import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { InvoiceListPage } from '@/components/dashboard/invoice-list-page';
import { fetchInvoicesForServer } from '@/lib/server-data';
import { InvoiceStatus } from '@/generated/prisma';

export const dynamic = 'force-dynamic';

export default async function ApprovedPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  const initialData = await fetchInvoicesForServer({ status: InvoiceStatus.APPROVED });

  return (
    <InvoiceListPage
      title="Approved Invoices"
      subtitle="Invoices approved and ready to send"
      status="APPROVED"
      initialData={initialData}
    />
  );
}
