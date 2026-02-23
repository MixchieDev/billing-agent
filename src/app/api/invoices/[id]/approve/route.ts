import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { approveInvoice } from '@/lib/billing-service';
import { convexClient, api } from '@/lib/convex';
import { notifyInvoiceApproved } from '@/lib/notifications';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check user role
    if (session.user.role !== 'ADMIN' && session.user.role !== 'APPROVER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const invoice = await approveInvoice(id, session.user.id);

    // Log the action
    await convexClient.mutation(api.auditLogs.create, {
      userId: session.user.id as any,
      action: 'INVOICE_APPROVED',
      entityType: 'Invoice',
      entityId: id,
      details: { invoiceNo: invoice.billingNo },
    });

    // Create notification
    await notifyInvoiceApproved(invoice, session.user.name || 'Unknown');

    return NextResponse.json(invoice);
  } catch (error) {
    console.error('Error approving invoice:', error);
    return NextResponse.json(
      { error: 'Failed to approve invoice' },
      { status: 500 }
    );
  }
}
