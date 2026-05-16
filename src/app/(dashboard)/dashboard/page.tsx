import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { DashboardView } from '@/components/dashboard/dashboard-view';
import { fetchInvoicesForServer, fetchInvoiceStatsForServer } from '@/lib/server-data';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  const [invoices, stats] = await Promise.all([
    fetchInvoicesForServer(),
    fetchInvoiceStatsForServer(),
  ]);

  return <DashboardView initialData={{ invoices, stats }} />;
}
