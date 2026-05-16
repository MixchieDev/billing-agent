import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { InvoiceListPage } from '@/components/dashboard/invoice-list-page';
import { fetchInvoicesForServer } from '@/lib/server-data';
import { InvoiceStatus } from '@/generated/prisma';

export const dynamic = 'force-dynamic';

export default async function RejectedPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  const initialData = await fetchInvoicesForServer({ status: InvoiceStatus.REJECTED });

  return (
    <InvoiceListPage
      title="Rejected Invoices"
      subtitle="Invoices that were rejected and need attention"
      status="REJECTED"
      initialData={initialData}
    />
  );
}
