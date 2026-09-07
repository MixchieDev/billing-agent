/**
 * "Smart reminder" asking a client for the BIR 2307 certificate they owe us.
 *
 * Deliberately NOT a pre-filled certificate: we show OUR reconciliation
 * (invoiced vs. received ⇒ implied withholding) and ask the client to issue the
 * 2307 from their own records. That gives their AP every figure they need
 * without us asserting their tax position — the amount on the certificate must
 * match what they actually remitted to the BIR.
 */

import prisma from './prisma';
import { EmailStatus } from '@/generated/prisma';
import {
  initEmailServiceFromEnv,
  replacePlaceholders,
  sendBillingEmail,
  EmailPlaceholderData,
} from './email-service';
import { certificateAmount } from './wht2307';
import { formatCurrency, formatDate } from './utils';

export interface Wht2307RequestResult {
  success: boolean;
  message: string;
  sentTo?: string;
  requestCount?: number;
}

/** Figures the client's AP needs to issue the certificate. */
export interface Wht2307Figures {
  invoiced: number; // gross, before tax withheld
  withheld: number; // the certificate value
  netBilled: number; // what our invoice actually asked for (invoiced − withheld)
  received: number; // cash actually collected
  variance: number; // netBilled − received; non-zero means an unexplained gap
  atcCode: string | null;
  settledDate: string;
}

/** Sub-peso rounding noise shouldn't surface as a "difference" line. */
const VARIANCE_TOLERANCE = 1;

const DEFAULT_SUBJECT =
  'Request for BIR Form 2307 — Invoice {{billingNo}}';
const DEFAULT_GREETING = 'Dear {{customerName}},';
const DEFAULT_BODY = [
  'Thank you for settling invoice {{billingNo}}.',
  '',
  'Our records show tax was withheld on this payment, so we are requesting the corresponding BIR Form 2307 (Certificate of Creditable Tax Withheld at Source).',
  '',
  'For your reference:',
  '  • Invoice: {{billingNo}} (settled {{settledDate}})',
  '  • Amount invoiced, before tax withheld: {{invoicedAmount}}',
  '  • Less: creditable tax withheld{{atcSuffix}}: {{withheldAmount}}',
  '  • Net amount billed: {{netBilledAmount}}',
  '  • Amount received: {{receivedAmount}}',
  '{{varianceLine}}',
  'If your records show a different amount or period, please issue the certificate based on what you actually remitted and let us know — we will update our books to match.',
].join('\n');
const DEFAULT_CLOSING = 'Thank you for your assistance.\n\nBest regards,\n{{companyName}} Billing Team';

/** True when cash received doesn't match what we billed net of withholding. */
export function hasVariance(f: Wht2307Figures): boolean {
  return Math.abs(f.variance) >= VARIANCE_TOLERANCE;
}

/**
 * Never let the email imply a figure it can't support: if the cash doesn't tie
 * out to the net billed, say so plainly rather than folding the gap into the
 * withholding number.
 */
function varianceSentence(f: Wht2307Figures): string {
  if (!hasVariance(f)) return '';
  return f.variance > 0
    ? `  • Difference not yet accounted for: ${formatCurrency(f.variance)}`
    : `  • Received in excess of the net billed: ${formatCurrency(Math.abs(f.variance))}`;
}

/** Placeholders unique to this email, applied after the shared ones. */
function applyWht2307Placeholders(text: string, f: Wht2307Figures): string {
  const variance = varianceSentence(f);
  return text
    .replace(/\{\{invoicedAmount\}\}/g, formatCurrency(f.invoiced))
    .replace(/\{\{receivedAmount\}\}/g, formatCurrency(f.received))
    .replace(/\{\{withheldAmount\}\}/g, formatCurrency(f.withheld))
    .replace(/\{\{netBilledAmount\}\}/g, formatCurrency(f.netBilled))
    .replace(/\{\{varianceLine\}\}\n?/g, variance ? `${variance}\n\n` : '\n')
    .replace(/\{\{atcCode\}\}/g, f.atcCode ?? '')
    .replace(/\{\{atcSuffix\}\}/g, f.atcCode ? ` (ATC ${f.atcCode})` : '')
    .replace(/\{\{settledDate\}\}/g, f.settledDate);
}

function buildHtml(greeting: string, body: string, closing: string, f: Wht2307Figures): string {
  const row = (label: string, value: string, strong = false) =>
    `<tr><td style="padding:6px 12px;color:#555;">${label}</td><td style="padding:6px 12px;text-align:right;${
      strong ? 'font-weight:600;' : ''
    }">${value}</td></tr>`;
  // The body already contains a plain-text version of the figures; for HTML we
  // drop those lines and render a table instead.
  const bodyHtml = body
    .split('\n')
    .filter((l) => !l.trim().startsWith('•') && l.trim() !== 'For your reference:')
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n\n')
    .map((p) => `<p style="margin:0 0 12px;">${p.replace(/\n/g, '<br>')}</p>`)
    .join('');

  return `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222;line-height:1.6;">
<p style="margin:0 0 12px;">${greeting}</p>
${bodyHtml}
<table style="border-collapse:collapse;border:1px solid #e5e5e5;margin:16px 0;min-width:380px;">
${row('Amount invoiced, before tax withheld', formatCurrency(f.invoiced))}
${row(
  `Less: creditable tax withheld${f.atcCode ? ` (ATC ${f.atcCode})` : ''}`,
  `(${formatCurrency(f.withheld)})`,
  true
)}
${row('Net amount billed', formatCurrency(f.netBilled))}
${row('Amount received', formatCurrency(f.received))}
${
  hasVariance(f)
    ? row(
        f.variance > 0 ? 'Difference not yet accounted for' : 'Received in excess of net billed',
        formatCurrency(Math.abs(f.variance))
      )
    : ''
}
</table>
<p style="margin:0 0 12px;white-space:pre-line;">${closing}</p>
</body></html>`;
}

export type ComposedWht2307Request =
  | { ok: false; message: string }
  | {
      ok: true;
      invoiceId: string;
      billingNo: string;
      customerName: string;
      toEmails: string;
      subject: string;
      plain: string;
      html: string;
      figures: Wht2307Figures;
    };

/**
 * Build the request email without sending it — so a preview and the real send
 * can never show different numbers. Returns a reason when no request is due.
 */
export async function composeWht2307Request(
  invoiceId: string
): Promise<ComposedWht2307Request> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true,
      billingNo: true,
      customerName: true,
      customerEmail: true,
      customerEmails: true,
      grossAmount: true,
      netAmount: true,
      amountPaidTotal: true,
      withholdingTax: true,
      withholdingCode: true,
      balanceDue: true,
      paidAt: true,
      dueDate: true,
      periodStart: true,
      periodEnd: true,
      wht2307Status: true,
      wht2307RequestCount: true,
      company: { select: { name: true } },
    },
  });

  if (!invoice) return { ok: false, message: 'Invoice not found' };
  if (invoice.wht2307Status !== 'PENDING') {
    return {
      ok: false,
      message:
        invoice.wht2307Status === 'RECEIVED'
          ? 'The 2307 for this invoice has already been received.'
          : 'This invoice has no withholding tax, so no 2307 is expected.',
    };
  }

  const toEmails = invoice.customerEmails || invoice.customerEmail;
  if (!toEmails) {
    return { ok: false, message: 'No email address on this invoice.' };
  }

  const withheld = certificateAmount(invoice);
  if (withheld <= 0) {
    return { ok: false, message: 'No withholding amount could be determined for this invoice.' };
  }

  // We bill NET of withholding, so the figure the client's AP recognises is
  // gross − withheld. Deriving netBilled here (rather than reading netAmount)
  // keeps the ladder self-consistent for the unbilled-withholding case, where
  // netAmount still equals gross and the tax shows up as a residual balance.
  const invoiced = Number(invoice.grossAmount);
  const received = Number(invoice.amountPaidTotal ?? 0);
  const netBilled = invoiced - withheld;
  const figures: Wht2307Figures = {
    invoiced,
    withheld,
    netBilled,
    received,
    variance: netBilled - received,
    atcCode: invoice.withholdingCode,
    settledDate: invoice.paidAt ? formatDate(invoice.paidAt) : '—',
  };

  // Template (editable in Settings) with a sensible built-in default.
  const tmpl = await prisma.emailTemplate.findFirst({
    where: { templateType: 'WHT2307_REQUEST' },
  });

  const shared: EmailPlaceholderData = {
    customerName: invoice.customerName,
    billingNo: invoice.billingNo || invoice.id.slice(0, 8),
    dueDate: formatDate(invoice.dueDate),
    totalAmount: formatCurrency(Number(invoice.netAmount)),
    periodStart: invoice.periodStart ? formatDate(invoice.periodStart) : '',
    periodEnd: invoice.periodEnd ? formatDate(invoice.periodEnd) : '',
    companyName: invoice.company?.name || 'YAHSHUA-ABBA',
    clientCompanyName: invoice.customerName,
  };

  const fill = (text: string) => applyWht2307Placeholders(replacePlaceholders(text, shared), figures);

  const subject = fill(tmpl?.subject || DEFAULT_SUBJECT);
  const greeting = fill(tmpl?.greeting || DEFAULT_GREETING);
  const body = fill(tmpl?.body || DEFAULT_BODY);
  const closing = fill(tmpl?.closing || DEFAULT_CLOSING);

  return {
    ok: true,
    invoiceId: invoice.id,
    billingNo: invoice.billingNo || invoice.id.slice(0, 8),
    customerName: invoice.customerName,
    toEmails,
    subject,
    plain: `${greeting}\n\n${body}\n\n${closing}`,
    html: buildHtml(greeting, body, closing, figures),
    figures,
  };
}

/**
 * Email the client asking for the 2307 on a settled invoice. Only valid while
 * the certificate is still pending.
 */
export async function sendWht2307Request(
  invoiceId: string,
  userId?: string | null
): Promise<Wht2307RequestResult> {
  initEmailServiceFromEnv();

  const composed = await composeWht2307Request(invoiceId);
  if (!composed.ok) return { success: false, message: composed.message };

  const { toEmails, subject, plain, html, figures, billingNo, customerName } = composed;

  const result = await sendBillingEmail(composed.invoiceId, toEmails, subject, plain, html);
  if (!result.success) {
    return { success: false, message: result.error || 'Failed to send the request' };
  }

  const updated = await prisma.invoice.update({
    where: { id: composed.invoiceId },
    data: {
      wht2307RequestedAt: new Date(),
      wht2307RequestCount: { increment: 1 },
    },
    select: { wht2307RequestCount: true },
  });

  await prisma.auditLog.create({
    data: {
      userId: userId ?? null,
      action: 'WHT2307_REQUESTED',
      entityType: 'Invoice',
      entityId: composed.invoiceId,
      details: {
        billingNo,
        customerName,
        to: toEmails,
        withheldAmount: figures.withheld,
        atcCode: figures.atcCode,
        requestCount: updated.wht2307RequestCount,
      },
    },
  });

  return {
    success: true,
    message: `2307 request sent to ${toEmails}`,
    sentTo: toEmails,
    requestCount: updated.wht2307RequestCount,
  };
}

export const WHT2307_DEFAULTS = {
  subject: DEFAULT_SUBJECT,
  greeting: DEFAULT_GREETING,
  body: DEFAULT_BODY,
  closing: DEFAULT_CLOSING,
};

// Re-exported so tests can exercise the placeholder logic directly.
export const __test = { applyWht2307Placeholders, buildHtml, varianceSentence };
export type { EmailStatus };
