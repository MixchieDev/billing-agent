import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { InvoiceListPage } from '@/components/dashboard/invoice-list-page';
import { fetchInvoicesForServer } from '@/lib/server-data';

export const dynamic = 'force-dynamic';

export default async function AllInvoicesPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  const initialData = await fetchInvoicesForServer();

  return (
    <InvoiceListPage
      title="All Invoices"
      subtitle="Complete list of all invoices"
      showAllStatuses
      initialData={initialData}
    />
  );
}
