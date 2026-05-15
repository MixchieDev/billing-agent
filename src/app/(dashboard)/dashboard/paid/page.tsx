import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { format, subDays } from 'date-fns';
import { authOptions } from '@/lib/auth';
import { PaidInvoicesPage } from '@/components/dashboard/paid-invoices-page';
import { fetchInvoicesForServer } from '@/lib/server-data';
import { InvoiceStatus } from '@/generated/prisma';

export const dynamic = 'force-dynamic';

export default async function PaidPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  // Match the client default: last 30 days
  const dateFrom = format(subDays(new Date(), 30), 'yyyy-MM-dd');
  const dateTo = format(new Date(), 'yyyy-MM-dd');

  const { invoices } = await fetchInvoicesForServer({
    status: InvoiceStatus.PAID,
    paidFrom: dateFrom,
    paidTo: dateTo,
  });

  return <PaidInvoicesPage initialData={{ invoices, dateFrom, dateTo }} />;
}
