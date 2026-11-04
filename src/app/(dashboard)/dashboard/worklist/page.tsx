import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { WorklistPage } from '@/components/dashboard/worklist-page';

export const dynamic = 'force-dynamic';

export default async function WorklistRoute() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  return <WorklistPage />;
}
