import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { RenewalsPage } from '@/components/dashboard/renewals-page';

export const dynamic = 'force-dynamic';

export default async function RenewalsRoute() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  return <RenewalsPage />;
}
