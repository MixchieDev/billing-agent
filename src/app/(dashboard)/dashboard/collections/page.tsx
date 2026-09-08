import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { CollectionsDashboard } from '@/components/dashboard/collections-dashboard';

export const dynamic = 'force-dynamic';

export default async function CollectionsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  return <CollectionsDashboard />;
}
