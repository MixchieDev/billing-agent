/**
 * Promise-to-Pay for the collections upgrade (Phase 1, PR-3).
 *
 * A promise records that a client committed to pay an overdue invoice by a date.
 * Logging an OPEN promise PAUSES follow-ups until that date (followUpPausedUntil),
 * so the automated ladder (PR-4) leaves the client alone while the promise stands.
 * When the invoice settles the promise is marked KEPT; the nightly sweep (PR-4)
 * marks it BROKEN the day after an unmet promisedDate and clears the pause.
 */

import { Prisma } from '@/generated/prisma';
import prisma from './prisma';

export interface CreatePromiseInput {
  invoiceId: string;
  promisedDate: Date;
  promisedAmount?: number | string | null;
  madeBy?: string | null; // client contact who promised
  channel?: string | null; // EMAIL | CALL | VIBER | MEETING
  notes?: string | null;
  capturedBy: string; // staff user id who logged it
}

/**
 * Log a promise and pause follow-ups until the promised date. Only chaseable
 * invoices (SENT / PARTIALLY_PAID) can carry a promise.
 */
export async function createPromise(input: CreatePromiseInput) {
  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findUnique({
      where: { id: input.invoiceId },
      select: { id: true, status: true, billingNo: true },
    });
    if (!invoice) throw new Error('Invoice not found');
    if (invoice.status !== 'SENT' && invoice.status !== 'PARTIALLY_PAID') {
      throw new Error(
        `Cannot log a promise while status is ${invoice.status}. Only SENT or PARTIALLY_PAID invoices can carry a promise.`
      );
    }

    const promise = await tx.promiseToPay.create({
      data: {
        invoiceId: invoice.id,
        promisedDate: input.promisedDate,
        promisedAmount:
          input.promisedAmount != null ? new Prisma.Decimal(input.promisedAmount) : null,
        madeBy: input.madeBy ?? null,
        channel: input.channel ?? null,
        notes: input.notes ?? null,
        capturedBy: input.capturedBy,
        status: 'OPEN',
      },
    });

    // Pause the follow-up ladder until the promised date.
    await tx.invoice.update({
      where: { id: invoice.id },
      data: { followUpPausedUntil: input.promisedDate },
    });

    await tx.auditLog.create({
      data: {
        userId: input.capturedBy,
        action: 'PROMISE_CREATED',
        entityType: 'Invoice',
        entityId: invoice.id,
        details: {
          billingNo: invoice.billingNo,
          promisedDate: input.promisedDate.toISOString(),
          promisedAmount: promise.promisedAmount?.toString() ?? null,
          channel: input.channel ?? null,
        },
      },
    });

    return promise;
  });
}

/**
 * Cancel an open promise (logged in error / renegotiated) and lift the pause it
 * set, restoring the pause to the next-latest still-open promise if any.
 */
export async function cancelPromise(invoiceId: string, promiseId: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const promise = await tx.promiseToPay.findUnique({ where: { id: promiseId } });
    if (!promise || promise.invoiceId !== invoiceId) throw new Error('Promise not found');

    await tx.promiseToPay.delete({ where: { id: promiseId } });

    // Recompute the pause from any remaining open promises.
    const remaining = await tx.promiseToPay.findMany({
      where: { invoiceId, status: 'OPEN' },
      orderBy: { promisedDate: 'desc' },
      take: 1,
    });
    await tx.invoice.update({
      where: { id: invoiceId },
      data: { followUpPausedUntil: remaining[0]?.promisedDate ?? null },
    });

    await tx.auditLog.create({
      data: {
        userId,
        action: 'PROMISE_CANCELLED',
        entityType: 'Invoice',
        entityId: invoiceId,
        details: { promiseId },
      },
    });
  });
}

/**
 * Mark any open promises on an invoice as KEPT. Called inside the payment
 * transaction when an invoice fully settles. Accepts the transaction client.
 */
export async function markOpenPromisesKept(
  tx: Prisma.TransactionClient,
  invoiceId: string
): Promise<void> {
  await tx.promiseToPay.updateMany({
    where: { invoiceId, status: 'OPEN' },
    data: { status: 'KEPT' },
  });
}
