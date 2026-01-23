import crypto from 'crypto';

const HITPAY_API_URL = process.env.HITPAY_API_URL || 'https://api.hit-pay.com/v1';
const HITPAY_API_KEY = process.env.HITPAY_API_KEY || '';
const HITPAY_SALT = process.env.HITPAY_SALT || '';

export interface CreatePaymentRequestParams {
  amount: number;
  currency?: string;
  referenceNumber: string;
  email?: string;
  name?: string;
  purpose?: string;
  redirectUrl?: string;
  paymentMethods?: string[];
}

export interface HitpayPaymentRequestResponse {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  amount: string;
  currency: string;
  status: string;
  purpose: string | null;
  reference_number: string | null;
  payment_methods: string[];
  url: string;
  redirect_url: string | null;
  send_sms: boolean;
  send_email: boolean;
  sms_status: string;
  email_status: string;
  allow_repeated_payments: boolean;
  expiry_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface HitpayWebhookPayload {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  amount: string;
  currency: string;
  status: string;
  purpose: string | null;
  reference_number: string | null;
  payment_methods: string[];
  url: string;
  redirect_url: string | null;
  created_at: string;
  updated_at: string;
  payments?: Array<{
    id: string;
    status: string;
    buyer_email: string | null;
    currency: string;
    amount: string;
    refunded_amount: string;
    payment_type: string;
    fees: string;
    created_at: string;
    updated_at: string;
  }>;
}

/**
 * Creates a payment request with HitPay
 */
export async function createPaymentRequest(
  params: CreatePaymentRequestParams
): Promise<HitpayPaymentRequestResponse> {
  const {
    amount,
    currency = 'PHP',
    referenceNumber,
    email,
    name,
    purpose,
    redirectUrl,
    paymentMethods,
  } = params;

  const body = new URLSearchParams();
  body.append('amount', amount.toFixed(2));
  body.append('currency', currency);
  body.append('reference_number', referenceNumber);

  if (email) body.append('email', email);
  if (name) body.append('name', name);
  if (purpose) body.append('purpose', purpose);
  if (redirectUrl) body.append('redirect_url', redirectUrl);

  // Add payment methods if specified
  if (paymentMethods && paymentMethods.length > 0) {
    paymentMethods.forEach((method) => {
      body.append('payment_methods[]', method);
    });
  }

  const response = await fetch(`${HITPAY_API_URL}/payment-requests`, {
    method: 'POST',
    headers: {
      'X-BUSINESS-API-KEY': HITPAY_API_KEY,
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('HitPay API error:', response.status, errorText);
    throw new Error(`HitPay API error: ${response.status} - ${errorText}`);
  }

  const data: HitpayPaymentRequestResponse = await response.json();
  return data;
}

/**
 * Verifies the webhook signature from HitPay
 * Uses HMAC-SHA256 with the salt as the secret key
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string
): boolean {
  const salt = process.env.HITPAY_SALT || '';

  if (!salt) {
    console.error('HITPAY_SALT is not configured');
    return false;
  }

  // Try with raw payload first
  let computedSignature = crypto
    .createHmac('sha256', salt)
    .update(payload)
    .digest('hex');

  if (computedSignature === signature) {
    return true;
  }

  // Try with normalized JSON (parse and re-stringify)
  try {
    const normalizedPayload = JSON.stringify(JSON.parse(payload));
    computedSignature = crypto
      .createHmac('sha256', salt)
      .update(normalizedPayload)
      .digest('hex');

    if (computedSignature === signature) {
      return true;
    }
  } catch {
    // JSON parse failed, continue with other attempts
  }

  // Try with payload + no trailing newline
  const trimmedPayload = payload.trim();
  computedSignature = crypto
    .createHmac('sha256', salt)
    .update(trimmedPayload)
    .digest('hex');

  console.log('Signature verification attempts failed:', {
    receivedSig: signature.substring(0, 16) + '...',
    lastComputedSig: computedSignature.substring(0, 16) + '...',
  });

  return computedSignature === signature;
}

/**
 * Gets the payment status from a webhook payload
 */
export function getPaymentDetailsFromWebhook(payload: HitpayWebhookPayload): {
  paymentRequestId: string;
  status: string;
  amount: string;
  currency: string;
  referenceNumber: string | null;
  paymentMethod: string | null;
  paymentReference: string | null;
} {
  const payment = payload.payments?.[0];

  return {
    paymentRequestId: payload.id,
    status: payload.status,
    amount: payload.amount,
    currency: payload.currency,
    referenceNumber: payload.reference_number,
    paymentMethod: payment?.payment_type || null,
    paymentReference: payment?.id || null,
  };
}
