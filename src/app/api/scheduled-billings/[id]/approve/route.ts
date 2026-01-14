import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { approveSchedule } from '@/lib/scheduled-billing-service';
import { NotificationType } from '@/generated/prisma';

/**
 * POST /api/scheduled-billings/[id]/approve
 * Approve a pending scheduled billing (ADMIN or APPROVER only)
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

    // Only ADMIN and APPROVER can approve schedules
    if (user.role !== 'ADMIN' && user.role !== 'APPROVER') {
      return NextResponse.json(
        { error: 'Only admins and approvers can approve schedules' },
        { status: 403 }
      );
    }

    const { id } = await params;

    // Check if exists and is pending
    const existing = await prisma.scheduledBilling.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        createdById: true,
        contract: { select: { companyName: true } },
        billingEntity: { select: { code: true } },
      },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Scheduled billing not found' }, { status: 404 });
    }

    if (existing.status !== 'PENDING') {
      return NextResponse.json(
        { error: 'Only pending schedules can be approved' },
        { status: 400 }
      );
    }

    const scheduledBilling = await approveSchedule(id, user.id);

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'SCHEDULED_BILLING_APPROVED',
        entityType: 'ScheduledBilling',
        entityId: id,
        details: {
          companyName: existing.contract.companyName,
          billingEntity: existing.billingEntity.code,
        },
      },
    });

    // Create notification for the creator
    if (existing.createdById) {
      await prisma.notification.create({
        data: {
          userId: existing.createdById,
          type: NotificationType.SCHEDULE_APPROVED,
          title: 'Schedule Approved',
          message: `Your scheduled billing for ${existing.contract.companyName} has been approved`,
          link: '/scheduled-billings',
          entityType: 'ScheduledBilling',
          entityId: id,
        },
      });
    }

    return NextResponse.json(scheduledBilling);
  } catch (error) {
    console.error('Error approving scheduled billing:', error);
    return NextResponse.json(
      { error: 'Failed to approve scheduled billing' },
      { status: 500 }
    );
  }
}
