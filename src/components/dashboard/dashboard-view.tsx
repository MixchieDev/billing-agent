'use client';

import { useState, useMemo } from 'react';
import { Header } from '@/components/dashboard/header';
import { StatsCards } from '@/components/dashboard/stats-cards';
import { InvoiceFiltersComponent, InvoiceFilters } from '@/components/dashboard/invoice-filters';
import { InvoiceTable, InvoiceRow } from '@/components/dashboard/invoice-table';
import { Button } from '@/components/ui/button';
import { RefreshCw, Play, Loader2 } from 'lucide-react';
import { useInvoices, useStats } from '@/lib/hooks/use-api';

const defaultFilters: InvoiceFilters = {
  billingEntity: '',
  partner: '',
  productType: '',
  status: '',
  dateFrom: '',
  dateTo: '',
};

export interface DashboardInitialData {
  invoices: { invoices: Array<Record<string, any>>; total: number; page: number; limit: number; totalPages: number };
  stats: {
    pending: number;
    approved: number;
    rejected: number;
    sent: number;
    totalPendingAmount: number;
    totalApprovedAmount: number;
  };
}

interface DashboardViewProps {
  initialData?: DashboardInitialData;
}

export function DashboardView({ initialData }: DashboardViewProps = {}) {
  const [filters, setFilters] = useState<InvoiceFilters>(defaultFilters);
  const [triggeringBilling, setTriggeringBilling] = useState(false);

  // SWR, seeded with server-prefetched data so the first paint has rows
  // without waiting for a client-side fetch.
  const { data: invoicesData, error: invoicesError, isLoading: invoicesLoading, mutate: mutateInvoices } = useInvoices(
    {},
    initialData ? { fallbackData: initialData.invoices, revalidateOnMount: false } : undefined,
  );
  const { data: statsData, error: statsError, mutate: mutateStats } = useStats(
    initialData ? { fallbackData: initialData.stats, revalidateOnMount: false } : undefined,
  );

  // Transform invoices data
  const invoices: InvoiceRow[] = useMemo(() => {
    if (!invoicesData) return [];
    const invoiceList = Array.isArray(invoicesData) ? invoicesData : (invoicesData.invoices || []);
    return invoiceList.map((inv: any) => ({
      id: inv.id,
      billingNo: inv.billingNo,
      customerName: inv.customerName,
      productType: inv.productType || inv.lineItems?.[0]?.description || 'ACCOUNTING',
      serviceFee: Number(inv.serviceFee),
      vatAmount: Number(inv.vatAmount),
      netAmount: Number(inv.netAmount),
      amountPaidTotal: inv.amountPaidTotal != null ? Number(inv.amountPaidTotal) : undefined,
      balanceDue: inv.balanceDue != null ? Number(inv.balanceDue) : null,
      dueDate: new Date(inv.dueDate),
      billingEntity: inv.company?.code || 'YOWI',
      billingModel: inv.billingModel,
      status: inv.status,
    }));
  }, [invoicesData]);

  // Stats with defaults
  const stats = useMemo(() => ({
    pending: statsData?.pending || 0,
    approved: statsData?.approved || 0,
    rejected: statsData?.rejected || 0,
    sent: statsData?.sent || 0,
    totalPendingAmount: statsData?.totalPendingAmount || 0,
    totalApprovedAmount: statsData?.totalApprovedAmount || 0,
  }), [statsData]);

  const loading = invoicesLoading;
  const error = invoicesError?.message || statsError?.message || null;

  // Refresh data
  const handleRefresh = () => {
    mutateInvoices();
    mutateStats();
  };

  // Approve invoice
  const handleApprove = async (id: string) => {
    try {
      const response = await fetch(`/api/invoices/${id}/approve`, {
        method: 'POST',
      });

      if (!response.ok) throw new Error('Failed to approve invoice');

      mutateInvoices();
      mutateStats();
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

      mutateInvoices();
      mutateStats();
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

      mutateInvoices();
      mutateStats();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  // Trigger billing run
  const handleTriggerBilling = async () => {
    if (!confirm('Run billing check now? This will generate invoices for contracts due within 15 days.')) {
      return;
    }

    try {
      setTriggeringBilling(true);
      const response = await fetch('/api/scheduler/trigger', {
        method: 'POST',
      });

      if (!response.ok) throw new Error('Failed to trigger billing');

      const data = await response.json();
      alert(`Billing run complete!\nProcessed: ${data.processed}\nErrors: ${data.errors?.length || 0}`);

      mutateInvoices();
      mutateStats();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setTriggeringBilling(false);
    }
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

      mutateInvoices();
      mutateStats();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleEdit = (id: string) => {
    console.log('Edit invoice:', id);
    alert('Edit functionality coming soon!');
  };

  const handleView = (id: string) => {
    window.open(`/api/invoices/${id}/pdf`, '_blank');
  };

  // Filter invoices — memoized so the downstream table doesn't re-sort
  // on every parent re-render (filter object identity changes).
  const filteredInvoices = useMemo(
    () =>
      invoices.filter((invoice) => {
        if (filters.billingEntity && invoice.billingEntity !== filters.billingEntity) return false;
        if (filters.productType && invoice.productType !== filters.productType) return false;
        if (filters.status && invoice.status !== filters.status) return false;
        return true;
      }),
    [invoices, filters.billingEntity, filters.productType, filters.status]
  );

  return (
    <div className="flex flex-col">
      <Header
        title="Billing Dashboard"
        subtitle="Manage and approve client invoices"
      />

      <div className="flex-1 space-y-6 p-6">
        {/* Stats */}
        <StatsCards stats={stats} />

        {/* Actions bar */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            Invoice Queue
            {loading && <Loader2 className="ml-2 inline h-4 w-4 animate-spin" />}
          </h2>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleRefresh} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button
              variant="outline"
              onClick={handleTriggerBilling}
              disabled={triggeringBilling}
            >
              {triggeringBilling ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              Run Billing
            </Button>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="rounded-md bg-red-50 p-4 text-red-700">
            Error: {error}
          </div>
        )}

        {/* Filters */}
        <InvoiceFiltersComponent
          filters={filters}
          onFilterChange={setFilters}
          onClear={() => setFilters(defaultFilters)}
        />

        {/* Invoice Table */}
        <InvoiceTable
          invoices={filteredInvoices}
          onApprove={handleApprove}
          onReject={handleReject}
          onVoid={handleVoid}
          onEdit={handleEdit}
          onView={handleView}
          onBulkApprove={handleBulkApprove}
          onSend={() => { mutateInvoices(); mutateStats(); }}
        />

        {/* Empty state */}
        {!loading && invoices.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            No invoices found. Click "Run Billing" to generate invoices for due contracts.
          </div>
        )}
      </div>
    </div>
  );
}
