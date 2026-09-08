import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { loadRenewals } from '@/lib/renewal-service';

/**
 * GET /api/renewals
 * Active contracts by how close they are to their end date, plus the active
 * contracts that have no end date recorded at all.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    return NextResponse.json(await loadRenewals());
  } catch (error) {
    console.error('Error loading renewals:', error);
    return NextResponse.json({ error: 'Failed to load renewals' }, { status: 500 });
  }
}
