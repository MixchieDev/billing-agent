import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { recordRenewal } from '@/lib/renewal-service';
import { RenewalOutcome } from '@/generated/prisma';

/** GET — this contract's renewal history, newest first. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const history = await prisma.contractRenewal.findMany({
      where: { contractId: id },
      orderBy: { decidedAt: 'desc' },
      include: { decidedBy: { select: { name: true, email: true } } },
    });
    return NextResponse.json({ history });
  } catch (error) {
    console.error('Error loading renewal history:', error);
    return NextResponse.json({ error: 'Failed to load renewal history' }, { status: 500 });
  }
}

/** POST — record what happened at the end of this term. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.user.role !== 'ADMIN' && session.user.role !== 'APPROVER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();

    if (!Object.values(RenewalOutcome).includes(body.outcome)) {
      return NextResponse.json(
        { error: `outcome must be one of ${Object.values(RenewalOutcome).join(', ')}` },
        { status: 400 }
      );
    }

    const result = await recordRenewal({
      contractId: id,
      outcome: body.outcome,
      newEndDate: body.newEndDate ? new Date(body.newEndDate) : null,
      newFee: body.newFee != null && body.newFee !== '' ? Number(body.newFee) : null,
      note: body.note ?? null,
      userId: session.user.id,
    });

    if (!result.success) return NextResponse.json({ error: result.message }, { status: 400 });
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error recording renewal:', error);
    return NextResponse.json({ error: 'Failed to record the renewal' }, { status: 500 });
  }
}
