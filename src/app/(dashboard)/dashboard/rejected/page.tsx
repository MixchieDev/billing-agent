import { InvoiceListPage } from '@/components/dashboard/invoice-list-page';

export default function RejectedPage() {
  return (
    <InvoiceListPage
      title="Rejected Invoices"
      subtitle="Invoices that were rejected and need attention"
      status="REJECTED"
    />
  );
}
