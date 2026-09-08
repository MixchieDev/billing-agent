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
import { ContractStatus, NotificationType } from '@/generated/prisma';

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

/**
 * Should tonight's sweep remind about this contract?
 *
 * Fires when the contract is inside the lead window and we haven't already
 * reminded for THIS renewal. Deliberately `days <= leadDays` rather than
 * `days === leadDays`: an exact-day test would miss any contract already
 * inside the window when this shipped, and would skip a day entirely if the
 * cron failed to run — the two ways a renewal actually gets missed.
 *
 * A reminder sent before the contract's end date counts for that renewal; once
 * the end date moves (the contract was renewed), the old notice is stale and
 * the next cycle reminds again.
 */
export function needsNotice(
  contractEnd: Date,
  noticeSentAt: Date | null,
  today: Date,
  leadDays: number
): boolean {
  const days = daysUntil(contractEnd, today);
  if (days > leadDays) return false; // not yet in the window
  if (days < 0) return false; // already lapsed — the list shows it, don't re-mail
  if (!noticeSentAt) return true;
  // A notice only counts for THIS renewal if it was sent after this renewal's
  // window opened. An older one belongs to a previous cycle — the contract has
  // since been renewed and the end date moved — so it must not suppress the
  // new reminder.
  const windowOpened = contractEnd.getTime() - leadDays * 86_400_000;
  return noticeSentAt.getTime() < windowOpened;
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
}> {
  const leadDays = await leadDaysSetting();

  const [withEnd, withoutEnd] = await prisma.$transaction([
    prisma.contract.findMany({
      where: { status: ContractStatus.ACTIVE, contractEndDate: { not: null } },
      select: {
        id: true, companyName: true, productType: true, monthlyFee: true,
        contractEndDate: true, contactPerson: true, email: true,
        renewalNoticeAt: true, billingEntity: { select: { code: true } },
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
  };
}

export interface RenewalSweepResult {
  leadDays: number;
  scanned: number;
  reminded: number;
  contracts: { id: string; companyName: string; daysUntil: number }[];
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

  const due = active.filter((c) =>
    needsNotice(c.contractEndDate!, c.renewalNoticeAt, today, leadDays)
  );

  const contracts: { id: string; companyName: string; daysUntil: number }[] = [];
  for (const c of due) {
    const days = daysUntil(c.contractEndDate!, today);
    await prisma.notification.create({
      data: {
        type: NotificationType.CONTRACT_RENEWAL,
        title: `Renewal in ${days} day${days === 1 ? '' : 's'}: ${c.companyName}`,
        message:
          `${c.companyName} (${c.billingEntity?.code ?? ''}) is up for renewal on ` +
          `${c.contractEndDate!.toISOString().slice(0, 10)} — ` +
          `${days} day${days === 1 ? '' : 's'} away. Monthly fee ${Number(c.monthlyFee).toLocaleString(
            'en-PH',
            { minimumFractionDigits: 2 }
          )}.`,
        link: '/dashboard/renewals',
        entityType: 'Contract',
        entityId: c.id,
      },
    });
    await prisma.contract.update({
      where: { id: c.id },
      data: { renewalNoticeAt: today },
    });
    contracts.push({ id: c.id, companyName: c.companyName, daysUntil: days });
  }

  const missingEndDate = await prisma.contract.count({
    where: { status: ContractStatus.ACTIVE, contractEndDate: null },
  });

  return { leadDays, scanned: active.length, reminded: contracts.length, contracts, missingEndDate };
}
