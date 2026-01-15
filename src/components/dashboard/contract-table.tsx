'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
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
  productType: 'ACCOUNTING' | 'PAYROLL' | 'COMPLIANCE' | 'HR';
  monthlyFee: number;
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

  return (
    <div className="rounded-lg border bg-white">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Customer #</TableHead>
            <TableHead>Company Name</TableHead>
            <TableHead>Partner</TableHead>
            <TableHead>Product Type</TableHead>
            <TableHead className="text-right">Monthly Fee</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Next Due Date</TableHead>
            <TableHead>Billing Entity</TableHead>
            <TableHead className="text-center">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {contracts.length === 0 ? (
            <TableRow>
              <TableCell colSpan={9} className="h-24 text-center text-gray-500">
                No contracts found
              </TableCell>
            </TableRow>
          ) : (
            contracts.map((contract) => (
              <TableRow
                key={contract.id}
                className="hover:bg-gray-50"
              >
                <TableCell className="font-mono text-sm text-gray-600">
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
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
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
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
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
      </Table>
    </div>
  );
}
