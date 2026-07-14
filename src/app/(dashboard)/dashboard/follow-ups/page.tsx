import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { FollowUpQueue } from '@/components/dashboard/follow-up-queue';

export const dynamic = 'force-dynamic';

export default async function FollowUpQueuePage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  return <FollowUpQueue />;
}
