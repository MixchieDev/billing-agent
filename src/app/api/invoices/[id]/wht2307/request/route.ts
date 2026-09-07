import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { sendWht2307Request } from '@/lib/wht2307-request';

/**
 * POST /api/invoices/[id]/wht2307/request
 * Email the client a reminder to issue the BIR 2307 for a settled invoice,
 * including our invoiced/received/withheld reconciliation.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.user.role !== 'ADMIN' && session.user.role !== 'APPROVER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const result = await sendWht2307Request(id, session.user.id);

    if (!result.success) {
      return NextResponse.json({ error: result.message }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error sending 2307 request:', error);
    return NextResponse.json({ error: 'Failed to send the 2307 request' }, { status: 500 });
  }
}
