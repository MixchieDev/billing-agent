import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import {
  MAX_TITLE_LENGTH,
  dayToDate,
  isValidDay,
  manilaDay,
  parseAmount,
} from '@/lib/worklist';
import { clientOnDay, getWorklistDay } from '@/lib/worklist-service';
import { formatCurrency } from '@/lib/utils';

/** GET /api/worklist?date=YYYY-MM-DD — the list for one Manila day (default today). */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const today = manilaDay();
  const date = request.nextUrl.searchParams.get('date') || today;
  if (!isValidDay(date)) return NextResponse.json({ error: 'Invalid date' }, { status: 400 });

  try {
    const data = await getWorklistDay(date, today);
    return NextResponse.json({ date, today, me: session.user.id, ...data });
  } catch (error) {
    console.error('[worklist] load failed', error);
    return NextResponse.json({ error: 'Failed to load the worklist' }, { status: 500 });
  }
}

/**
 * POST /api/worklist — put a client or a task on a day.
 * Body: { date, contractId? , title?, ownerId?, targetAmount?, uninvoicedAmount? }
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const today = manilaDay();
  const date = body.date || today;
  if (!isValidDay(date)) return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
  if (date < today) {
    return NextResponse.json({ error: "Past days can't be changed. Add it to today instead." }, { status: 400 });
  }

  const contractId = typeof body.contractId === 'string' && body.contractId ? body.contractId : null;
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, MAX_TITLE_LENGTH) : '';
  if (!contractId && !title) {
    return NextResponse.json({ error: 'Choose a client or type a task' }, { status: 400 });
  }

  const target = parseAmount(body.targetAmount);
  const uninvoiced = parseAmount(body.uninvoicedAmount);
  if (target.error || uninvoiced.error) {
    return NextResponse.json({ error: target.error || uninvoiced.error }, { status: 400 });
  }

  const ownerId = typeof body.ownerId === 'string' && body.ownerId ? body.ownerId : session.user.id;

  try {
    const [owner, contract] = await prisma.$transaction([
      prisma.user.findUnique({ where: { id: ownerId }, select: { id: true } }),
      prisma.contract.findUnique({
        where: { id: contractId ?? '' },
        select: { id: true, companyName: true },
      }),
    ]);
    if (!owner) return NextResponse.json({ error: 'Owner not found' }, { status: 400 });
    if (contractId && !contract) return NextResponse.json({ error: 'Client not found' }, { status: 400 });
    // A client counts once a day, whichever of its contracts was picked.
    if (contract && (await clientOnDay(contract.companyName, date))) {
      return NextResponse.json(
        { error: `${contract!.companyName} is already on this day's list` },
        { status: 409 }
      );
    }

    const amountNote =
      target.value != null || (uninvoiced.value ?? 0) > 0
        ? [
            target.value != null ? `${formatCurrency(target.value)} from open invoices` : null,
            (uninvoiced.value ?? 0) > 0 ? `${formatCurrency(uninvoiced.value!)} not invoiced yet` : null,
          ]
            .filter(Boolean)
            .join(', ')
        : null;

    const item = await prisma.worklistItem.create({
      data: {
        startDate: dayToDate(date),
        contractId,
        title: contractId ? null : title,
        ownerId,
        createdById: session.user.id,
        targetAmount: target.value ?? null,
        uninvoicedAmount: uninvoiced.value ?? 0,
        ...(amountNote && {
          notes: { create: { authorId: session.user.id, kind: 'SYSTEM', body: `Amount to collect: ${amountNote}` } },
        }),
      },
      select: { id: true },
    });
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    console.error('[worklist] add failed', error);
    return NextResponse.json({ error: 'Failed to add to the worklist' }, { status: 500 });
  }
}
