import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { InvoiceListPage } from '@/components/dashboard/invoice-list-page';
import { fetchInvoicesForServer } from '@/lib/server-data';
import { InvoiceStatus } from '@/generated/prisma';

export const dynamic = 'force-dynamic';

export default async function PendingPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  const initialData = await fetchInvoicesForServer({ status: InvoiceStatus.PENDING });

  return (
    <InvoiceListPage
      title="Pending Approval"
      subtitle="Invoices awaiting review and approval"
      status="PENDING"
      initialData={initialData}
    />
  );
}
