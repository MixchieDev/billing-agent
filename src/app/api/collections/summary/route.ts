import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { addDays, startOfDay, startOfWeek, subDays, format } from 'date-fns';
import { certificateAmount } from '@/lib/wht2307';

/**
 * GET /api/collections/summary
 * Everything the Collections Dashboard needs in one round-trip:
 * AR aging (on remaining balances, not face amounts), this-week collected /
 * follow-ups, promise-to-pay counts, and a 14-day cash calendar
 * (dues + promised payments + PDC clearing dates).
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const today = startOfDay(new Date());
    const weekStart = startOfWeek(today, { weekStartsOn: 1 }); // Monday
    const horizon = addDays(today, 14);

    // Batched via prisma.$transaction([...]): one pooled round-trip.
    const [outstanding, openPromises, brokenLast30, paymentsWeek, followUpsWeek, pdcUpcoming, wht2307Pending] =
      await prisma.$transaction([
        prisma.invoice.findMany({
          where: { status: { in: ['SENT', 'PARTIALLY_PAID'] } },
          select: {
            id: true,
            billingNo: true,
            customerName: true,
            dueDate: true,
            netAmount: true,
            balanceDue: true,
            status: true,
            followUpPausedUntil: true,
            company: { select: { code: true } },
          },
        }),
        prisma.promiseToPay.findMany({
          where: { status: 'OPEN' },
          select: {
            id: true,
            promisedDate: true,
            promisedAmount: true,
            invoice: { select: { billingNo: true, customerName: true, balanceDue: true, netAmount: true } },
          },
        }),
        prisma.promiseToPay.count({
          where: { status: 'BROKEN', updatedAt: { gte: subDays(today, 30) } },
        }),
        prisma.invoicePayment.findMany({
          where: { paidDate: { gte: weekStart } },
          orderBy: { paidDate: 'desc' },
          select: {
            id: true,
            amount: true,
            method: true,
            reference: true,
            paidDate: true,
            invoice: {
              select: { id: true, billingNo: true, customerName: true, company: { select: { code: true } } },
            },
          },
        }),
        prisma.followUpLog.count({
          where: { sentAt: { gte: weekStart }, status: 'SENT' },
        }),
        prisma.pdcCheck.findMany({
          where: {
            status: { in: ['WAREHOUSED', 'DEPOSITED'] },
            checkDate: { lte: horizon },
          },
          select: { id: true, checkNo: true, bankName: true, amount: true, checkDate: true, status: true },
        }),
        prisma.invoice.findMany({
          where: { wht2307Status: 'PENDING' },
          select: { withholdingTax: true, balanceDue: true },
        }),
      ]);

    // ---- Aging on the money still owed (balanceDue falls back to netAmount) ----
    // Each bucket carries its invoices so the dashboard can drill in without a
    // second round-trip.
    type AgingInvoice = {
      id: string;
      billingNo: string | null;
      customerName: string;
      entity: string;
      balance: number;
      daysOverdue: number;
      status: string;
      paused: boolean;
    };
    const bucket = () => ({ count: 0, amount: 0, invoices: [] as AgingInvoice[] });
    const aging = {
      current: bucket(), // not yet due
      d1_30: bucket(),
      d31_60: bucket(),
      d61_90: bucket(),
      d90plus: bucket(),
    };
    let totalOutstanding = 0;
    let pausedCount = 0;

    for (const inv of outstanding) {
      const owed = Number(inv.balanceDue ?? inv.netAmount);
      if (owed <= 0) continue;
      totalOutstanding += owed;
      if (inv.followUpPausedUntil && inv.followUpPausedUntil > today) pausedCount++;

      const daysOverdue = Math.floor((today.getTime() - startOfDay(inv.dueDate).getTime()) / 86_400_000);
      const b =
        daysOverdue <= 0 ? aging.current
        : daysOverdue <= 30 ? aging.d1_30
        : daysOverdue <= 60 ? aging.d31_60
        : daysOverdue <= 90 ? aging.d61_90
        : aging.d90plus;
      b.count++;
      b.amount += owed;
      b.invoices.push({
        id: inv.id,
        billingNo: inv.billingNo,
        customerName: inv.customerName,
        entity: inv.company?.code ?? '',
        balance: owed,
        daysOverdue,
        status: inv.status,
        paused: !!(inv.followUpPausedUntil && inv.followUpPausedUntil > today),
      });
    }
    // Biggest exposure first within each bucket.
    for (const b of Object.values(aging)) b.invoices.sort((x, y) => y.balance - x.balance);

    // ---- 14-day cash calendar: dues + promises + PDC dates, grouped by day ----
    type CalItem = { type: 'DUE' | 'PROMISE' | 'PDC'; label: string; amount: number };
    const byDay = new Map<string, CalItem[]>();
    const push = (date: Date, item: CalItem) => {
      if (date < today || date > horizon) return;
      const key = format(date, 'yyyy-MM-dd');
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key)!.push(item);
    };

    for (const inv of outstanding) {
      const owed = Number(inv.balanceDue ?? inv.netAmount);
      if (owed > 0) {
        push(startOfDay(inv.dueDate), {
          type: 'DUE',
          label: `${inv.customerName} · ${inv.billingNo ?? inv.id.slice(0, 8)}`,
          amount: owed,
        });
      }
    }
    for (const p of openPromises) {
      push(startOfDay(p.promisedDate), {
        type: 'PROMISE',
        label: `${p.invoice.customerName} · ${p.invoice.billingNo ?? ''}`,
        amount: Number(p.promisedAmount ?? p.invoice.balanceDue ?? p.invoice.netAmount),
      });
    }
    for (const c of pdcUpcoming) {
      push(startOfDay(c.checkDate), {
        type: 'PDC',
        label: `${c.bankName} check #${c.checkNo}`,
        amount: Number(c.amount),
      });
    }
    const calendar = [...byDay.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([date, items]) => ({ date, items }));

    const openPromiseAmount = openPromises.reduce(
      (sum, p) => sum + Number(p.promisedAmount ?? p.invoice.balanceDue ?? p.invoice.netAmount),
      0
    );

    return NextResponse.json({
      aging,
      totalOutstanding,
      outstandingCount: outstanding.length,
      pausedCount,
      collectedThisWeek: {
        amount: paymentsWeek.reduce((sum, p) => sum + Number(p.amount), 0),
        count: paymentsWeek.length,
        payments: paymentsWeek.map((p) => ({
          id: p.id,
          amount: Number(p.amount),
          method: p.method,
          reference: p.reference,
          paidDate: p.paidDate,
          billingNo: p.invoice.billingNo,
          customerName: p.invoice.customerName,
          entity: p.invoice.company?.code ?? '',
        })),
      },
      followUpsThisWeek: followUpsWeek,
      promises: {
        open: { count: openPromises.length, amount: openPromiseAmount },
        brokenLast30,
      },
      wht2307: {
        count: wht2307Pending.length,
        amount: wht2307Pending.reduce((sum, inv) => sum + certificateAmount(inv), 0),
      },
      calendar,
    });
  } catch (error) {
    console.error('Error building collections summary:', error);
    return NextResponse.json({ error: 'Failed to load collections summary' }, { status: 500 });
  }
}
