'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Save, Loader2 } from 'lucide-react';

export interface CompanyData {
  id: string;
  code: string;
  name: string;
  address: string | null;
  contactNumber: string | null;
  tin: string | null;
  bankName: string | null;
  bankAccountName: string | null;
  bankAccountNo: string | null;
  invoicePrefix: string | null;
  nextInvoiceNo: number;
  logoPath: string | null;
  formReference: string | null;
  _count?: {
    contracts: number;
    invoices: number;
  };
}

interface CompanyCardProps {
  company: CompanyData;
  onSave: (code: string, data: Partial<CompanyData>) => Promise<void>;
}

export function CompanyCard({ company, onSave }: CompanyCardProps) {
  const [formData, setFormData] = useState({
    name: company.name || '',
    address: company.address || '',
    contactNumber: company.contactNumber || '',
    tin: company.tin || '',
    bankName: company.bankName || '',
    bankAccountName: company.bankAccountName || '',
    bankAccountNo: company.bankAccountNo || '',
    invoicePrefix: company.invoicePrefix || '',
    nextInvoiceNo: company.nextInvoiceNo || 1,
    logoPath: company.logoPath || '',
    formReference: company.formReference || '',
  });
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const handleChange = (field: string, value: string | number) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await onSave(company.code, formData);
      setHasChanges(false);
    } catch (error) {
      console.error('Failed to save:', error);
    } finally {
      setSaving(false);
    }
  };

  const inputClassName = "w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";
  const labelClassName = "block text-sm font-medium text-gray-700 mb-1";

  return (
    <div className="rounded-lg border bg-white p-6 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Badge variant={company.code === 'YOWI' ? 'default' : 'secondary'} className="text-lg px-3 py-1">
            {company.code}
          </Badge>
          <div className="text-sm text-gray-500">
            {company._count?.contracts || 0} contracts · {company._count?.invoices || 0} invoices
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="space-y-4">
        {/* Basic Info */}
        <div className="grid grid-cols-1 gap-4">
          <div>
            <label className={labelClassName}>Company Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              className={inputClassName}
            />
          </div>

          <div>
            <label className={labelClassName}>Address</label>
            <textarea
              value={formData.address}
              onChange={(e) => handleChange('address', e.target.value)}
              rows={2}
              className={inputClassName}
            />
          </div>

          <div>
            <label className={labelClassName}>Contact Number</label>
            <input
              type="text"
              value={formData.contactNumber}
              onChange={(e) => handleChange('contactNumber', e.target.value)}
              className={inputClassName}
            />
          </div>

          <div>
            <label className={labelClassName}>TIN (Tax Identification Number)</label>
            <input
              type="text"
              value={formData.tin}
              onChange={(e) => handleChange('tin', e.target.value)}
              placeholder="e.g., 010-143-230-000"
              className={inputClassName}
            />
          </div>
        </div>

        {/* Bank Details */}
        <div className="border-t pt-4 mt-4">
          <h4 className="text-sm font-semibold text-gray-900 mb-3">Bank Details</h4>
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className={labelClassName}>Bank Name</label>
              <input
                type="text"
                value={formData.bankName}
                onChange={(e) => handleChange('bankName', e.target.value)}
                className={inputClassName}
              />
            </div>

            <div>
              <label className={labelClassName}>Account Name</label>
              <input
                type="text"
                value={formData.bankAccountName}
                onChange={(e) => handleChange('bankAccountName', e.target.value)}
                className={inputClassName}
              />
            </div>

            <div>
              <label className={labelClassName}>Account Number</label>
              <input
                type="text"
                value={formData.bankAccountNo}
                onChange={(e) => handleChange('bankAccountNo', e.target.value)}
                className={inputClassName}
              />
            </div>
          </div>
        </div>

        {/* Invoice Settings */}
        <div className="border-t pt-4 mt-4">
          <h4 className="text-sm font-semibold text-gray-900 mb-3">Invoice Settings</h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClassName}>Invoice Prefix</label>
              <input
                type="text"
                value={formData.invoicePrefix}
                onChange={(e) => handleChange('invoicePrefix', e.target.value)}
                placeholder="e.g., S"
                className={inputClassName}
              />
            </div>

            <div>
              <label className={labelClassName}>Next Invoice #</label>
              <input
                type="number"
                value={formData.nextInvoiceNo}
                onChange={(e) => handleChange('nextInvoiceNo', parseInt(e.target.value) || 1)}
                min={1}
                className={inputClassName}
              />
            </div>
          </div>
        </div>

        {/* Branding */}
        <div className="border-t pt-4 mt-4">
          <h4 className="text-sm font-semibold text-gray-900 mb-3">Branding</h4>
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className={labelClassName}>Logo Path</label>
              <input
                type="text"
                value={formData.logoPath}
                onChange={(e) => handleChange('logoPath', e.target.value)}
                placeholder="/assets/logo.png"
                className={inputClassName}
              />
            </div>

            <div>
              <label className={labelClassName}>Form Reference</label>
              <input
                type="text"
                value={formData.formReference}
                onChange={(e) => handleChange('formReference', e.target.value)}
                className={inputClassName}
              />
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="border-t pt-4 mt-4">
          <Button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className="w-full"
          >
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {saving ? 'Saving...' : hasChanges ? 'Save Changes' : 'No Changes'}
          </Button>
        </div>
      </div>
    </div>
  );
}
