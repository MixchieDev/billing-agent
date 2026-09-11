/**
 * Read-only suspensions.
 *
 * Level 4 of the ladder warns a client that their account will be set to
 * read-only if the balance is not settled within the grace period. Setting it
 * read-only happens by hand in the service platform — this app's job is to say
 * exactly which accounts are due for that, and, just as importantly, which are
 * due to be RESTORED because they have since paid.
 *
 * Nothing here suspends anything. It tracks.
 */

import prisma from './prisma';
import { getSettings } from './settings';

export const DEFAULT_GRACE_DAYS = 7;
export const MAX_GRACE_DAYS = 90;

/**
 * The grace period, as a number of days that can defensibly appear in a notice.
 *
 * Anything out of range falls back to the default rather than being clamped to
 * the nearest bound: a stored -5 clamped to 1 would tell a client they have one
 * day, which is not what anyone configured.
 */
export function resolveGraceDays(value: unknown): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 1 && n <= MAX_GRACE_DAYS ? n : DEFAULT_GRACE_DAYS;
}

export type SuspensionStage =
  /** Notice sent, grace period still running. */
  | 'grace'
  /** Grace expired and still unpaid — set this account to read-only. */
  | 'due'
  /** Already set read-only, still unpaid. */
  | 'suspended'
  /** Set read-only but has since been paid — restore access. */
  | 'restore';

export interface SuspensionRow {
  invoiceId: string;
  billingNo: string | null;
  customerName: string;
  entity: string;
  balanceDue: number;
  netAmount: number;
  dueDate: string;
  daysOverdue: number;
  noticeSentAt: string;
  deadline: string;
  /** Negative once the deadline has passed. */
  daysToDeadline: number;
  suspendedAt: string | null;
  paidAt: string | null;
  stage: SuspensionStage;
  email: string | null;
}

function daysBetween(from: Date, to: Date): number {
  return Math.round(
    (Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()) -
      Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate())) /
      86_400_000
  );
}

/**
 * Which stage an account is at. Order matters: a paid-but-still-suspended
 * account is checked first, because leaving a paying client locked out is the
 * worst outcome in this whole flow.
 */
export function suspensionStage(
  isSettled: boolean,
  suspendedAt: Date | null,
  deadline: Date,
  today: Date
): SuspensionStage {
  if (suspendedAt && isSettled) return 'restore';
  if (suspendedAt) return 'suspended';
  if (daysBetween(today, deadline) <= 0) return 'due';
  return 'grace';
}

export async function loadSuspensions(): Promise<{
  graceDays: number;
  rows: SuspensionRow[];
  counts: Record<SuspensionStage, number>;
  dueValue: number;
}> {
  const cfg = await getSettings(['collections.suspensionGraceDays']);
  const graceDays = resolveGraceDays(cfg['collections.suspensionGraceDays']);

  // Every invoice that has ever had a suspension notice — including paid ones,
  // because a paid invoice on a suspended account is the signal to restore it.
  const invoices = await prisma.invoice.findMany({
    where: { suspensionNoticeAt: { not: null } },
    select: {
      id: true, billingNo: true, customerName: true, status: true,
      netAmount: true, balanceDue: true, dueDate: true, paidAt: true,
      suspensionNoticeAt: true, suspendedAt: true,
      customerEmail: true, customerEmails: true,
      company: { select: { code: true } },
    },
    orderBy: { suspensionNoticeAt: 'asc' },
  });

  const today = new Date();
  const counts: Record<SuspensionStage, number> = {
    grace: 0, due: 0, suspended: 0, restore: 0,
  };
  let dueValue = 0;

  const rows = invoices.map((i) => {
    const deadline = new Date(i.suspensionNoticeAt!);
    deadline.setDate(deadline.getDate() + graceDays);

    const balance = i.balanceDue === null ? Number(i.netAmount) : Number(i.balanceDue);
    // VOID and REJECTED are settled for this purpose too: there is nothing left
    // to collect, so nobody should stay locked out over them.
    const isSettled =
      i.status === 'PAID' || i.status === 'VOID' || i.status === 'REJECTED' || balance <= 0;

    const stage = suspensionStage(isSettled, i.suspendedAt, deadline, today);
    counts[stage]++;
    if (stage === 'due') dueValue += balance;

    return {
      invoiceId: i.id,
      billingNo: i.billingNo,
      customerName: i.customerName,
      entity: i.company?.code ?? '',
      balanceDue: balance,
      netAmount: Number(i.netAmount),
      dueDate: i.dueDate.toISOString(),
      daysOverdue: daysBetween(i.dueDate, today),
      noticeSentAt: i.suspensionNoticeAt!.toISOString(),
      deadline: deadline.toISOString(),
      daysToDeadline: daysBetween(today, deadline),
      suspendedAt: i.suspendedAt ? i.suspendedAt.toISOString() : null,
      paidAt: i.paidAt ? i.paidAt.toISOString() : null,
      stage,
      email: i.customerEmails || i.customerEmail,
    };
  });

  // Most urgent first: restore, then due, then the rest by deadline.
  const rank: Record<SuspensionStage, number> = { restore: 0, due: 1, suspended: 2, grace: 3 };
  rows.sort(
    (a, b) => rank[a.stage] - rank[b.stage] || a.daysToDeadline - b.daysToDeadline
  );

  return { graceDays, rows, counts, dueValue };
}

export interface MarkResult {
  success: boolean;
  message: string;
}

/**
 * Record that an account was set read-only, or that access was restored.
 * `suspendedAt` is a log of what the operator did in the other system, so the
 * two stay in step.
 */
export async function markSuspension(
  invoiceId: string,
  suspended: boolean,
  userId?: string | null
): Promise<MarkResult> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { id: true, billingNo: true, customerName: true, suspensionNoticeAt: true, suspendedAt: true },
  });

  if (!invoice) return { success: false, message: 'Invoice not found' };
  if (suspended && !invoice.suspensionNoticeAt) {
    return {
      success: false,
      message:
        'No suspension notice has been sent for this invoice. Send the level-4 notice before setting the account read-only.',
    };
  }
  if (suspended && invoice.suspendedAt) {
    return { success: false, message: 'This account is already recorded as read-only.' };
  }
  if (!suspended && !invoice.suspendedAt) {
    return { success: false, message: 'This account is not recorded as read-only.' };
  }

  await prisma.invoice.update({
    where: { id: invoice.id },
    data: { suspendedAt: suspended ? new Date() : null },
  });

  await prisma.auditLog.create({
    data: {
      userId: userId ?? null,
      action: suspended ? 'ACCOUNT_SET_READ_ONLY' : 'ACCOUNT_ACCESS_RESTORED',
      entityType: 'Invoice',
      entityId: invoice.id,
      details: { billingNo: invoice.billingNo, customerName: invoice.customerName },
    },
  });

  return {
    success: true,
    message: suspended
      ? `${invoice.customerName} recorded as read-only`
      : `${invoice.customerName} recorded as restored`,
  };
}
