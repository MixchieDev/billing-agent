/**
 * Receivables feed: billing agent → cash management.
 *
 * Alongside the contract sync, billing agent sends what is actually owed (one
 * receivable per invoice) and what actually landed (one collection per
 * payment). Both are owned entirely by billing agent; the cash app only reads
 * them. Design: docs/RECEIVABLES_FEED_DESIGN.md.
 *
 * Two ways rows reach cash management, like the contract sync:
 *   1. on each change, via syncReceivablesForInvoices — scheduled with `after()`
 *   2. a full reconcile, nightly and on demand, followed by a prune of rows the
 *      run didn't touch (deleted invoices, history older than the window)
 *
 * Only client commitments count as cash in the forecast, so each receivable
 * carries where its expected date came from: a promise, a PDC, the payment
 * terms (not yet due), or nothing (overdue with no commitment).
 */
import prisma from './prisma';
import type { InvoiceStatus, Prisma } from '@/generated/prisma';
import { getSetting } from './settings';
import { entityCode, isoDate, post } from './cash-management-sync';
import { forecastInputsFor } from './forecast-inputs';

/** History window for paid invoices and payments. */
export const HISTORY_MONTHS = 13;
/** Rows per request; the receiver accepts at most 200. */
const BATCH_SIZE = 100;
const DAY_MS = 86_400_000;

export type ReceivableState = 'PENDING' | 'OPEN' | 'PARTIAL' | 'PAID' | 'VOID';
export type ExpectedSource = 'PROMISE' | 'PDC' | 'TERMS' | 'NONE';

export function stateFor(status: InvoiceStatus): ReceivableState {
  switch (status) {
    case 'PENDING':
      return 'PENDING';
    case 'APPROVED':
    case 'SENT':
      return 'OPEN';
    case 'PARTIALLY_PAID':
      return 'PARTIAL';
    case 'PAID':
      return 'PAID';
    default:
      return 'VOID'; // VOID, REJECTED: nothing is owed
  }
}

export interface Expectation {
  expectedDate: string | null;
  expectedSource: ExpectedSource;
  promisedAmount: number | null;
}

/**
 * When the cash is expected, first match wins: an open promise, a pending PDC,
 * the payment terms for an invoice not yet due (due date + the client's usual
 * lag), or nothing for an overdue invoice with no commitment.
 */
export function expectationFor(args: {
  state: ReceivableState;
  dueDate: Date;
  promise: { promisedDate: Date; promisedAmount: unknown } | null;
  pdc: { checkDate: Date } | null;
  lagDays: number | null;
  today: Date;
}): Expectation {
  const { state, dueDate, promise, pdc, lagDays, today } = args;
  if (state !== 'OPEN' && state !== 'PARTIAL') {
    return { expectedDate: null, expectedSource: 'NONE', promisedAmount: null };
  }
  if (promise) {
    return {
      expectedDate: isoDate(promise.promisedDate),
      expectedSource: 'PROMISE',
      promisedAmount: promise.promisedAmount != null ? Number(promise.promisedAmount) : null,
    };
  }
  if (pdc) return { expectedDate: isoDate(pdc.checkDate), expectedSource: 'PDC', promisedAmount: null };
  if (isoDate(dueDate)! >= isoDate(today)!) {
    const expected = new Date(dueDate.getTime() + (lagDays ?? 0) * DAY_MS);
    return { expectedDate: isoDate(expected), expectedSource: 'TERMS', promisedAmount: null };
  }
  return { expectedDate: null, expectedSource: 'NONE', promisedAmount: null };
}

const INVOICE_SELECT = {
  id: true,
  billingNo: true,
  customerName: true,
  status: true,
  periodStart: true,
  statementDate: true,
  dueDate: true,
  netAmount: true,
  balanceDue: true,
  amountPaidTotal: true,
  paidAt: true,
  company: { select: { name: true } },
  contracts: { select: { id: true, customerNumber: true }, orderBy: { customerNumber: 'asc' } },
  promises: {
    where: { status: 'OPEN' },
    select: { promisedDate: true, promisedAmount: true },
    orderBy: { createdAt: 'desc' },
    take: 1,
  },
  pdcChecks: {
    where: { status: { in: ['WAREHOUSED', 'DEPOSITED'] } },
    select: { checkDate: true },
    orderBy: { checkDate: 'asc' },
    take: 1,
  },
} satisfies Prisma.InvoiceSelect;

type FeedInvoice = Prisma.InvoiceGetPayload<{ select: typeof INVOICE_SELECT }>;

export function buildReceivable(inv: FeedInvoice, lagDays: number | null, today: Date) {
  const state = stateFor(inv.status);
  const balanceDue =
    state === 'PAID'
      ? 0
      : Number(inv.balanceDue ?? Number(inv.netAmount) - Number(inv.amountPaidTotal ?? 0));
  return {
    invoiceId: inv.id,
    entity: entityCode(inv.company.name),
    billingNo: inv.billingNo,
    customerName: inv.customerName,
    customerNumbers: inv.contracts.map((c) => c.customerNumber).filter((n): n is string => !!n),
    // Manual invoices have no period; the statement month stands in for it.
    periodStart: isoDate(inv.periodStart ?? inv.statementDate),
    statementDate: isoDate(inv.statementDate)!,
    dueDate: isoDate(inv.dueDate)!,
    netAmount: Number(inv.netAmount),
    balanceDue: Math.round(balanceDue * 100) / 100,
    state,
    ...expectationFor({
      state,
      dueDate: inv.dueDate,
      promise: inv.promises[0] ?? null,
      pdc: inv.pdcChecks[0] ?? null,
      lagDays,
      today,
    }),
    paidAt: isoDate(inv.paidAt),
  };
}

const PAYMENT_SELECT = {
  id: true,
  invoiceId: true,
  amount: true,
  paidDate: true,
  method: true,
  receivedInBank: true,
  receivedInAccountNo: true,
  invoice: {
    select: {
      company: { select: { name: true } },
      contracts: { select: { customerNumber: true }, orderBy: { customerNumber: 'asc' }, take: 1 },
    },
  },
} satisfies Prisma.InvoicePaymentSelect;

type FeedPayment = Prisma.InvoicePaymentGetPayload<{ select: typeof PAYMENT_SELECT }>;

export function buildCollection(p: FeedPayment) {
  return {
    paymentId: p.id,
    invoiceId: p.invoiceId,
    entity: entityCode(p.invoice.company.name),
    customerNumber: p.invoice.contracts[0]?.customerNumber ?? null,
    amount: Number(p.amount),
    paidDate: isoDate(p.paidDate)!,
    method: p.method,
    receivedInBank: p.receivedInBank,
    receivedInAccountNo: p.receivedInAccountNo,
  };
}

/** The client's usual lag, from the first of the invoice's contracts that has one. */
async function lagsForInvoices(invoices: FeedInvoice[]): Promise<Map<string, number | null>> {
  const contractIds = [...new Set(invoices.flatMap((i) => i.contracts.map((c) => c.id)))];
  const inputs = await forecastInputsFor(contractIds);
  return new Map(
    invoices.map((i) => [
      i.id,
      i.contracts.map((c) => inputs.get(c.id)?.paymentLagDays ?? null).find((l) => l != null) ?? null,
    ])
  );
}

async function sendBatches<T>(path: string, key: string, rows: T[], syncedAt: number) {
  const errors: string[] = [];
  let sent = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const r = await post(path, { [key]: chunk, syncedAt });
    if (r.ok) sent += chunk.length;
    else errors.push(`${key} ${i + 1}-${i + chunk.length}: ${r.error ?? `HTTP ${r.status}`}`);
  }
  return { sent, errors };
}

/** Per-change sync and the nightly run both stay off until this is switched on. */
export async function receivablesFeedEnabled(): Promise<boolean> {
  return (await getSetting('cashSync.receivablesEnabled')) === true;
}

/**
 * Push the current state of some invoices and their payments. Call with
 * `after()` from any route that changes an invoice, a payment, a promise or a
 * PDC. A voided or rejected invoice is sent as VOID, which removes it there.
 */
export async function syncReceivablesForInvoices(invoiceIds: string[]): Promise<void> {
  const ids = [...new Set(invoiceIds.filter(Boolean))];
  if (!ids.length || !(await receivablesFeedEnabled())) return;
  try {
    const [invoices, payments] = await prisma.$transaction([
      prisma.invoice.findMany({ where: { id: { in: ids } }, select: INVOICE_SELECT }),
      prisma.invoicePayment.findMany({ where: { invoiceId: { in: ids } }, select: PAYMENT_SELECT }),
    ]);
    const lags = await lagsForInvoices(invoices);
    const today = new Date();
    const syncedAt = Date.now();
    const r = await sendBatches(
      '/sync-receivables',
      'receivables',
      invoices.map((i) => buildReceivable(i, lags.get(i.id) ?? null, today)),
      syncedAt
    );
    const c = await sendBatches('/sync-collections', 'collections', payments.map(buildCollection), syncedAt);
    const errors = [...r.errors, ...c.errors];
    if (errors.length) await recordFailure(ids, errors);
  } catch (e) {
    await recordFailure(ids, [e instanceof Error ? e.message : String(e)]);
  }
}

/** Fire-and-forget form for `after()`: never throws into the request. */
export function queueReceivableSync(invoiceIds: (string | null | undefined)[]) {
  return () => syncReceivablesForInvoices(invoiceIds.filter((x): x is string => !!x)).catch(() => {});
}

async function recordFailure(invoiceIds: string[], errors: string[]) {
  console.error(`[receivables-feed] ${invoiceIds.length} invoice(s): ${errors.join('; ')}`);
  await prisma.auditLog
    .create({
      data: {
        action: 'CASH_SYNC_FAILED',
        entityType: 'Invoice',
        entityId: invoiceIds[0] ?? 'receivables',
        details: { feed: 'receivables', invoiceIds: invoiceIds.slice(0, 50), errors },
      },
    })
    .catch(() => {});
}

export interface ReceivablesReconcileResult {
  at: string;
  receivables: number;
  collections: number;
  sent: number;
  pruned?: { receivables: number; collections: number };
  errors: string[];
}

/**
 * Push every invoice that is pending, open or partly paid, plus everything paid
 * in the last HISTORY_MONTHS, and every payment in that window. Then prune what
 * the run didn't touch — but only after a clean run, so a failed batch can
 * never delete rows that were simply not re-sent.
 */
export async function reconcileReceivables(): Promise<ReceivablesReconcileResult> {
  const startedAt = new Date();
  const syncedAt = startedAt.getTime();
  const cutoff = new Date(startedAt);
  cutoff.setMonth(cutoff.getMonth() - HISTORY_MONTHS);

  const result: ReceivablesReconcileResult = {
    at: startedAt.toISOString(), receivables: 0, collections: 0, sent: 0, errors: [],
  };
  const job = await prisma.jobRun.create({ data: { jobName: 'cash-receivables-reconcile', status: 'RUNNING' } });

  try {
    const [invoices, payments] = await prisma.$transaction([
      prisma.invoice.findMany({
        where: {
          OR: [
            { status: { in: ['PENDING', 'APPROVED', 'SENT', 'PARTIALLY_PAID'] } },
            { status: 'PAID', paidAt: { gte: cutoff } },
          ],
        },
        select: INVOICE_SELECT,
        orderBy: { createdAt: 'asc' },
      }),
      prisma.invoicePayment.findMany({
        where: { paidDate: { gte: cutoff } },
        select: PAYMENT_SELECT,
        orderBy: { paidDate: 'asc' },
      }),
    ]);
    result.receivables = invoices.length;
    result.collections = payments.length;

    const lags = await lagsForInvoices(invoices);
    const r = await sendBatches(
      '/sync-receivables',
      'receivables',
      invoices.map((i) => buildReceivable(i, lags.get(i.id) ?? null, startedAt)),
      syncedAt
    );
    const c = await sendBatches('/sync-collections', 'collections', payments.map(buildCollection), syncedAt);
    result.sent = r.sent + c.sent;
    result.errors.push(...r.errors, ...c.errors);

    if (!result.errors.length) {
      const p = await post('/sync-prune', { before: syncedAt });
      if (p.ok) {
        result.pruned = p.body?.deleted as ReceivablesReconcileResult['pruned'];
      } else {
        result.errors.push(`prune: ${p.error ?? `HTTP ${p.status}`}`);
      }
    }

    await prisma.jobRun.update({
      where: { id: job.id },
      data: {
        status: result.errors.length ? 'FAILED' : 'COMPLETED',
        completedAt: new Date(),
        itemsProcessed: result.sent,
        errors: result.errors.length ? result.errors : undefined,
      },
    });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    result.errors.push(error);
    await prisma.jobRun
      .update({ where: { id: job.id }, data: { status: 'FAILED', completedAt: new Date(), errors: [error] } })
      .catch(() => {});
  }

  await prisma.settings
    .upsert({
      where: { key: 'cashSync.receivablesLastRun' },
      update: { value: result as never },
      create: { key: 'cashSync.receivablesLastRun', value: result as never },
    })
    .catch(() => {});
  return result;
}
