import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { convexClient, api } from '@/lib/convex';
import { NotificationType } from '@/lib/enums';

/**
 * POST /api/scheduled-billings/[id]/reject
 * Reject a pending scheduled billing (ADMIN or APPROVER only)
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

    const user = session.user as { id: string; role: string };

    // Only ADMIN and APPROVER can reject schedules
    if (user.role !== 'ADMIN' && user.role !== 'APPROVER') {
      return NextResponse.json(
        { error: 'Only admins and approvers can reject schedules' },
        { status: 403 }
      );
    }

    const { id } = await params;

    // Get reason from request body (optional)
    let reason: string | undefined;
    try {
      const body = await request.json();
      reason = body.reason;
    } catch {
      // No body or invalid JSON, reason is optional
    }

    // Check if exists and is pending
    const existing = await convexClient.query(api.scheduledBillings.getById, {
      id: id as any,
    });

    if (!existing) {
      return NextResponse.json({ error: 'Scheduled billing not found' }, { status: 404 });
    }

    if (existing.status !== 'PENDING') {
      return NextResponse.json(
        { error: 'Only pending schedules can be rejected' },
        { status: 400 }
      );
    }

    const scheduledBilling = await convexClient.mutation(api.scheduledBillings.reject, {
      id: id as any,
      rejectedById: user.id as any,
      rejectionReason: reason,
    });

    // Create audit log
    await convexClient.mutation(api.auditLogs.create, {
      userId: user.id as any,
      action: 'SCHEDULED_BILLING_REJECTED',
      entityType: 'ScheduledBilling',
      entityId: id,
      details: {
        companyName: existing.contract?.companyName,
        billingEntity: existing.billingEntity?.code,
        reason,
      },
    });

    // Create notification for the creator
    if (existing.createdById) {
      await convexClient.mutation(api.notifications.create, {
        userId: existing.createdById as any,
        type: NotificationType.SCHEDULE_REJECTED,
        title: 'Schedule Rejected',
        message: `Your scheduled billing for ${existing.contract?.companyName} has been rejected${reason ? `: ${reason}` : ''}`,
        link: '/scheduled-billings',
        entityType: 'ScheduledBilling',
        entityId: id,
      });
    }

    return NextResponse.json(scheduledBilling);
  } catch (error) {
    console.error('Error rejecting scheduled billing:', error);
    return NextResponse.json(
      { error: 'Failed to reject scheduled billing' },
      { status: 500 }
    );
  }
}
