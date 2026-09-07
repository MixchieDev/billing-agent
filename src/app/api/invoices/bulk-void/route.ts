import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { InvoiceStatus } from '@/generated/prisma';

/** Guard rail: a cleanup slip shouldn't be able to wipe the whole book at once. */
const MAX_BULK = 100;

/**
 * POST /api/invoices/bulk-void
 * Void several invoices in one operator action, applying exactly the same rules
 * as the single-invoice void: only APPROVED/SENT, reason required, pending
 * HitPay requests closed, audit logged per invoice.
 *
 * Each invoice is processed independently so one bad row can't silently drop
 * the rest — the response reports per-invoice outcomes.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.user.role !== 'ADMIN' && session.user.role !== 'APPROVER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!user) {
      return NextResponse.json(
        { error: 'User session is invalid. Please log out and log in again.' },
        { status: 401 }
      );
    }

    const { ids, reason } = await request.json();

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'No invoices selected' }, { status: 400 });
    }
    if (typeof reason !== 'string' || !reason.trim()) {
      return NextResponse.json({ error: 'Void reason is required' }, { status: 400 });
    }
    if (ids.length > MAX_BULK) {
      return NextResponse.json(
        { error: `Too many invoices at once (${ids.length}). Void at most ${MAX_BULK} per action.` },
        { status: 400 }
      );
    }

    const invoices = await prisma.invoice.findMany({
      where: { id: { in: ids } },
      select: { id: true, billingNo: true, status: true },
    });
    const found = new Map(invoices.map((i) => [i.id, i]));

    const voided: string[] = [];
    const skipped: { id: string; billingNo: string | null; reason: string }[] = [];

    for (const id of ids) {
      const inv = found.get(id);
      if (!inv) {
        skipped.push({ id, billingNo: null, reason: 'Invoice not found' });
        continue;
      }
      if (inv.status !== InvoiceStatus.APPROVED && inv.status !== InvoiceStatus.SENT) {
        skipped.push({
          id,
          billingNo: inv.billingNo,
          reason: `Cannot void a ${inv.status} invoice`,
        });
        continue;
      }

      try {
        await prisma.invoice.update({
          where: { id },
          data: {
            status: InvoiceStatus.VOID,
            voidedById: session.user.id,
            voidedAt: new Date(),
            voidReason: reason,
          },
        });

        if (inv.status === InvoiceStatus.SENT) {
          await prisma.hitpayPaymentRequest.updateMany({
            where: { invoiceId: id, status: 'PENDING' },
            data: { status: 'FAILED' },
          });
        }

        await prisma.auditLog.create({
          data: {
            userId: session.user.id,
            action: 'INVOICE_VOIDED',
            entityType: 'Invoice',
            entityId: id,
            details: {
              invoiceNo: inv.billingNo,
              reason,
              previousStatus: inv.status,
              bulk: true,
              batchSize: ids.length,
            },
          },
        });

        voided.push(id);
      } catch (e) {
        skipped.push({
          id,
          billingNo: inv.billingNo,
          reason: e instanceof Error ? e.message : 'Update failed',
        });
      }
    }

    // One notification for the batch rather than a flood of them.
    if (voided.length > 0) {
      await prisma.notification.create({
        data: {
          type: 'INVOICE_VOID',
          title: 'Invoices voided in bulk',
          message: `${voided.length} invoice${voided.length === 1 ? '' : 's'} voided by ${
            session.user.name || 'Unknown'
          } during cleanup. Reason: ${reason}`,
          link: '/dashboard/cleanup',
          entityType: 'Invoice',
          entityId: voided[0],
        },
      });
    }

    return NextResponse.json({
      voidedCount: voided.length,
      skippedCount: skipped.length,
      skipped,
      message:
        `Voided ${voided.length} invoice${voided.length === 1 ? '' : 's'}` +
        (skipped.length ? `, skipped ${skipped.length}` : ''),
    });
  } catch (error) {
    console.error('Error bulk-voiding invoices:', error);
    return NextResponse.json({ error: 'Failed to void the selected invoices' }, { status: 500 });
  }
}
