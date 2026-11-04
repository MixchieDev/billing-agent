/**
 * Forecast inputs the cash management app needs per contract, computed here
 * because billing agent holds the schedules and the payment history:
 *   - expected cash per billing cycle, net of VAT and withholding, using the
 *     same calculateBilling call the invoice generator makes
 *   - how many days after the due date the client usually pays
 *   - how reliably they pay on time
 */
import prisma from './prisma';
import { calculateBilling } from './utils';
import { getVatRate } from './settings';
import type { BillingFrequency, VatType } from '@/generated/prisma';

/** Settled invoices per client that the lag and reliability are taken from. */
export const HISTORY_SIZE = 6;
/** Paid within this many days of the due date counts as on time. */
export const ON_TIME_DAYS = 7;
const MAX_LAG_DAYS = 90;
const DAY_MS = 86_400_000;

const CYCLE_MONTHS: Record<BillingFrequency, number | null> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  ANNUALLY: 12,
  CUSTOM: null,
};

export interface ScheduleTerms {
  billingAmount: unknown;
  vatType: VatType;
  hasWithholding: boolean;
  withholdingRate: unknown;
  frequency: BillingFrequency;
  dueDayOfMonth: number | null;
}

export interface ForecastInputs {
  expectedCashPerCycle: number | null;
  cycleMonths: number | null;
  dueDayOfMonth: number | null;
  paymentLagDays: number | null;
  billingReliability: number | null;
}

/**
 * The cash one billing cycle lands as. Invoices are generated VAT-exclusive
 * (VAT added on top of the schedule amount) and net of withholding.
 */
export function cashPerCycle(t: ScheduleTerms, vatRate: number): number {
  return calculateBilling(
    Number(t.billingAmount ?? 0),
    false,
    t.vatType === 'VAT',
    t.hasWithholding,
    t.withholdingRate != null ? Number(t.withholdingRate) : 0.02,
    vatRate
  ).netAmount;
}

/** Days paid after due (negative = early), newest first. */
export function lagDays(dueDate: Date, paidAt: Date): number {
  return Math.round((paidAt.getTime() - dueDate.getTime()) / DAY_MS);
}

/** Median lag, clamped to 0–90 days; null with fewer than two settled invoices. */
export function medianLag(lags: number[]): number | null {
  if (lags.length < 2) return null;
  const sorted = [...lags].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  return Math.min(MAX_LAG_DAYS, Math.max(0, median));
}

/** Share of settled invoices paid within ON_TIME_DAYS of due; null with no history. */
export function reliability(lags: number[]): number | null {
  if (!lags.length) return null;
  return Math.round((lags.filter((d) => d <= ON_TIME_DAYS).length / lags.length) * 100) / 100;
}

/**
 * Forecast inputs for many contracts in one round trip. Reads the contract's
 * active schedule (where the real amount, tax setup and due day live) and its
 * last HISTORY_SIZE settled invoices.
 */
export async function forecastInputsFor(contractIds: string[]): Promise<Map<string, ForecastInputs>> {
  const out = new Map<string, ForecastInputs>();
  if (!contractIds.length) return out;

  const [schedules, history] = await prisma.$transaction([
    prisma.scheduledBilling.findMany({
      where: { contractId: { in: contractIds }, status: 'ACTIVE' },
      select: {
        contractId: true,
        billingAmount: true,
        vatType: true,
        hasWithholding: true,
        withholdingRate: true,
        frequency: true,
        dueDayOfMonth: true,
        billingDayOfMonth: true,
      },
      orderBy: { updatedAt: 'desc' },
    }),
    // Implicit many-to-many: "A" is the contract, "B" the invoice.
    prisma.$queryRaw<{ contractId: string; dueDate: Date; paidAt: Date }[]>`
      SELECT "contractId", "dueDate", "paidAt" FROM (
        SELECT ci."A" AS "contractId", i."dueDate", i."paidAt",
               ROW_NUMBER() OVER (PARTITION BY ci."A" ORDER BY i."paidAt" DESC) AS n
        FROM "_ContractToInvoice" ci
        JOIN "Invoice" i ON i.id = ci."B"
        WHERE ci."A" = ANY(${contractIds}) AND i.status = 'PAID' AND i."paidAt" IS NOT NULL
      ) h
      WHERE n <= ${HISTORY_SIZE}`,
  ]);
  const vatRate = await getVatRate();

  const scheduleFor = new Map<string, (typeof schedules)[number]>();
  for (const s of schedules) if (!scheduleFor.has(s.contractId)) scheduleFor.set(s.contractId, s);
  const lagsFor = new Map<string, number[]>();
  for (const h of history) {
    const list = lagsFor.get(h.contractId) ?? [];
    list.push(lagDays(h.dueDate, h.paidAt));
    lagsFor.set(h.contractId, list);
  }

  for (const id of contractIds) {
    const s = scheduleFor.get(id);
    const lags = lagsFor.get(id) ?? [];
    out.set(id, {
      expectedCashPerCycle: s ? cashPerCycle(s, vatRate) : null,
      cycleMonths: s ? CYCLE_MONTHS[s.frequency] : null,
      dueDayOfMonth: s ? s.dueDayOfMonth ?? s.billingDayOfMonth : null,
      paymentLagDays: medianLag(lags),
      billingReliability: reliability(lags),
    });
  }
  return out;
}
