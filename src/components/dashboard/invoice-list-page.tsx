'use client';

import { useState, useMemo } from 'react';
import { Header } from '@/components/dashboard/header';
import { InvoiceTable, InvoiceRow } from '@/components/dashboard/invoice-table';
import { MarkPaidModal, InvoiceForPayment } from '@/components/dashboard/mark-paid-modal';
import { InvoiceEditModal } from '@/components/dashboard/invoice-edit-modal';
import { InvoiceAuditLogModal } from '@/components/dashboard/invoice-audit-log-modal';
import { Button } from '@/components/ui/button';
import { RefreshCw, Loader2, Search, X } from 'lucide-react';
import { useInvoices } from '@/lib/hooks/use-api';

interface InvoiceListPageProps {
  title: string;
  subtitle: string;
  status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SENT' | 'PAID' | 'CANCELLED' | 'VOID';
  showAllStatuses?: boolean;
}

export function InvoiceListPage({ title, subtitle, status, showAllStatuses }: InvoiceListPageProps) {
  const [selectedInvoiceForPayment, setSelectedInvoiceForPayment] = useState<InvoiceForPayment | null>(null);
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);
  const [selectedInvoiceForHistory, setSelectedInvoiceForHistory] = useState<{ id: string; billingNo: string | null; customerName: string } | null>(null);

  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [entityFilter, setEntityFilter] = useState<'ALL' | 'YOWI' | 'ABBA'>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Use SWR for data fetching with caching
  const { data: invoicesData, error: invoicesError, isLoading, mutate } = useInvoices(
    status && !showAllStatuses ? status : undefined
  );

  // Transform invoices data
  const invoices: InvoiceRow[] = useMemo(() => {
    if (!invoicesData) return [];
    const invoiceList = Array.isArray(invoicesData) ? invoicesData : (invoicesData.invoices || []);
    return invoiceList.map((inv: any) => ({
      id: inv.id,
      billingNo: inv.billingNo,
      customerName: inv.customerName,
      customerEmail: inv.customerEmail,
      customerEmails: inv.customerEmails,
      productType: inv.lineItems?.[0]?.description?.includes('Payroll') ? 'PAYROLL' : 'ACCOUNTING',
      serviceFee: Number(inv.serviceFee),
      vatAmount: Number(inv.vatAmount),
      netAmount: Number(inv.netAmount),
      dueDate: new Date(inv.dueDate),
      createdAt: new Date(inv.createdAt),
      billingEntity: inv.company?.code || 'YOWI',
      billingModel: inv.billingModel,
      status: inv.status,
      // Follow-up tracking fields
      followUpEnabled: inv.followUpEnabled ?? true,
      followUpCount: inv.followUpCount ?? 0,
      lastFollowUpLevel: inv.lastFollowUpLevel ?? 0,
    }));
  }, [invoicesData]);

  const loading = isLoading;
  const error = invoicesError?.message || null;

  // Filter invoices based on search and filters
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      // Search filter (client name or billing number)
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesName = inv.customerName.toLowerCase().includes(query);
        const matchesBillingNo = inv.billingNo?.toLowerCase().includes(query);
        if (!matchesName && !matchesBillingNo) return false;
      }

      // Entity filter
      if (entityFilter !== 'ALL' && inv.billingEntity !== entityFilter) return false;

      // Status filter (only when showing all statuses)
      if (showAllStatuses && statusFilter !== 'ALL' && inv.status !== statusFilter) return false;

      return true;
    });
  }, [invoices, searchQuery, entityFilter, statusFilter, showAllStatuses]);

  const hasActiveFilters = searchQuery || entityFilter !== 'ALL' || (showAllStatuses && statusFilter !== 'ALL');

  const clearFilters = () => {
    setSearchQuery('');
    setEntityFilter('ALL');
    setStatusFilter('ALL');
  };

  // Refresh data using SWR mutate
  const refreshData = () => mutate();

  // Approve invoice
  const handleApprove = async (id: string) => {
    try {
      const response = await fetch(`/api/invoices/${id}/approve`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to approve invoice');
      mutate();
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
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.details || data.error || 'Failed to reject invoice');
      }
      mutate();
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
      mutate();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleView = (id: string) => {
    window.open(`/api/invoices/${id}/pdf`, '_blank');
  };

  const handleEdit = (id: string) => {
    setEditingInvoiceId(id);
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

    mutate();
  };

  // Void invoice
  const handleVoid = async (id: string) => {
    const reason = prompt('Enter reason for voiding this invoice:');
    if (!reason) return;

    try {
      const response = await fetch(`/api/invoices/${id}/void`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.details || data.error || 'Failed to void invoice');
      }
      mutate();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  // Pay online via HitPay
  const handlePayOnline = async (invoice: InvoiceRow) => {
    try {
      const response = await fetch(`/api/invoices/${invoice.id}/hitpay/create-payment`, {
        method: 'POST',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create payment request');
      }

      const data = await response.json();

      if (data.checkoutUrl) {
        // Open HitPay checkout in a new tab
        window.open(data.checkoutUrl, '_blank');
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  // View invoice history
  const handleViewHistory = (invoice: InvoiceRow) => {
    setSelectedInvoiceForHistory({
      id: invoice.id,
      billingNo: invoice.billingNo,
      customerName: invoice.customerName,
    });
  };

  // Send follow-up email
  const handleSendFollowUp = async (invoice: InvoiceRow) => {
    const nextLevel = (invoice.lastFollowUpLevel ?? 0) + 1;
    const levelDescriptions: Record<number, string> = {
      1: 'Gentle Reminder',
      2: 'Firm Reminder',
      3: 'Final Notice',
    };

    const confirmed = window.confirm(
      `Send follow-up email (Level ${nextLevel}: ${levelDescriptions[nextLevel]}) for invoice ${invoice.billingNo || invoice.id.slice(0, 8)} to ${invoice.customerName}?`
    );
    if (!confirmed) return;

    try {
      const response = await fetch(`/api/invoices/${invoice.id}/follow-up`, {
        method: 'POST',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send follow-up');
      }

      alert(`Follow-up Level ${data.level} sent successfully!`);
      mutate();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  return (
    <div className="flex flex-col">
      <Header title={title} subtitle={subtitle} />

      <div className="flex-1 space-y-4 p-6">
        {/* Header row */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {title}
            {loading && <Loader2 className="ml-2 inline h-4 w-4 animate-spin" />}
            <span className="ml-2 text-sm font-normal text-gray-500">
              ({filteredInvoices.length}{hasActiveFilters ? ` of ${invoices.length}` : ''} invoice{filteredInvoices.length !== 1 ? 's' : ''})
            </span>
          </h2>
          <Button variant="outline" onClick={refreshData} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-gray-50 p-3">
          {/* Search input */}
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by client or invoice no..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-md border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Entity filter */}
          <select
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value as 'ALL' | 'YOWI' | 'ABBA')}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="ALL">All Entities</option>
            <option value="YOWI">YOWI</option>
            <option value="ABBA">ABBA</option>
          </select>

          {/* Status filter (only when showing all statuses) */}
          {showAllStatuses && (
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="ALL">All Statuses</option>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="SENT">Sent</option>
              <option value="PAID">Paid</option>
              <option value="REJECTED">Rejected</option>
              <option value="VOID">Void</option>
            </select>
          )}

          {/* Clear filters button */}
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="text-gray-500">
              <X className="mr-1 h-4 w-4" />
              Clear
            </Button>
          )}
        </div>

        {/* Error message */}
        {error && (
          <div className="rounded-md bg-red-50 p-4 text-red-700">
            Error: {error}
          </div>
        )}

        {/* Invoice Table */}
        <InvoiceTable
          invoices={filteredInvoices}
          onApprove={handleApprove}
          onReject={handleReject}
          onVoid={handleVoid}
          onEdit={handleEdit}
          onView={handleView}
          onBulkApprove={handleBulkApprove}
          onSend={refreshData}
          onMarkPaid={handleMarkPaid}
          onPayOnline={handlePayOnline}
          onViewHistory={handleViewHistory}
          onSendFollowUp={handleSendFollowUp}
        />

        {/* Empty state */}
        {!loading && invoices.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            No {status?.toLowerCase() || ''} invoices found.
          </div>
        )}

        {/* No results from filter */}
        {!loading && invoices.length > 0 && filteredInvoices.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            No invoices match your filters.{' '}
            <button onClick={clearFilters} className="text-blue-600 hover:underline">
              Clear filters
            </button>
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

      {/* Invoice Edit Modal */}
      <InvoiceEditModal
        invoiceId={editingInvoiceId}
        isOpen={!!editingInvoiceId}
        onClose={() => setEditingInvoiceId(null)}
        onSave={refreshData}
      />

      {/* Invoice Audit Log Modal */}
      <InvoiceAuditLogModal
        invoice={selectedInvoiceForHistory}
        isOpen={!!selectedInvoiceForHistory}
        onClose={() => setSelectedInvoiceForHistory(null)}
      />
    </div>
  );
}
