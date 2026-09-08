import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { CleanupPage } from '@/components/dashboard/cleanup-page';

export const dynamic = 'force-dynamic';

export default async function CleanupRoute() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  // Cleanup voids real invoices — viewers have no business here.
  if (session.user.role !== 'ADMIN' && session.user.role !== 'APPROVER') {
    redirect('/dashboard');
  }

  return <CleanupPage />;
}
