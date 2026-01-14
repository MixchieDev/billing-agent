import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import {
  getScheduledBilling,
  updateScheduledBilling,
  deleteScheduledBilling,
  UpdateScheduledBillingInput,
} from '@/lib/scheduled-billing-service';

/**
 * GET /api/scheduled-billings/[id]
 * Get a single scheduled billing with its run history
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const scheduledBilling = await getScheduledBilling(id);

    if (!scheduledBilling) {
      return NextResponse.json({ error: 'Scheduled billing not found' }, { status: 404 });
    }

    return NextResponse.json(scheduledBilling);
  } catch (error) {
    console.error('Error fetching scheduled billing:', error);
    return NextResponse.json(
      { error: 'Failed to fetch scheduled billing' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/scheduled-billings/[id]
 * Update a scheduled billing
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    // Check if exists
    const existing = await prisma.scheduledBilling.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Scheduled billing not found' }, { status: 404 });
    }

    // Validate billingDayOfMonth if provided
    if (body.billingDayOfMonth !== undefined) {
      if (body.billingDayOfMonth < 1 || body.billingDayOfMonth > 31) {
        return NextResponse.json(
          { error: 'billingDayOfMonth must be between 1 and 31' },
          { status: 400 }
        );
      }
    }

    // Validate billingAmount if provided
    if (body.billingAmount !== undefined && body.billingAmount <= 0) {
      return NextResponse.json(
        { error: 'billingAmount must be greater than 0' },
        { status: 400 }
      );
    }

    const input: UpdateScheduledBillingInput = {
      ...(body.billingAmount !== undefined && { billingAmount: body.billingAmount }),
      ...(body.vatType !== undefined && { vatType: body.vatType }),
      ...(body.hasWithholding !== undefined && { hasWithholding: body.hasWithholding }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.frequency !== undefined && { frequency: body.frequency }),
      ...(body.billingDayOfMonth !== undefined && { billingDayOfMonth: body.billingDayOfMonth }),
      ...(body.startDate !== undefined && { startDate: new Date(body.startDate) }),
      ...(body.endDate !== undefined && { endDate: body.endDate ? new Date(body.endDate) : null }),
      ...(body.autoApprove !== undefined && { autoApprove: body.autoApprove }),
      ...(body.autoSendEnabled !== undefined && { autoSendEnabled: body.autoSendEnabled }),
      ...(body.status !== undefined && { status: body.status }),
      ...(body.remarks !== undefined && { remarks: body.remarks }),
    };

    const scheduledBilling = await updateScheduledBilling(id, input);

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: (session.user as { id: string }).id,
        action: 'SCHEDULED_BILLING_UPDATED',
        entityType: 'ScheduledBilling',
        entityId: id,
        details: body,
      },
    });

    return NextResponse.json(scheduledBilling);
  } catch (error) {
    console.error('Error updating scheduled billing:', error);
    return NextResponse.json(
      { error: 'Failed to update scheduled billing' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/scheduled-billings/[id]
 * Delete a scheduled billing
 */
export async function DELETE(
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
      select: { id: true, contract: { select: { companyName: true } } },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Scheduled billing not found' }, { status: 404 });
    }

    await deleteScheduledBilling(id);

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: (session.user as { id: string }).id,
        action: 'SCHEDULED_BILLING_DELETED',
        entityType: 'ScheduledBilling',
        entityId: id,
        details: {
          companyName: existing.contract.companyName,
        },
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting scheduled billing:', error);
    return NextResponse.json(
      { error: 'Failed to delete scheduled billing' },
      { status: 500 }
    );
  }
}
