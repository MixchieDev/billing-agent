import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { loadCleanupCandidates } from '@/lib/cleanup-service';

/**
 * GET /api/invoices/cleanup
 * Every open invoice with its cleanup flags (duplicates, never delivered,
 * unreachable, long overdue, test rows) plus per-bucket counts.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    return NextResponse.json(await loadCleanupCandidates());
  } catch (error) {
    console.error('Error loading cleanup candidates:', error);
    return NextResponse.json({ error: 'Failed to load the cleanup list' }, { status: 500 });
  }
}
