import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { rejectInvoice } from '@/lib/billing-service';
import prisma from '@/lib/prisma';
import { notifyInvoiceRejected } from '@/lib/notifications';

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
    const body = await request.json();
    const { reason, rescheduleDate } = body;

    if (!reason) {
      return NextResponse.json(
        { error: 'Rejection reason is required' },
        { status: 400 }
      );
    }

    const invoice = await rejectInvoice(
      id,
      session.user.id,
      reason,
      rescheduleDate ? new Date(rescheduleDate) : undefined
    );

    // Log the action
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'INVOICE_REJECTED',
        entityType: 'Invoice',
        entityId: id,
        details: { invoiceNo: invoice.billingNo, reason, rescheduleDate },
      },
    });

    // Create notification
    await notifyInvoiceRejected(invoice, session.user.name || 'Unknown', reason);

    return NextResponse.json(invoice);
  } catch (error) {
    console.error('Error rejecting invoice:', error);
    return NextResponse.json(
      { error: 'Failed to reject invoice' },
      { status: 500 }
    );
  }
}
