import { InvoiceListPage } from '@/components/dashboard/invoice-list-page';

export default function ApprovedPage() {
  return (
    <InvoiceListPage
      title="Approved Invoices"
      subtitle="Invoices approved and ready to send"
      status="APPROVED"
    />
  );
}
