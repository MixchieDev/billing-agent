/**
 * Invoice book cleanup.
 *
 * Flags open invoices that probably should not be chased — duplicates, ones we
 * never actually delivered, ones with nowhere to send a reminder — so the book
 * can be tidied before the collections ladder is armed against it.
 *
 * Every flag is advisory and carries its evidence. Nothing here mutates an
 * invoice; voiding is an explicit operator action.
 */

import prisma from './prisma';
import { InvoiceStatus } from '@/generated/prisma';

/** Statuses that are still "open" — the only ones worth cleaning up. */
export const OPEN_STATUSES = [InvoiceStatus.SENT, InvoiceStatus.APPROVED];

export const STALE_DAYS = 90;
/** Below this an invoice is almost certainly a test row, not real billing. */
export const TRIVIAL_AMOUNT = 100;

export type CleanupBucket =
  | 'duplicates'
  | 'never-sent'
  | 'no-email'
  | 'stale'
  | 'test';

export interface CleanupFlag {
  bucket: CleanupBucket;
  /** Why this invoice was flagged, specific enough to act on without digging. */
  reason: string;
  /** Exact duplicates and test rows are safe to action in bulk; the rest need judgment. */
  confident: boolean;
}

export interface CleanupCandidate {
  id: string;
  billingNo: string | null;
  customerName: string;
  entity: string;
  status: InvoiceStatus;
  netAmount: number;
  dueDate: string | null;
  periodStart: string | null;
  createdAt: string;
  daysOverdue: number | null;
  hasBeenEmailed: boolean;
  hasEmailAddress: boolean;
  followUpEnabled: boolean;
  flags: CleanupFlag[];
}

/** Shape the flagging logic needs — kept minimal so it can be unit-tested. */
export interface FlaggableInvoice {
  id: string;
  billingNo: string | null;
  /** Billing entity code. Two entities billing one client are separate debts. */
  entity: string;
  customerName: string;
  status: InvoiceStatus;
  netAmount: number;
  dueDate: Date | null;
  periodStart: Date | null;
  createdAt: Date;
  hasBeenEmailed: boolean;
  hasEmailAddress: boolean;
}

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}

/**
 * Cluster key: the same client billed by the same entity for the same period.
 *
 * The entity matters — YOWI and ABBA each bill some shared clients, and those
 * are two genuine receivables, not a double-billing. Leaving it out flagged a
 * real MINDANAO GOLDEN GRAINS pair as a clear-cut duplicate.
 */
function clusterKey(inv: FlaggableInvoice): string | null {
  if (!inv.periodStart) return null;
  const client = inv.customerName.trim().toLowerCase();
  return `${inv.entity}|${client}|${inv.periodStart.toISOString().slice(0, 10)}`;
}

/**
 * Flag a whole set at once — duplicate detection needs to see siblings, so this
 * cannot be done one invoice at a time.
 */
export function computeFlags(
  invoices: FlaggableInvoice[],
  today: Date = new Date()
): Map<string, CleanupFlag[]> {
  const out = new Map<string, CleanupFlag[]>();
  for (const inv of invoices) out.set(inv.id, []);
  const add = (id: string, flag: CleanupFlag) => out.get(id)!.push(flag);

  // --- Duplicate clusters: same client, same period, more than one open row.
  const clusters = new Map<string, FlaggableInvoice[]>();
  for (const inv of invoices) {
    const key = clusterKey(inv);
    if (!key) continue;
    if (!clusters.has(key)) clusters.set(key, []);
    clusters.get(key)!.push(inv);
  }

  for (const group of clusters.values()) {
    if (group.length < 2) continue;
    const period = group[0].periodStart!.toISOString().slice(0, 10);

    // Within a cluster, an identical amount is a much stronger signal than a
    // merely-repeated period: differing amounts are often legitimate re-bills.
    const byAmount = new Map<string, FlaggableInvoice[]>();
    for (const inv of group) {
      const k = inv.netAmount.toFixed(2);
      if (!byAmount.has(k)) byAmount.set(k, []);
      byAmount.get(k)!.push(inv);
    }

    for (const inv of group) {
      const sameAmount = byAmount.get(inv.netAmount.toFixed(2))!;
      const twins = sameAmount.filter((o) => o.id !== inv.id);
      if (twins.length > 0) {
        // Exactly one of an identical set has to survive, or voiding the
        // "clear-cut" selection would wipe the receivable entirely. The
        // earliest-created row is the original; only the later copies are
        // safe to void in bulk.
        const ordered = [...sameAmount].sort(
          (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id)
        );
        const keeper = ordered[0];
        const isKeeper = keeper.id === inv.id;

        // Billing numbers are reused across entities, so qualify them.
        const name = (t: FlaggableInvoice) => `${t.billingNo ?? t.id.slice(0, 8)} (${t.entity})`;

        add(inv.id, {
          bucket: 'duplicates',
          reason: isKeeper
            ? `Original of ${twins.length} identical ${inv.entity} invoice(s) for ${period} — keep this one`
            : `Same ${inv.entity} client, period ${period} and amount as ${name(keeper)}, created later`,
          // Only the later copies are preselectable.
          confident: !isKeeper,
        });
      } else {
        add(inv.id, {
          bucket: 'duplicates',
          reason: `${group.length} open ${inv.entity} invoices for ${period} — amounts differ, may be a re-bill`,
          confident: false,
        });
      }
    }
  }

  for (const inv of invoices) {
    // --- Never delivered. Chasing these would be indefensible.
    if (inv.status === InvoiceStatus.APPROVED) {
      add(inv.id, {
        bucket: 'never-sent',
        reason: 'Approved but never sent — the client has not received this',
        confident: false,
      });
    } else if (!inv.hasBeenEmailed) {
      add(inv.id, {
        bucket: 'never-sent',
        reason: 'Marked sent but no email was ever logged against it',
        confident: false,
      });
    }

    // --- Nowhere to send a reminder.
    if (!inv.hasEmailAddress) {
      add(inv.id, {
        bucket: 'no-email',
        reason: 'No email address on the invoice — cannot be chased by email',
        confident: false,
      });
    }

    // --- Long overdue.
    if (inv.dueDate) {
      const overdue = daysBetween(inv.dueDate, today);
      if (overdue >= STALE_DAYS) {
        add(inv.id, {
          bucket: 'stale',
          reason: `${overdue} days past due`,
          confident: false,
        });
      }
    }

    // --- Obvious test rows.
    const looksLikeTest = /\b(test|testing|demo|sample|dummy)\b/i.test(inv.customerName);
    if (looksLikeTest || inv.netAmount < TRIVIAL_AMOUNT) {
      add(inv.id, {
        bucket: 'test',
        reason: looksLikeTest
          ? `Client name looks like a test row ("${inv.customerName}")`
          : `Amount is only ${inv.netAmount.toFixed(2)}`,
        confident: looksLikeTest && inv.netAmount < TRIVIAL_AMOUNT,
      });
    }
  }

  return out;
}

/** Load every open invoice with its cleanup flags. */
export async function loadCleanupCandidates(): Promise<{
  candidates: CleanupCandidate[];
  counts: Record<CleanupBucket, number>;
  totals: { openCount: number; openValue: number; flaggedCount: number; flaggedValue: number };
}> {
  // Batched: prod runs connection_limit=1 behind PgBouncer.
  const [invoices, emailGroups] = await prisma.$transaction([
    prisma.invoice.findMany({
      where: { status: { in: OPEN_STATUSES } },
      select: {
        id: true,
        billingNo: true,
        customerName: true,
        customerEmail: true,
        customerEmails: true,
        status: true,
        netAmount: true,
        dueDate: true,
        periodStart: true,
        createdAt: true,
        followUpEnabled: true,
        company: { select: { code: true } },
      },
      orderBy: [{ customerName: 'asc' }, { dueDate: 'asc' }],
    }),
    prisma.emailLog.findMany({
      select: { invoiceId: true },
      distinct: ['invoiceId'],
    }),
  ]);

  const emailed = new Set(
    emailGroups.map((e) => e.invoiceId).filter((id): id is string => !!id)
  );

  const today = new Date();
  const flaggable: FlaggableInvoice[] = invoices.map((i) => ({
    id: i.id,
    billingNo: i.billingNo,
    entity: i.company?.code ?? '',
    customerName: i.customerName,
    status: i.status,
    netAmount: Number(i.netAmount),
    dueDate: i.dueDate,
    periodStart: i.periodStart,
    createdAt: i.createdAt,
    hasBeenEmailed: emailed.has(i.id),
    hasEmailAddress: !!(i.customerEmails || i.customerEmail),
  }));

  const flagMap = computeFlags(flaggable, today);

  const counts: Record<CleanupBucket, number> = {
    duplicates: 0,
    'never-sent': 0,
    'no-email': 0,
    stale: 0,
    test: 0,
  };

  const candidates: CleanupCandidate[] = invoices.map((i) => {
    const flags = flagMap.get(i.id) ?? [];
    for (const bucket of new Set(flags.map((f) => f.bucket))) counts[bucket]++;
    return {
      id: i.id,
      billingNo: i.billingNo,
      customerName: i.customerName,
      entity: i.company?.code ?? '',
      status: i.status,
      netAmount: Number(i.netAmount),
      dueDate: i.dueDate ? i.dueDate.toISOString() : null,
      periodStart: i.periodStart ? i.periodStart.toISOString() : null,
      createdAt: i.createdAt.toISOString(),
      daysOverdue: i.dueDate ? daysBetween(i.dueDate, today) : null,
      hasBeenEmailed: emailed.has(i.id),
      hasEmailAddress: !!(i.customerEmails || i.customerEmail),
      followUpEnabled: i.followUpEnabled,
      flags,
    };
  });

  const flagged = candidates.filter((c) => c.flags.length > 0);

  return {
    candidates,
    counts,
    totals: {
      openCount: candidates.length,
      openValue: candidates.reduce((s, c) => s + c.netAmount, 0),
      flaggedCount: flagged.length,
      flaggedValue: flagged.reduce((s, c) => s + c.netAmount, 0),
    },
  };
}
