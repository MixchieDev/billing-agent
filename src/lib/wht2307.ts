/**
 * BIR Form 2307 (Certificate of Creditable Tax Withheld) tracking.
 *
 * When a client withholds tax they pay us less cash and owe us a 2307
 * certificate instead — it's a real receivable (a creditable tax asset), so we
 * track which ones are still outstanding and how long they've been pending.
 *
 * The certificate amount lives in one of two places depending on how the
 * invoice settled (see payment-service):
 *   - billed with withholding  → the invoice's `withholdingTax`
 *   - unbilled, operator flagged the shortfall as withholding → the residual
 *     `balanceDue` left on the settled invoice
 */

export interface Wht2307Source {
  withholdingTax: unknown; // Prisma.Decimal | number | null
  balanceDue: unknown; // Prisma.Decimal | number | null
}

const toNumber = (v: unknown): number => {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** The peso value the certificate should cover. */
export function certificateAmount(invoice: Wht2307Source): number {
  const billed = toNumber(invoice.withholdingTax);
  if (billed > 0) return billed;
  // Unbilled withholding: the shortfall left on the settled invoice.
  const residual = toNumber(invoice.balanceDue);
  return residual > 0 ? residual : 0;
}

export type Wht2307AgeBucket = 'd0_30' | 'd31_60' | 'd61_90' | 'd90plus';

export const WHT2307_BUCKETS: Array<{ key: Wht2307AgeBucket; label: string }> = [
  { key: 'd0_30', label: '0–30 days' },
  { key: 'd31_60', label: '31–60 days' },
  { key: 'd61_90', label: '61–90 days' },
  { key: 'd90plus', label: '90+ days' },
];

/**
 * How long a certificate has been outstanding, measured from the day the
 * invoice was settled (that's when the client owes us the 2307).
 */
export function daysPending(paidAt: Date | null | undefined, today: Date): number {
  if (!paidAt) return 0;
  const start = new Date(paidAt);
  start.setHours(0, 0, 0, 0);
  const end = new Date(today);
  end.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86_400_000));
}

export function ageBucket(days: number): Wht2307AgeBucket {
  if (days <= 30) return 'd0_30';
  if (days <= 60) return 'd31_60';
  if (days <= 90) return 'd61_90';
  return 'd90plus';
}
