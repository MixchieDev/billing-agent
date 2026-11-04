import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isValidDay, manilaDay } from '@/lib/worklist';
import { getSuggestions } from '@/lib/worklist-service';

/**
 * GET /api/worklist/suggestions?date= — clients overdue with no promise or
 * pending PDC, and clients whose promise falls due today.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const today = manilaDay();
  const date = request.nextUrl.searchParams.get('date') || today;
  if (!isValidDay(date)) return NextResponse.json({ error: 'Invalid date' }, { status: 400 });

  try {
    // Overdue is judged against the day being planned, never earlier than today.
    const asOf = date < today ? today : date;
    return NextResponse.json(await getSuggestions(date, asOf));
  } catch (error) {
    console.error('[worklist] suggestions failed', error);
    return NextResponse.json({ error: 'Failed to load suggestions' }, { status: 500 });
  }
}
