'use client';

import { useState, useEffect } from 'react';
import { X, Loader2, Save } from 'lucide-react';
import { MultiEmailInput } from '@/components/ui/multi-email-input';
import { parseEmails, joinEmails } from '@/lib/utils';

interface Partner {
  id: string;
  code: string;
  name: string;
  billingModel: string;
}

interface Company {
  id: string;
  code: string;
  name: string;
}

interface Contract {
  id: string;
  customerId: string;
  companyName: string;
  productType: string;
  partnerId: string | null;
  billingEntityId: string;
  monthlyFee: number;
  paymentPlan: string | null;
  contractStart: string | null;
  nextDueDate: string | null;
  status: string;
  vatType: string;
  billingType: string;
  contactPerson: string | null;
  email: string | null;
  emails: string | null;  // Comma-separated list of emails
  address: string | null;
  tin: string | null;
  mobile: string | null;
  remarks: string | null;
  partner?: Partner | null;
  billingEntity?: Company;
}

interface ContractFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  contract?: Contract | null;
  partners: Partner[];
  companies: Company[];
}

const productTypes = ['ACCOUNTING', 'PAYROLL', 'COMPLIANCE', 'HR'];
const statusOptions = ['ACTIVE', 'INACTIVE', 'STOPPED', 'NOT_STARTED'];
const vatTypes = ['VAT', 'NON_VAT'];
const billingTypes = ['RECURRING', 'ONE_TIME'];
const paymentPlanOptions = ['Monthly', 'Quarterly', 'Annual', 'Custom'];

export function ContractFormModal({
  isOpen,
  onClose,
  onSave,
  contract,
  partners,
  companies,
}: ContractFormModalProps) {
  const isEditing = !!contract;
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    customerId: '',
    companyName: '',
    productType: 'ACCOUNTING',
    partner: '',
    billingEntity: 'YOWI',
    monthlyFee: '',
    paymentPlan: 'Monthly',
    contractStart: '',
    nextDueDate: '',
    status: 'ACTIVE',
    vatType: 'VAT',
    billingType: 'RECURRING',
    contactPerson: '',
    emails: '',  // Comma-separated list of emails
    address: '',
    tin: '',
    mobile: '',
    remarks: '',
  });

  // Initialize form when contract changes
  useEffect(() => {
    if (contract) {
      setFormData({
        customerId: contract.customerId || '',
        companyName: contract.companyName || '',
        productType: contract.productType || 'ACCOUNTING',
        partner: contract.partner?.code || '',
        billingEntity: contract.billingEntity?.code || 'YOWI',
        monthlyFee: contract.monthlyFee?.toString() || '',
        paymentPlan: contract.paymentPlan || 'Monthly',
        contractStart: contract.contractStart ? contract.contractStart.split('T')[0] : '',
        nextDueDate: contract.nextDueDate ? contract.nextDueDate.split('T')[0] : '',
        status: contract.status || 'ACTIVE',
        vatType: contract.vatType || 'VAT',
        billingType: contract.billingType || 'RECURRING',
        contactPerson: contract.contactPerson || '',
        emails: contract.emails || contract.email || '',  // Prefer emails, fallback to email
        address: contract.address || '',
        tin: contract.tin || '',
        mobile: contract.mobile || '',
        remarks: contract.remarks || '',
      });
    } else {
      // Reset form for new contract
      setFormData({
        customerId: '',
        companyName: '',
        productType: 'ACCOUNTING',
        partner: partners.find(p => p.code === 'Direct-YOWI')?.code || '',
        billingEntity: 'YOWI',
        monthlyFee: '',
        paymentPlan: 'Monthly',
        contractStart: '',
        nextDueDate: '',
        status: 'ACTIVE',
        vatType: 'VAT',
        billingType: 'RECURRING',
        contactPerson: '',
        emails: '',
        address: '',
        tin: '',
        mobile: '',
        remarks: '',
      });
    }
    setError(null);
  }, [contract, partners, isOpen]);

  if (!isOpen) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      setFormData(prev => ({ ...prev, [name]: (e.target as HTMLInputElement).checked }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);

    try {
      const url = isEditing ? `/api/contracts/${contract.id}` : '/api/contracts';
      const method = isEditing ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          monthlyFee: parseFloat(formData.monthlyFee) || 0,
          contractStart: formData.contractStart || null,
          nextDueDate: formData.nextDueDate || null,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save contract');
      }

      onSave();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Filter partners based on selected billing entity
  const filteredPartners = partners.filter(p => {
    if (formData.billingEntity === 'YOWI') {
      return ['Direct-YOWI', 'Globe', 'RCBC'].includes(p.code);
    } else {
      return p.code === 'Direct-ABBA';
    }
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 my-8 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white flex items-center justify-between p-4 border-b z-10">
          <h3 className="text-lg font-semibold text-gray-900">
            {isEditing ? 'Edit Contract' : 'New Contract'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-600 text-sm">
              {error}
            </div>
          )}

          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Customer ID <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="customerId"
                value={formData.customerId}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                placeholder="CUST001"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Company Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="companyName"
                value={formData.companyName}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                placeholder="Company Inc."
              />
            </div>
          </div>

          {/* Product & Partner */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Product Type <span className="text-red-500">*</span>
              </label>
              <select
                name="productType"
                value={formData.productType}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              >
                {productTypes.map(pt => (
                  <option key={pt} value={pt}>{pt}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Billing Entity <span className="text-red-500">*</span>
              </label>
              <select
                name="billingEntity"
                value={formData.billingEntity}
                onChange={(e) => {
                  handleChange(e);
                  // Reset partner when billing entity changes
                  const defaultPartner = e.target.value === 'YOWI' ? 'Direct-YOWI' : 'Direct-ABBA';
                  setFormData(prev => ({ ...prev, partner: defaultPartner }));
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              >
                {companies.map(c => (
                  <option key={c.code} value={c.code}>{c.code} - {c.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Partner */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Partner <span className="text-red-500">*</span>
            </label>
            <select
              name="partner"
              value={formData.partner}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Select Partner...</option>
              {filteredPartners.map(p => (
                <option key={p.code} value={p.code}>{p.name} ({p.billingModel})</option>
              ))}
            </select>
          </div>

          {/* Billing Info */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Monthly Fee <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                name="monthlyFee"
                value={formData.monthlyFee}
                onChange={handleChange}
                required
                min="0"
                step="0.01"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                placeholder="15000"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Payment Plan
              </label>
              <select
                name="paymentPlan"
                value={formData.paymentPlan}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              >
                {paymentPlanOptions.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Status
              </label>
              <select
                name="status"
                value={formData.status}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              >
                {statusOptions.map(s => (
                  <option key={s} value={s}>{s.replace('_', ' ')}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Contract Start
              </label>
              <input
                type="date"
                name="contractStart"
                value={formData.contractStart}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Next Due Date
              </label>
              <input
                type="date"
                name="nextDueDate"
                value={formData.nextDueDate}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* VAT & Billing Type */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                VAT Type
              </label>
              <select
                name="vatType"
                value={formData.vatType}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              >
                {vatTypes.map(v => (
                  <option key={v} value={v}>{v.replace('_', '-')}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Billing Type
              </label>
              <select
                name="billingType"
                value={formData.billingType}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              >
                {billingTypes.map(b => (
                  <option key={b} value={b}>{b.replace('_', ' ')}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Contact Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Contact Person
              </label>
              <input
                type="text"
                name="contactPerson"
                value={formData.contactPerson}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                placeholder="John Doe"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email Addresses
              </label>
              <MultiEmailInput
                value={parseEmails(formData.emails)}
                onChange={(emails) => setFormData(prev => ({ ...prev, emails: joinEmails(emails) }))}
                placeholder="Enter email address"
              />
            </div>
          </div>

          {/* Address */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Billing Address
            </label>
            <textarea
              name="address"
              value={formData.address}
              onChange={handleChange}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              placeholder="Street, City, Province, Zip Code"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                TIN
              </label>
              <input
                type="text"
                name="tin"
                value={formData.tin}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                placeholder="123-456-789-000"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Mobile
              </label>
              <input
                type="text"
                name="mobile"
                value={formData.mobile}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                placeholder="09171234567"
              />
            </div>
          </div>

          {/* Remarks */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Remarks
            </label>
            <textarea
              name="remarks"
              value={formData.remarks}
              onChange={handleChange}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              placeholder="Additional notes..."
            />
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  {isEditing ? 'Update Contract' : 'Create Contract'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
