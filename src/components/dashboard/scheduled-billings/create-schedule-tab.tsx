'use client';

import { useState, useEffect } from 'react';
import { Loader2, Search, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Contract {
  id: string;
  companyName: string;
  productType: string;
  email: string | null;
  billingEntity: { id: string; code: string; name: string };
  monthlyFee: number | null;
  billingAmount: number | null;
  vatType: 'VAT' | 'NON_VAT';
  withholdingRate: number | null;
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

interface CreateScheduleTabProps {
  onSuccess: () => void;
}

export function CreateScheduleTab({ onSuccess }: CreateScheduleTabProps) {
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
  const [dueDayOfMonth, setDueDayOfMonth] = useState('15');
  const [frequency, setFrequency] = useState<'MONTHLY' | 'QUARTERLY' | 'ANNUALLY' | 'CUSTOM'>('MONTHLY');
  const [customIntervalValue, setCustomIntervalValue] = useState('30');
  const [customIntervalUnit, setCustomIntervalUnit] = useState<'DAYS' | 'MONTHS'>('DAYS');
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

        // Handle both array response and { contracts: [] } response
        const contractsList = Array.isArray(contractsData) ? contractsData : (contractsData.contracts || []);
        setContracts(contractsList);
        setBillingEntities(companiesData.filter((c: BillingEntity) => ['YOWI', 'ABBA'].includes(c.code)));

        // Fetch withholding presets from settings
        if (settingsRes.ok) {
          const settingsData = await settingsRes.json();
          // Settings API returns { settings: [{ key, value }, ...] }
          const findSetting = (key: string) =>
            settingsData.settings?.find((s: { key: string }) => s.key === key)?.value;

          const presets = findSetting('tax.withholdingPresets');
          if (presets && Array.isArray(presets)) {
            setWithholdingPresets(presets);
          } else {
            // Default presets fallback
            setWithholdingPresets([
              { rate: 0.01, code: 'WC100', label: '1% - Services' },
              { rate: 0.02, code: 'WC160', label: '2% - Professional Services' },
              { rate: 0.05, code: 'WC058', label: '5% - Rentals' },
              { rate: 0.10, code: 'WC010', label: '10% - Professional Fees' },
            ]);
          }

          const defaultRate = findSetting('tax.defaultWithholdingRate');
          if (defaultRate) {
            setSelectedWithholdingRate(defaultRate);
          }

          const defaultCode = findSetting('tax.defaultWithholdingCode');
          if (defaultCode) {
            setSelectedWithholdingCode(defaultCode);
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

  // When contract is selected, auto-fill fields from contract data
  useEffect(() => {
    if (contractId) {
      const contract = contracts.find((c) => c.id === contractId);
      if (contract) {
        // Auto-fill billing entity
        setBillingEntityId(contract.billingEntity.id);

        // Auto-fill billing amount (prefer billingAmount, fallback to monthlyFee)
        // Handle Prisma Decimal which comes as string
        const amount = contract.billingAmount || contract.monthlyFee;
        if (amount) {
          setBillingAmount(String(Number(amount)));
        }

        // Auto-fill VAT type
        setVatType(contract.vatType || 'VAT');

        // Auto-fill withholding tax if set (handle Prisma Decimal as string)
        const withholdingRate = contract.withholdingRate ? Number(contract.withholdingRate) : 0;
        if (withholdingRate > 0) {
          setHasWithholding(true);
          setSelectedWithholdingRate(withholdingRate);
          // Try to find matching preset code
          const matchingPreset = withholdingPresets.find(
            (p) => Math.abs(p.rate - withholdingRate) < 0.0001
          );
          if (matchingPreset) {
            setSelectedWithholdingCode(matchingPreset.code);
          }
        } else {
          setHasWithholding(false);
        }

        // Auto-fill description from product type
        const productTypeDescriptions: Record<string, string> = {
          'PAYROLL': 'Monthly Payroll Services',
          'ACCOUNTING': 'Monthly Accounting Services',
          'HR': 'Monthly HR Services',
          'TAX': 'Tax Compliance Services',
          'AUDIT': 'Audit Services',
          'CONSULTING': 'Consulting Services',
        };
        const defaultDesc = productTypeDescriptions[contract.productType] || `${contract.productType} Services`;
        setDescription(defaultDesc);
      }
    }
  }, [contractId, contracts, withholdingPresets]);

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

    // Validate custom frequency
    if (frequency === 'CUSTOM') {
      const intervalVal = parseInt(customIntervalValue);
      if (isNaN(intervalVal) || intervalVal < 1) {
        setError('Custom interval must be at least 1');
        return;
      }
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
          dueDayOfMonth: parseInt(dueDayOfMonth),
          frequency,
          customIntervalValue: frequency === 'CUSTOM' ? parseInt(customIntervalValue) : undefined,
          customIntervalUnit: frequency === 'CUSTOM' ? customIntervalUnit : undefined,
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

      // Reset form
      setContractId('');
      setBillingEntityId('');
      setBillingAmount('');
      setDescription('');
      setBillingDayOfMonth('15');
      setDueDayOfMonth('15');
      setFrequency('MONTHLY');
      setCustomIntervalValue('30');
      setCustomIntervalUnit('DAYS');
      setVatType('VAT');
      setHasWithholding(false);
      setAutoApprove(false);
      setAutoSendEnabled(true);
      setRemarks('');
      setStartDate(new Date().toISOString().split('T')[0]);
      setEndDate('');
      setSearchQuery('');

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create scheduled billing');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="rounded-lg bg-red-50 p-4 text-red-700">
            {error}
          </div>
        )}

        {/* Approval Notice */}
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800">Approval Required</p>
            <p className="text-sm text-amber-700">
              New schedules require approval before becoming active. Once approved, invoices will be generated automatically on the scheduled billing day.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column - Contract Details */}
          <div className="space-y-6">
            <div className="rounded-lg border bg-white p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Contract Selection</h3>

              {/* Contract Search */}
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
                <div className="max-h-48 overflow-y-auto rounded-lg border">
                  {filteredContracts.length === 0 ? (
                    <div className="p-4 text-center text-sm text-gray-500">No contracts found</div>
                  ) : (
                    filteredContracts.slice(0, 20).map((contract) => (
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
              <div className="mt-6">
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
            </div>
          </div>

          {/* Right Column - Schedule Config */}
          <div className="space-y-6">
            <div className="rounded-lg border bg-white p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Schedule Configuration</h3>

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
              <div className="mt-4">
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
              <div className="grid grid-cols-3 gap-4 mt-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Billing Day <span className="text-red-500">*</span>
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
                  <p className="mt-1 text-xs text-gray-500">Invoice generated</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Due Day <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={dueDayOfMonth}
                    onChange={(e) => setDueDayOfMonth(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                      <option key={day} value={day}>
                        {day}{day === 1 ? 'st' : day === 2 ? 'nd' : day === 3 ? 'rd' : 'th'}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-gray-500">Payment due</p>
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
                    <option value="CUSTOM">Custom Interval</option>
                  </select>
                </div>
              </div>

              {/* Custom Interval Settings */}
              {frequency === 'CUSTOM' && (
                <div className="mt-4 p-4 rounded-lg bg-gray-50 border">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Custom Interval
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">Every</span>
                    <input
                      type="number"
                      value={customIntervalValue}
                      onChange={(e) => setCustomIntervalValue(e.target.value)}
                      min="1"
                      className="w-20 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <select
                      value={customIntervalUnit}
                      onChange={(e) => setCustomIntervalUnit(e.target.value as 'DAYS' | 'MONTHS')}
                      className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="DAYS">Days</option>
                      <option value="MONTHS">Months</option>
                    </select>
                  </div>
                  <p className="mt-2 text-xs text-gray-500">
                    e.g., "Every 45 days" or "Every 2 months"
                  </p>
                </div>
              )}

              {/* Date Range */}
              <div className="grid grid-cols-2 gap-4 mt-4">
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
              <div className="grid grid-cols-2 gap-4 mt-4">
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
            </div>

            {/* Automation Settings */}
            <div className="rounded-lg border bg-white p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Automation Settings</h3>
              <div className="space-y-3">
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
            </div>

            {/* Remarks */}
            <div className="rounded-lg border bg-white p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Notes</h3>
              <textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Internal notes about this schedule..."
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Preview Section */}
        {selectedContract && billingEntityId && billingAmount && (
          <div className="rounded-lg border-2 border-blue-200 bg-blue-50 p-6">
            <h3 className="text-lg font-medium text-blue-900 mb-4">Preview - Schedule Summary</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left Column */}
              <div className="space-y-4">
                <div>
                  <div className="text-xs font-medium text-blue-600 uppercase tracking-wide">Client</div>
                  <div className="text-lg font-semibold text-gray-900">{selectedContract.companyName}</div>
                  <div className="text-sm text-gray-600">{selectedContract.productType}</div>
                </div>

                <div>
                  <div className="text-xs font-medium text-blue-600 uppercase tracking-wide">Billing Entity</div>
                  <div className="text-base font-medium text-gray-900">
                    {billingEntities.find(e => e.id === billingEntityId)?.code || billingEntityId}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-medium text-blue-600 uppercase tracking-wide">Schedule</div>
                  <div className="text-base text-gray-900">
                    {frequency === 'CUSTOM'
                      ? `Every ${customIntervalValue} ${customIntervalUnit.toLowerCase()}`
                      : frequency.charAt(0) + frequency.slice(1).toLowerCase()
                    }
                  </div>
                  <div className="text-sm text-gray-600">
                    Invoice on the {billingDayOfMonth}{billingDayOfMonth === '1' ? 'st' : billingDayOfMonth === '2' ? 'nd' : billingDayOfMonth === '3' ? 'rd' : 'th'},
                    Due on the {dueDayOfMonth}{dueDayOfMonth === '1' ? 'st' : dueDayOfMonth === '2' ? 'nd' : dueDayOfMonth === '3' ? 'rd' : 'th'}
                  </div>
                  <div className="text-sm text-gray-600">
                    Starting {new Date(startDate).toLocaleDateString()}
                    {endDate && ` until ${new Date(endDate).toLocaleDateString()}`}
                  </div>
                </div>
              </div>

              {/* Right Column - Amount Breakdown */}
              <div className="space-y-3">
                <div className="text-xs font-medium text-blue-600 uppercase tracking-wide">Amount Breakdown</div>
                <div className="rounded-lg bg-white p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Base Amount</span>
                    <span className="font-medium">₱{parseFloat(billingAmount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                  </div>
                  {vatType === 'VAT' && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">VAT (12%)</span>
                      <span className="font-medium">₱{(parseFloat(billingAmount) * 0.12).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}
                  {hasWithholding && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">
                        Withholding ({(selectedWithholdingRate * 100).toFixed(0)}% - {selectedWithholdingCode})
                      </span>
                      <span className="font-medium text-red-600">-₱{(parseFloat(billingAmount) * selectedWithholdingRate).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}
                  <div className="border-t pt-2 flex justify-between">
                    <span className="font-medium text-gray-900">Net Receivable</span>
                    <span className="font-bold text-lg text-blue-700">
                      ₱{(
                        parseFloat(billingAmount) +
                        (vatType === 'VAT' ? parseFloat(billingAmount) * 0.12 : 0) -
                        (hasWithholding ? parseFloat(billingAmount) * selectedWithholdingRate : 0)
                      ).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                <div className="text-xs font-medium text-blue-600 uppercase tracking-wide mt-4">Automation</div>
                <div className="flex flex-wrap gap-2">
                  {autoApprove ? (
                    <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
                      Auto-Approve
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700">
                      Manual Approval
                    </span>
                  )}
                  {autoApprove && autoSendEnabled ? (
                    <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
                      Auto-Send Email
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
                      Manual Send
                    </span>
                  )}
                </div>

                {description && (
                  <div className="mt-3">
                    <div className="text-xs font-medium text-blue-600 uppercase tracking-wide">Invoice Line Item</div>
                    <div className="text-sm text-gray-700 italic">"{description}"</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Submit Button */}
        <div className="flex justify-end pt-4">
          <Button type="submit" disabled={submitting || !contractId || !billingEntityId || !billingAmount} size="lg">
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              'Submit for Approval'
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
