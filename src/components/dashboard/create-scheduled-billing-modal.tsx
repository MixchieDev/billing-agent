'use client';

import { useState, useEffect } from 'react';
import { X, Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Contract {
  id: string;
  companyName: string;
  productType: string;
  email: string | null;
  billingEntity: { id: string; code: string; name: string };
}

interface BillingEntity {
  id: string;
  code: string;
  name: string;
}

interface WithholdingPreset {
  rate: number;
  code: string;
  label: string;
}

interface CreateScheduledBillingModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateScheduledBillingModal({ onClose, onSuccess }: CreateScheduledBillingModalProps) {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [billingEntities, setBillingEntities] = useState<BillingEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Form state
  const [contractId, setContractId] = useState('');
  const [billingEntityId, setBillingEntityId] = useState('');
  const [billingAmount, setBillingAmount] = useState('');
  const [description, setDescription] = useState('');
  const [billingDayOfMonth, setBillingDayOfMonth] = useState('15');
  const [frequency, setFrequency] = useState<'MONTHLY' | 'QUARTERLY' | 'ANNUALLY'>('MONTHLY');
  const [vatType, setVatType] = useState<'VAT' | 'NON_VAT'>('VAT');
  const [hasWithholding, setHasWithholding] = useState(false);
  const [withholdingPresets, setWithholdingPresets] = useState<WithholdingPreset[]>([]);
  const [selectedWithholdingRate, setSelectedWithholdingRate] = useState<number>(0.02);
  const [selectedWithholdingCode, setSelectedWithholdingCode] = useState<string>('WC160');
  const [autoApprove, setAutoApprove] = useState(false);
  const [autoSendEnabled, setAutoSendEnabled] = useState(true);
  const [remarks, setRemarks] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [contractsRes, companiesRes, settingsRes] = await Promise.all([
          fetch('/api/contracts'),
          fetch('/api/companies'),
          fetch('/api/settings'),
        ]);

        if (!contractsRes.ok || !companiesRes.ok) {
          throw new Error('Failed to fetch data');
        }

        const contractsData = await contractsRes.json();
        const companiesData = await companiesRes.json();

        setContracts(contractsData);
        setBillingEntities(companiesData.filter((c: BillingEntity) => ['YOWI', 'ABBA'].includes(c.code)));

        // Fetch withholding presets
        if (settingsRes.ok) {
          const settingsData = await settingsRes.json();
          if (settingsData['tax.withholdingPresets']) {
            setWithholdingPresets(settingsData['tax.withholdingPresets']);
          }
          if (settingsData['tax.defaultWithholdingRate']) {
            setSelectedWithholdingRate(settingsData['tax.defaultWithholdingRate']);
          }
          if (settingsData['tax.defaultWithholdingCode']) {
            setSelectedWithholdingCode(settingsData['tax.defaultWithholdingCode']);
          }
        }
      } catch {
        setError('Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // When contract is selected, auto-fill billing entity
  useEffect(() => {
    if (contractId) {
      const contract = contracts.find((c) => c.id === contractId);
      if (contract) {
        setBillingEntityId(contract.billingEntity.id);
      }
    }
  }, [contractId, contracts]);

  const filteredContracts = contracts.filter((contract) =>
    contract.companyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    contract.productType.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedContract = contracts.find((c) => c.id === contractId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!contractId || !billingEntityId || !billingAmount || !billingDayOfMonth) {
      setError('Please fill in all required fields');
      return;
    }

    const amount = parseFloat(billingAmount);
    if (isNaN(amount) || amount <= 0) {
      setError('Billing amount must be a positive number');
      return;
    }

    const day = parseInt(billingDayOfMonth);
    if (isNaN(day) || day < 1 || day > 31) {
      setError('Billing day must be between 1 and 31');
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch('/api/scheduled-billings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contractId,
          billingEntityId,
          billingAmount: amount,
          description: description || undefined,
          billingDayOfMonth: day,
          frequency,
          vatType,
          hasWithholding,
          withholdingRate: hasWithholding ? selectedWithholdingRate : undefined,
          withholdingCode: hasWithholding ? selectedWithholdingCode : undefined,
          autoApprove,
          autoSendEnabled,
          remarks: remarks || undefined,
          startDate: startDate ? new Date(startDate).toISOString() : undefined,
          endDate: endDate ? new Date(endDate).toISOString() : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create scheduled billing');
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create scheduled billing');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white shadow-xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Create Scheduled Billing</h2>
          <button onClick={onClose} className="rounded-full p-1 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {error && (
              <div className="rounded-lg bg-red-50 p-4 text-red-700">
                {error}
              </div>
            )}

            {/* Contract Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Contract <span className="text-red-500">*</span>
              </label>
              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search contracts..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="max-h-40 overflow-y-auto rounded-lg border">
                {filteredContracts.length === 0 ? (
                  <div className="p-4 text-center text-sm text-gray-500">No contracts found</div>
                ) : (
                  filteredContracts.map((contract) => (
                    <button
                      key={contract.id}
                      type="button"
                      onClick={() => setContractId(contract.id)}
                      className={`w-full px-4 py-3 text-left hover:bg-gray-50 border-b last:border-b-0 ${
                        contractId === contract.id ? 'bg-blue-50' : ''
                      }`}
                    >
                      <div className="font-medium text-gray-900">{contract.companyName}</div>
                      <div className="flex gap-2 text-xs text-gray-500">
                        <span>{contract.productType}</span>
                        <span>•</span>
                        <span>{contract.billingEntity.code}</span>
                      </div>
                    </button>
                  ))
                )}
              </div>
              {selectedContract && (
                <div className="mt-2 rounded-lg bg-blue-50 p-3">
                  <div className="text-sm font-medium text-blue-900">Selected: {selectedContract.companyName}</div>
                  <div className="text-xs text-blue-700">{selectedContract.email || 'No email'}</div>
                </div>
              )}
            </div>

            {/* Billing Entity */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Billing Entity <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-2">
                {billingEntities.map((entity) => (
                  <button
                    key={entity.id}
                    type="button"
                    onClick={() => setBillingEntityId(entity.id)}
                    className={`flex-1 rounded-lg border-2 px-4 py-3 text-center transition-colors ${
                      billingEntityId === entity.id
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="font-medium">{entity.code}</div>
                    <div className="text-xs text-gray-500">{entity.name}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Billing Amount */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Billing Amount (PHP) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={billingAmount}
                onChange={(e) => setBillingAmount(e.target.value)}
                placeholder="0.00"
                step="0.01"
                min="0"
                className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                required
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Description (Line Item)
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g., Monthly Payroll Services"
                className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <p className="mt-1 text-xs text-gray-500">This will appear on the invoice line item</p>
            </div>

            {/* Schedule Settings */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Billing Day of Month <span className="text-red-500">*</span>
                </label>
                <select
                  value={billingDayOfMonth}
                  onChange={(e) => setBillingDayOfMonth(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                    <option key={day} value={day}>
                      {day}{day === 1 ? 'st' : day === 2 ? 'nd' : day === 3 ? 'rd' : 'th'}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Frequency
                </label>
                <select
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value as typeof frequency)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="MONTHLY">Monthly</option>
                  <option value="QUARTERLY">Quarterly</option>
                  <option value="ANNUALLY">Annually</option>
                </select>
              </div>
            </div>

            {/* Date Range */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Start Date
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  End Date (Optional)
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* VAT and Withholding */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  VAT Type
                </label>
                <select
                  value={vatType}
                  onChange={(e) => setVatType(e.target.value as typeof vatType)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="VAT">VAT (12%)</option>
                  <option value="NON_VAT">Non-VAT</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Withholding Tax
                </label>
                <select
                  value={hasWithholding ? `${selectedWithholdingRate}:${selectedWithholdingCode}` : 'none'}
                  onChange={(e) => {
                    if (e.target.value === 'none') {
                      setHasWithholding(false);
                    } else {
                      setHasWithholding(true);
                      const [rate, code] = e.target.value.split(':');
                      setSelectedWithholdingRate(parseFloat(rate));
                      setSelectedWithholdingCode(code);
                    }
                  }}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="none">No Withholding</option>
                  {withholdingPresets.map((preset) => (
                    <option key={`${preset.rate}:${preset.code}`} value={`${preset.rate}:${preset.code}`}>
                      {preset.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Automation Settings */}
            <div className="rounded-lg border bg-gray-50 p-4 space-y-3">
              <h3 className="font-medium text-gray-900">Automation Settings</h3>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoApprove}
                  onChange={(e) => setAutoApprove(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Auto-approve invoices</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoSendEnabled}
                  onChange={(e) => setAutoSendEnabled(e.target.checked)}
                  disabled={!autoApprove}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                />
                <span className={`text-sm ${autoApprove ? 'text-gray-700' : 'text-gray-400'}`}>
                  Auto-send invoices via email
                </span>
              </label>
              <p className="text-xs text-gray-500">
                {autoApprove && autoSendEnabled
                  ? 'Invoices will be automatically approved and sent to the client.'
                  : autoApprove
                  ? 'Invoices will be automatically approved but require manual sending.'
                  : 'Invoices will require manual approval before sending.'}
              </p>
            </div>

            {/* Remarks */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Remarks (Optional)
              </label>
              <textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Internal notes about this schedule..."
                rows={2}
                className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting || !contractId || !billingEntityId || !billingAmount}>
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Schedule'
                )}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
