import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

const MAX_BULK = 500;

/**
 * POST /api/invoices/bulk-follow-up  { ids: string[], enabled: boolean }
 * Turn the follow-up ladder on or off for several invoices at once.
 *
 * The reversible half of cleanup: an invoice we shouldn't chase (never
 * delivered, no email on file, under dispute) can be taken out of the ladder
 * without voiding it, so the receivable stays on the books.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.user.role !== 'ADMIN' && session.user.role !== 'APPROVER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { ids, enabled } = await request.json();

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'No invoices selected' }, { status: 400 });
    }
    if (typeof enabled !== 'boolean') {
      return NextResponse.json({ error: 'enabled must be true or false' }, { status: 400 });
    }
    if (ids.length > MAX_BULK) {
      return NextResponse.json(
        { error: `Too many invoices at once (${ids.length}). Limit is ${MAX_BULK}.` },
        { status: 400 }
      );
    }

    const result = await prisma.invoice.updateMany({
      where: { id: { in: ids } },
      data: { followUpEnabled: enabled },
    });

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: enabled ? 'FOLLOW_UP_ENABLED_BULK' : 'FOLLOW_UP_DISABLED_BULK',
        entityType: 'Invoice',
        entityId: ids[0],
        details: { count: result.count, enabled, invoiceIds: ids },
      },
    });

    return NextResponse.json({
      count: result.count,
      message: `Follow-ups ${enabled ? 'enabled' : 'disabled'} for ${result.count} invoice${
        result.count === 1 ? '' : 's'
      }`,
    });
  } catch (error) {
    console.error('Error updating follow-up flags:', error);
    return NextResponse.json({ error: 'Failed to update follow-ups' }, { status: 500 });
  }
}
