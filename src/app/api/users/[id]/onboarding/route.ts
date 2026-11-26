import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

/**
 * POST /api/users/[id]/onboarding — ADMIN only.
 *   { action: 'reset' }     the user has to do the course again before the app opens
 *   { action: 'complete' }  waive the course for this user
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, email: true, role: true } });
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  if (body.action !== 'reset' && body.action !== 'complete') {
    return NextResponse.json({ error: 'action must be reset or complete' }, { status: 400 });
  }
  const now = new Date();
  const data =
    body.action === 'reset'
      ? { onboardingWalkthroughAt: null, onboardingCompletedAt: null }
      : { onboardingWalkthroughAt: now, onboardingCompletedAt: now };
  await prisma.user.update({ where: { id }, data });
  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: body.action === 'reset' ? 'ONBOARDING_RESET' : 'ONBOARDING_WAIVED',
      entityType: 'User',
      entityId: id,
      details: { email: user.email, by: session.user.email },
    },
  });
  return NextResponse.json({ ok: true, ...data });
}
