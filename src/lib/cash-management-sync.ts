/**
 * Contract sync: billing agent → cash management.
 *
 * Billing agent is the source of truth for a contract's commercial terms. This
 * module pushes them to the cash management app, which upserts by customer
 * number. It is one-way; nothing comes back.
 *
 * Ownership, agreed 2026-09-16 — billing agent always overwrites these:
 *   customer no., company name, entity, monthly fee, payment plan,
 *   contract start, renewal date, status, invoice day
 * Cash management owns these, and they must never be overwritten by a sync:
 *   who acquired (it decides which bank account a collection lands in),
 *   reliability score, bank account, notes
 * The second group is still sent, because the receiver's current code requires
 * it; the receiver change that stops applying them on update is in the cash
 * management repo and must be deployed before nightly reconciliation is on.
 *
 * Two ways a contract reaches cash management:
 *   1. on each write, via syncContractById — scheduled with `after()` so the
 *      request finishes even once the page has responded
 *   2. a full reconciliation of every contract, nightly and on demand — the
 *      backstop that heals anything missed, dropped or written around
 */

import prisma from './prisma';
import { ContractStatus } from '@/generated/prisma';
import { getSetting } from './settings';

const SYNC_URL = process.env.CASH_MGMT_SYNC_URL || 'https://intent-yak-558.convex.site';
const TIMEOUT_MS = 15_000;
const BATCH_SIZE = 50;

/**
 * Billing agent's statuses, in the vocabulary the receiver understands. Without
 * this, STOPPED and INACTIVE were unknown to it and silently became "Active",
 * so stopped clients inflated expected cash.
 */
const STATUS_FOR_RECEIVER: Record<ContractStatus, string> = {
  ACTIVE: 'ACTIVE',
  NOT_STARTED: 'NOT_STARTED',
  INACTIVE: 'PAUSED', // receiver → "Inactive"
  STOPPED: 'CANCELLED', // receiver → "Cancelled"
};

export function translateStatus(status: ContractStatus): string {
  return STATUS_FOR_RECEIVER[status];
}

function entityCode(name: string): string {
  return name.toUpperCase().includes('ABBA') ? 'ABBA' : 'YAHSHUA';
}

const isoDate = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

/** Everything the payload needs that isn't a plain contract column. */
interface Derived {
  /** The contract's own start, else the earliest period it was billed for, else when it was created. */
  contractStart: string;
  /** From the contract's active scheduled billing — that is where the real billing day lives. */
  invoiceDay: number | null;
}

/**
 * Resolve start dates and invoice days for many contracts in two queries.
 *
 * The start date matters because the receiver substitutes "today" for a missing
 * one, which then changes on every sync. Any stable value is better than a date
 * that moves; a real start date is used whenever there is one.
 */
export async function deriveFor(
  contracts: { id: string; contractStart: Date | null; createdAt: Date; billingDayOfMonth: number | null }[]
): Promise<Map<string, Derived>> {
  const ids = contracts.map((c) => c.id);
  const out = new Map<string, Derived>();
  if (!ids.length) return out;

  const [schedules, earliest] = await prisma.$transaction([
    prisma.scheduledBilling.findMany({
      where: { contractId: { in: ids }, status: 'ACTIVE' },
      select: { contractId: true, billingDayOfMonth: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
    }),
    // Implicit many-to-many: "A" is the contract, "B" the invoice.
    prisma.$queryRaw<{ contractId: string; first: Date | null }[]>`
      SELECT ci."A" AS "contractId", MIN(i."periodStart") AS first
      FROM "_ContractToInvoice" ci
      JOIN "Invoice" i ON i.id = ci."B"
      WHERE ci."A" = ANY(${ids})
      GROUP BY ci."A"`,
  ]);

  const dayByContract = new Map<string, number>();
  for (const s of schedules) {
    if (!dayByContract.has(s.contractId)) dayByContract.set(s.contractId, s.billingDayOfMonth);
  }
  const firstBilled = new Map(earliest.map((r) => [r.contractId, r.first]));

  for (const c of contracts) {
    out.set(c.id, {
      contractStart: isoDate(c.contractStart ?? firstBilled.get(c.id) ?? c.createdAt)!,
      invoiceDay: dayByContract.get(c.id) ?? c.billingDayOfMonth ?? null,
    });
  }
  return out;
}

const CONTRACT_SELECT = {
  id: true,
  customerNumber: true,
  companyName: true,
  monthlyFee: true,
  paymentPlan: true,
  contractStart: true,
  contractEndDate: true,
  status: true,
  billingDayOfMonth: true,
  remarks: true,
  createdAt: true,
  billingEntity: { select: { name: true } },
  partner: { select: { name: true } },
} as const;

type SyncContract = {
  id: string;
  customerNumber: string | null;
  companyName: string;
  monthlyFee: unknown;
  paymentPlan: string | null;
  contractStart: Date | null;
  contractEndDate: Date | null;
  status: ContractStatus;
  billingDayOfMonth: number | null;
  remarks: string | null;
  createdAt: Date;
  billingEntity: { name: string };
  partner: { name: string } | null;
};

export function buildPayload(c: SyncContract, d: Derived) {
  return {
    // --- owned by billing agent: always applied ---
    customerNumber: c.customerNumber,
    companyName: c.companyName,
    entity: entityCode(c.billingEntity.name),
    monthlyFee: Number(c.monthlyFee ?? 0),
    paymentPlan: c.paymentPlan,
    contractStart: d.contractStart,
    contractEndDate: isoDate(c.contractEndDate),
    status: translateStatus(c.status),
    billingDayOfMonth: d.invoiceDay,
    id: c.id,
    // --- owned by cash management: initial values for a new customer only ---
    partnerName: c.partner?.name ?? null,
    remarks: c.remarks,
    bankAccount: 'Main Account',
  };
}

export interface SyncResult {
  ok: boolean;
  status?: number;
  error?: string;
  created?: number;
  updated?: number;
  skipped?: number;
}

async function post(path: string, body: unknown): Promise<SyncResult> {
  const apiKey = process.env.CASH_MGMT_SYNC_KEY;
  if (!apiKey) return { ok: false, error: 'CASH_MGMT_SYNC_KEY is not set' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${SYNC_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text().catch(() => '');
    let json: Record<string, unknown> = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      /* non-JSON error body */
    }
    if (!res.ok) {
      return { ok: false, status: res.status, error: String(json.error ?? text).slice(0, 300) };
    }
    return {
      ok: true,
      status: res.status,
      created: typeof json.created === 'number' ? json.created : undefined,
      updated: typeof json.updated === 'number' ? json.updated : undefined,
      skipped: typeof json.skipped === 'number' ? json.skipped : undefined,
    };
  } catch (e) {
    const aborted = e instanceof Error && e.name === 'AbortError';
    return { ok: false, error: aborted ? `timed out after ${TIMEOUT_MS / 1000}s` : String(e) };
  } finally {
    clearTimeout(timer);
  }
}

/** A failed sync is recorded where people can see it, not only in server logs. */
async function recordFailure(contractId: string, customerNumber: string | null, error: string) {
  console.error(`[cash-mgmt-sync] ${customerNumber ?? contractId}: ${error}`);
  await prisma.auditLog
    .create({
      data: {
        action: 'CASH_SYNC_FAILED',
        entityType: 'Contract',
        entityId: contractId,
        details: { customerNumber, error },
      },
    })
    .catch(() => {});
}

/**
 * Push one contract. Re-reads it, so every caller sends the current state and
 * the derived fields, rather than whatever shape it happened to have in hand.
 */
export async function syncContractById(contractId: string): Promise<SyncResult> {
  try {
    const c = await prisma.contract.findUnique({ where: { id: contractId }, select: CONTRACT_SELECT });
    if (!c) return { ok: false, error: 'contract not found' };
    if (!c.customerNumber) return { ok: false, error: 'no customer number — cannot be matched' };

    const derived = (await deriveFor([c])).get(c.id)!;
    const result = await post('/sync-contract', buildPayload(c, derived));
    if (!result.ok) await recordFailure(c.id, c.customerNumber, result.error ?? `HTTP ${result.status}`);
    return result;
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await recordFailure(contractId, null, error);
    return { ok: false, error };
  }
}

/**
 * Push a known set of contracts in batches — used after a CSV import. Failures
 * are recorded per batch in the audit log, like a single-contract sync.
 */
export async function syncContractsByIds(ids: string[]): Promise<SyncResult> {
  if (!ids.length) return { ok: true, created: 0, updated: 0, skipped: 0 };
  try {
    const contracts = await prisma.contract.findMany({
      where: { id: { in: ids }, customerNumber: { not: null } },
      select: CONTRACT_SELECT,
    });
    const derived = await deriveFor(contracts);
    const total: SyncResult = { ok: true, created: 0, updated: 0, skipped: 0 };
    for (let i = 0; i < contracts.length; i += BATCH_SIZE) {
      const chunk = contracts.slice(i, i + BATCH_SIZE);
      const r = await post('/sync-contracts', {
        contracts: chunk.map((c) => buildPayload(c, derived.get(c.id)!)),
      });
      if (r.ok) {
        total.created! += r.created ?? 0;
        total.updated! += r.updated ?? 0;
        total.skipped! += r.skipped ?? 0;
      } else {
        total.ok = false;
        total.error = r.error ?? `HTTP ${r.status}`;
        for (const c of chunk) await recordFailure(c.id, c.customerNumber, total.error);
      }
    }
    return total;
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error('[cash-mgmt-sync] batch:', error);
    return { ok: false, error };
  }
}

export interface ReconcileResult {
  at: string;
  contracts: number;
  sent: number;
  created: number;
  updated: number;
  skipped: number;
  failedBatches: number;
  errors: string[];
}

/**
 * Push every contract. This is what makes billing agent the source of truth:
 * whatever the per-write sync missed — a dropped request, a write path that
 * never called it, an import before the payload was fixed — is corrected on the
 * next run.
 */
export async function reconcileAllContracts(): Promise<ReconcileResult> {
  const startedAt = new Date();
  const job = await prisma.jobRun.create({
    data: { jobName: 'cash-mgmt-reconcile', status: 'RUNNING' },
  });

  const result: ReconcileResult = {
    at: startedAt.toISOString(),
    contracts: 0, sent: 0, created: 0, updated: 0, skipped: 0, failedBatches: 0, errors: [],
  };

  try {
    const contracts = await prisma.contract.findMany({
      where: { customerNumber: { not: null } },
      select: CONTRACT_SELECT,
      orderBy: { customerNumber: 'asc' },
    });
    result.contracts = contracts.length;
    const derived = await deriveFor(contracts);

    for (let i = 0; i < contracts.length; i += BATCH_SIZE) {
      const chunk = contracts.slice(i, i + BATCH_SIZE);
      // The receiver expects { contracts: [...] }. The old batch call sent a
      // bare array and got a 400 every time, so CSV imports never synced.
      const r = await post('/sync-contracts', {
        contracts: chunk.map((c) => buildPayload(c, derived.get(c.id)!)),
      });
      if (r.ok) {
        result.sent += chunk.length;
        result.created += r.created ?? 0;
        result.updated += r.updated ?? 0;
        result.skipped += r.skipped ?? 0;
      } else {
        result.failedBatches++;
        result.errors.push(
          `contracts ${i + 1}-${i + chunk.length}: ${r.error ?? `HTTP ${r.status}`}`
        );
      }
    }

    await prisma.jobRun.update({
      where: { id: job.id },
      data: {
        status: result.failedBatches ? 'FAILED' : 'COMPLETED',
        completedAt: new Date(),
        itemsProcessed: result.sent,
        errors: result.errors.length ? result.errors : undefined,
      },
    });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    result.errors.push(error);
    result.failedBatches++;
    await prisma.jobRun
      .update({ where: { id: job.id }, data: { status: 'FAILED', completedAt: new Date(), errors: [error] } })
      .catch(() => {});
  }

  // Latest result, readable by the settings page without scanning job history.
  await prisma.settings
    .upsert({
      where: { key: 'cashSync.lastRun' },
      update: { value: result as never },
      create: { key: 'cashSync.lastRun', value: result as never },
    })
    .catch(() => {});

  return result;
}

/**
 * Off until the cash management receiver stops overwriting the fields it owns.
 * Before that, a nightly push of every contract would reset who-acquired,
 * reliability, bank account and notes on every customer, every night.
 */
export async function nightlyReconcileEnabled(): Promise<boolean> {
  return (await getSetting('cashSync.nightlyReconcile')) === true;
}
