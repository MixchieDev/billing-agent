import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { loadSuspensions, markSuspension } from '@/lib/suspension-service';

/** GET — accounts at each stage of the read-only process. */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json(await loadSuspensions());
  } catch (error) {
    console.error('Error loading suspensions:', error);
    return NextResponse.json({ error: 'Failed to load suspensions' }, { status: 500 });
  }
}

/** POST { invoiceId, suspended } — log that you set an account read-only, or restored it. */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.user.role !== 'ADMIN' && session.user.role !== 'APPROVER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { invoiceId, suspended } = await request.json();
    if (!invoiceId || typeof suspended !== 'boolean') {
      return NextResponse.json({ error: 'invoiceId and suspended are required' }, { status: 400 });
    }

    const result = await markSuspension(invoiceId, suspended, session.user.id);
    if (!result.success) return NextResponse.json({ error: result.message }, { status: 400 });
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error updating suspension:', error);
    return NextResponse.json({ error: 'Failed to update the suspension' }, { status: 500 });
  }
}
