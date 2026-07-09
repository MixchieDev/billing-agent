import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { createPromise, cancelPromise } from '@/lib/promise-service';

/** GET /api/invoices/[id]/promises — list an invoice's promises (newest first). */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const promises = await prisma.promiseToPay.findMany({
    where: { invoiceId: id },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json(promises);
}

/** POST /api/invoices/[id]/promises — log a promise (pauses follow-ups until the date). */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'ADMIN' && session.user.role !== 'APPROVER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();

  if (!body.promisedDate) {
    return NextResponse.json({ error: 'promisedDate is required' }, { status: 400 });
  }
  const promisedDate = new Date(body.promisedDate);
  if (isNaN(promisedDate.getTime())) {
    return NextResponse.json({ error: 'Invalid promisedDate' }, { status: 400 });
  }

  try {
    const promise = await createPromise({
      invoiceId: id,
      promisedDate,
      promisedAmount: body.promisedAmount ?? null,
      madeBy: body.madeBy ?? null,
      channel: body.channel ?? null,
      notes: body.notes ?? null,
      capturedBy: session.user.id,
    });
    return NextResponse.json(promise);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to log promise';
    const isClientError =
      message.includes('Invoice not found') || message.includes('Cannot log a promise');
    return NextResponse.json({ error: message }, { status: isClientError ? 400 : 500 });
  }
}

/** DELETE /api/invoices/[id]/promises?promiseId=… — cancel a promise, lift its pause. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'ADMIN' && session.user.role !== 'APPROVER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const promiseId = new URL(request.url).searchParams.get('promiseId');
  if (!promiseId) {
    return NextResponse.json({ error: 'promiseId is required' }, { status: 400 });
  }

  try {
    await cancelPromise(id, promiseId, session.user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to cancel promise';
    const isClientError = message.includes('Promise not found');
    return NextResponse.json({ error: message }, { status: isClientError ? 400 : 500 });
  }
}
