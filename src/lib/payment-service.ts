/**
 * Payment recording for the collections upgrade (Phase 1, PR-2).
 *
 * Single source of truth for turning a received payment into invoice state.
 * Used by BOTH the manual "record payment" route and the HitPay webhook so the
 * settlement rules (partials, EWT / 2307, PAID vs PARTIALLY_PAID) live in one
 * tested place.
 *
 * Billing convention (from calculateBilling in utils.ts): netAmount is ALREADY
 * net of withholding (netAmount = grossAmount − withholdingTax). So a client who
 * withholds pays `netAmount` in cash and separately owes a BIR 2307 certificate
 * for the withheld portion. Therefore: a withholding invoice that settles in full
 * still has a 2307 PENDING.
 */

import { Prisma } from '@/generated/prisma';
import prisma from './prisma';
import { notifyInvoicePaid } from './notifications';

// Peso tolerance for "close enough to settled" (rounding / bank fees).
export const SETTLE_TOLERANCE = new Prisma.Decimal(1);

export type SettlementStatus = 'PAID' | 'PARTIALLY_PAID';

export interface Settlement {
  status: SettlementStatus;
  balanceDue: Prisma.Decimal;
  wht2307Pending: boolean;
  isEwtShort: boolean;
}

/**
 * Pure settlement decision — no I/O, unit-tested directly.
 *
 * @param netAmount        invoice net (cash expected), already net of withholding
 * @param withholdingTax   withholding on the invoice (0 if none)
 * @param amountPaidTotal  sum of all payments received so far
 */
export function computeSettlement(
  netAmount: Prisma.Decimal,
  withholdingTax: Prisma.Decimal,
  amountPaidTotal: Prisma.Decimal
): Settlement {
  const balanceDue = netAmount.minus(amountPaidTotal);
  const withholds = withholdingTax.greaterThan(0);

  // Fully settled: paid the net (within tolerance, incl. small overpayment).
  if (balanceDue.lessThanOrEqualTo(SETTLE_TOLERANCE)) {
    return { status: 'PAID', balanceDue, wht2307Pending: withholds, isEwtShort: false };
  }

  // Short by exactly the EWT: client withheld on the net-billed amount. Treat as
  // a full settlement with the 2307 pending (brief §3.2 tolerance rule).
  if (withholds && balanceDue.minus(withholdingTax).abs().lessThanOrEqualTo(SETTLE_TOLERANCE)) {
    return { status: 'PAID', balanceDue, wht2307Pending: true, isEwtShort: true };
  }

  return { status: 'PARTIALLY_PAID', balanceDue, wht2307Pending: false, isEwtShort: false };
}

export interface RecordPaymentInput {
  invoiceId: string;
  amount: number | string | Prisma.Decimal;
  method: string; // CASH | BANK_TRANSFER | CHECK | HITPAY
  reference?: string | null;
  paidDate?: Date;
  source?: string; // MANUAL | HITPAY_WEBHOOK | BANKREC_SUGGESTED
  recordedBy?: string | null;
}

export interface RecordPaymentResult {
  invoiceId: string;
  status: SettlementStatus;
  amountPaidTotal: string;
  balanceDue: string;
  isEwtShort: boolean;
  wht2307Pending: boolean;
  fullySettled: boolean;
}

/**
 * Append a payment and recompute invoice settlement state atomically. Keeps the
 * legacy single-payment fields (paidAt/paidAmount/paymentMethod/paymentReference)
 * in sync so existing reads keep working. Returns the resulting state; the caller
 * fires notifications.
 */
export async function recordPayment(
  input: RecordPaymentInput
): Promise<RecordPaymentResult> {
  const amount = new Prisma.Decimal(input.amount);
  if (amount.lessThanOrEqualTo(0)) {
    throw new Error('Payment amount must be greater than zero');
  }
  const paidDate = input.paidDate ?? new Date();
  const method = input.method;
  const reference = input.reference ?? null;

  const result = await prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findUnique({
      where: { id: input.invoiceId },
      select: {
        id: true,
        billingNo: true,
        customerName: true,
        status: true,
        netAmount: true,
        withholdingTax: true,
      },
    });
    if (!invoice) throw new Error('Invoice not found');
    if (invoice.status !== 'SENT' && invoice.status !== 'PARTIALLY_PAID') {
      throw new Error(
        `Cannot record a payment while status is ${invoice.status}. Only SENT or PARTIALLY_PAID invoices accept payments.`
      );
    }

    const payment = await tx.invoicePayment.create({
      data: {
        invoiceId: invoice.id,
        amount,
        method,
        reference,
        paidDate,
        source: input.source ?? 'MANUAL',
        recordedBy: input.recordedBy ?? null,
      },
    });

    const agg = await tx.invoicePayment.aggregate({
      where: { invoiceId: invoice.id },
      _sum: { amount: true },
    });
    const amountPaidTotal = agg._sum.amount ?? new Prisma.Decimal(0);

    const settlement = computeSettlement(
      invoice.netAmount,
      invoice.withholdingTax ?? new Prisma.Decimal(0),
      amountPaidTotal
    );

    if (settlement.isEwtShort) {
      await tx.invoicePayment.update({
        where: { id: payment.id },
        data: { isEwtShort: true },
      });
    }

    const data: Prisma.InvoiceUpdateInput = {
      status: settlement.status,
      amountPaidTotal,
      balanceDue: settlement.balanceDue,
      paidAmount: amountPaidTotal, // keep legacy field in sync
    };
    if (settlement.status === 'PAID') {
      data.paidAt = paidDate;
      data.paymentMethod = method;
      data.paymentReference = reference;
      if (settlement.wht2307Pending) data.wht2307Status = 'PENDING';
    }

    await tx.invoice.update({ where: { id: invoice.id }, data });

    await tx.auditLog.create({
      data: {
        userId: input.recordedBy ?? null,
        action: settlement.status === 'PAID' ? 'INVOICE_PAID' : 'INVOICE_PAYMENT_RECORDED',
        entityType: 'Invoice',
        entityId: invoice.id,
        details: {
          billingNo: invoice.billingNo,
          amount: amount.toString(),
          method,
          reference,
          source: input.source ?? 'MANUAL',
          amountPaidTotal: amountPaidTotal.toString(),
          balanceDue: settlement.balanceDue.toString(),
          status: settlement.status,
          isEwtShort: settlement.isEwtShort,
          wht2307Pending: settlement.wht2307Pending,
        },
      },
    });

    return {
      invoice,
      amountPaidTotal,
      settlement,
    };
  });

  const fullySettled = result.settlement.status === 'PAID';
  if (fullySettled) {
    await notifyInvoicePaid({
      id: result.invoice.id,
      billingNo: result.invoice.billingNo,
      customerName: result.invoice.customerName,
      paidAmount: Number(result.amountPaidTotal),
      paymentMethod: method,
    });
  }

  return {
    invoiceId: result.invoice.id,
    status: result.settlement.status,
    amountPaidTotal: result.amountPaidTotal.toString(),
    balanceDue: result.settlement.balanceDue.toString(),
    isEwtShort: result.settlement.isEwtShort,
    wht2307Pending: result.settlement.wht2307Pending,
    fullySettled,
  };
}
