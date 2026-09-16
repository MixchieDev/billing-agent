import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getSetting, clearSettingsCache } from '@/lib/settings';
import { reconcileAllContracts } from '@/lib/cash-management-sync';

// A full push of every contract can take a while; give it room.
export const maxDuration = 120;

/** GET — last reconciliation result, recent per-contract failures, nightly switch. */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const since = new Date(Date.now() - 7 * 86_400_000);
    // Sequential, not Promise.all: production runs Prisma with connection_limit=1.
    const lastRun = await getSetting('cashSync.lastRun');
    const nightly = await getSetting('cashSync.nightlyReconcile');
    const failures = await prisma.auditLog.findMany({
      where: { action: 'CASH_SYNC_FAILED', createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { createdAt: true, entityId: true, details: true },
    });

    return NextResponse.json({
      lastRun: lastRun ?? null,
      nightlyReconcile: nightly === true,
      recentFailures: failures,
    });
  } catch (error) {
    console.error('Error loading cash sync status:', error);
    return NextResponse.json({ error: 'Failed to load sync status' }, { status: 500 });
  }
}

/** POST { action: 'sync' } runs a full push now; { action: 'nightly', enabled } flips the switch. */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Only an admin can run the cash management sync' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));

    if (body.action === 'nightly') {
      if (typeof body.enabled !== 'boolean') {
        return NextResponse.json({ error: 'enabled must be true or false' }, { status: 400 });
      }
      await prisma.settings.upsert({
        where: { key: 'cashSync.nightlyReconcile' },
        update: { value: body.enabled },
        create: { key: 'cashSync.nightlyReconcile', value: body.enabled },
      });
      await prisma.auditLog.create({
        data: {
          userId: session.user.id,
          action: body.enabled ? 'CASH_SYNC_NIGHTLY_ON' : 'CASH_SYNC_NIGHTLY_OFF',
          entityType: 'Settings',
          entityId: 'cashSync.nightlyReconcile',
          details: { enabled: body.enabled },
        },
      });
      clearSettingsCache();
      return NextResponse.json({ nightlyReconcile: body.enabled });
    }

    if (body.action === 'sync') {
      const result = await reconcileAllContracts();
      await prisma.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'CASH_SYNC_RUN',
          entityType: 'Settings',
          entityId: 'cashSync',
          details: { contracts: result.contracts, sent: result.sent, failedBatches: result.failedBatches },
        },
      });
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "action must be 'sync' or 'nightly'" }, { status: 400 });
  } catch (error) {
    console.error('Error running cash sync:', error);
    return NextResponse.json({ error: 'Failed to run the cash management sync' }, { status: 500 });
  }
}
