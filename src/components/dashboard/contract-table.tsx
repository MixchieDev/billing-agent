'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableFooter,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatDateShort } from '@/lib/utils';
import { Pencil, Trash2 } from 'lucide-react';

export interface ContractRow {
  id: string;
  customerNumber?: string;
  customerId?: string;
  companyName: string;
  productType: string;
  monthlyFee: number;
  billingType?: 'RECURRING' | 'ONE_TIME' | null;
  status: 'ACTIVE' | 'INACTIVE' | 'STOPPED' | 'NOT_STARTED';
  nextDueDate: Date | null;
  billingEntity: 'YOWI' | 'ABBA';
  contactPerson: string | null;
  email: string | null;
  paymentPlan: string | null;
  autoSendEnabled: boolean;
  contractEndDate: Date | null;
  partner?: { code: string; name: string } | null;
}

interface ContractTableProps {
  contracts: ContractRow[];
  onContractClick?: (contract: ContractRow) => void;
  onEdit?: (contract: ContractRow) => void;
  onDelete?: (contract: ContractRow) => void;
}

export function ContractTable({ contracts, onContractClick, onEdit, onDelete }: ContractTableProps) {
  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'success' | 'warning' | 'destructive' | 'secondary'> = {
      ACTIVE: 'success',
      INACTIVE: 'warning',
      STOPPED: 'destructive',
      NOT_STARTED: 'secondary',
    };
    const labels: Record<string, string> = {
      ACTIVE: 'Active',
      INACTIVE: 'Inactive',
      STOPPED: 'Stopped',
      NOT_STARTED: 'Not Started',
    };
    return <Badge variant={variants[status] || 'secondary'}>{labels[status] || status}</Badge>;
  };

  const getProductBadge = (productType: string) => {
    return <Badge variant="outline">{productType}</Badge>;
  };

  /**
   * Annualised value of a recurring contract. One-time contracts have no annual
   * run-rate, so they show the fee itself rather than a fabricated x12.
   */
  const annualValue = (c: { monthlyFee: number; billingType?: string | null }) =>
    c.billingType === 'ONE_TIME'
      ? formatCurrency(c.monthlyFee)
      : formatCurrency(c.monthlyFee * 12);

  const bookAnnual = contracts
    .filter((c) => c.status === 'ACTIVE')
    .reduce((sum, c) => sum + (c.billingType === 'ONE_TIME' ? c.monthlyFee : c.monthlyFee * 12), 0);
  const activeCount = contracts.filter((c) => c.status === 'ACTIVE').length;

  return (
    <div className="rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Customer #</TableHead>
            <TableHead>Company Name</TableHead>
            <TableHead>Partner</TableHead>
            <TableHead>Product Type</TableHead>
            <TableHead className="text-right">Monthly Fee</TableHead>
            <TableHead className="text-right">Annual Value</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Next Due Date</TableHead>
            <TableHead>Billing Entity</TableHead>
            <TableHead className="text-center">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {contracts.length === 0 ? (
            <TableRow>
              <TableCell colSpan={10} className="h-24 text-center text-muted-foreground">
                No contracts found
              </TableCell>
            </TableRow>
          ) : (
            contracts.map((contract) => (
              <TableRow
                key={contract.id}
                className="hover:bg-muted"
              >
                <TableCell className="font-mono text-sm text-muted-foreground">
                  {contract.customerNumber || '-'}
                </TableCell>
                <TableCell className="font-medium">{contract.companyName}</TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {contract.partner?.code || 'Direct'}
                  </Badge>
                </TableCell>
                <TableCell>{getProductBadge(contract.productType)}</TableCell>
                <TableCell className="text-right">{formatCurrency(contract.monthlyFee)}</TableCell>
                <TableCell className="text-right font-medium">
                  {annualValue(contract)}
                </TableCell>
                <TableCell>{getStatusBadge(contract.status)}</TableCell>
                <TableCell>
                  {contract.nextDueDate ? formatDateShort(contract.nextDueDate) : '-'}
                </TableCell>
                <TableCell>
                  <Badge variant={contract.billingEntity === 'YOWI' ? 'default' : 'secondary'}>
                    {contract.billingEntity}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-center gap-1">
                    {onEdit && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onEdit(contract);
                        }}
                        className="p-1.5 text-muted-foreground hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        title="Edit Contract"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    )}
                    {onDelete && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(contract);
                        }}
                        className="p-1.5 text-muted-foreground hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="Delete Contract"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
        {contracts.length > 0 && (
          <TableFooter>
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={4} className="text-muted-foreground">
                {activeCount} active contract{activeCount === 1 ? '' : 's'} on this page
              </TableCell>
              <TableCell className="text-right text-muted-foreground">
                {formatCurrency(bookAnnual / 12)}/mo
              </TableCell>
              <TableCell className="text-right font-semibold">
                {formatCurrency(bookAnnual)}
              </TableCell>
              <TableCell colSpan={4} />
            </TableRow>
          </TableFooter>
        )}
      </Table>
    </div>
  );
}
