'use client';

import { useState, useEffect } from 'react';
import {
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  FileText,
  ExternalLink,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format, formatDistanceToNow } from 'date-fns';

interface ScheduledBillingRun {
  id: string;
  scheduledBillingId: string;
  invoiceId: string | null;
  runDate: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'SKIPPED';
  errorMessage: string | null;
  createdAt: string;
  scheduledBilling: {
    contract: {
      id: string;
      companyName: string;
      productType: string;
    };
    billingEntity: {
      id: string;
      code: string;
      name: string;
    };
  };
  invoice: {
    id: string;
    billingNo: string | null;
    status: string;
    netAmount: number;
    customerName: string;
  } | null;
}

export function RunHistoryTab() {
  const [runs, setRuns] = useState<ScheduledBillingRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [daysBack, setDaysBack] = useState(30);

  const fetchRuns = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/scheduled-billings/runs?daysBack=${daysBack}`);
      if (!res.ok) throw new Error('Failed to fetch runs');
      const data = await res.json();
      setRuns(data.runs || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch run history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRuns();
  }, [daysBack]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'SUCCESS':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
            <CheckCircle className="h-3 w-3" />
            Success
          </span>
        );
      case 'FAILED':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
            <XCircle className="h-3 w-3" />
            Failed
          </span>
        );
      case 'SKIPPED':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
            <AlertTriangle className="h-3 w-3" />
            Skipped
          </span>
        );
      case 'PENDING':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
            <Clock className="h-3 w-3" />
            Pending
          </span>
        );
      default:
        return null;
    }
  };

  const getInvoiceStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return <span className="text-xs text-amber-600">Pending</span>;
      case 'APPROVED':
        return <span className="text-xs text-blue-600">Approved</span>;
      case 'SENT':
        return <span className="text-xs text-green-600">Sent</span>;
      case 'PAID':
        return <span className="text-xs text-green-700 font-medium">Paid</span>;
      case 'REJECTED':
        return <span className="text-xs text-red-600">Rejected</span>;
      default:
        return <span className="text-xs text-gray-500">{status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with filters */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <select
            value={daysBack}
            onChange={(e) => setDaysBack(parseInt(e.target.value))}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={0}>All time</option>
          </select>
          <span className="text-sm text-gray-500">
            {runs.length} run{runs.length !== 1 ? 's' : ''} found
          </span>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="rounded-lg bg-red-50 p-4 text-red-700">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-red-500 underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Runs Table */}
      <div className="rounded-lg border bg-white">
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : runs.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <Clock className="mx-auto h-12 w-12 text-gray-300 mb-4" />
            <p className="text-lg font-medium">No runs found</p>
            <p className="text-sm mt-1">
              {daysBack > 0
                ? `No scheduled billing runs in the last ${daysBack} days`
                : 'No scheduled billing runs yet'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Run Date</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Client</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Entity</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Amount</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Run Status</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Generated Invoice</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {runs.map((run) => (
                  <tr key={run.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">
                        {format(new Date(run.runDate), 'MMM d, yyyy')}
                      </div>
                      <div className="text-xs text-gray-500">
                        {format(new Date(run.runDate), 'h:mm a')}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">
                        {run.scheduledBilling.contract.companyName}
                      </div>
                      <div className="text-xs text-gray-500">
                        {run.scheduledBilling.contract.productType}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                        {run.scheduledBilling.billingEntity.code}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {run.invoice ? (
                        <span className="font-medium text-gray-900">
                          {new Intl.NumberFormat('en-PH', {
                            style: 'currency',
                            currency: 'PHP',
                          }).format(Number(run.invoice.netAmount))}
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">{getStatusBadge(run.status)}</td>
                    <td className="px-4 py-3">
                      {run.invoice ? (
                        <div className="flex items-center gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-gray-400" />
                              <span className="font-mono text-xs text-gray-700">
                                {run.invoice.billingNo || 'Draft'}
                              </span>
                            </div>
                            <div className="mt-0.5">
                              {getInvoiceStatusBadge(run.invoice.status)}
                            </div>
                          </div>
                          <a
                            href={`/api/invoices/${run.invoice.id}/pdf`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                            title="View PDF"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {run.errorMessage ? (
                        <div className="max-w-[200px]">
                          <span className="text-xs text-red-600 truncate block" title={run.errorMessage}>
                            {run.errorMessage}
                          </span>
                        </div>
                      ) : run.status === 'SKIPPED' ? (
                        <span className="text-xs text-gray-500">Already invoiced</span>
                      ) : run.status === 'SUCCESS' ? (
                        <span className="text-xs text-gray-500">
                          {formatDistanceToNow(new Date(run.runDate), { addSuffix: true })}
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Summary Stats */}
      {runs.length > 0 && (
        <div className="grid grid-cols-4 gap-4">
          <div className="rounded-lg border bg-white p-4 text-center">
            <div className="text-2xl font-bold text-gray-900">{runs.length}</div>
            <p className="text-sm text-gray-500">Total Runs</p>
          </div>
          <div className="rounded-lg border bg-white p-4 text-center">
            <div className="text-2xl font-bold text-green-600">
              {runs.filter((r) => r.status === 'SUCCESS').length}
            </div>
            <p className="text-sm text-gray-500">Successful</p>
          </div>
          <div className="rounded-lg border bg-white p-4 text-center">
            <div className="text-2xl font-bold text-red-600">
              {runs.filter((r) => r.status === 'FAILED').length}
            </div>
            <p className="text-sm text-gray-500">Failed</p>
          </div>
          <div className="rounded-lg border bg-white p-4 text-center">
            <div className="text-2xl font-bold text-gray-600">
              {runs.filter((r) => r.status === 'SKIPPED').length}
            </div>
            <p className="text-sm text-gray-500">Skipped</p>
          </div>
        </div>
      )}
    </div>
  );
}
