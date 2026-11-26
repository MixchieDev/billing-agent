import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { needsOnboarding } from '@/lib/onboarding/gate';
import { Sidebar } from '@/components/dashboard/sidebar';
import { ChatPanelLazy } from '@/components/dashboard/chat/chat-panel-lazy';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The Get started gate: a new user sees nothing of the app until they have
  // finished the course. Admins are never gated. Checked here, on the shell
  // every dashboard and settings page shares, so no page can be reached around it.
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  if (session.user.role !== 'ADMIN') {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true, onboardingWalkthroughAt: true, onboardingCompletedAt: true },
    });
    if (!user || needsOnboarding(user)) redirect('/get-started');
  }

  return (
    <div className="flex h-screen bg-muted text-foreground">
      <Sidebar />
      <main className="flex-1 overflow-auto">{children}</main>
      <ChatPanelLazy />
    </div>
  );
}
