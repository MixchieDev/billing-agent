import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getSettings, clearSettingsCache } from '@/lib/settings';

const KEYS = [
  'collections.l1Days',
  'collections.l2Days',
  'collections.l3Days',
  'collections.autoSendLevels',
  'collections.maxPerRun',
] as const;

/**
 * GET /api/collections/settings
 * The ladder configuration, plus the last few nightly runs — so the decision to
 * arm a level is made against what the sweep actually reported, not a guess.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const s = await getSettings([...KEYS]);
    const runs = await prisma.collectionRun.findMany({
      orderBy: { runDate: 'desc' },
      take: 5,
      select: {
        id: true, runDate: true, status: true, invoicesScanned: true,
        followUpsSent: true, promisesBroken: true, suppressed: true,
      },
    });

    const armed: number[] = Array.isArray(s['collections.autoSendLevels'])
      ? s['collections.autoSendLevels']
      : [];

    // A level with no template sends nothing and logs an error per invoice, so
    // arming it is worse than leaving it off. The panel needs to say so.
    const templates = await prisma.emailTemplate.findMany({
      where: { templateType: 'FOLLOW_UP' },
      select: { followUpLevel: true },
    });
    const levelsWithTemplate = [
      ...new Set(templates.map((t) => t.followUpLevel).filter((n): n is number => n !== null)),
    ].sort();

    return NextResponse.json({
      settings: {
        l1Days: Number(s['collections.l1Days']),
        l2Days: Number(s['collections.l2Days']),
        l3Days: Number(s['collections.l3Days']),
        autoSendLevels: armed,
        maxPerRun: Number(s['collections.maxPerRun']) || 0,
      },
      runs,
      levelsWithTemplate,
    });
  } catch (error) {
    console.error('Error loading collections settings:', error);
    return NextResponse.json({ error: 'Failed to load collections settings' }, { status: 500 });
  }
}

/** PUT — save the ladder configuration. ADMIN only: arming this sends client mail. */
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Only an admin can change collections settings' }, { status: 403 });
    }

    const body = await request.json();

    const levels = Array.isArray(body.autoSendLevels)
      ? [...new Set(body.autoSendLevels.map(Number))].filter((n) => n === 1 || n === 2 || n === 3).sort()
      : [];

    const day = (v: unknown, fallback: number) => {
      const n = Math.floor(Number(v));
      return Number.isFinite(n) && n >= 0 && n <= 365 ? n : fallback;
    };
    const l1 = day(body.l1Days, 1);
    const l2 = day(body.l2Days, 7);
    const l3 = day(body.l3Days, 15);

    // Out-of-order offsets would let a later level fire before an earlier one,
    // so the ladder would escalate backwards.
    if (!(l1 <= l2 && l2 <= l3)) {
      return NextResponse.json(
        { error: 'Day offsets must increase: level 1 no later than level 2, level 2 no later than level 3.' },
        { status: 400 }
      );
    }

    const rawCap = Math.floor(Number(body.maxPerRun));
    const maxPerRun = Number.isFinite(rawCap) && rawCap >= 0 ? Math.min(rawCap, 1000) : 25;

    const values: Record<string, unknown> = {
      'collections.l1Days': l1,
      'collections.l2Days': l2,
      'collections.l3Days': l3,
      'collections.autoSendLevels': levels,
      'collections.maxPerRun': maxPerRun,
    };

    for (const [key, value] of Object.entries(values)) {
      await prisma.settings.upsert({
        where: { key },
        update: { value: value as never },
        create: { key, value: value as never },
      });
    }

    // Arming or disarming auto-send is worth an audit trail of its own.
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'COLLECTIONS_SETTINGS_UPDATED',
        entityType: 'Settings',
        entityId: 'collections',
        details: { autoSendLevels: levels, maxPerRun, l1Days: l1, l2Days: l2, l3Days: l3 },
      },
    });

    clearSettingsCache();

    return NextResponse.json({
      settings: { l1Days: l1, l2Days: l2, l3Days: l3, autoSendLevels: levels, maxPerRun },
      message: levels.length
        ? `Auto-send armed for level${levels.length > 1 ? 's' : ''} ${levels.join(', ')}` +
          (maxPerRun ? `, capped at ${maxPerRun} per night` : ', with no nightly cap')
        : 'Auto-send is off — the sweep will report but send nothing',
    });
  } catch (error) {
    console.error('Error saving collections settings:', error);
    return NextResponse.json({ error: 'Failed to save collections settings' }, { status: 500 });
  }
}
