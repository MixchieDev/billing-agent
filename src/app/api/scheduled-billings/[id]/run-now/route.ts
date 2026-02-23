import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { convexClient, api } from '@/lib/convex';
import { generateFromScheduledBilling } from '@/lib/invoice-generator';
import { autoSendInvoice } from '@/lib/auto-send';

/**
 * POST /api/scheduled-billings/[id]/run-now
 * Manually trigger invoice generation for a scheduled billing
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

    // Check if exists and is active
    const existing = await convexClient.query(api.scheduledBillings.getById, {
      id: id as any,
    });

    if (!existing) {
      return NextResponse.json({ error: 'Scheduled billing not found' }, { status: 404 });
    }

    if (existing.status === 'ENDED') {
      return NextResponse.json({ error: 'Cannot run an ended schedule' }, { status: 400 });
    }

    // Generate invoice
    const result = await generateFromScheduledBilling(id);

    // If auto-approved and auto-send enabled, send the invoice
    let emailSent = false;
    if (result.autoApproved && existing.autoSendEnabled) {
      try {
        await autoSendInvoice(result.invoice._id || result.invoice.id);
        emailSent = true;
      } catch (emailError) {
        console.error('Failed to auto-send invoice:', emailError);
        // Don't fail the request, just log the error
      }
    }

    // Create audit log
    await convexClient.mutation(api.auditLogs.create, {
      userId: (session.user as { id: string }).id as any,
      action: 'SCHEDULED_BILLING_MANUAL_RUN',
      entityType: 'ScheduledBilling',
      entityId: id,
      details: {
        companyName: existing.contract?.companyName,
        invoiceId: result.invoice._id || result.invoice.id,
        billingNo: result.invoice.billingNo,
        autoApproved: result.autoApproved,
        emailSent,
      },
    });

    return NextResponse.json({
      success: true,
      invoice: result.invoice,
      autoApproved: result.autoApproved,
      emailSent,
    });
  } catch (error) {
    console.error('Error running scheduled billing:', error);

    // Check if it's a known error
    if (error instanceof Error) {
      if (error.message.includes('already exists')) {
        return NextResponse.json(
          { error: 'Invoice already exists for this billing period' },
          { status: 400 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Failed to generate invoice' },
      { status: 500 }
    );
  }
}
