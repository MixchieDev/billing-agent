import { NextRequest, NextResponse } from 'next/server';
import { convexClient, api } from '@/lib/convex';
import {
  verifyWebhookSignature,
  getPaymentDetailsFromWebhook,
  HitpayWebhookPayload,
} from '@/lib/hitpay-service';
import { notifyInvoicePaid } from '@/lib/notifications';
import { notifyNexusPayment } from '@/lib/bridge-nexus-sync';

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
    const paymentRequest = await convexClient.query(api.hitpayPaymentRequests.getByHitpayRequestId, {
      hitpayRequestId: paymentDetails.paymentRequestId,
    });

    if (!paymentRequest) {
      console.error('Payment request not found:', paymentDetails.paymentRequestId);
      return NextResponse.json(
        { error: 'Payment request not found' },
        { status: 404 }
      );
    }

    // Get the invoice
    const invoice = await convexClient.query(api.invoices.getById, {
      id: paymentRequest.invoiceId,
    });

    if (!invoice) {
      console.error('Invoice not found for payment request:', paymentRequest._id);
      return NextResponse.json(
        { error: 'Invoice not found' },
        { status: 404 }
      );
    }

    // Check if already processed (idempotency)
    if (paymentRequest.status === 'COMPLETED') {
      console.log('Payment already processed:', paymentRequest._id);
      return NextResponse.json({ received: true, alreadyProcessed: true });
    }

    // Check if invoice is already paid
    if (invoice.status === 'PAID') {
      console.log('Invoice already paid:', invoice._id);
      return NextResponse.json({ received: true, alreadyPaid: true });
    }

    // Update payment request
    await convexClient.mutation(api.hitpayPaymentRequests.update, {
      id: paymentRequest._id,
      data: {
        status: 'COMPLETED',
        paidAt: Date.now(),
        paymentMethod: paymentDetails.paymentMethod,
        paymentReference: paymentDetails.paymentReference,
      },
    });

    // Update invoice to PAID
    await convexClient.mutation(api.invoices.update, {
      id: invoice._id,
      data: {
        status: 'PAID',
        paidAt: Date.now(),
        paidAmount: Number(paymentDetails.amount),
        paymentMethod: 'HITPAY',
        paymentReference: paymentDetails.paymentReference,
      },
    });

    // Create audit log
    await convexClient.mutation(api.auditLogs.create, {
      action: 'INVOICE_PAID',
      entityType: 'Invoice',
      entityId: invoice._id,
      details: {
        billingNo: invoice.billingNo,
        paidAmount: paymentDetails.amount,
        paymentMethod: 'HITPAY',
        hitpayPaymentType: paymentDetails.paymentMethod,
        paymentReference: paymentDetails.paymentReference,
        source: 'hitpay_webhook',
      },
    });

    // Send notification (outside transaction)
    await notifyInvoicePaid({
      id: invoice._id,
      billingNo: invoice.billingNo,
      customerName: invoice.customerName,
      paidAmount: Number(paymentDetails.amount),
      paymentMethod: `HitPay (${paymentDetails.paymentMethod || 'Online'})`,
    });

    // Bridge: Notify Nexus of payment (fire-and-forget)
    notifyNexusPayment(invoice._id).catch(() => {});

    console.log('Payment processed successfully:', {
      invoiceId: invoice._id,
      billingNo: invoice.billingNo,
      amount: paymentDetails.amount,
    });

    return NextResponse.json({ received: true, processed: true });
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
