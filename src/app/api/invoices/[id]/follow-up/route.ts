import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { sendFollowUpEmail, canSendFollowUp, getFollowUpHistory } from '@/lib/follow-up-service';

// POST - Send follow-up email for an invoice
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only ADMIN and APPROVER can send follow-ups
    if (session.user.role !== 'ADMIN' && session.user.role !== 'APPROVER') {
      return NextResponse.json(
        { error: 'Permission denied. Only ADMIN or APPROVER can send follow-up emails.' },
        { status: 403 }
      );
    }

    const { id } = await params;

    // Check if follow-up can be sent
    const canSendResult = await canSendFollowUp(id);
    if (!canSendResult.canSend) {
      return NextResponse.json(
        { error: canSendResult.reason },
        { status: 400 }
      );
    }

    // Send follow-up email
    const result = await sendFollowUpEmail(id, session.user.id);

    if (result.success) {
      return NextResponse.json({
        success: true,
        level: result.level,
        message: result.message,
        followUpLogId: result.followUpLogId,
      });
    } else {
      return NextResponse.json(
        { error: result.message, details: result.error },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error sending follow-up:', error);
    return NextResponse.json(
      { error: 'Failed to send follow-up email' },
      { status: 500 }
    );
  }
}

// GET - Get follow-up status and history for an invoice
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Check if follow-up can be sent
    const canSendResult = await canSendFollowUp(id);

    // Get follow-up history
    const history = await getFollowUpHistory(id);

    return NextResponse.json({
      canSend: canSendResult.canSend,
      reason: canSendResult.reason,
      nextLevel: canSendResult.nextLevel,
      history: history.map((log) => ({
        id: log.id,
        level: log.level,
        sentAt: log.sentAt.toISOString(),
        toEmail: log.toEmail,
        subject: log.subject,
        status: log.status,
        error: log.error,
        templateName: log.template?.name,
      })),
    });
  } catch (error) {
    console.error('Error getting follow-up status:', error);
    return NextResponse.json(
      { error: 'Failed to get follow-up status' },
      { status: 500 }
    );
  }
}
