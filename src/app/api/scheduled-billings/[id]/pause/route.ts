import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { convexClient, api } from '@/lib/convex';

/**
 * POST /api/scheduled-billings/[id]/pause
 * Pause a scheduled billing
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Check if exists
    const existing = await convexClient.query(api.scheduledBillings.getById, {
      id: id as any,
    });

    if (!existing) {
      return NextResponse.json({ error: 'Scheduled billing not found' }, { status: 404 });
    }

    if (existing.status === 'PAUSED') {
      return NextResponse.json({ error: 'Schedule is already paused' }, { status: 400 });
    }

    if (existing.status === 'ENDED') {
      return NextResponse.json({ error: 'Cannot pause an ended schedule' }, { status: 400 });
    }

    const scheduledBilling = await convexClient.mutation(api.scheduledBillings.update, {
      id: id as any,
      data: { status: 'PAUSED' },
    });

    // Create audit log
    await convexClient.mutation(api.auditLogs.create, {
      userId: (session.user as { id: string }).id as any,
      action: 'SCHEDULED_BILLING_PAUSED',
      entityType: 'ScheduledBilling',
      entityId: id,
      details: {
        companyName: existing.contract?.companyName,
      },
    });

    return NextResponse.json(scheduledBilling);
  } catch (error) {
    console.error('Error pausing scheduled billing:', error);
    return NextResponse.json(
      { error: 'Failed to pause scheduled billing' },
      { status: 500 }
    );
  }
}
