import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import {
  MAX_TITLE_LENGTH,
  WORKLIST_STATUSES,
  WORKLIST_STATUS_LABEL,
  dateToDay,
  dayToDate,
  manilaDay,
  nextDoneDate,
  parseAmount,
  type WorklistStatusKey,
} from '@/lib/worklist';
import { formatCurrency } from '@/lib/utils';

/**
 * PATCH /api/worklist/[id] — change status, owner, amounts or the task text.
 * Every change is written to the item's log so the day reads as a history.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const today = manilaDay();

  const item = await prisma.worklistItem.findUnique({
    where: { id },
    include: { owner: { select: { name: true, email: true } } },
  });
  if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 });

  const data: Record<string, unknown> = {};
  const log: string[] = [];

  if (body.status !== undefined) {
    if (!WORKLIST_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }
    const status = body.status as WorklistStatusKey;
    if (status !== item.status) {
      const done = nextDoneDate(
        { status: item.status as WorklistStatusKey, doneDate: item.doneDate ? dateToDay(item.doneDate) : null },
        status,
        today
      );
      data.status = status;
      data.doneDate = done ? dayToDate(done) : null;
      log.push(`Status: ${WORKLIST_STATUS_LABEL[item.status as WorklistStatusKey]} → ${WORKLIST_STATUS_LABEL[status]}`);
    }
  }

  if (body.ownerId !== undefined && body.ownerId !== item.ownerId) {
    const owner = await prisma.user.findUnique({ where: { id: String(body.ownerId) }, select: { id: true, name: true, email: true } });
    if (!owner) return NextResponse.json({ error: 'Owner not found' }, { status: 400 });
    data.ownerId = owner.id;
    log.push(`Owner: ${item.owner.name || item.owner.email} → ${owner.name || owner.email}`);
  }

  const target = parseAmount(body.targetAmount);
  const uninvoiced = parseAmount(body.uninvoicedAmount);
  if (target.error || uninvoiced.error) {
    return NextResponse.json({ error: target.error || uninvoiced.error }, { status: 400 });
  }
  const prevTarget = item.targetAmount == null ? null : Number(item.targetAmount);
  const prevUninv = Number(item.uninvoicedAmount);
  if (target.value !== undefined && target.value !== prevTarget) {
    data.targetAmount = target.value;
    log.push(
      `From open invoices: ${target.value == null ? 'full open balance' : formatCurrency(target.value)}`
    );
  }
  if (uninvoiced.value !== undefined && (uninvoiced.value ?? 0) !== prevUninv) {
    data.uninvoicedAmount = uninvoiced.value ?? 0;
    log.push(`Not invoiced yet: ${formatCurrency(uninvoiced.value ?? 0)}`);
  }

  if (body.title !== undefined && !item.contractId) {
    const title = String(body.title).trim().slice(0, MAX_TITLE_LENGTH);
    if (!title) return NextResponse.json({ error: 'A task needs some text' }, { status: 400 });
    if (title !== item.title) {
      data.title = title;
      log.push(`Renamed to “${title}”`);
    }
  }

  if (Object.keys(data).length === 0) return NextResponse.json({ ok: true, changed: false });

  await prisma.worklistItem.update({
    where: { id },
    data: {
      ...data,
      notes: { create: log.map((b) => ({ authorId: session.user.id, kind: 'SYSTEM', body: b })) },
    },
  });
  return NextResponse.json({ ok: true, changed: true });
}

/** DELETE /api/worklist/[id] — take an item off the list for good, with its log. */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const item = await prisma.worklistItem.findUnique({ where: { id }, select: { createdById: true } });
  if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 });
  if (item.createdById !== session.user.id && session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Only the person who added it, or an admin, can remove it' }, { status: 403 });
  }
  await prisma.worklistItem.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
