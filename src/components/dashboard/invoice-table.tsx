'use client';

import { useState, useMemo } from 'react';
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
import { formatCurrency, formatDateShort, formatDateTime, daysUntil } from '@/lib/utils';
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
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Ban,
  CreditCard,
  History,
  MailWarning,
} from 'lucide-react';
import { SendInvoiceModal } from './send-invoice-modal';

type SortField = 'billingNo' | 'customerName' | 'serviceFee' | 'vatAmount' | 'netAmount' | 'dueDate' | 'createdAt' | 'billingEntity' | 'status';
type SortDirection = 'asc' | 'desc' | null;

export interface InvoiceRow {
  id: string;
  billingNo: string | null;
  customerName: string;
  customerEmail?: string | null;
  customerEmails?: string | null;
  productType: string;
  serviceFee: number;
  vatAmount: number;
  netAmount: number;
  dueDate: Date;
  createdAt: Date;
  billingEntity: 'YOWI' | 'ABBA';
  billingModel: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SENT' | 'PAID' | 'VOID';
  emailStatus?: string;
  // Follow-up tracking fields
  followUpEnabled?: boolean;
  followUpCount?: number;
  lastFollowUpLevel?: number;
}

interface InvoiceTableProps {
  invoices: InvoiceRow[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onVoid?: (id: string) => void;
  onEdit: (id: string) => void;
  onView: (id: string) => void;
  onBulkApprove: (ids: string[]) => void;
  onSend?: (id: string) => void;
  onMarkPaid?: (invoice: InvoiceRow) => void;
  onPayOnline?: (invoice: InvoiceRow) => void;
  onViewHistory?: (invoice: InvoiceRow) => void;
  onSendFollowUp?: (invoice: InvoiceRow) => void;
  showBulkActions?: boolean;
}

export function InvoiceTable({
  invoices,
  onApprove,
  onReject,
  onVoid,
  onEdit,
  onView,
  onBulkApprove,
  onSend,
  onMarkPaid,
  onPayOnline,
  onViewHistory,
  onSendFollowUp,
  showBulkActions = true,
}: InvoiceTableProps) {
  const [sendingInvoice, setSendingInvoice] = useState<InvoiceRow | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

  // Handle column header click for sorting
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      // Cycle through: asc -> desc -> null
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else if (sortDirection === 'desc') {
        setSortDirection(null);
        setSortField(null);
      } else {
        setSortDirection('asc');
      }
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Sort invoices
  const sortedInvoices = useMemo(() => {
    if (!sortField || !sortDirection) return invoices;

    return [...invoices].sort((a, b) => {
      let aVal: any;
      let bVal: any;

      switch (sortField) {
        case 'billingNo':
          aVal = a.billingNo || '';
          bVal = b.billingNo || '';
          break;
        case 'customerName':
          aVal = a.customerName.toLowerCase();
          bVal = b.customerName.toLowerCase();
          break;
        case 'serviceFee':
          aVal = a.serviceFee;
          bVal = b.serviceFee;
          break;
        case 'vatAmount':
          aVal = a.vatAmount;
          bVal = b.vatAmount;
          break;
        case 'netAmount':
          aVal = a.netAmount;
          bVal = b.netAmount;
          break;
        case 'dueDate':
          aVal = new Date(a.dueDate).getTime();
          bVal = new Date(b.dueDate).getTime();
          break;
        case 'createdAt':
          aVal = new Date(a.createdAt).getTime();
          bVal = new Date(b.createdAt).getTime();
          break;
        case 'billingEntity':
          aVal = a.billingEntity;
          bVal = b.billingEntity;
          break;
        case 'status':
          aVal = a.status;
          bVal = b.status;
          break;
        default:
          return 0;
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [invoices, sortField, sortDirection]);

  // Sortable header component
  const SortableHeader = ({ field, children, className = '' }: { field: SortField; children: React.ReactNode; className?: string }) => (
    <TableHead className={className}>
      <button
        onClick={() => handleSort(field)}
        className="flex items-center gap-1 hover:text-blue-600 transition-colors"
      >
        {children}
        {sortField === field ? (
          sortDirection === 'asc' ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-30" />
        )}
      </button>
    </TableHead>
  );

  const handleDownloadPdf = (id: string) => {
    window.open(`/api/invoices/${id}/pdf`, '_blank');
  };

  const handleOpenSendModal = (invoice: InvoiceRow) => {
    setSendingInvoice(invoice);
  };

  const handleSendComplete = () => {
    if (sendingInvoice && onSend) {
      onSend(sendingInvoice.id);
    }
    setSendingInvoice(null);
  };

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
    if (selectedIds.size === sortedInvoices.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sortedInvoices.map((i) => i.id)));
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'success' | 'destructive' | 'warning' | 'secondary'> = {
      PENDING: 'warning',
      APPROVED: 'success',
      REJECTED: 'destructive',
      SENT: 'default',
      PAID: 'success',
      VOID: 'secondary',
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
                  checked={selectedIds.size === sortedInvoices.length && sortedInvoices.length > 0}
                  onChange={toggleSelectAll}
                  className="h-4 w-4 rounded border-gray-300"
                />
              </TableHead>
            )}
            <SortableHeader field="billingNo">Invoice No.</SortableHeader>
            <SortableHeader field="customerName">Client</SortableHeader>
            <TableHead>Service</TableHead>
            <SortableHeader field="serviceFee" className="text-right">Service Fee</SortableHeader>
            <SortableHeader field="vatAmount" className="text-right">VAT</SortableHeader>
            <SortableHeader field="netAmount" className="text-right">Net Amount</SortableHeader>
            <SortableHeader field="createdAt">Created</SortableHeader>
            <SortableHeader field="dueDate">Due Date</SortableHeader>
            <TableHead>Days Until Due</TableHead>
            <SortableHeader field="billingEntity">Entity</SortableHeader>
            <SortableHeader field="status">Status</SortableHeader>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedInvoices.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={showBulkActions ? 13 : 12}
                className="h-24 text-center text-gray-500"
              >
                No invoices found
              </TableCell>
            </TableRow>
          ) : (
            sortedInvoices.map((invoice) => (
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
                <TableCell className="font-mono text-xs text-gray-600">
                  {invoice.billingNo || '-'}
                </TableCell>
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
                <TableCell title={formatDateTime(invoice.createdAt)} className="cursor-help">
                  {formatDateShort(invoice.createdAt)}
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
                    {onViewHistory && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onViewHistory(invoice)}
                        title="View History"
                      >
                        <History className="h-4 w-4" />
                      </Button>
                    )}
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
                          onClick={() => handleOpenSendModal(invoice)}
                          title="Send Email"
                        >
                          <Mail className="mr-1 h-4 w-4" />
                          Send
                        </Button>
                        {onVoid && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onVoid(invoice.id)}
                            title="Void Invoice"
                            className="text-gray-600 hover:text-gray-800 hover:bg-gray-100"
                          >
                            <Ban className="mr-1 h-4 w-4" />
                            Void
                          </Button>
                        )}
                      </>
                    )}
                    {invoice.status === 'SENT' && (
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
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenSendModal(invoice)}
                          title="Resend Email"
                        >
                          <Mail className="mr-1 h-4 w-4" />
                          Resend
                        </Button>
                        {onSendFollowUp && invoice.followUpEnabled !== false && daysUntil(invoice.dueDate) < 0 && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onSendFollowUp(invoice)}
                            disabled={(invoice.lastFollowUpLevel ?? 0) >= 3}
                            className={`${
                              (invoice.lastFollowUpLevel ?? 0) >= 3
                                ? 'text-gray-400 cursor-not-allowed'
                                : 'text-orange-600 hover:text-orange-700 hover:bg-orange-50'
                            }`}
                            title={
                              (invoice.lastFollowUpLevel ?? 0) >= 3
                                ? 'Maximum follow-ups reached (3/3)'
                                : `Send follow-up level ${(invoice.lastFollowUpLevel ?? 0) + 1}`
                            }
                          >
                            <MailWarning className="mr-1 h-4 w-4" />
                            Follow-up
                            <Badge
                              variant="secondary"
                              className="ml-1 px-1 py-0 text-xs"
                            >
                              {invoice.lastFollowUpLevel ?? 0}/3
                            </Badge>
                          </Button>
                        )}
                        {onPayOnline && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onPayOnline(invoice)}
                            className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                            title="Pay Online via HitPay"
                          >
                            <CreditCard className="mr-1 h-4 w-4" />
                            Pay Online
                          </Button>
                        )}
                        {onMarkPaid && (
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
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {/* Send Invoice Modal */}
      {sendingInvoice && (
        <SendInvoiceModal
          isOpen={!!sendingInvoice}
          onClose={() => setSendingInvoice(null)}
          invoice={sendingInvoice}
          onSent={handleSendComplete}
        />
      )}
    </div>
  );
}
