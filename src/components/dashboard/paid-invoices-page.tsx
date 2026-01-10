'use client';

import { useState, useEffect, useCallback } from 'react';
import { Header } from '@/components/dashboard/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { RefreshCw, Loader2, Filter, X, Download } from 'lucide-react';
import { formatCurrency, formatDateShort } from '@/lib/utils';
import { format, subDays } from 'date-fns';

interface PaidInvoice {
  id: string;
  billingNo: string | null;
  customerName: string;
  serviceFee: number;
  vatAmount: number;
  netAmount: number;
  dueDate: Date;
  billingEntity: string;
  paidAt: Date | null;
  paidAmount: number | null;
  paymentMethod: string | null;
  paymentReference: string | null;
}

export function PaidInvoicesPage() {
  const [invoices, setInvoices] = useState<PaidInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Date filter state - default to last 30 days
  const [dateFrom, setDateFrom] = useState(() => format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [showFilters, setShowFilters] = useState(true);

  const fetchInvoices = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      params.set('status', 'PAID');
      if (dateFrom) params.set('paidFrom', dateFrom);
      if (dateTo) params.set('paidTo', dateTo);

      const url = `/api/invoices?${params.toString()}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch invoices');

      const data = await response.json();
      const invoiceList = Array.isArray(data) ? data : (data.invoices || []);

      const transformedInvoices: PaidInvoice[] = invoiceList.map((inv: any) => ({
        id: inv.id,
        billingNo: inv.billingNo,
        customerName: inv.customerName,
        serviceFee: Number(inv.serviceFee),
        vatAmount: Number(inv.vatAmount),
        netAmount: Number(inv.netAmount),
        dueDate: new Date(inv.dueDate),
        billingEntity: inv.company?.code || 'YOWI',
        paidAt: inv.paidAt ? new Date(inv.paidAt) : null,
        paidAmount: inv.paidAmount ? Number(inv.paidAmount) : null,
        paymentMethod: inv.paymentMethod,
        paymentReference: inv.paymentReference,
      }));

      // Sort by paid date descending (most recent first)
      transformedInvoices.sort((a, b) => {
        if (!a.paidAt) return 1;
        if (!b.paidAt) return -1;
        return b.paidAt.getTime() - a.paidAt.getTime();
      });

      setInvoices(transformedInvoices);
    } catch (err: any) {
      setError(err.message);
      console.error('Error fetching paid invoices:', err);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const clearFilters = () => {
    setDateFrom('');
    setDateTo('');
  };

  const handleExport = async () => {
    if (invoices.length === 0) {
      alert('No invoices to export');
      return;
    }

    try {
      setExporting(true);
      setError(null);

      const params = new URLSearchParams();
      if (dateFrom) params.set('paidFrom', dateFrom);
      if (dateTo) params.set('paidTo', dateTo);

      const response = await fetch(`/api/invoices/export?${params.toString()}`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Export failed');
      }

      // Get the filename from Content-Disposition header or use default
      const contentDisposition = response.headers.get('Content-Disposition');
      const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
      const filename = filenameMatch ? filenameMatch[1] : 'YTO_Export.csv';

      // Download the CSV
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      setError(err.message);
      console.error('Error exporting invoices:', err);
    } finally {
      setExporting(false);
    }
  };

  const getPaymentMethodBadge = (method: string | null) => {
    if (!method) return <span className="text-gray-400">-</span>;
    const labels: Record<string, string> = {
      CASH: 'Cash',
      BANK_TRANSFER: 'Bank Transfer',
      CHECK: 'Check',
    };
    const variants: Record<string, 'default' | 'secondary' | 'success'> = {
      CASH: 'secondary',
      BANK_TRANSFER: 'default',
      CHECK: 'secondary',
    };
    return <Badge variant={variants[method] || 'secondary'}>{labels[method] || method}</Badge>;
  };

  // Calculate totals
  const totalAmount = invoices.reduce((sum, inv) => sum + inv.netAmount, 0);
  const totalPaid = invoices.reduce((sum, inv) => sum + (inv.paidAmount || inv.netAmount), 0);

  return (
    <div className="flex flex-col">
      <Header title="Paid Invoices" subtitle="View and export paid invoice records" />

      <div className="flex-1 space-y-6 p-6">
        {/* Actions bar */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">
              Paid Invoices
              {loading && <Loader2 className="ml-2 inline h-4 w-4 animate-spin" />}
            </h2>
            <span className="text-sm text-gray-500">
              ({invoices.length} invoice{invoices.length !== 1 ? 's' : ''})
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter className="mr-2 h-4 w-4" />
              {showFilters ? 'Hide Filters' : 'Show Filters'}
            </Button>
            <Button variant="outline" onClick={fetchInvoices} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button
              onClick={handleExport}
              disabled={exporting || invoices.length === 0}
            >
              {exporting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              {exporting ? 'Exporting...' : 'Export to YTO'}
            </Button>
          </div>
        </div>

        {/* Date Filters */}
        {showFilters && (
          <div className="rounded-lg border bg-white p-4">
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Payment Date From
                </label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-44"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Payment Date To
                </label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-44"
                />
              </div>
              {(dateFrom || dateTo) && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="mr-1 h-4 w-4" />
                  Clear
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Summary */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <div className="rounded-lg border bg-white p-4">
            <div className="text-2xl font-bold text-gray-900">{invoices.length}</div>
            <p className="text-sm text-gray-500">Paid Invoices</p>
          </div>
          <div className="rounded-lg border bg-white p-4">
            <div className="text-2xl font-bold text-green-600">{formatCurrency(totalAmount)}</div>
            <p className="text-sm text-gray-500">Total Invoice Amount</p>
          </div>
          <div className="rounded-lg border bg-white p-4">
            <div className="text-2xl font-bold text-green-600">{formatCurrency(totalPaid)}</div>
            <p className="text-sm text-gray-500">Total Amount Received</p>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="rounded-md bg-red-50 p-4 text-red-700">
            Error: {error}
          </div>
        )}

        {/* Invoice Table */}
        <div className="rounded-lg border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice No</TableHead>
                <TableHead>Client</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Paid Date</TableHead>
                <TableHead className="text-right">Amount Paid</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Entity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-24 text-center text-gray-500">
                    {loading ? 'Loading...' : 'No paid invoices found'}
                  </TableCell>
                </TableRow>
              ) : (
                invoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-medium">
                      {invoice.billingNo || invoice.id.slice(0, 8)}
                    </TableCell>
                    <TableCell>{invoice.customerName}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(invoice.netAmount)}
                    </TableCell>
                    <TableCell>{formatDateShort(invoice.dueDate)}</TableCell>
                    <TableCell>
                      {invoice.paidAt ? formatDateShort(invoice.paidAt) : '-'}
                    </TableCell>
                    <TableCell className="text-right font-medium text-green-600">
                      {invoice.paidAmount ? formatCurrency(invoice.paidAmount) : formatCurrency(invoice.netAmount)}
                    </TableCell>
                    <TableCell>{getPaymentMethodBadge(invoice.paymentMethod)}</TableCell>
                    <TableCell className="text-sm text-gray-600">
                      {invoice.paymentReference || '-'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={invoice.billingEntity === 'YOWI' ? 'default' : 'secondary'}>
                        {invoice.billingEntity}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Empty state */}
        {!loading && invoices.length === 0 && !error && (
          <div className="text-center py-12 text-gray-500">
            No paid invoices found for the selected date range.
            {(dateFrom || dateTo) && (
              <button
                onClick={clearFilters}
                className="ml-1 text-blue-600 hover:text-blue-800"
              >
                Clear filters
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
