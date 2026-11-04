import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { MAX_NOTE_LENGTH } from '@/lib/worklist';

/** POST /api/worklist/[id]/notes — add an update to an item's log. Body: { body } */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const payload = await request.json().catch(() => ({}));
  const text = typeof payload.body === 'string' ? payload.body.trim() : '';
  if (!text) return NextResponse.json({ error: 'Write an update first' }, { status: 400 });
  if (text.length > MAX_NOTE_LENGTH) {
    return NextResponse.json({ error: `Keep updates under ${MAX_NOTE_LENGTH} characters` }, { status: 400 });
  }

  const item = await prisma.worklistItem.findUnique({ where: { id }, select: { id: true } });
  if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 });

  const note = await prisma.worklistNote.create({
    data: { itemId: id, authorId: session.user.id, body: text },
    select: { id: true },
  });
  return NextResponse.json(note, { status: 201 });
}
