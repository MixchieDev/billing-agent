import { InvoiceListPage } from '@/components/dashboard/invoice-list-page';

export default function PendingPage() {
  return (
    <InvoiceListPage
      title="Pending Approval"
      subtitle="Invoices awaiting review and approval"
      status="PENDING"
    />
  );
}
