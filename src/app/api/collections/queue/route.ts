import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getSettings } from '@/lib/settings';
import { decideFollowUp } from '@/lib/collections-service';
import { calculateDaysOverdue } from '@/lib/follow-up-service';
import { subDays } from 'date-fns';

const MAX_LEVEL = 3;

export type QueueCategory = 'BROKEN_PROMISE' | 'NO_EMAIL' | 'MAXED' | 'REVIEW';

/**
 * GET /api/collections/queue
 * The follow-up worklist, partitioned with the SAME ladder decision the nightly
 * sweep uses (decideFollowUp), so the queue is a faithful preview of it:
 *  - needsAction: a human must decide — broken promises, missing email,
 *    max-level-reached, or a level configured as draft-for-review.
 *  - autoTonight: due for a level the sweep will auto-send tonight.
 *  - recentAuto: follow-ups sent in the last 7 days (reviewable log).
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Ladder settings (cached helper — not a Prisma query, stays out of the batch).
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

    const [candidates, recentAuto] = await prisma.$transaction([
      // Overdue, chaseable, un-paused — same population the sweep scans, plus
      // maxed-out ones (the sweep skips those; the queue surfaces them).
      prisma.invoice.findMany({
        where: {
          status: { in: ['SENT', 'PARTIALLY_PAID'] },
          followUpEnabled: true,
          dueDate: { lt: today },
          OR: [{ followUpPausedUntil: null }, { followUpPausedUntil: { lte: today } }],
        },
        select: {
          id: true,
          billingNo: true,
          customerName: true,
          customerEmail: true,
          customerEmails: true,
          dueDate: true,
          netAmount: true,
          balanceDue: true,
          status: true,
          lastFollowUpLevel: true,
          lastFollowUpAt: true,
          company: { select: { code: true } },
          promises: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { status: true, promisedDate: true, madeBy: true },
          },
        },
        orderBy: { dueDate: 'asc' },
      }),
      prisma.followUpLog.findMany({
        where: { sentAt: { gte: subDays(today, 7) } },
        orderBy: { sentAt: 'desc' },
        take: 50,
        select: {
          id: true,
          level: true,
          sentAt: true,
          toEmail: true,
          status: true,
          invoice: { select: { id: true, billingNo: true, customerName: true, company: { select: { code: true } } } },
        },
      }),
    ]);

    type Row = {
      id: string;
      billingNo: string | null;
      customerName: string;
      entity: string;
      daysOverdue: number;
      balance: number;
      status: string;
      lastFollowUpLevel: number;
      nextLevel: number | null;
      category: QueueCategory;
      note: string;
      brokenPromise?: { promisedDate: Date; madeBy: string | null };
    };

    const needsAction: Row[] = [];
    const autoTonight: Array<Omit<Row, 'category' | 'note'>> = [];

    for (const inv of candidates) {
      const balance = Number(inv.balanceDue ?? inv.netAmount);
      if (balance <= 0) continue;

      const daysOverdue = calculateDaysOverdue(inv.dueDate);
      const lastLevel = inv.lastFollowUpLevel ?? 0;
      const nextLevel = lastLevel + 1;
      const hasEmail = !!(inv.customerEmails || inv.customerEmail);
      const latestPromise = inv.promises[0];
      const promiseBroken = latestPromise?.status === 'BROKEN';
      const chasedToday = !!inv.lastFollowUpAt && new Date(inv.lastFollowUpAt) >= today;

      const base = {
        id: inv.id,
        billingNo: inv.billingNo,
        customerName: inv.customerName,
        entity: inv.company?.code ?? '',
        daysOverdue,
        balance,
        status: inv.status,
        lastFollowUpLevel: lastLevel,
        nextLevel: nextLevel <= MAX_LEVEL ? nextLevel : null,
      };

      // Human-first categories, in precedence order.
      if (promiseBroken) {
        needsAction.push({
          ...base,
          category: 'BROKEN_PROMISE',
          note: 'Client missed a promised payment date',
          brokenPromise: { promisedDate: latestPromise.promisedDate, madeBy: latestPromise.madeBy },
        });
        continue;
      }
      if (nextLevel > MAX_LEVEL) {
        needsAction.push({
          ...base,
          category: 'MAXED',
          note: 'All 3 reminder levels sent — needs escalation',
        });
        continue;
      }

      const decision = decideFollowUp(daysOverdue, lastLevel, offsets, autoSendLevels);
      const dueForLevel = daysOverdue >= offsets[nextLevel];
      if (!dueForLevel || chasedToday) continue; // ladder is on schedule — nothing to do

      if (!hasEmail) {
        needsAction.push({
          ...base,
          category: 'NO_EMAIL',
          note: 'No contact email on the invoice — follow-up cannot send',
        });
      } else if (decision.due) {
        autoTonight.push(base);
      } else {
        needsAction.push({
          ...base,
          category: 'REVIEW',
          note: `Level ${nextLevel} is set to draft-for-review — send manually`,
        });
      }
    }

    return NextResponse.json({
      needsAction,
      autoTonight,
      recentAuto,
      settings: { offsets, autoSendLevels },
    });
  } catch (error) {
    console.error('Error building follow-up queue:', error);
    return NextResponse.json({ error: 'Failed to load follow-up queue' }, { status: 500 });
  }
}
