import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { toggleFollowUpEnabled } from '@/lib/follow-up-service';
import prisma from '@/lib/prisma';

// PATCH - Toggle follow-up enabled/disabled for an invoice
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only ADMIN and APPROVER can toggle follow-up
    if (session.user.role !== 'ADMIN' && session.user.role !== 'APPROVER') {
      return NextResponse.json(
        { error: 'Permission denied. Only ADMIN or APPROVER can modify follow-up settings.' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const { enabled } = body;

    if (typeof enabled !== 'boolean') {
      return NextResponse.json(
        { error: 'Invalid request. "enabled" must be a boolean.' },
        { status: 400 }
      );
    }

    // Check if invoice exists
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      select: { id: true, status: true },
    });

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // Toggle follow-up
    const result = await toggleFollowUpEnabled(id, enabled, session.user.id);

    return NextResponse.json({
      success: result.success,
      followUpEnabled: result.enabled,
      message: enabled ? 'Follow-up enabled' : 'Follow-up disabled',
    });
  } catch (error) {
    console.error('Error toggling follow-up:', error);
    return NextResponse.json(
      { error: 'Failed to toggle follow-up' },
      { status: 500 }
    );
  }
}
