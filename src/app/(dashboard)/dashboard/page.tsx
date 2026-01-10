'use client';

import { useState, useEffect, useCallback } from 'react';
import { Header } from '@/components/dashboard/header';
import { StatsCards } from '@/components/dashboard/stats-cards';
import { InvoiceFiltersComponent, InvoiceFilters } from '@/components/dashboard/invoice-filters';
import { InvoiceTable, InvoiceRow } from '@/components/dashboard/invoice-table';
import { Button } from '@/components/ui/button';
import { RefreshCw, Play, Loader2 } from 'lucide-react';

const defaultFilters: InvoiceFilters = {
  billingEntity: '',
  partner: '',
  productType: '',
  status: '',
  dateFrom: '',
  dateTo: '',
};

export default function DashboardPage() {
  const [filters, setFilters] = useState<InvoiceFilters>(defaultFilters);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [stats, setStats] = useState({
    pending: 0,
    approved: 0,
    rejected: 0,
    sent: 0,
    totalPendingAmount: 0,
    totalApprovedAmount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [triggeringBilling, setTriggeringBilling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch invoices
  const fetchInvoices = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/invoices');
      if (!response.ok) throw new Error('Failed to fetch invoices');

      const data = await response.json();

      // Handle both array response and { invoices: [] } response
      const invoiceList = Array.isArray(data) ? data : (data.invoices || []);

      // Transform API data to InvoiceRow format
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
  }, []);

  // Fetch stats
  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch('/api/stats');
      if (!response.ok) throw new Error('Failed to fetch stats');

      const data = await response.json();
      setStats({
        pending: data.pending || 0,
        approved: data.approved || 0,
        rejected: data.rejected || 0,
        sent: data.sent || 0,
        totalPendingAmount: data.totalPendingAmount || 0,
        totalApprovedAmount: data.totalApprovedAmount || 0,
      });
    } catch (err) {
      console.error('Error fetching stats:', err);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchInvoices();
    fetchStats();
  }, [fetchInvoices, fetchStats]);

  // Approve invoice
  const handleApprove = async (id: string) => {
    try {
      const response = await fetch(`/api/invoices/${id}/approve`, {
        method: 'POST',
      });

      if (!response.ok) throw new Error('Failed to approve invoice');

      // Refresh data
      await fetchInvoices();
      await fetchStats();
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

      // Refresh data
      await fetchInvoices();
      await fetchStats();
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

      // Refresh data
      await fetchInvoices();
      await fetchStats();
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

      // Refresh data
      await fetchInvoices();
      await fetchStats();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setTriggeringBilling(false);
    }
  };

  const handleEdit = (id: string) => {
    console.log('Edit invoice:', id);
    alert('Edit functionality coming soon!');
  };

  const handleView = (id: string) => {
    // Open invoice in new tab
    window.open(`/api/invoices/${id}/pdf`, '_blank');
  };

  const handleRefresh = () => {
    fetchInvoices();
    fetchStats();
  };

  // Filter invoices
  const filteredInvoices = invoices.filter((invoice) => {
    if (filters.billingEntity && invoice.billingEntity !== filters.billingEntity) return false;
    if (filters.productType && invoice.productType !== filters.productType) return false;
    if (filters.status && invoice.status !== filters.status) return false;
    return true;
  });

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
          onEdit={handleEdit}
          onView={handleView}
          onBulkApprove={handleBulkApprove}
          onSend={() => { fetchInvoices(); fetchStats(); }}
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
