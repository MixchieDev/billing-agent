'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  X,
  FileText,
  CheckCircle,
  XCircle,
  Mail,
  DollarSign,
  Ban,
  Edit,
  Clock,
  RefreshCw,
  Send,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { formatDateTime } from '@/lib/utils';

interface AuditLog {
  id: string;
  action: string;
  details: Record<string, any> | null;
  createdAt: string;
  user: {
    name: string | null;
    email: string;
  } | null;
}

interface InvoiceForAudit {
  id: string;
  billingNo: string | null;
  customerName: string;
}

interface InvoiceAuditLogModalProps {
  invoice: InvoiceForAudit | null;
  isOpen: boolean;
  onClose: () => void;
}

// Action to icon and color mapping
const actionConfig: Record<string, { icon: any; color: string; label: string }> = {
  INVOICE_CREATED: { icon: FileText, color: 'text-blue-500', label: 'Created' },
  INVOICE_APPROVED: { icon: CheckCircle, color: 'text-green-500', label: 'Approved' },
  INVOICE_REJECTED: { icon: XCircle, color: 'text-red-500', label: 'Rejected' },
  INVOICE_SENT: { icon: Mail, color: 'text-blue-500', label: 'Sent' },
  INVOICE_PAID: { icon: DollarSign, color: 'text-green-500', label: 'Paid' },
  INVOICE_VOIDED: { icon: Ban, color: 'text-gray-500', label: 'Voided' },
  INVOICE_UPDATED: { icon: Edit, color: 'text-yellow-500', label: 'Updated' },
  INVOICE_AUTO_SENT: { icon: Send, color: 'text-purple-500', label: 'Auto-sent' },
  INVOICE_SEND_FAILED: { icon: AlertCircle, color: 'text-red-500', label: 'Send Failed' },
  INVOICE_PDF_GENERATED: { icon: FileText, color: 'text-gray-500', label: 'PDF Generated' },
  INVOICE_EMAIL_SENT: { icon: Mail, color: 'text-blue-500', label: 'Email Sent' },
  INVOICE_REMINDER_SENT: { icon: RefreshCw, color: 'text-orange-500', label: 'Reminder Sent' },
};

const defaultActionConfig = { icon: Clock, color: 'text-gray-400', label: 'Activity' };

function getActionConfig(action: string) {
  return actionConfig[action] || defaultActionConfig;
}

function formatActionDetails(action: string, details: Record<string, any> | null): string {
  if (!details) return '';

  switch (action) {
    case 'INVOICE_PAID':
      const amount = details.amount || details.paidAmount;
      const method = details.method || details.paymentMethod;
      if (amount && method) {
        return `Amount: PHP ${Number(amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })} via ${method.replace('_', ' ')}`;
      }
      break;
    case 'INVOICE_SENT':
    case 'INVOICE_AUTO_SENT':
    case 'INVOICE_EMAIL_SENT':
      if (details.to || details.recipients) {
        return `Sent to: ${details.to || details.recipients}`;
      }
      break;
    case 'INVOICE_REJECTED':
    case 'INVOICE_VOIDED':
      if (details.reason) {
        return `Reason: ${details.reason}`;
      }
      break;
    case 'INVOICE_UPDATED':
      if (details.changes && typeof details.changes === 'object') {
        const changeList = Object.keys(details.changes).join(', ');
        return `Changed: ${changeList}`;
      }
      break;
    case 'INVOICE_SEND_FAILED':
      if (details.error) {
        return `Error: ${details.error}`;
      }
      break;
  }

  return '';
}

export function InvoiceAuditLogModal({ invoice, isOpen, onClose }: InvoiceAuditLogModalProps) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchLogs = useCallback(async (pageNum: number, append: boolean = false) => {
    if (!invoice) return;

    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const response = await fetch(`/api/invoices/${invoice.id}/audit-logs?page=${pageNum}&limit=20`);
      if (!response.ok) {
        throw new Error('Failed to fetch audit logs');
      }
      const data = await response.json();

      if (append) {
        setLogs((prev) => [...prev, ...data.logs]);
      } else {
        setLogs(data.logs);
      }
      setPage(data.page);
      setTotalPages(data.totalPages);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit logs');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [invoice]);

  useEffect(() => {
    if (isOpen && invoice) {
      setLogs([]);
      setPage(1);
      fetchLogs(1);
    }
  }, [isOpen, invoice, fetchLogs]);

  const handleLoadMore = () => {
    if (page < totalPages) {
      fetchLogs(page + 1, true);
    }
  };

  if (!isOpen || !invoice) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Invoice History</h2>
            <p className="text-sm text-gray-600">
              {invoice.billingNo || invoice.id.slice(0, 8)} - {invoice.customerName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              <span className="ml-2 text-sm text-gray-500">Loading history...</span>
            </div>
          ) : error ? (
            <div className="p-4 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
              {error}
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Clock className="h-10 w-10 mx-auto mb-2 text-gray-300" />
              <p>No history available for this invoice.</p>
            </div>
          ) : (
            <div className="space-y-0">
              {/* Timeline */}
              {logs.map((log, index) => {
                const config = getActionConfig(log.action);
                const Icon = config.icon;
                const isLast = index === logs.length - 1;

                return (
                  <div key={log.id} className="relative flex">
                    {/* Timeline line */}
                    {!isLast && (
                      <div className="absolute left-4 top-8 w-0.5 h-full bg-gray-200" />
                    )}

                    {/* Icon */}
                    <div className={`relative z-10 flex-shrink-0 w-8 h-8 rounded-full bg-white border-2 border-gray-200 flex items-center justify-center ${config.color}`}>
                      <Icon className="h-4 w-4" />
                    </div>

                    {/* Content */}
                    <div className="ml-4 pb-6 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{config.label}</span>
                        <span className="text-xs text-gray-500">
                          {formatDateTime(log.createdAt)}
                        </span>
                      </div>

                      {log.user && (
                        <p className="text-sm text-gray-600">
                          By: {log.user.name || log.user.email}
                        </p>
                      )}

                      {log.details && (
                        <p className="text-sm text-gray-500 mt-1">
                          {formatActionDetails(log.action, log.details)}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t p-4 flex items-center justify-between">
          <span className="text-sm text-gray-500">
            {total > 0 ? `${logs.length} of ${total} entries` : ''}
          </span>
          <div className="flex gap-2">
            {page < totalPages && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleLoadMore}
                disabled={loadingMore}
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    Loading...
                  </>
                ) : (
                  'Load more'
                )}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
