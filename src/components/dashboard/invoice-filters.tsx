'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Filter, X } from 'lucide-react';
import { useProductTypes } from '@/lib/hooks/use-api';

export interface InvoiceFilters {
  billingEntity: string;
  partner: string;
  productType: string;
  status: string;
  dateFrom: string;
  dateTo: string;
}

interface InvoiceFiltersProps {
  filters: InvoiceFilters;
  onFilterChange: (filters: InvoiceFilters) => void;
  onClear: () => void;
}

export function InvoiceFiltersComponent({
  filters,
  onFilterChange,
  onClear,
}: InvoiceFiltersProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { data: productTypes } = useProductTypes();

  const handleChange = (key: keyof InvoiceFilters, value: string) => {
    onFilterChange({ ...filters, [key]: value });
  };

  const hasActiveFilters = Object.values(filters).some((v) => v !== '');

  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900"
        >
          <Filter className="h-4 w-4" />
          Filters
          {hasActiveFilters && (
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
              Active
            </span>
          )}
        </button>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={onClear}>
            <X className="mr-1 h-4 w-4" />
            Clear all
          </Button>
        )}
      </div>

      {isExpanded && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {/* Billing Entity */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">
              Billing Entity
            </label>
            <Select
              value={filters.billingEntity}
              onChange={(e) => handleChange('billingEntity', e.target.value)}
            >
              <option value="">All Entities</option>
              <option value="YOWI">YOWI</option>
              <option value="ABBA">ABBA</option>
            </Select>
          </div>

          {/* Partner */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">
              Partner
            </label>
            <Select
              value={filters.partner}
              onChange={(e) => handleChange('partner', e.target.value)}
            >
              <option value="">All Partners</option>
              <option value="Globe">Globe/Innove</option>
              <option value="RCBC">RCBC</option>
              <option value="Direct">Direct</option>
            </Select>
          </div>

          {/* Product Type */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">
              Product Type
            </label>
            <Select
              value={filters.productType}
              onChange={(e) => handleChange('productType', e.target.value)}
            >
              <option value="">All Types</option>
              {(productTypes || []).map(pt => (
                <option key={pt.value} value={pt.value}>{pt.label}</option>
              ))}
            </Select>
          </div>

          {/* Status */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">
              Status
            </label>
            <Select
              value={filters.status}
              onChange={(e) => handleChange('status', e.target.value)}
            >
              <option value="">All Statuses</option>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
              <option value="SENT">Sent</option>
              <option value="PAID">Paid</option>
            </Select>
          </div>

          {/* Date From */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">
              Due Date From
            </label>
            <Input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => handleChange('dateFrom', e.target.value)}
            />
          </div>

          {/* Date To */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">
              Due Date To
            </label>
            <Input
              type="date"
              value={filters.dateTo}
              onChange={(e) => handleChange('dateTo', e.target.value)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
