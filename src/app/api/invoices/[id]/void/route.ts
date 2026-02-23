import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { convexClient, api } from '@/lib/convex';
import { InvoiceStatus } from '@/lib/enums';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check user role - only ADMIN and APPROVER can void
    if (session.user.role !== 'ADMIN' && session.user.role !== 'APPROVER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Verify user exists in database
    const user = await convexClient.query(api.users.getById, {
      id: session.user.id as any,
    });
    if (!user) {
      return NextResponse.json(
        { error: 'User session is invalid. Please log out and log in again.' },
        { status: 401 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const { reason } = body;

    if (!reason) {
      return NextResponse.json(
        { error: 'Void reason is required' },
        { status: 400 }
      );
    }

    // Get the invoice first to check status
    const existingInvoice = await convexClient.query(api.invoices.getById, {
      id: id as any,
    });

    if (!existingInvoice) {
      return NextResponse.json(
        { error: 'Invoice not found' },
        { status: 404 }
      );
    }

    // Only APPROVED invoices can be voided
    if (existingInvoice.status !== InvoiceStatus.APPROVED) {
      return NextResponse.json(
        { error: 'Only approved invoices can be voided. This invoice is ' + existingInvoice.status },
        { status: 400 }
      );
    }

    // Void the invoice using updateStatus
    const invoice = await convexClient.mutation(api.invoices.updateStatus, {
      id: id as any,
      status: InvoiceStatus.VOID,
      voidedById: session.user.id as any,
      voidReason: reason,
    });

    // Log the action
    await convexClient.mutation(api.auditLogs.create, {
      userId: session.user.id as any,
      action: 'INVOICE_VOIDED',
      entityType: 'Invoice',
      entityId: id,
      details: { invoiceNo: invoice?.billingNo, reason },
    });

    // Create notification
    await convexClient.mutation(api.notifications.create, {
      type: 'INVOICE_VOID',
      title: 'Invoice Voided',
      message: `Invoice ${invoice?.billingNo} has been voided by ${session.user.name || 'Unknown'}. Reason: ${reason}`,
      link: `/dashboard/invoices/${id}`,
      entityType: 'Invoice',
      entityId: id,
    });

    return NextResponse.json({
      id: invoice?._id,
      ...invoice,
    });
  } catch (error) {
    console.error('Error voiding invoice:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to void invoice', details: errorMessage },
      { status: 500 }
    );
  }
}
