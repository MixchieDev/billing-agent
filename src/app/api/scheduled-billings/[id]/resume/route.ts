import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { resumeSchedule } from '@/lib/scheduled-billing-service';

/**
 * POST /api/scheduled-billings/[id]/resume
 * Resume a paused scheduled billing
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
    const existing = await prisma.scheduledBilling.findUnique({
      where: { id },
      select: { id: true, status: true, contract: { select: { companyName: true } } },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Scheduled billing not found' }, { status: 404 });
    }

    if (existing.status === 'ACTIVE') {
      return NextResponse.json({ error: 'Schedule is already active' }, { status: 400 });
    }

    if (existing.status === 'ENDED') {
      return NextResponse.json({ error: 'Cannot resume an ended schedule' }, { status: 400 });
    }

    const scheduledBilling = await resumeSchedule(id);

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: (session.user as { id: string }).id,
        action: 'SCHEDULED_BILLING_RESUMED',
        entityType: 'ScheduledBilling',
        entityId: id,
        details: {
          companyName: existing.contract.companyName,
        },
      },
    });

    return NextResponse.json(scheduledBilling);
  } catch (error) {
    console.error('Error resuming scheduled billing:', error);
    return NextResponse.json(
      { error: 'Failed to resume scheduled billing' },
      { status: 500 }
    );
  }
}
