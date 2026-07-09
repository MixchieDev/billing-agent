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

const MAX_LEVEL = 3;

export interface FollowUpDecision {
  due: boolean;
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
    return { due: false, level: null, reason: 'max level reached' };
  }
  const offset = offsets[nextLevel];
  if (daysOverdue < offset) {
    return { due: false, level: nextLevel, reason: `not yet (needs ${offset}d overdue, is ${daysOverdue}d)` };
  }
  if (!autoSendLevels.includes(nextLevel)) {
    return { due: false, level: nextLevel, reason: `level ${nextLevel} is draft-for-review, not auto-sent` };
  }
  return { due: true, level: nextLevel, reason: 'due' };
}

export interface SweepDecision {
  invoiceId: string;
  level: number | null;
  due: boolean;
  sent: boolean;
  reason: string;
}

export interface CollectionsSweepResult {
  runId: string;
  invoicesScanned: number;
  followUpsSent: number;
  promisesBroken: number;
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
      'collections.autoSendLevels',
    ]);
    const offsets: Record<number, number> = {
      1: Number(s['collections.l1Days']),
      2: Number(s['collections.l2Days']),
      3: Number(s['collections.l3Days']),
    };
    const autoSendLevels: number[] = Array.isArray(s['collections.autoSendLevels'])
      ? s['collections.autoSendLevels']
      : [1, 2, 3];

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

      if (decision.due) {
        try {
          const res = await sendFollowUpEmail(inv.id); // system action (userId null)
          entry.sent = res.success;
          if (res.success) followUpsSent++;
          else entry.reason = res.message;
          if (!res.success) errors.push({ invoiceId: inv.id, error: res.message });
        } catch (e) {
          entry.reason = e instanceof Error ? e.message : String(e);
          errors.push({ invoiceId: inv.id, error: entry.reason });
        }
      }
      decisions.push(entry);
    }

    await prisma.collectionRun.update({
      where: { id: run.id },
      data: {
        status: 'COMPLETED',
        invoicesScanned: candidates.length,
        followUpsSent,
        promisesBroken,
        errors: errors.length ? (errors as unknown as Prisma.InputJsonValue) : undefined,
      },
    });

    return { runId: run.id, invoicesScanned: candidates.length, followUpsSent, promisesBroken, decisions, errors };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await prisma.collectionRun.update({
      where: { id: run.id },
      data: { status: 'FAILED', errors: [{ error: message }] as unknown as Prisma.InputJsonValue },
    });
    throw e;
  }
}
