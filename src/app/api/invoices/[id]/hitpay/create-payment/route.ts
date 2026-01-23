import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
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
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      select: {
        id: true,
        billingNo: true,
        customerName: true,
        customerEmail: true,
        customerEmails: true,
        status: true,
        netAmount: true,
        hitpayPaymentRequests: {
          where: { status: 'PENDING' },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
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
    const existingRequest = invoice.hitpayPaymentRequests[0];
    if (existingRequest) {
      return NextResponse.json({
        paymentRequestId: existingRequest.id,
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
    const referenceNumber = invoice.billingNo || invoice.id;
    const redirectUrl = `${APP_URL}/payment/success?invoice=${invoice.id}`;

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
    const paymentRequest = await prisma.hitpayPaymentRequest.create({
      data: {
        invoiceId: invoice.id,
        hitpayRequestId: hitpayResponse.id,
        checkoutUrl: hitpayResponse.url,
        amount: Number(invoice.netAmount),
        currency: 'PHP',
        status: 'PENDING',
      },
    });

    // Log the action
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'HITPAY_PAYMENT_CREATED',
        entityType: 'Invoice',
        entityId: invoice.id,
        details: {
          billingNo: invoice.billingNo,
          hitpayRequestId: hitpayResponse.id,
          amount: Number(invoice.netAmount),
          checkoutUrl: hitpayResponse.url,
        },
      },
    });

    return NextResponse.json({
      paymentRequestId: paymentRequest.id,
      hitpayRequestId: hitpayResponse.id,
      checkoutUrl: hitpayResponse.url,
      amount: paymentRequest.amount,
      currency: paymentRequest.currency,
      status: paymentRequest.status,
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
    const paymentRequest = await prisma.hitpayPaymentRequest.findFirst({
      where: { invoiceId: id },
      orderBy: { createdAt: 'desc' },
    });

    if (!paymentRequest) {
      return NextResponse.json({
        status: 'NO_PAYMENT_REQUEST',
        message: 'No payment request found for this invoice'
      });
    }

    return NextResponse.json({
      paymentRequestId: paymentRequest.id,
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
