import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { searchClients } from '@/lib/worklist-service';

/** GET /api/worklist/clients?q= — client search for the Worklist add box. */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const q = (request.nextUrl.searchParams.get('q') || '').slice(0, 100);
  if (q.trim().length < 2) return NextResponse.json({ clients: [] });
  return NextResponse.json({ clients: await searchClients(q) });
}
