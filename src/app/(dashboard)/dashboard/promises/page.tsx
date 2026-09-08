import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { PromisesPage } from '@/components/dashboard/promises-page';

export const dynamic = 'force-dynamic';

export default async function PromisesRoute() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  return <PromisesPage />;
}
