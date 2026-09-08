import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { certificateAmount } from '@/lib/wht2307';

/**
 * PATCH /api/invoices/[id]/wht2307  { status: 'RECEIVED' | 'PENDING' }
 * Record that a client's BIR 2307 certificate arrived (or undo a mistake).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.user.role !== 'ADMIN' && session.user.role !== 'APPROVER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const next = body?.status;

    if (next !== 'RECEIVED' && next !== 'PENDING') {
      return NextResponse.json(
        { error: "status must be 'RECEIVED' or 'PENDING'" },
        { status: 400 }
      );
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      select: {
        id: true,
        billingNo: true,
        customerName: true,
        wht2307Status: true,
        withholdingTax: true,
        balanceDue: true,
      },
    });
    if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });

    if (invoice.wht2307Status === 'NOT_APPLICABLE') {
      return NextResponse.json(
        { error: 'This invoice has no withholding tax, so no 2307 is expected.' },
        { status: 400 }
      );
    }
    if (invoice.wht2307Status === next) {
      return NextResponse.json(
        { error: `The 2307 is already marked ${next.toLowerCase()}.` },
        { status: 400 }
      );
    }

    const updated = await prisma.invoice.update({
      where: { id },
      data: {
        wht2307Status: next,
        wht2307ReceivedAt: next === 'RECEIVED' ? new Date() : null,
      },
      select: { id: true, wht2307Status: true, wht2307ReceivedAt: true },
    });

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: next === 'RECEIVED' ? 'WHT2307_RECEIVED' : 'WHT2307_REVERTED_TO_PENDING',
        entityType: 'Invoice',
        entityId: id,
        details: {
          billingNo: invoice.billingNo,
          customerName: invoice.customerName,
          amount: certificateAmount(invoice),
          from: invoice.wht2307Status,
          to: next,
        },
      },
    });

    return NextResponse.json({ success: true, ...updated });
  } catch (error) {
    console.error('Error updating 2307 status:', error);
    return NextResponse.json({ error: 'Failed to update 2307 status' }, { status: 500 });
  }
}
