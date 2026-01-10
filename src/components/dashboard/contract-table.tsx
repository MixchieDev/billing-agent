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
import { Settings } from 'lucide-react';

export interface ContractRow {
  id: string;
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
}

interface ContractTableProps {
  contracts: ContractRow[];
  onContractClick?: (contract: ContractRow) => void;
}

export function ContractTable({ contracts, onContractClick }: ContractTableProps) {
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
            <TableHead>Company Name</TableHead>
            <TableHead>Product Type</TableHead>
            <TableHead className="text-right">Monthly Fee</TableHead>
            <TableHead>Payment Plan</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Auto-Send</TableHead>
            <TableHead>End Date</TableHead>
            <TableHead>Next Due Date</TableHead>
            <TableHead>Billing Entity</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {contracts.length === 0 ? (
            <TableRow>
              <TableCell colSpan={10} className="h-24 text-center text-gray-500">
                No contracts found
              </TableCell>
            </TableRow>
          ) : (
            contracts.map((contract) => (
              <TableRow
                key={contract.id}
                className={onContractClick ? 'cursor-pointer hover:bg-gray-50' : ''}
                onClick={() => onContractClick?.(contract)}
              >
                <TableCell className="font-medium">{contract.companyName}</TableCell>
                <TableCell>{getProductBadge(contract.productType)}</TableCell>
                <TableCell className="text-right">{formatCurrency(contract.monthlyFee)}</TableCell>
                <TableCell className="text-sm text-gray-600">
                  {contract.paymentPlan || 'Monthly'}
                </TableCell>
                <TableCell>{getStatusBadge(contract.status)}</TableCell>
                <TableCell>
                  <Badge variant={contract.autoSendEnabled ? 'success' : 'secondary'}>
                    {contract.autoSendEnabled ? 'On' : 'Off'}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-gray-600">
                  {contract.contractEndDate ? formatDateShort(contract.contractEndDate) : '-'}
                </TableCell>
                <TableCell>
                  {contract.nextDueDate ? formatDateShort(contract.nextDueDate) : '-'}
                </TableCell>
                <TableCell>
                  <Badge variant={contract.billingEntity === 'YOWI' ? 'default' : 'secondary'}>
                    {contract.billingEntity}
                  </Badge>
                </TableCell>
                <TableCell>
                  {onContractClick && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onContractClick(contract);
                      }}
                      className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                      title="Contract Settings"
                    >
                      <Settings className="h-4 w-4" />
                    </button>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
