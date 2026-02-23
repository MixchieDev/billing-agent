import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { convexClient, api } from '@/lib/convex';

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
    const scheduledBilling = await convexClient.query(api.scheduledBillings.getById, {
      id: id as any,
    });

    if (!scheduledBilling) {
      return NextResponse.json({ error: 'Scheduled billing not found' }, { status: 404 });
    }

    // Get run history
    const runs = await convexClient.query(api.scheduledBillingRuns.listByScheduledBillingId, {
      scheduledBillingId: id as any,
    });

    return NextResponse.json({ ...scheduledBilling, runs });
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
    const existing = await convexClient.query(api.scheduledBillings.getById, {
      id: id as any,
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

    const updateData: Record<string, any> = {};
    if (body.billingAmount !== undefined) updateData.billingAmount = body.billingAmount;
    if (body.vatType !== undefined) updateData.vatType = body.vatType;
    if (body.hasWithholding !== undefined) updateData.hasWithholding = body.hasWithholding;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.frequency !== undefined) updateData.frequency = body.frequency;
    if (body.billingDayOfMonth !== undefined) updateData.billingDayOfMonth = body.billingDayOfMonth;
    if (body.startDate !== undefined) updateData.startDate = new Date(body.startDate).getTime();
    if (body.endDate !== undefined) updateData.endDate = body.endDate ? new Date(body.endDate).getTime() : null;
    if (body.autoApprove !== undefined) updateData.autoApprove = body.autoApprove;
    if (body.autoSendEnabled !== undefined) updateData.autoSendEnabled = body.autoSendEnabled;
    if (body.status !== undefined) updateData.status = body.status;
    if (body.remarks !== undefined) updateData.remarks = body.remarks;

    const scheduledBilling = await convexClient.mutation(api.scheduledBillings.update, {
      id: id as any,
      data: updateData,
    });

    // Create audit log
    await convexClient.mutation(api.auditLogs.create, {
      userId: (session.user as { id: string }).id as any,
      action: 'SCHEDULED_BILLING_UPDATED',
      entityType: 'ScheduledBilling',
      entityId: id,
      details: body,
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
    const existing = await convexClient.query(api.scheduledBillings.getById, {
      id: id as any,
    });

    if (!existing) {
      return NextResponse.json({ error: 'Scheduled billing not found' }, { status: 404 });
    }

    await convexClient.mutation(api.scheduledBillings.remove, {
      id: id as any,
    });

    // Create audit log
    await convexClient.mutation(api.auditLogs.create, {
      userId: (session.user as { id: string }).id as any,
      action: 'SCHEDULED_BILLING_DELETED',
      entityType: 'ScheduledBilling',
      entityId: id,
      details: {
        companyName: existing.contract?.companyName,
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
