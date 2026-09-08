import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

/**
 * GET /api/collections/promises?status=OPEN|KEPT|BROKEN|ALL
 * Every promise to pay with who made it, when, how much, and through which
 * channel — plus the invoice it belongs to and what's still owed on it.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const statusParam = new URL(request.url).searchParams.get('status') ?? 'ALL';
    const where = statusParam !== 'ALL' ? { status: statusParam as 'OPEN' | 'KEPT' | 'BROKEN' } : {};

    const [promises, counts] = await prisma.$transaction([
      prisma.promiseToPay.findMany({
        where,
        orderBy: [{ status: 'asc' }, { promisedDate: 'asc' }],
        select: {
          id: true,
          promisedDate: true,
          promisedAmount: true,
          madeBy: true,
          capturedBy: true,
          channel: true,
          status: true,
          notes: true,
          createdAt: true,
          invoice: {
            select: {
              id: true,
              billingNo: true,
              customerName: true,
              status: true,
              netAmount: true,
              balanceDue: true,
              dueDate: true,
              company: { select: { code: true } },
            },
          },
        },
      }),
      prisma.promiseToPay.groupBy({ by: ['status'], _count: true, orderBy: { status: 'asc' } }),
    ]);

    // Resolve the staff who logged each promise (capturedBy holds a user id).
    const userIds = [...new Set(promises.map((p) => p.capturedBy).filter(Boolean))];
    const users = userIds.length
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, email: true },
        })
      : [];
    const userById = new Map(users.map((u) => [u.id, u.name || u.email]));

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return NextResponse.json({
      promises: promises.map((p) => {
        const balance = Number(p.invoice.balanceDue ?? p.invoice.netAmount);
        const daysToPromise = Math.round(
          (new Date(p.promisedDate).setHours(0, 0, 0, 0) - today.getTime()) / 86_400_000
        );
        return {
          id: p.id,
          status: p.status,
          promisedDate: p.promisedDate,
          promisedAmount: p.promisedAmount != null ? Number(p.promisedAmount) : null,
          madeBy: p.madeBy,
          capturedByName: userById.get(p.capturedBy) ?? null,
          channel: p.channel,
          notes: p.notes,
          createdAt: p.createdAt,
          daysToPromise, // negative = past
          invoice: {
            id: p.invoice.id,
            billingNo: p.invoice.billingNo,
            customerName: p.invoice.customerName,
            status: p.invoice.status,
            entity: p.invoice.company?.code ?? '',
            balance,
            dueDate: p.invoice.dueDate,
          },
        };
      }),
      counts: Object.fromEntries(counts.map((c) => [c.status, c._count])),
    });
  } catch (error) {
    console.error('Error loading promises:', error);
    return NextResponse.json({ error: 'Failed to load promises' }, { status: 500 });
  }
}
