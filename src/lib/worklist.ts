/**
 * Daily Worklist: pure helpers shared by the API and the page.
 *
 * Days are 'YYYY-MM-DD' strings in Manila time. An item is on the list for
 * every day from its startDate until the day it was marked done, which is how
 * unfinished work carries over without a nightly job and how a past day can
 * still be looked at.
 *
 * Amounts on an item are working targets only. Nothing here changes an
 * invoice, AR or the cash feed.
 */

export const WORKLIST_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED'] as const;
export type WorklistStatusKey = (typeof WORKLIST_STATUSES)[number];

export const WORKLIST_STATUS_LABEL: Record<WorklistStatusKey, string> = {
  TODO: 'To do',
  IN_PROGRESS: 'In progress',
  DONE: 'Done',
  BLOCKED: 'Blocked',
};

/** Invoice statuses that still have money owed, as on the Collections page. */
export const OPEN_INVOICE_STATUSES = ['SENT', 'PARTIALLY_PAID'] as const;

const MAX_AMOUNT = 1_000_000_000_000;
export const MAX_NOTE_LENGTH = 2000;
export const MAX_TITLE_LENGTH = 200;

const manilaFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Manila',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** The Manila calendar day a moment falls on. */
export function manilaDay(d: Date = new Date()): string {
  return manilaFmt.format(d);
}

export function isValidDay(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** A day as the value Prisma writes to a DATE column. */
export function dayToDate(day: string): Date {
  return new Date(day + 'T00:00:00Z');
}

/** A DATE column value back to its day. */
export function dateToDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(day: string, n: number): string {
  return dateToDay(new Date(dayToDate(day).getTime() + n * 86_400_000));
}

/** Whole days from a to b (positive when b is later). */
export function daysBetween(a: string, b: string): number {
  return Math.round((dayToDate(b).getTime() - dayToDate(a).getTime()) / 86_400_000);
}

/** "4 Nov" */
export function shortDay(day: string): string {
  return dayToDate(day).toLocaleDateString('en-PH', { timeZone: 'UTC', day: 'numeric', month: 'short' });
}

/** "Today, Wed 4 Nov" / "Yesterday, …" / "Thu 5 Nov" */
export function dayLabel(day: string, today: string): string {
  const s = dayToDate(day).toLocaleDateString('en-PH', {
    timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short',
  });
  if (day === today) return `Today, ${s}`;
  if (day === addDays(today, -1)) return `Yesterday, ${s}`;
  if (day === addDays(today, 1)) return `Tomorrow, ${s}`;
  return s;
}

/** Prisma where clause: items on the list on this day. */
export function onDayWhere(day: string) {
  const d = dayToDate(day);
  return {
    startDate: { lte: d },
    OR: [{ doneDate: null }, { doneDate: { gte: d } }],
  };
}

/** doneDate after a status change: set on the day it is done, cleared if reopened. */
export function nextDoneDate(
  prev: { status: WorklistStatusKey; doneDate: string | null },
  status: WorklistStatusKey,
  today: string
): string | null {
  if (status !== 'DONE') return null;
  return prev.status === 'DONE' && prev.doneDate ? prev.doneDate : today;
}

/**
 * Reads an amount from a request body. undefined = not given; null = cleared.
 * Returns an error string for anything that isn't a sensible peso amount.
 */
export function parseAmount(v: unknown): { value: number | null | undefined; error?: string } {
  if (v === undefined) return { value: undefined };
  if (v === null || v === '') return { value: null };
  const n = typeof v === 'string' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > MAX_AMOUNT) {
    return { value: undefined, error: 'Amounts must be zero or more' };
  }
  return { value: Math.round(n * 100) / 100 };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** How invoice customer names are matched to contract company names. */
export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * One contract per company name, for grouping. A worklist "client" is every
 * contract under the same company name (a client often has one per product),
 * plus invoices in that name that were never linked to a contract. The first
 * contract given for a name represents it, so pass ACTIVE ones first.
 */
export function contractNameIndex<T extends { id: string; companyName: string }>(contracts: T[]): Map<string, T> {
  const out = new Map<string, T>();
  for (const c of contracts) {
    const k = normalizeName(c.companyName);
    if (!out.has(k)) out.set(k, c);
  }
  return out;
}

/** The client name an invoice belongs to: its contract's, else its own. */
export function invoiceClientKey(inv: { customerName: string; contracts?: { companyName: string }[] }): string {
  return normalizeName(inv.contracts?.[0]?.companyName ?? inv.customerName);
}

// ---------------------------------------------------------------------------
// Client summary: what a client owes and what they've committed to
// ---------------------------------------------------------------------------

export interface OpenInvoiceInput {
  id: string;
  billingNo: string | null;
  customerName: string;
  dueDate: Date;
  netAmount: number;
  balanceDue: number | null;
  amountPaidTotal: number;
  lastFollowUpAt: Date | null;
  lastFollowUpLevel: number;
  contractIds: string[];
  openPromises: { promisedDate: Date; promisedAmount: number | null }[];
  pendingPdcs: { checkDate: Date; amount: number }[];
}

export interface Commitment {
  kind: 'PROMISE' | 'PDC';
  day: string;
  amount: number | null;
}

export interface OpenInvoiceView {
  id: string;
  billingNo: string | null;
  customerName: string;
  netAmount: number;
  balance: number;
  dueDay: string;
  daysOverdue: number;
  commitment: Commitment | null;
}

export interface ClientSummary {
  openBalance: number;
  openInvoiceCount: number;
  oldestDaysOverdue: number;
  overdueUncommitted: number;
  /** Earliest promise or pending PDC across the client's open invoices. */
  nextCommitment: Commitment | null;
  lastFollowUp: { day: string; level: number } | null;
  invoices: OpenInvoiceView[];
}

export function invoiceBalance(inv: Pick<OpenInvoiceInput, 'balanceDue' | 'netAmount' | 'amountPaidTotal'>): number {
  return round2(inv.balanceDue ?? inv.netAmount - inv.amountPaidTotal);
}

/** The commitment that sets when this invoice is expected: earliest promise or PDC. */
function earliestCommitment(inv: OpenInvoiceInput): Commitment | null {
  const all: Commitment[] = [
    ...inv.openPromises.map((p) => ({ kind: 'PROMISE' as const, day: manilaDay(p.promisedDate), amount: p.promisedAmount })),
    ...inv.pendingPdcs.map((c) => ({ kind: 'PDC' as const, day: manilaDay(c.checkDate), amount: c.amount })),
  ];
  all.sort((a, b) => a.day.localeCompare(b.day));
  return all[0] ?? null;
}

export function summarizeClient(invoices: OpenInvoiceInput[], today: string): ClientSummary {
  const views: OpenInvoiceView[] = invoices
    .map((inv) => {
      const dueDay = manilaDay(inv.dueDate);
      return {
        id: inv.id,
        billingNo: inv.billingNo,
        customerName: inv.customerName,
        netAmount: round2(inv.netAmount),
        balance: invoiceBalance(inv),
        dueDay,
        daysOverdue: Math.max(0, daysBetween(dueDay, today)),
        commitment: earliestCommitment(inv),
      };
    })
    .filter((v) => v.balance > 0)
    .sort((a, b) => a.dueDay.localeCompare(b.dueDay));

  const commitments = views.map((v) => v.commitment).filter((c): c is Commitment => c != null);
  commitments.sort((a, b) => a.day.localeCompare(b.day));

  let last: { day: string; level: number } | null = null;
  for (const inv of invoices) {
    if (!inv.lastFollowUpAt) continue;
    const day = manilaDay(inv.lastFollowUpAt);
    if (!last || day > last.day) last = { day, level: inv.lastFollowUpLevel };
  }

  return {
    openBalance: round2(views.reduce((s, v) => s + v.balance, 0)),
    openInvoiceCount: views.length,
    oldestDaysOverdue: views.reduce((m, v) => Math.max(m, v.daysOverdue), 0),
    overdueUncommitted: round2(
      views.filter((v) => v.daysOverdue > 0 && !v.commitment).reduce((s, v) => s + v.balance, 0)
    ),
    nextCommitment: commitments[0] ?? null,
    lastFollowUp: last,
    invoices: views,
  };
}

/**
 * What an item counts toward the day's "to collect" total.
 * The invoiced part is the target if one is set, never more than what is
 * actually still open (a payment since may have shrunk it).
 */
export function itemAmounts(
  item: { targetAmount: number | null; uninvoicedAmount: number },
  openBalance: number | null
): { invoiced: number; uninvoiced: number; total: number } {
  const bal = openBalance ?? 0;
  const invoiced = round2(item.targetAmount == null ? bal : Math.min(item.targetAmount, bal));
  const uninvoiced = round2(item.uninvoicedAmount);
  return { invoiced, uninvoiced, total: round2(invoiced + uninvoiced) };
}

// ---------------------------------------------------------------------------
// Suggestions
// ---------------------------------------------------------------------------

export interface SuggestInvoiceInput extends OpenInvoiceInput {
  contracts: { id: string; companyName: string }[];
}

export interface Suggestion {
  contractId: string;
  companyName: string;
  reason: 'NO_COMMITMENT' | 'PROMISE_DUE';
  amount: number;
  oldestDaysOverdue: number;
}

/**
 * Clients worth a call today: an overdue invoice with no open promise or
 * pending PDC, or a promise falling due today. An invoice with no linked
 * contract is matched by customer name; one that still matches no client
 * can't be suggested, and is counted so the page can say so.
 */
export function buildSuggestions(
  invoices: SuggestInvoiceInput[],
  today: string,
  /** Client name keys already on the day's list. */
  exclude: Set<string>,
  /** Client name key → the contract that represents it. */
  byName: Map<string, { id: string; companyName: string }>
): { suggestions: Suggestion[]; unlinked: number } {
  const byClient = new Map<string, Suggestion>();
  let unlinked = 0;

  for (const inv of invoices) {
    const balance = invoiceBalance(inv);
    if (balance <= 0) continue;
    const dueDay = manilaDay(inv.dueDate);
    const daysOverdue = daysBetween(dueDay, today);
    const commitment = earliestCommitment(inv);
    const promiseToday = inv.openPromises.some((p) => manilaDay(p.promisedDate) === today);
    const uncommitted = daysOverdue > 0 && !commitment;
    if (!uncommitted && !promiseToday) continue;

    const key = invoiceClientKey(inv);
    const c = byName.get(key);
    if (!c) {
      unlinked++;
      continue;
    }
    if (exclude.has(key)) continue;
    const prev = byClient.get(key);
    const reason = uncommitted ? 'NO_COMMITMENT' : 'PROMISE_DUE';
    byClient.set(key, {
      contractId: c.id,
      companyName: c.companyName,
      // A client with any uncommitted overdue invoice is listed for that.
      reason: prev?.reason === 'NO_COMMITMENT' ? 'NO_COMMITMENT' : reason,
      amount: round2((prev?.amount ?? 0) + balance),
      oldestDaysOverdue: Math.max(prev?.oldestDaysOverdue ?? 0, Math.max(0, daysOverdue)),
    });
  }

  const suggestions = [...byClient.values()].sort(
    (a, b) =>
      (a.reason === 'PROMISE_DUE' ? 0 : 1) - (b.reason === 'PROMISE_DUE' ? 0 : 1) ||
      b.amount - a.amount
  );
  return { suggestions, unlinked };
}
