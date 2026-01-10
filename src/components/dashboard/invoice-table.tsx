'use client';

import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatDateShort, daysUntil } from '@/lib/utils';
import {
  Check,
  X,
  Edit,
  Eye,
  MoreHorizontal,
  Mail,
  Download,
  Loader2,
  DollarSign,
} from 'lucide-react';

export interface InvoiceRow {
  id: string;
  billingNo: string | null;
  customerName: string;
  productType: string;
  serviceFee: number;
  vatAmount: number;
  netAmount: number;
  dueDate: Date;
  billingEntity: 'YOWI' | 'ABBA';
  billingModel: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SENT' | 'PAID';
  emailStatus?: string;
}

interface InvoiceTableProps {
  invoices: InvoiceRow[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onEdit: (id: string) => void;
  onView: (id: string) => void;
  onBulkApprove: (ids: string[]) => void;
  onSend?: (id: string) => void;
  onMarkPaid?: (invoice: InvoiceRow) => void;
  showBulkActions?: boolean;
}

export function InvoiceTable({
  invoices,
  onApprove,
  onReject,
  onEdit,
  onView,
  onBulkApprove,
  onSend,
  onMarkPaid,
  showBulkActions = true,
}: InvoiceTableProps) {
  const [sendingId, setSendingId] = useState<string | null>(null);

  const handleDownloadPdf = (id: string) => {
    window.open(`/api/invoices/${id}/pdf`, '_blank');
  };

  const handleSend = async (id: string) => {
    if (!confirm('Send this invoice to the client via email?')) return;

    setSendingId(id);
    try {
      const response = await fetch(`/api/invoices/${id}/send`, {
        method: 'POST',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to send invoice');
      }

      const data = await response.json();
      alert(`Invoice sent successfully to ${data.sentTo}`);

      if (onSend) onSend(id);
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    } finally {
      setSendingId(null);
    }
  };
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === invoices.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(invoices.map((i) => i.id)));
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'success' | 'destructive' | 'warning' | 'secondary'> = {
      PENDING: 'warning',
      APPROVED: 'success',
      REJECTED: 'destructive',
      SENT: 'default',
      PAID: 'success',
    };
    return <Badge variant={variants[status] || 'secondary'}>{status}</Badge>;
  };

  const getDaysUntilBadge = (dueDate: Date) => {
    const days = daysUntil(dueDate);
    if (days < 0) {
      return <Badge variant="destructive">{Math.abs(days)} days overdue</Badge>;
    } else if (days <= 5) {
      return <Badge variant="warning">{days} days</Badge>;
    } else {
      return <Badge variant="secondary">{days} days</Badge>;
    }
  };

  return (
    <div className="rounded-lg border bg-white">
      {/* Bulk actions */}
      {showBulkActions && selectedIds.size > 0 && (
        <div className="flex items-center gap-4 border-b bg-blue-50 px-4 py-3">
          <span className="text-sm font-medium text-blue-900">
            {selectedIds.size} selected
          </span>
          <Button
            size="sm"
            onClick={() => onBulkApprove(Array.from(selectedIds))}
          >
            <Check className="mr-1 h-4 w-4" />
            Approve Selected
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setSelectedIds(new Set())}
          >
            Clear Selection
          </Button>
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            {showBulkActions && (
              <TableHead className="w-12">
                <input
                  type="checkbox"
                  checked={selectedIds.size === invoices.length && invoices.length > 0}
                  onChange={toggleSelectAll}
                  className="h-4 w-4 rounded border-gray-300"
                />
              </TableHead>
            )}
            <TableHead>Client</TableHead>
            <TableHead>Service</TableHead>
            <TableHead className="text-right">Service Fee</TableHead>
            <TableHead className="text-right">VAT</TableHead>
            <TableHead className="text-right">Net Amount</TableHead>
            <TableHead>Due Date</TableHead>
            <TableHead>Days Until Due</TableHead>
            <TableHead>Entity</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoices.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={showBulkActions ? 11 : 10}
                className="h-24 text-center text-gray-500"
              >
                No invoices found
              </TableCell>
            </TableRow>
          ) : (
            invoices.map((invoice) => (
              <TableRow key={invoice.id}>
                {showBulkActions && (
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(invoice.id)}
                      onChange={() => toggleSelect(invoice.id)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                  </TableCell>
                )}
                <TableCell className="font-medium">
                  {invoice.customerName}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{invoice.productType}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  {formatCurrency(invoice.serviceFee)}
                </TableCell>
                <TableCell className="text-right">
                  {formatCurrency(invoice.vatAmount)}
                </TableCell>
                <TableCell className="text-right font-medium">
                  {formatCurrency(invoice.netAmount)}
                </TableCell>
                <TableCell>{formatDateShort(invoice.dueDate)}</TableCell>
                <TableCell>{getDaysUntilBadge(invoice.dueDate)}</TableCell>
                <TableCell>
                  <Badge
                    variant={invoice.billingEntity === 'YOWI' ? 'default' : 'secondary'}
                  >
                    {invoice.billingEntity}
                  </Badge>
                </TableCell>
                <TableCell>{getStatusBadge(invoice.status)}</TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onView(invoice.id)}
                      title="View details"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onEdit(invoice.id)}
                      title="Edit"
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    {invoice.status === 'PENDING' && (
                      <>
                        <Button
                          size="sm"
                          onClick={() => onApprove(invoice.id)}
                          className="bg-green-600 hover:bg-green-700 text-white"
                        >
                          <Check className="mr-1 h-4 w-4" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => onReject(invoice.id)}
                        >
                          <X className="mr-1 h-4 w-4" />
                          Reject
                        </Button>
                      </>
                    )}
                    {invoice.status === 'APPROVED' && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownloadPdf(invoice.id)}
                          title="Download PDF"
                        >
                          <Download className="mr-1 h-4 w-4" />
                          PDF
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleSend(invoice.id)}
                          disabled={sendingId === invoice.id}
                          title="Send Email"
                        >
                          {sendingId === invoice.id ? (
                            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                          ) : (
                            <Mail className="mr-1 h-4 w-4" />
                          )}
                          {sendingId === invoice.id ? 'Sending...' : 'Send'}
                        </Button>
                      </>
                    )}
                    {invoice.status === 'SENT' && onMarkPaid && (
                      <Button
                        size="sm"
                        onClick={() => onMarkPaid(invoice)}
                        className="bg-green-600 hover:bg-green-700 text-white"
                        title="Mark as Paid"
                      >
                        <DollarSign className="mr-1 h-4 w-4" />
                        Mark Paid
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
