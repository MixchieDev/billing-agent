import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { canFinish, needsOnboarding } from '@/lib/onboarding/gate';

const SELECT = { id: true, role: true, onboardingWalkthroughAt: true, onboardingCompletedAt: true } as const;

/** GET /api/onboarding — the signed-in user's own progress. */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: SELECT });
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  return NextResponse.json({
    walkthroughAt: user.onboardingWalkthroughAt,
    completedAt: user.onboardingCompletedAt,
    gated: needsOnboarding(user),
  });
}

/**
 * POST /api/onboarding
 *   { event: 'walkthrough' }                      — the course reports all eight steps done
 *   { event: 'complete', acknowledgedHandbook }   — the user finishes; opens the app
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: SELECT });
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  if (body.event === 'walkthrough') {
    if (!user.onboardingWalkthroughAt) {
      await prisma.user.update({ where: { id: user.id }, data: { onboardingWalkthroughAt: new Date() } });
    }
    return NextResponse.json({ ok: true });
  }

  if (body.event === 'complete') {
    const check = canFinish(user, body.acknowledgedHandbook === true);
    if (!check.ok) return NextResponse.json({ error: check.reason }, { status: 400 });
    const now = new Date();
    await prisma.user.update({ where: { id: user.id }, data: { onboardingCompletedAt: now } });
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'ONBOARDING_COMPLETED',
        entityType: 'User',
        entityId: user.id,
        details: { walkthroughAt: user.onboardingWalkthroughAt, completedAt: now },
      },
    });
    return NextResponse.json({ ok: true, completedAt: now });
  }

  return NextResponse.json({ error: 'Unknown event' }, { status: 400 });
}
