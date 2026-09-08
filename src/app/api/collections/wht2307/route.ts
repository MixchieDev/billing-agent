import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { Prisma } from '@/generated/prisma';
import { certificateAmount, daysPending, ageBucket, WHT2307_BUCKETS } from '@/lib/wht2307';

/**
 * GET /api/collections/wht2307?status=PENDING|RECEIVED|ALL
 * Outstanding (and received) BIR 2307 certificates — what each is worth, which
 * client owes it, and how long it has been pending since the invoice settled.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const statusParam = (new URL(request.url).searchParams.get('status') ?? 'PENDING').toUpperCase();
    const statusFilter: Prisma.EnumWht2307StatusFilter =
      statusParam === 'ALL'
        ? { in: ['PENDING', 'RECEIVED'] }
        : statusParam === 'RECEIVED'
          ? { equals: 'RECEIVED' }
          : { equals: 'PENDING' };

    const [rows, pendingRows] = await prisma.$transaction([
      prisma.invoice.findMany({
        where: { wht2307Status: statusFilter },
        orderBy: [{ paidAt: 'asc' }],
        select: {
          id: true,
          billingNo: true,
          customerName: true,
          customerTin: true,
          netAmount: true,
          withholdingTax: true,
          withholdingCode: true,
          balanceDue: true,
          paidAt: true,
          wht2307Status: true,
          wht2307ReceivedAt: true,
          wht2307RequestedAt: true,
          wht2307RequestCount: true,
          customerEmail: true,
          customerEmails: true,
          company: { select: { code: true } },
        },
      }),
      // Always compute the pending totals so the summary is stable across filters.
      prisma.invoice.findMany({
        where: { wht2307Status: 'PENDING' },
        select: { withholdingTax: true, balanceDue: true, paidAt: true },
      }),
    ]);

    const today = new Date();

    const certificates = rows.map((inv) => {
      const days = daysPending(inv.paidAt, today);
      return {
        id: inv.id,
        billingNo: inv.billingNo,
        customerName: inv.customerName,
        customerTin: inv.customerTin,
        entity: inv.company?.code ?? '',
        amount: certificateAmount(inv),
        withholdingCode: inv.withholdingCode,
        invoiceNet: Number(inv.netAmount),
        paidAt: inv.paidAt,
        status: inv.wht2307Status,
        receivedAt: inv.wht2307ReceivedAt,
        daysPending: inv.wht2307Status === 'PENDING' ? days : null,
        bucket: inv.wht2307Status === 'PENDING' ? ageBucket(days) : null,
        requestedAt: inv.wht2307RequestedAt,
        requestCount: inv.wht2307RequestCount,
        hasEmail: !!(inv.customerEmails || inv.customerEmail),
      };
    });

    // Aging of what's still outstanding.
    const aging: Record<string, { count: number; amount: number }> = {};
    for (const b of WHT2307_BUCKETS) aging[b.key] = { count: 0, amount: 0 };
    let pendingTotal = 0;
    for (const inv of pendingRows) {
      const amt = certificateAmount(inv);
      if (amt <= 0) continue;
      pendingTotal += amt;
      const b = aging[ageBucket(daysPending(inv.paidAt, today))];
      b.count++;
      b.amount += amt;
    }

    return NextResponse.json({
      certificates,
      summary: {
        pendingCount: pendingRows.length,
        pendingAmount: pendingTotal,
        aging,
      },
    });
  } catch (error) {
    console.error('Error loading 2307 certificates:', error);
    return NextResponse.json({ error: 'Failed to load 2307 certificates' }, { status: 500 });
  }
}
