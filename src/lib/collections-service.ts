/**
 * Collections sweep for the collections upgrade (Phase 1, PR-4).
 *
 * Runs nightly (after the billing job, from /api/scheduler/trigger):
 *  1. Break overdue promises (OPEN, promisedDate past) → BROKEN + lift the pause,
 *     so the ladder resumes chasing.
 *  2. For each chaseable, overdue, un-paused invoice, decide the next follow-up
 *     level from the configured day-offsets and send it (reusing the existing
 *     follow-up machinery) if that level is set to auto-send.
 *  3. Log the run to CollectionRun.
 *
 * Level 4 (suspension notice) and PDC reminders are Phase 3.
 */

import { Prisma } from '@/generated/prisma';
import prisma from './prisma';
import { getSettings } from './settings';
import { sendFollowUpEmail, calculateDaysOverdue } from './follow-up-service';

const MAX_LEVEL = 4;

export interface FollowUpDecision {
  due: boolean;
  /**
   * The invoice is old enough for this level — independent of whether the level
   * is armed. `due` is this AND armed; the gap between the two is the dry-run
   * report an operator reviews before switching auto-send on.
   */
  ripe: boolean;
  level: number | null; // the level under consideration (null if maxed out)
  reason: string;
}

/**
 * Pure ladder decision: given how overdue an invoice is and the level it last
 * received, should the next level go out now? No I/O — unit-tested directly.
 */
export function decideFollowUp(
  daysOverdue: number,
  lastFollowUpLevel: number,
  offsets: Record<number, number>,
  autoSendLevels: number[]
): FollowUpDecision {
  const nextLevel = lastFollowUpLevel + 1;
  if (nextLevel > MAX_LEVEL) {
    return { due: false, ripe: false, level: null, reason: 'max level reached' };
  }
  const offset = offsets[nextLevel];
  if (daysOverdue < offset) {
    return {
      due: false,
      ripe: false,
      level: nextLevel,
      reason: `not yet (needs ${offset}d overdue, is ${daysOverdue}d)`,
    };
  }
  if (!autoSendLevels.includes(nextLevel)) {
    return {
      due: false,
      ripe: true,
      level: nextLevel,
      reason: `would send L${nextLevel} — level not armed for auto-send`,
    };
  }
  return { due: true, ripe: true, level: nextLevel, reason: 'due' };
}

export interface SweepDecision {
  invoiceId: string;
  level: number | null;
  due: boolean;
  sent: boolean;
  reason: string;
}

/** What the ladder would have sent, per level, had every level been armed. */
export type SuppressedByLevel = Record<number, number>;

export interface CollectionsSweepResult {
  runId: string;
  invoicesScanned: number;
  followUpsSent: number;
  promisesBroken: number;
  /** Levels currently armed. Empty means the sweep is in report-only mode. */
  armedLevels: number[];
  /** Nightly ceiling in force (0 = none) and how many it held back. */
  maxPerRun: number;
  cappedOut: number;
  suppressed: SuppressedByLevel;
  suppressedTotal: number;
  decisions: SweepDecision[];
  errors: { invoiceId?: string; error: string }[];
}

function startOfToday(): Date {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return t;
}

export async function runCollectionsSweep(): Promise<CollectionsSweepResult> {
  const run = await prisma.collectionRun.create({ data: { status: 'RUNNING' } });
  const errors: { invoiceId?: string; error: string }[] = [];
  const decisions: SweepDecision[] = [];
  const suppressed: SuppressedByLevel = {};
  let followUpsSent = 0;
  let promisesBroken = 0;

  try {
    const today = startOfToday();

    // 1. Break overdue promises and lift their pause.
    const broken = await prisma.promiseToPay.findMany({
      where: { status: 'OPEN', promisedDate: { lt: today } },
      select: { id: true, invoiceId: true },
    });
    for (const pr of broken) {
      await prisma.promiseToPay.update({ where: { id: pr.id }, data: { status: 'BROKEN' } });
      await prisma.invoice.update({
        where: { id: pr.invoiceId },
        data: { followUpPausedUntil: null },
      });
    }
    promisesBroken = broken.length;

    // 2. Ladder settings.
    const s = await getSettings([
      'collections.l1Days',
      'collections.l2Days',
      'collections.l3Days',
      'collections.l4Days',
      'collections.autoSendLevels',
      'collections.maxPerRun',
    ]);
    const offsets: Record<number, number> = {
      1: Number(s['collections.l1Days']),
      2: Number(s['collections.l2Days']),
      3: Number(s['collections.l3Days']),
      4: Number(s['collections.l4Days']),
    };
    // Absent/malformed setting means dormant, never "chase everything". A
    // missing row must not be the difference between silence and 200 emails.
    const autoSendLevels: number[] = Array.isArray(s['collections.autoSendLevels'])
      ? s['collections.autoSendLevels']
      : [];
    // 0 (or anything unparseable) means no ceiling.
    const rawCap = Number(s['collections.maxPerRun']);
    const maxPerRun = Number.isFinite(rawCap) && rawCap > 0 ? Math.floor(rawCap) : 0;

    // 3. Chaseable, overdue, un-paused invoices with room to escalate.
    const candidates = await prisma.invoice.findMany({
      where: {
        status: { in: ['SENT', 'PARTIALLY_PAID'] },
        followUpEnabled: true,
        dueDate: { lt: today },
        lastFollowUpLevel: { lt: MAX_LEVEL },
        OR: [{ followUpPausedUntil: null }, { followUpPausedUntil: { lte: today } }],
      },
      select: { id: true, dueDate: true, lastFollowUpLevel: true, lastFollowUpAt: true },
    });

    // Oldest debt first, so a capped run drains the backlog in an order anyone
    // would defend rather than whatever the query happened to return.
    candidates.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

    let sentThisRun = 0;
    let cappedOut = 0;

    for (const inv of candidates) {
      // Already chased today (e.g. a manual re-trigger) → leave it alone.
      if (inv.lastFollowUpAt && new Date(inv.lastFollowUpAt) >= today) {
        decisions.push({ invoiceId: inv.id, level: null, due: false, sent: false, reason: 'already chased today' });
        continue;
      }

      const daysOverdue = calculateDaysOverdue(inv.dueDate);
      const decision = decideFollowUp(daysOverdue, inv.lastFollowUpLevel ?? 0, offsets, autoSendLevels);
      const entry: SweepDecision = {
        invoiceId: inv.id,
        level: decision.level,
        due: decision.due,
        sent: false,
        reason: decision.reason,
      };

      // Ripe but not armed → the report-only path. Count it so the run tells
      // the operator exactly what arming that level would have cost.
      if (decision.ripe && !decision.due && decision.level !== null) {
        suppressed[decision.level] = (suppressed[decision.level] ?? 0) + 1;
      }

      // At the ceiling: stop sending, but keep evaluating so the run still
      // reports the full picture of what was owed tonight.
      if (decision.due && maxPerRun > 0 && sentThisRun >= maxPerRun) {
        cappedOut++;
        entry.reason = `held back — nightly cap of ${maxPerRun} reached`;
        decisions.push(entry);
        continue;
      }

      if (decision.due) {
        try {
          const res = await sendFollowUpEmail(inv.id); // system action (userId null)
          entry.sent = res.success;
          if (res.success) {
            followUpsSent++;
            sentThisRun++;
          } else {
            entry.reason = res.message;
            errors.push({ invoiceId: inv.id, error: res.message });
          }
        } catch (e) {
          entry.reason = e instanceof Error ? e.message : String(e);
          errors.push({ invoiceId: inv.id, error: entry.reason });
        }
      }
      decisions.push(entry);
    }

    const suppressedTotal = Object.values(suppressed).reduce((a, b) => a + b, 0);

    await prisma.collectionRun.update({
      where: { id: run.id },
      data: {
        status: 'COMPLETED',
        invoicesScanned: candidates.length,
        followUpsSent,
        promisesBroken,
        suppressed: {
          armedLevels: autoSendLevels,
          byLevel: suppressed,
          total: suppressedTotal,
          maxPerRun,
          cappedOut,
        },
        errors: errors.length ? (errors as unknown as Prisma.InputJsonValue) : undefined,
      },
    });

    if (cappedOut > 0) {
      console.log(
        `[Collections] Nightly cap of ${maxPerRun} reached — ${cappedOut} follow-up(s) held ` +
          `back for tomorrow.`
      );
    }
    if (suppressedTotal > 0) {
      console.log(
        `[Collections] Report-only: ${suppressedTotal} follow-up(s) withheld ` +
          `(armed levels: ${autoSendLevels.length ? autoSendLevels.join(', ') : 'none'}). ` +
          `By level: ${JSON.stringify(suppressed)}`
      );
    }

    return {
      runId: run.id,
      invoicesScanned: candidates.length,
      followUpsSent,
      promisesBroken,
      armedLevels: autoSendLevels,
      maxPerRun,
      cappedOut,
      suppressed,
      suppressedTotal,
      decisions,
      errors,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await prisma.collectionRun.update({
      where: { id: run.id },
      data: { status: 'FAILED', errors: [{ error: message }] as unknown as Prisma.InputJsonValue },
    });
    throw e;
  }
}
