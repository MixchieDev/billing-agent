import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { SuspensionsPage } from '@/components/dashboard/suspensions-page';

export const dynamic = 'force-dynamic';

export default async function SuspensionsRoute() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  if (session.user.role !== 'ADMIN' && session.user.role !== 'APPROVER') {
    redirect('/dashboard');
  }
  return <SuspensionsPage />;
}
