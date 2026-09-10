/**
 * Contract renewals.
 *
 * The point of this is that no contract quietly lapses. Every active contract
 * with an end date is tracked, a reminder fires once at the configured lead
 * time (45 days by default), and anything already inside that window when the
 * feature goes live is caught on the first sweep rather than skipped.
 *
 * Contracts with no end date are NOT silently ignored — they're reported
 * separately, because "we don't know when this renews" is the real risk.
 */

import prisma from './prisma';
import { getSettings } from './settings';
import { ContractStatus, NotificationType, RenewalOutcome } from '@/generated/prisma';

export const DEFAULT_LEAD_DAYS = 45;

export type RenewalStage = 'overdue' | 'due' | 'soon' | 'later';

export interface RenewalRow {
  id: string;
  companyName: string;
  productType: string;
  entity: string;
  monthlyFee: number;
  contractEndDate: string;
  daysUntil: number;
  stage: RenewalStage;
  contactPerson: string | null;
  email: string | null;
  noticeSentAt: string | null;
  /** Most recent decided outcome, so the list shows what already happened. */
  lastOutcome: 'RENEWED' | 'NOT_RENEWING' | 'LAPSED' | null;
  lastDecidedAt: string | null;
}

/**
 * Whole days from `today` to `end`; negative once the date has passed.
 *
 * Compared in UTC on both sides. Contract end dates are date-only values stored
 * at UTC midnight, and the server runs UTC on Vercel but Manila (UTC+8) in
 * development — reading local calendar parts off a UTC timestamp makes the
 * countdown differ by a day between the two.
 */
export function daysUntil(end: Date, today: Date): number {
  const a = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  const b = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.round((a - b) / 86_400_000);
}

/**
 * How urgent a renewal is. `due` is the actionable band — inside the lead time
 * but not yet lapsed.
 */
export function renewalStage(days: number, leadDays: number): RenewalStage {
  if (days < 0) return 'overdue';
  if (days <= leadDays) return 'due';
  if (days <= leadDays * 2) return 'soon';
  return 'later';
}

/** What the sweep should raise for a contract tonight, if anything. */
export type NoticeKind = 'reminder' | 'lapsed' | null;

/**
 * Decide tonight's notice for one contract.
 *
 * Two moments matter, and both are once-only:
 *
 *  - `reminder` — the contract has entered the lead window. Deliberately
 *    `days <= leadDays` rather than `days === leadDays`: an exact-day test
 *    would skip any contract already inside the window when this shipped, and
 *    would skip a renewal entirely if the cron missed that one night.
 *
 *  - `lapsed` — the end date has passed without the contract being renewed.
 *    Without this a lapse is silent: it sits on the Renewals page waiting for
 *    someone to notice, which is the exact failure this feature exists to
 *    prevent. It also catches contracts that lapsed BEFORE this shipped, since
 *    they have no notice recorded at all.
 *
 * Both phases share `renewalNoticeAt`, distinguished by where it sits relative
 * to the end date: a reminder is always written before the end date, a lapse
 * notice always after. So a notice on or before the end date means the lapse
 * alert is still owed; one after it means the lapse has already been raised.
 */
export function noticeDue(
  contractEnd: Date,
  noticeSentAt: Date | null,
  today: Date,
  leadDays: number
): NoticeKind {
  const days = daysUntil(contractEnd, today);

  if (days < 0) {
    // Lapsed. Raise once, then stay quiet.
    if (!noticeSentAt) return 'lapsed';
    return noticeSentAt.getTime() <= contractEnd.getTime() ? 'lapsed' : null;
  }

  if (days > leadDays) return null; // not yet in the window

  if (!noticeSentAt) return 'reminder';
  // A notice only counts for THIS renewal if it was sent after this renewal's
  // window opened. An older one belongs to a previous cycle — the contract has
  // since been renewed and the end date moved — so it must not suppress the
  // new reminder.
  const windowOpened = contractEnd.getTime() - leadDays * 86_400_000;
  return noticeSentAt.getTime() < windowOpened ? 'reminder' : null;
}

/** Back-compat: true when a lead-time reminder is due. */
export function needsNotice(
  contractEnd: Date,
  noticeSentAt: Date | null,
  today: Date,
  leadDays: number
): boolean {
  return noticeDue(contractEnd, noticeSentAt, today, leadDays) === 'reminder';
}

async function leadDaysSetting(): Promise<number> {
  const s = await getSettings(['renewals.leadDays']);
  const n = Number(s['renewals.leadDays']);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_LEAD_DAYS;
}

/** Everything renewal-related for the dashboard. */
export async function loadRenewals(): Promise<{
  leadDays: number;
  renewals: RenewalRow[];
  missingEndDate: { id: string; companyName: string; entity: string; monthlyFee: number }[];
  counts: Record<RenewalStage, number>;
  missingCount: number;
  rate: RenewalRate;
}> {
  const leadDays = await leadDaysSetting();

  const [withEnd, withoutEnd] = await prisma.$transaction([
    prisma.contract.findMany({
      where: { status: ContractStatus.ACTIVE, contractEndDate: { not: null } },
      select: {
        id: true, companyName: true, productType: true, monthlyFee: true,
        contractEndDate: true, contactPerson: true, email: true,
        renewalNoticeAt: true, billingEntity: { select: { code: true } },
        renewals: {
          orderBy: { decidedAt: 'desc' },
          take: 1,
          select: { outcome: true, decidedAt: true, newEndDate: true },
        },
      },
      orderBy: { contractEndDate: 'asc' },
    }),
    prisma.contract.findMany({
      where: { status: ContractStatus.ACTIVE, contractEndDate: null },
      select: {
        id: true, companyName: true, monthlyFee: true,
        billingEntity: { select: { code: true } },
      },
      orderBy: { companyName: 'asc' },
    }),
  ]);

  const today = new Date();
  const counts: Record<RenewalStage, number> = { overdue: 0, due: 0, soon: 0, later: 0 };

  const renewals = withEnd.map((c) => {
    const days = daysUntil(c.contractEndDate!, today);
    const stage = renewalStage(days, leadDays);
    counts[stage]++;
    return {
      id: c.id,
      companyName: c.companyName,
      productType: c.productType,
      entity: c.billingEntity?.code ?? '',
      monthlyFee: Number(c.monthlyFee),
      contractEndDate: c.contractEndDate!.toISOString(),
      daysUntil: days,
      stage,
      contactPerson: c.contactPerson,
      email: c.email,
      noticeSentAt: c.renewalNoticeAt ? c.renewalNoticeAt.toISOString() : null,
      lastOutcome: c.renewals[0]?.outcome ?? null,
      lastDecidedAt: c.renewals[0]?.decidedAt.toISOString() ?? null,
    };
  });

  return {
    leadDays,
    renewals,
    missingEndDate: withoutEnd.map((c) => ({
      id: c.id,
      companyName: c.companyName,
      entity: c.billingEntity?.code ?? '',
      monthlyFee: Number(c.monthlyFee),
    })),
    counts,
    missingCount: withoutEnd.length,
    rate: await renewalRate(),
  };
}

export interface RenewalSweepResult {
  leadDays: number;
  scanned: number;
  reminded: number;
  contracts: { id: string; companyName: string; daysUntil: number; kind: NoticeKind }[];
  /** Of `reminded`, how many were lapse alerts rather than lead-time reminders. */
  lapsed: number;
  missingEndDate: number;
}

/**
 * Nightly: raise an in-app notification for every contract that has entered the
 * lead window and hasn't been flagged yet. Notifications only — this never
 * emails the client, since a renewal conversation is the account manager's to
 * start.
 */
export async function runRenewalSweep(today: Date = new Date()): Promise<RenewalSweepResult> {
  const leadDays = await leadDaysSetting();

  const active = await prisma.contract.findMany({
    where: { status: ContractStatus.ACTIVE, contractEndDate: { not: null } },
    select: {
      id: true, companyName: true, contractEndDate: true,
      renewalNoticeAt: true, monthlyFee: true,
      billingEntity: { select: { code: true } },
    },
  });

  const due = active
    .map((c) => ({ c, kind: noticeDue(c.contractEndDate!, c.renewalNoticeAt, today, leadDays) }))
    .filter((x): x is { c: (typeof active)[number]; kind: 'reminder' | 'lapsed' } => x.kind !== null);

  const contracts: { id: string; companyName: string; daysUntil: number; kind: NoticeKind }[] = [];
  let lapsed = 0;
  for (const { c, kind } of due) {
    const days = daysUntil(c.contractEndDate!, today);
    const endStr = c.contractEndDate!.toISOString().slice(0, 10);
    const fee = Number(c.monthlyFee).toLocaleString('en-PH', { minimumFractionDigits: 2 });
    if (kind === 'lapsed') lapsed++;
    await prisma.notification.create({
      data: {
        type: NotificationType.CONTRACT_RENEWAL,
        title:
          kind === 'lapsed'
            ? `Contract LAPSED: ${c.companyName}`
            : `Renewal in ${days} day${days === 1 ? '' : 's'}: ${c.companyName}`,
        message:
          kind === 'lapsed'
            ? `${c.companyName} (${c.billingEntity?.code ?? ''}) passed its renewal date on ` +
              `${endStr}, ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago, and has not ` +
              `been renewed. Monthly fee ${fee} is still being billed.`
            : `${c.companyName} (${c.billingEntity?.code ?? ''}) is up for renewal on ` +
              `${endStr} — ${days} day${days === 1 ? '' : 's'} away. Monthly fee ${fee}.`,
        link: '/dashboard/renewals',
        entityType: 'Contract',
        entityId: c.id,
      },
    });
    await prisma.contract.update({
      where: { id: c.id },
      data: { renewalNoticeAt: today },
    });
    contracts.push({ id: c.id, companyName: c.companyName, daysUntil: days, kind });
  }

  const missingEndDate = await prisma.contract.count({
    where: { status: ContractStatus.ACTIVE, contractEndDate: null },
  });

  return {
    leadDays,
    scanned: active.length,
    reminded: contracts.length,
    lapsed,
    contracts,
    missingEndDate,
  };
}


/* ------------------------------------------------------------------ *
 * Recording what actually happened at the end of a term.
 * ------------------------------------------------------------------ */

export interface RecordRenewalInput {
  contractId: string;
  outcome: RenewalOutcome;
  /** Required for RENEWED — where the term moves to. */
  newEndDate?: Date | null;
  /** Optional fee change agreed at renewal. */
  newFee?: number | null;
  note?: string | null;
  userId?: string | null;
}

export interface RecordRenewalResult {
  success: boolean;
  message: string;
}

/**
 * Record a renewal decision and move the contract to match it.
 *
 * The history row is the point: a status field would be overwritten by the
 * next cycle, and then "did they renew last year?" is unanswerable. Writing
 * history and mutating the contract together also means the contract can never
 * show a term that no decision accounts for.
 */
export async function recordRenewal(input: RecordRenewalInput): Promise<RecordRenewalResult> {
  const contract = await prisma.contract.findUnique({
    where: { id: input.contractId },
    select: { id: true, companyName: true, contractEndDate: true, monthlyFee: true, status: true },
  });

  if (!contract) return { success: false, message: 'Contract not found' };
  if (!contract.contractEndDate) {
    return {
      success: false,
      message: 'This contract has no renewal date, so there is no term to close out. Set one first.',
    };
  }

  if (input.outcome === RenewalOutcome.RENEWED) {
    if (!input.newEndDate) {
      return { success: false, message: 'A renewed contract needs its new renewal date.' };
    }
    if (input.newEndDate.getTime() <= contract.contractEndDate.getTime()) {
      return {
        success: false,
        message: 'The new renewal date must be after the current one — otherwise the term never moves forward.',
      };
    }
  }

  const renewed = input.outcome === RenewalOutcome.RENEWED;

  await prisma.contractRenewal.create({
    data: {
      contractId: contract.id,
      outcome: input.outcome,
      previousEndDate: contract.contractEndDate,
      newEndDate: renewed ? input.newEndDate! : null,
      previousFee: contract.monthlyFee,
      newFee: renewed && input.newFee != null ? input.newFee : null,
      note: input.note?.trim() || null,
      decidedById: input.userId ?? null,
    },
  });

  await prisma.contract.update({
    where: { id: contract.id },
    data: renewed
      ? {
          contractEndDate: input.newEndDate!,
          // A new term is a new cycle, so the next reminder must fire.
          renewalNoticeAt: null,
          ...(input.newFee != null ? { monthlyFee: input.newFee } : {}),
        }
      : {
          // Not renewing or lapsed: the term stands as it is. Deactivating the
          // contract is a separate, deliberate act — billing may still need to
          // run out the notice period.
          renewalNoticeAt: new Date(),
        },
  });

  return {
    success: true,
    message: renewed
      ? `${contract.companyName} renewed to ${input.newEndDate!.toISOString().slice(0, 10)}`
      : `${contract.companyName} marked ${input.outcome === RenewalOutcome.NOT_RENEWING ? 'not renewing' : 'lapsed'}`,
  };
}

export interface RenewalRate {
  renewed: number;
  notRenewed: number;
  total: number;
  /** Null when nothing has come up for renewal yet — not zero, which would read as total failure. */
  rate: number | null;
}

/** Renewal rate over a trailing window, decided outcomes only. */
export async function renewalRate(days = 365): Promise<RenewalRate> {
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await prisma.contractRenewal.groupBy({
    by: ['outcome'],
    where: { decidedAt: { gte: since } },
    _count: { _all: true },
    orderBy: { outcome: 'asc' },
  });
  const count = (o: RenewalOutcome) => rows.find((r) => r.outcome === o)?._count._all ?? 0;
  const renewed = count(RenewalOutcome.RENEWED);
  const notRenewed = count(RenewalOutcome.NOT_RENEWING) + count(RenewalOutcome.LAPSED);
  const total = renewed + notRenewed;
  return { renewed, notRenewed, total, rate: total > 0 ? renewed / total : null };
}
