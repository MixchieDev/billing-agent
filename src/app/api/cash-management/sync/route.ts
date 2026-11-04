import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { clearSettingsCache } from '@/lib/settings';
import { reconcileAllContracts } from '@/lib/cash-management-sync';
import { reconcileReceivables } from '@/lib/receivables-feed';

// A full push of every contract can take a while; give it room.
export const maxDuration = 120;

/** GET — last reconciliation result, recent per-contract failures, nightly switch. */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const since = new Date(Date.now() - 7 * 86_400_000);
    // Sequential, not Promise.all: production runs Prisma with connection_limit=1.
    // Read the rows directly, not via the cached getSetting: a run writes its
    // result straight to the table, so the 5-minute cache would show the
    // previous run right after "Sync now".
    const rows = await prisma.settings.findMany({
      where: {
        key: {
          in: ['cashSync.lastRun', 'cashSync.nightlyReconcile', 'cashSync.receivablesEnabled', 'cashSync.receivablesLastRun'],
        },
      },
    });
    const setting = (key: string) => rows.find((r) => r.key === key)?.value;
    const lastRun = setting('cashSync.lastRun');
    const nightly = setting('cashSync.nightlyReconcile');
    const receivablesEnabled = setting('cashSync.receivablesEnabled');
    const receivablesLastRun = setting('cashSync.receivablesLastRun');
    const failures = await prisma.auditLog.findMany({
      where: { action: 'CASH_SYNC_FAILED', createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { createdAt: true, entityId: true, details: true },
    });

    return NextResponse.json({
      lastRun: lastRun ?? null,
      nightlyReconcile: nightly === true,
      receivablesEnabled: receivablesEnabled === true,
      receivablesLastRun: receivablesLastRun ?? null,
      recentFailures: failures,
    });
  } catch (error) {
    console.error('Error loading cash sync status:', error);
    return NextResponse.json({ error: 'Failed to load sync status' }, { status: 500 });
  }
}

/**
 * POST { action: 'sync' } pushes every contract now; { action: 'nightly', enabled }
 * flips the nightly contract sync; { action: 'receivables', enabled } switches the
 * receivables feed on or off; { action: 'sync-receivables' } pushes it now.
 */
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

    if (body.action === 'receivables') {
      if (typeof body.enabled !== 'boolean') {
        return NextResponse.json({ error: 'enabled must be true or false' }, { status: 400 });
      }
      await prisma.settings.upsert({
        where: { key: 'cashSync.receivablesEnabled' },
        update: { value: body.enabled },
        create: { key: 'cashSync.receivablesEnabled', value: body.enabled },
      });
      await prisma.auditLog.create({
        data: {
          userId: session.user.id,
          action: body.enabled ? 'CASH_RECEIVABLES_ON' : 'CASH_RECEIVABLES_OFF',
          entityType: 'Settings',
          entityId: 'cashSync.receivablesEnabled',
          details: { enabled: body.enabled },
        },
      });
      clearSettingsCache();
      return NextResponse.json({ receivablesEnabled: body.enabled });
    }

    if (body.action === 'sync-receivables') {
      const result = await reconcileReceivables();
      await prisma.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'CASH_RECEIVABLES_RUN',
          entityType: 'Settings',
          entityId: 'cashSync',
          details: { receivables: result.receivables, collections: result.collections, sent: result.sent, errors: result.errors.length },
        },
      });
      return NextResponse.json(result);
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

    return NextResponse.json(
      { error: "action must be 'sync', 'nightly', 'receivables' or 'sync-receivables'" },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error running cash sync:', error);
    return NextResponse.json({ error: 'Failed to run the cash management sync' }, { status: 500 });
  }
}
