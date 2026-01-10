import { InvoiceListPage } from '@/components/dashboard/invoice-list-page';

export default function AllInvoicesPage() {
  return (
    <InvoiceListPage
      title="All Invoices"
      subtitle="Complete list of all invoices"
      showAllStatuses
    />
  );
}
