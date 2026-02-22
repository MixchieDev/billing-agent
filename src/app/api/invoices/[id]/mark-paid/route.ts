import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { notifyInvoicePaid } from '@/lib/notifications';
import { notifyNexusPayment } from '@/lib/bridge-nexus-sync';

interface MarkPaidRequest {
  paidAmount: number;
  paymentMethod: 'CASH' | 'BANK_TRANSFER' | 'CHECK' | 'HITPAY';
  paymentReference?: string;
  paidAt?: string; // ISO date string, defaults to now
}

/**
 * POST /api/invoices/[id]/mark-paid
 * Marks an invoice as PAID with payment details
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

    // Check user role
    if (session.user.role !== 'ADMIN' && session.user.role !== 'APPROVER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const body: MarkPaidRequest = await request.json();

    // Validate required fields
    if (!body.paidAmount || body.paidAmount <= 0) {
      return NextResponse.json(
        { error: 'Valid paid amount is required' },
        { status: 400 }
      );
    }

    if (!body.paymentMethod) {
      return NextResponse.json(
        { error: 'Payment method is required' },
        { status: 400 }
      );
    }

    const validMethods = ['CASH', 'BANK_TRANSFER', 'CHECK', 'HITPAY'];
    if (!validMethods.includes(body.paymentMethod)) {
      return NextResponse.json(
        { error: 'Invalid payment method. Must be CASH, BANK_TRANSFER, CHECK, or HITPAY' },
        { status: 400 }
      );
    }

    // Get the invoice
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      select: {
        id: true,
        billingNo: true,
        customerName: true,
        status: true,
        netAmount: true,
      },
    });

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // Only SENT invoices can be marked as paid
    if (invoice.status !== 'SENT') {
      return NextResponse.json(
        { error: `Cannot mark invoice as paid. Current status: ${invoice.status}. Only SENT invoices can be marked as paid.` },
        { status: 400 }
      );
    }

    // Update invoice to PAID status with payment details
    const paidAt = body.paidAt ? new Date(body.paidAt) : new Date();

    const updatedInvoice = await prisma.invoice.update({
      where: { id },
      data: {
        status: 'PAID',
        paidAt,
        paidAmount: body.paidAmount,
        paymentMethod: body.paymentMethod,
        paymentReference: body.paymentReference || null,
      },
    });

    // Log the action
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'INVOICE_PAID',
        entityType: 'Invoice',
        entityId: id,
        details: {
          billingNo: invoice.billingNo,
          paidAmount: body.paidAmount,
          paymentMethod: body.paymentMethod,
          paymentReference: body.paymentReference,
          paidAt: paidAt.toISOString(),
        },
      },
    });

    // Create notification
    await notifyInvoicePaid({
      id: invoice.id,
      billingNo: invoice.billingNo,
      customerName: invoice.customerName,
      paidAmount: body.paidAmount,
      paymentMethod: body.paymentMethod,
    });

    // Bridge: Notify Nexus of payment (fire-and-forget)
    notifyNexusPayment(id).catch(() => {});

    return NextResponse.json(updatedInvoice);
  } catch (error) {
    console.error('Error marking invoice as paid:', error);
    return NextResponse.json(
      { error: 'Failed to mark invoice as paid' },
      { status: 500 }
    );
  }
}
