import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { GetStartedPanel } from '@/components/onboarding/get-started-panel';

export const dynamic = 'force-dynamic';

/**
 * Get started: the only page a new user can reach until they finish the
 * course. Admins and users who have finished can still open it to look.
 */
export default async function GetStartedPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, role: true, onboardingWalkthroughAt: true, onboardingCompletedAt: true },
  });
  if (!user) redirect('/login');

  return (
    <GetStartedPanel
      name={user.name ?? session.user.email ?? 'there'}
      role={user.role}
      walkthroughAt={user.onboardingWalkthroughAt?.toISOString() ?? null}
      completedAt={user.onboardingCompletedAt?.toISOString() ?? null}
    />
  );
}
