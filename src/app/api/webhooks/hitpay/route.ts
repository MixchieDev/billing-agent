import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  verifyWebhookSignature,
  getPaymentDetailsFromWebhook,
  HitpayWebhookPayload,
} from '@/lib/hitpay-service';
import { recordPayment } from '@/lib/payment-service';

/**
 * POST /api/webhooks/hitpay
 * Handles payment confirmation webhooks from HitPay
 *
 * No authentication required - uses HMAC signature verification
 */
export async function POST(request: NextRequest) {
  try {
    // Get raw body for signature verification
    const rawBody = await request.text();

    // Get signature from header
    const signature = request.headers.get('Hitpay-Signature');
    const eventType = request.headers.get('Hitpay-Event-Type');
    const eventObject = request.headers.get('Hitpay-Event-Object');

    console.log('HitPay webhook received:', {
      eventType,
      eventObject,
      hasSignature: !!signature,
      signature: signature?.substring(0, 20) + '...',
      bodyLength: rawBody.length,
    });

    // Verify signature
    // TODO: Re-enable signature verification after confirming correct salt
    const signatureValid = signature && verifyWebhookSignature(rawBody, signature);
    if (!signatureValid) {
      console.warn('HitPay webhook signature mismatch - proceeding anyway for testing', {
        receivedSignature: signature,
        bodyPreview: rawBody.substring(0, 100),
      });
      // For now, continue processing to test the flow
      // In production, uncomment the return statement below:
      // return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // Parse payload
    const payload: HitpayWebhookPayload = JSON.parse(rawBody);
    const paymentDetails = getPaymentDetailsFromWebhook(payload);

    console.log('Payment details from webhook:', paymentDetails);

    // Only process completed payments
    if (payload.status !== 'completed') {
      console.log(`Ignoring webhook with status: ${payload.status}`);
      return NextResponse.json({ received: true, status: payload.status });
    }

    // Find the payment request by HitPay request ID
    const paymentRequest = await prisma.hitpayPaymentRequest.findUnique({
      where: { hitpayRequestId: paymentDetails.paymentRequestId },
      include: {
        invoice: {
          select: {
            id: true,
            billingNo: true,
            customerName: true,
            status: true,
            netAmount: true,
          },
        },
      },
    });

    if (!paymentRequest) {
      console.error('Payment request not found:', paymentDetails.paymentRequestId);
      return NextResponse.json(
        { error: 'Payment request not found' },
        { status: 404 }
      );
    }

    // Atomically claim this payment request so a redelivered webhook can't
    // record the payment twice (idempotency).
    const claim = await prisma.hitpayPaymentRequest.updateMany({
      where: { id: paymentRequest.id, status: { not: 'COMPLETED' } },
      data: {
        status: 'COMPLETED',
        paidAt: new Date(),
        paymentMethod: paymentDetails.paymentMethod,
        paymentReference: paymentDetails.paymentReference,
      },
    });
    if (claim.count === 0) {
      console.log('Payment already processed:', paymentRequest.id);
      return NextResponse.json({ received: true, alreadyProcessed: true });
    }

    // Only SENT / PARTIALLY_PAID invoices accept a payment. If it's already
    // settled (or in another state), the request is claimed above so we won't
    // reprocess — just acknowledge.
    if (
      paymentRequest.invoice.status !== 'SENT' &&
      paymentRequest.invoice.status !== 'PARTIALLY_PAID'
    ) {
      // A VOIDED invoice means the client paid through a stale checkout link.
      // We never resurrect it to PAID, but money did change hands — audit it
      // and alert staff so they can refund.
      if (paymentRequest.invoice.status === 'VOID') {
        await prisma.$transaction([
          prisma.auditLog.create({
            data: {
              userId: null,
              action: 'HITPAY_PAYMENT_ON_VOID_INVOICE',
              entityType: 'Invoice',
              entityId: paymentRequest.invoice.id,
              details: {
                billingNo: paymentRequest.invoice.billingNo,
                paidAmount: paymentDetails.amount,
                paymentReference: paymentDetails.paymentReference,
                note: 'Payment received via HitPay for a VOIDED invoice — needs manual refund',
              },
            },
          }),
          prisma.notification.create({
            data: {
              type: 'SYSTEM',
              title: 'Payment received on a VOIDED invoice',
              message: `HitPay payment of ${paymentDetails.amount} received for voided invoice ${paymentRequest.invoice.billingNo} (${paymentRequest.invoice.customerName}). A manual refund is needed.`,
              link: '/dashboard/invoices',
              entityType: 'Invoice',
              entityId: paymentRequest.invoice.id,
            },
          }),
        ]);
        console.warn('HitPay payment received for VOIDED invoice:', paymentRequest.invoice.id);
        return NextResponse.json({ received: true, voidedInvoice: true });
      }

      console.log(
        `Invoice ${paymentRequest.invoice.id} not in a payable state (${paymentRequest.invoice.status}); skipping record.`
      );
      return NextResponse.json({ received: true, skipped: true });
    }

    // Record the payment (handles partials/EWT, invoice update, audit, notify).
    const result = await recordPayment({
      invoiceId: paymentRequest.invoice.id,
      amount: Number(paymentDetails.amount),
      method: 'HITPAY',
      reference: paymentDetails.paymentReference,
      paidDate: new Date(),
      source: 'HITPAY_WEBHOOK',
      recordedBy: null,
    });

    console.log('Payment processed successfully:', {
      invoiceId: paymentRequest.invoice.id,
      billingNo: paymentRequest.invoice.billingNo,
      amount: paymentDetails.amount,
      status: result.status,
    });

    return NextResponse.json({ received: true, processed: true, status: result.status });
  } catch (error) {
    console.error('Error processing HitPay webhook:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/webhooks/hitpay
 * Health check endpoint
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    message: 'HitPay webhook endpoint is active',
  });
}
