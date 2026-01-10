'use client';

import { useState, useEffect, useCallback } from 'react';
import { Header } from '@/components/dashboard/header';
import { InvoiceTable, InvoiceRow } from '@/components/dashboard/invoice-table';
import { MarkPaidModal, InvoiceForPayment } from '@/components/dashboard/mark-paid-modal';
import { Button } from '@/components/ui/button';
import { RefreshCw, Loader2 } from 'lucide-react';

interface InvoiceListPageProps {
  title: string;
  subtitle: string;
  status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SENT' | 'PAID' | 'CANCELLED';
  showAllStatuses?: boolean;
}

export function InvoiceListPage({ title, subtitle, status, showAllStatuses }: InvoiceListPageProps) {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedInvoiceForPayment, setSelectedInvoiceForPayment] = useState<InvoiceForPayment | null>(null);

  // Fetch invoices
  const fetchInvoices = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (status && !showAllStatuses) {
        params.set('status', status);
      }

      const url = `/api/invoices${params.toString() ? `?${params.toString()}` : ''}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch invoices');

      const data = await response.json();
      const invoiceList = Array.isArray(data) ? data : (data.invoices || []);

      const transformedInvoices: InvoiceRow[] = invoiceList.map((inv: any) => ({
        id: inv.id,
        billingNo: inv.billingNo,
        customerName: inv.customerName,
        productType: inv.lineItems?.[0]?.description?.includes('Payroll') ? 'PAYROLL' : 'ACCOUNTING',
        serviceFee: Number(inv.serviceFee),
        vatAmount: Number(inv.vatAmount),
        netAmount: Number(inv.netAmount),
        dueDate: new Date(inv.dueDate),
        billingEntity: inv.company?.code || 'YOWI',
        billingModel: inv.billingModel,
        status: inv.status,
      }));

      setInvoices(transformedInvoices);
    } catch (err: any) {
      setError(err.message);
      console.error('Error fetching invoices:', err);
    } finally {
      setLoading(false);
    }
  }, [status, showAllStatuses]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  // Approve invoice
  const handleApprove = async (id: string) => {
    try {
      const response = await fetch(`/api/invoices/${id}/approve`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to approve invoice');
      await fetchInvoices();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  // Reject invoice
  const handleReject = async (id: string) => {
    const reason = prompt('Enter rejection reason:');
    if (!reason) return;

    try {
      const response = await fetch(`/api/invoices/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      if (!response.ok) throw new Error('Failed to reject invoice');
      await fetchInvoices();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  // Bulk approve
  const handleBulkApprove = async (ids: string[]) => {
    try {
      const response = await fetch('/api/invoices/bulk-approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceIds: ids }),
      });
      if (!response.ok) throw new Error('Failed to bulk approve');
      await fetchInvoices();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleView = (id: string) => {
    window.open(`/api/invoices/${id}/pdf`, '_blank');
  };

  const handleEdit = (id: string) => {
    alert('Edit functionality coming soon!');
  };

  const handleMarkPaid = (invoice: InvoiceRow) => {
    setSelectedInvoiceForPayment({
      id: invoice.id,
      billingNo: invoice.billingNo,
      customerName: invoice.customerName,
      netAmount: invoice.netAmount,
    });
  };

  const handleSavePayment = async (
    invoiceId: string,
    data: {
      paidAmount: number;
      paymentMethod: 'CASH' | 'BANK_TRANSFER' | 'CHECK';
      paymentReference?: string;
      paidAt?: string;
    }
  ) => {
    const response = await fetch(`/api/invoices/${invoiceId}/mark-paid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to mark as paid');
    }

    await fetchInvoices();
  };

  return (
    <div className="flex flex-col">
      <Header title={title} subtitle={subtitle} />

      <div className="flex-1 space-y-6 p-6">
        {/* Actions bar */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {title}
            {loading && <Loader2 className="ml-2 inline h-4 w-4 animate-spin" />}
            <span className="ml-2 text-sm font-normal text-gray-500">
              ({invoices.length} invoice{invoices.length !== 1 ? 's' : ''})
            </span>
          </h2>
          <Button variant="outline" onClick={fetchInvoices} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Error message */}
        {error && (
          <div className="rounded-md bg-red-50 p-4 text-red-700">
            Error: {error}
          </div>
        )}

        {/* Invoice Table */}
        <InvoiceTable
          invoices={invoices}
          onApprove={handleApprove}
          onReject={handleReject}
          onEdit={handleEdit}
          onView={handleView}
          onBulkApprove={handleBulkApprove}
          onSend={fetchInvoices}
          onMarkPaid={handleMarkPaid}
        />

        {/* Empty state */}
        {!loading && invoices.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            No {status?.toLowerCase() || ''} invoices found.
          </div>
        )}
      </div>

      {/* Mark Paid Modal */}
      <MarkPaidModal
        invoice={selectedInvoiceForPayment}
        isOpen={!!selectedInvoiceForPayment}
        onClose={() => setSelectedInvoiceForPayment(null)}
        onSave={handleSavePayment}
      />
    </div>
  );
}
