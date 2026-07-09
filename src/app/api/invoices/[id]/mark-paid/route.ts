import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { recordPayment } from '@/lib/payment-service';

interface MarkPaidRequest {
  paidAmount: number;
  paymentMethod: 'CASH' | 'BANK_TRANSFER' | 'CHECK' | 'HITPAY';
  paymentReference?: string;
  paidAt?: string; // ISO date string, defaults to now
  settleWithholding?: boolean; // shortfall is an unbilled 2307 deduction
}

/**
 * POST /api/invoices/[id]/mark-paid
 * Records a payment against an invoice. Supports partial payments: the invoice
 * becomes PARTIALLY_PAID until the balance is settled, then PAID. (Kept at this
 * path so the existing Record-payment modal keeps working.)
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

    const result = await recordPayment({
      invoiceId: id,
      amount: body.paidAmount,
      method: body.paymentMethod,
      reference: body.paymentReference || null,
      paidDate: body.paidAt ? new Date(body.paidAt) : new Date(),
      source: 'MANUAL',
      recordedBy: session.user.id,
      settleWithholding: body.settleWithholding,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to record payment';
    console.error('Error recording payment:', error);
    // Client errors (not found / wrong status / bad amount) → 400; else 500.
    const isClientError =
      message.includes('Invoice not found') ||
      message.includes('Cannot record a payment') ||
      message.includes('greater than zero') ||
      message.includes('too large to be withholding');
    return NextResponse.json({ error: message }, { status: isClientError ? 400 : 500 });
  }
}
