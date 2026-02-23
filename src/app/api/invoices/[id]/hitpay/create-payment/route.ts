import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { convexClient, api } from '@/lib/convex';
import { createPaymentRequest } from '@/lib/hitpay-service';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

/**
 * POST /api/invoices/[id]/hitpay/create-payment
 * Creates a HitPay payment request for an invoice
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

    // Get the invoice
    const invoice = await convexClient.query(api.invoices.getById, {
      id: id as any,
    });

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // Only SENT invoices can have payment requests created
    if (invoice.status !== 'SENT') {
      return NextResponse.json(
        { error: `Cannot create payment for invoice. Current status: ${invoice.status}. Only SENT invoices can be paid.` },
        { status: 400 }
      );
    }

    // Check if there's already a pending payment request
    const existingRequests = await convexClient.query(api.hitpayPaymentRequests.getByInvoiceId, {
      invoiceId: id as any,
    });
    const existingRequest = existingRequests.find((r: any) => r.status === 'PENDING');

    if (existingRequest) {
      return NextResponse.json({
        paymentRequestId: existingRequest._id,
        hitpayRequestId: existingRequest.hitpayRequestId,
        checkoutUrl: existingRequest.checkoutUrl,
        amount: existingRequest.amount,
        currency: existingRequest.currency,
        status: existingRequest.status,
        message: 'Existing payment request found',
      });
    }

    // Get customer email
    const customerEmail = invoice.customerEmail ||
      (invoice.customerEmails ? invoice.customerEmails.split(',')[0].trim() : undefined);

    // Create payment request with HitPay
    const referenceNumber = invoice.billingNo || invoice._id;
    const redirectUrl = `${APP_URL}/payment/success?invoice=${invoice._id}`;

    const hitpayResponse = await createPaymentRequest({
      amount: Number(invoice.netAmount),
      currency: 'PHP',
      referenceNumber,
      email: customerEmail,
      name: invoice.customerName,
      purpose: `Invoice ${referenceNumber}`,
      redirectUrl,
    });

    // Store the payment request in database
    const paymentRequestId = await convexClient.mutation(api.hitpayPaymentRequests.create, {
      invoiceId: id as any,
      hitpayRequestId: hitpayResponse.id,
      checkoutUrl: hitpayResponse.url,
      amount: Number(invoice.netAmount),
      currency: 'PHP',
      status: 'PENDING',
    });

    // Log the action
    await convexClient.mutation(api.auditLogs.create, {
      userId: session.user.id as any,
      action: 'HITPAY_PAYMENT_CREATED',
      entityType: 'Invoice',
      entityId: invoice._id,
      details: {
        billingNo: invoice.billingNo,
        hitpayRequestId: hitpayResponse.id,
        amount: Number(invoice.netAmount),
        checkoutUrl: hitpayResponse.url,
      },
    });

    return NextResponse.json({
      paymentRequestId,
      hitpayRequestId: hitpayResponse.id,
      checkoutUrl: hitpayResponse.url,
      amount: Number(invoice.netAmount),
      currency: 'PHP',
      status: 'PENDING',
    });
  } catch (error) {
    console.error('Error creating HitPay payment request:', error);
    return NextResponse.json(
      { error: 'Failed to create payment request' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/invoices/[id]/hitpay/create-payment
 * Gets the current payment request status for an invoice
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

    // Get the latest payment request for this invoice
    const paymentRequests = await convexClient.query(api.hitpayPaymentRequests.getByInvoiceId, {
      invoiceId: id as any,
    });

    // Sort by createdAt desc and take the latest
    const sorted = paymentRequests.sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0));
    const paymentRequest = sorted[0];

    if (!paymentRequest) {
      return NextResponse.json({
        status: 'NO_PAYMENT_REQUEST',
        message: 'No payment request found for this invoice'
      });
    }

    return NextResponse.json({
      paymentRequestId: paymentRequest._id,
      hitpayRequestId: paymentRequest.hitpayRequestId,
      checkoutUrl: paymentRequest.checkoutUrl,
      amount: paymentRequest.amount,
      currency: paymentRequest.currency,
      status: paymentRequest.status,
      paidAt: paymentRequest.paidAt,
      paymentMethod: paymentRequest.paymentMethod,
      paymentReference: paymentRequest.paymentReference,
    });
  } catch (error) {
    console.error('Error getting payment request status:', error);
    return NextResponse.json(
      { error: 'Failed to get payment request status' },
      { status: 500 }
    );
  }
}
