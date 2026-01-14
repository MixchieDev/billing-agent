'use client';

import { useState, useEffect, useMemo } from 'react';
import { FileText, Send, Loader2, CheckCircle, AlertCircle, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MultiEmailInput } from '@/components/ui/multi-email-input';
import { parseEmails, joinEmails } from '@/lib/utils';
import {
  format,
  addMonths,
  startOfMonth,
  endOfMonth,
  differenceInMonths
} from 'date-fns';

interface Contract {
  id: string;
  companyName: string;
  productType: string;
  monthlyFee: number;
  billingAmount: number | null;
  email: string | null;
  emails: string | null;  // Comma-separated list of emails
  tin: string | null;
  vatType: string;
  billingEntityId: string;
  paymentPlan: string | null;
  billingEntity: {
    id: string;
    code: string;
    name: string;
  };
}

interface Company {
  id: string;
  code: string;
  name: string;
}

interface WithholdingPreset {
  rate: number;
  code: string;
  label: string;
}

export function InvoiceGenerator() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string; billingNo?: string } | null>(null);

  // Form state
  const [selectedContractId, setSelectedContractId] = useState<string>('');
  const [useCustomBillTo, setUseCustomBillTo] = useState(false);
  const [customBillTo, setCustomBillTo] = useState({
    name: '',
    attention: '',
    address: '',
    emails: '',  // Comma-separated list of emails
    tin: '',
  });
  const [billingEntityId, setBillingEntityId] = useState<string>('');
  const [monthlyRate, setMonthlyRate] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [dueDate, setDueDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [vatType, setVatType] = useState<'VAT' | 'NON_VAT'>('VAT');
  const [hasWithholding, setHasWithholding] = useState(false);
  const [withholdingPresets, setWithholdingPresets] = useState<WithholdingPreset[]>([]);
  const [selectedWithholdingRate, setSelectedWithholdingRate] = useState<number>(0.02);
  const [selectedWithholdingCode, setSelectedWithholdingCode] = useState<string>('WC160');
  const [autoApprove, setAutoApprove] = useState(false);
  const [sendImmediately, setSendImmediately] = useState(false);
  const [remarks, setRemarks] = useState<string>('');
  const [showPreview, setShowPreview] = useState(false);
  const [paymentPlan, setPaymentPlan] = useState<'Monthly' | 'Quarterly' | 'Annual' | 'Custom'>('Monthly');

  // Billing period selection (month/year)
  const currentDate = new Date();
  const [billingStartMonth, setBillingStartMonth] = useState<string>(
    format(currentDate, 'yyyy-MM')
  );
  const [billingEndMonth, setBillingEndMonth] = useState<string>(
    format(currentDate, 'yyyy-MM')
  );

  // Auto-calculate end month based on payment plan (skip for Custom)
  useEffect(() => {
    if (paymentPlan === 'Custom') return; // Don't auto-calculate for Custom

    const start = new Date(billingStartMonth + '-01');
    let endDate: Date;

    if (paymentPlan === 'Annual') {
      // 12 months: start + 11 months
      endDate = addMonths(start, 11);
    } else if (paymentPlan === 'Quarterly') {
      // 3 months: start + 2 months
      endDate = addMonths(start, 2);
    } else {
      // Monthly: same month
      endDate = start;
    }

    setBillingEndMonth(format(endDate, 'yyyy-MM'));
  }, [billingStartMonth, paymentPlan]);

  // Calculate billing periods based on payment plan
  const billingPeriods = useMemo(() => {
    const periods: { label: string; startDate: Date; endDate: Date; multiplier: number }[] = [];
    const start = new Date(billingStartMonth + '-01');
    const end = new Date(billingEndMonth + '-01');

    if (start > end) return periods;

    const totalMonths = differenceInMonths(endOfMonth(end), start) + 1;

    if (paymentPlan === 'Annual') {
      // Single line item covering entire selected period
      const startLabel = format(start, 'MMM yyyy');
      const endLabel = format(end, 'MMM yyyy');
      const label = startLabel === endLabel
        ? startLabel
        : `${startLabel} - ${endLabel}`;

      periods.push({
        label,
        startDate: startOfMonth(start),
        endDate: endOfMonth(end),
        multiplier: totalMonths
      });
    } else if (paymentPlan === 'Quarterly') {
      // Group into 3-month chunks starting from selected start date
      let current = start;
      let quarterNum = 1;

      while (current <= end) {
        const quarterEnd = addMonths(current, 2); // 3 months from start
        const effectiveEnd = quarterEnd > end ? end : quarterEnd;
        const monthsInPeriod = differenceInMonths(endOfMonth(effectiveEnd), current) + 1;

        const startLabel = format(current, 'MMM');
        const endLabel = format(effectiveEnd, 'MMM yyyy');

        periods.push({
          label: `Q${quarterNum} (${startLabel}-${endLabel})`,
          startDate: startOfMonth(current),
          endDate: endOfMonth(effectiveEnd),
          multiplier: monthsInPeriod
        });

        current = addMonths(current, 3);
        quarterNum++;
      }
    } else {
      // Monthly - one line per month
      let current = start;
      while (current <= end) {
        periods.push({
          label: format(current, 'MMMM yyyy'),
          startDate: startOfMonth(current),
          endDate: endOfMonth(current),
          multiplier: 1
        });
        current = addMonths(current, 1);
      }
    }

    return periods;
  }, [billingStartMonth, billingEndMonth, paymentPlan]);

  // Calculate total billing amount
  const totalBillingAmount = billingPeriods.reduce(
    (sum, period) => sum + parseFloat(monthlyRate || '0') * period.multiplier,
    0
  );

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [contractsRes, companiesRes, settingsRes] = await Promise.all([
          fetch('/api/contracts?status=ACTIVE'),
          fetch('/api/companies'),
          fetch('/api/settings?category=tax'),
        ]);

        if (contractsRes.ok) {
          const data = await contractsRes.json();
          setContracts(data.contracts || data);
        }

        if (companiesRes.ok) {
          const data = await companiesRes.json();
          setCompanies(data);
        }

        if (settingsRes.ok) {
          const data = await settingsRes.json();
          // Get withholding presets from settings
          const presets = data.settings?.find((s: { key: string }) => s.key === 'tax.withholdingPresets')?.value;
          if (presets && Array.isArray(presets)) {
            setWithholdingPresets(presets);
          } else {
            // Default presets
            setWithholdingPresets([
              { rate: 0.01, code: 'WC100', label: '1% - Services' },
              { rate: 0.02, code: 'WC160', label: '2% - Professional Services' },
              { rate: 0.05, code: 'WC058', label: '5% - Rentals' },
              { rate: 0.10, code: 'WC010', label: '10% - Professional Fees' },
            ]);
          }
        }
      } catch (error) {
        console.error('Failed to fetch data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // When contract is selected, populate defaults
  useEffect(() => {
    if (selectedContractId) {
      const contract = contracts.find((c) => c.id === selectedContractId);
      if (contract) {
        setBillingEntityId(contract.billingEntityId);
        setMonthlyRate(String(contract.billingAmount || contract.monthlyFee));
        setVatType(contract.vatType as 'VAT' | 'NON_VAT');
        setDescription(contract.productType.charAt(0) + contract.productType.slice(1).toLowerCase() + ' Services');
        // Set payment plan from contract (default to Monthly)
        const plan = contract.paymentPlan as 'Monthly' | 'Quarterly' | 'Annual' | 'Custom';
        setPaymentPlan(['Monthly', 'Quarterly', 'Annual', 'Custom'].includes(plan) ? plan : 'Monthly');
        // Reset to current month when contract changes
        const now = format(new Date(), 'yyyy-MM');
        setBillingStartMonth(now);
        setBillingEndMonth(now);
      }
    }
  }, [selectedContractId, contracts]);

  const handleGenerate = async () => {
    setGenerating(true);
    setResult(null);

    try {
      // Build line items from billing periods (amount = monthlyRate * multiplier)
      const lineItems = billingPeriods.map((period) => ({
        description: `${description || 'Services'} - ${period.label}`,
        amount: parseFloat(monthlyRate || '0') * period.multiplier,
        periodStart: period.startDate.toISOString(),
        periodEnd: period.endDate.toISOString(),
      }));

      // For single line item, use the formatted description with period label
      const singleItemDescription = lineItems.length === 1
        ? lineItems[0].description
        : description || undefined;

      const requestBody: any = {
        billingEntityId,
        billingAmount: totalBillingAmount,
        dueDate,
        vatType,
        hasWithholding,
        withholdingRate: hasWithholding ? selectedWithholdingRate : undefined,
        withholdingCode: hasWithholding ? selectedWithholdingCode : undefined,
        autoApprove,
        sendImmediately: autoApprove && sendImmediately,
        description: singleItemDescription,
        remarks: remarks || undefined,
        lineItems: lineItems.length > 1 ? lineItems : undefined,
        // For single month, use overall period
        periodStart: billingPeriods[0]?.startDate.toISOString(),
        periodEnd: billingPeriods[billingPeriods.length - 1]?.endDate.toISOString(),
      };

      if (useCustomBillTo) {
        requestBody.customBillTo = customBillTo;
      } else {
        requestBody.contractId = selectedContractId;
      }

      const res = await fetch('/api/invoices/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const data = await res.json();

      if (res.ok) {
        setResult({
          success: true,
          message: data.emailSent
            ? `Invoice ${data.invoice.billingNo} generated and sent!`
            : `Invoice ${data.invoice.billingNo} generated successfully!`,
          billingNo: data.invoice.billingNo,
        });

        // Reset form
        setSelectedContractId('');
        setMonthlyRate('');
        setPaymentPlan('Monthly');
        const now = format(new Date(), 'yyyy-MM');
        setBillingStartMonth(now);
        setBillingEndMonth(now);
        setDescription('');
        setRemarks('');
        setAutoApprove(false);
        setSendImmediately(false);
      } else {
        setResult({
          success: false,
          message: data.error || 'Failed to generate invoice',
        });
      }
    } catch (error) {
      setResult({
        success: false,
        message: 'Failed to generate invoice. Please try again.',
      });
    } finally {
      setGenerating(false);
    }
  };

  const isFormValid = () => {
    if (!billingEntityId || !monthlyRate || parseFloat(monthlyRate) <= 0 || !dueDate) {
      return false;
    }
    if (billingPeriods.length === 0) {
      return false;
    }
    if (useCustomBillTo) {
      return !!customBillTo.name;
    }
    return !!selectedContractId;
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Invoice Generator</h2>
        <p className="text-sm text-gray-500">Create and send invoices on demand</p>
      </div>

      {/* Result Message */}
      {result && (
        <div
          className={`rounded-lg p-4 ${
            result.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {result.success ? (
              <CheckCircle className="h-5 w-5" />
            ) : (
              <AlertCircle className="h-5 w-5" />
            )}
            <span className="font-medium">{result.message}</span>
          </div>
        </div>
      )}

      {/* Form */}
      <div className="rounded-lg border bg-white p-6">
        <div className="grid gap-6 md:grid-cols-2">
          {/* Left Column - Customer Selection */}
          <div className="space-y-4">
            <h3 className="font-medium text-gray-900">Customer Details</h3>

            {/* Toggle between contract and custom */}
            <div className="flex gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={!useCustomBillTo}
                  onChange={() => setUseCustomBillTo(false)}
                  className="h-4 w-4 text-blue-600"
                />
                <span className="text-sm">Select from Contracts</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={useCustomBillTo}
                  onChange={() => setUseCustomBillTo(true)}
                  className="h-4 w-4 text-blue-600"
                />
                <span className="text-sm">Custom Bill To</span>
              </label>
            </div>

            {!useCustomBillTo ? (
              <div>
                <label className="block text-sm font-medium text-gray-700">Contract</label>
                <select
                  value={selectedContractId}
                  onChange={(e) => setSelectedContractId(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Select a contract...</option>
                  {contracts.map((contract) => (
                    <option key={contract.id} value={contract.id}>
                      {contract.companyName} - {contract.productType}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Company Name *</label>
                  <input
                    type="text"
                    value={customBillTo.name}
                    onChange={(e) => setCustomBillTo({ ...customBillTo, name: e.target.value })}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Attention</label>
                  <input
                    type="text"
                    value={customBillTo.attention}
                    onChange={(e) => setCustomBillTo({ ...customBillTo, attention: e.target.value })}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Address</label>
                  <input
                    type="text"
                    value={customBillTo.address}
                    onChange={(e) => setCustomBillTo({ ...customBillTo, address: e.target.value })}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Email Addresses</label>
                  <MultiEmailInput
                    value={parseEmails(customBillTo.emails)}
                    onChange={(emails) => setCustomBillTo({ ...customBillTo, emails: joinEmails(emails) })}
                    placeholder="Enter email address"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">TIN</label>
                  <input
                    type="text"
                    value={customBillTo.tin}
                    onChange={(e) => setCustomBillTo({ ...customBillTo, tin: e.target.value })}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Right Column - Invoice Details */}
          <div className="space-y-4">
            <h3 className="font-medium text-gray-900">Invoice Details</h3>

            <div>
              <label className="block text-sm font-medium text-gray-700">Billing Entity *</label>
              <select
                value={billingEntityId}
                onChange={(e) => setBillingEntityId(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">Select billing entity...</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.code} - {company.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Monthly Rate *</label>
                <input
                  type="number"
                  value={monthlyRate}
                  onChange={(e) => setMonthlyRate(e.target.value)}
                  min="0"
                  step="0.01"
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Payment Plan</label>
                <select
                  value={paymentPlan}
                  onChange={(e) => setPaymentPlan(e.target.value as 'Monthly' | 'Quarterly' | 'Annual' | 'Custom')}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="Monthly">Monthly</option>
                  <option value="Quarterly">Quarterly</option>
                  <option value="Annual">Annual</option>
                  <option value="Custom">Custom (per month)</option>
                </select>
              </div>
            </div>

            {/* Billing Period Range */}
            <div className="rounded-lg border border-gray-200 p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <Calendar className="h-4 w-4" />
                Billing Period
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">From</label>
                  <input
                    type="month"
                    value={billingStartMonth}
                    onChange={(e) => setBillingStartMonth(e.target.value)}
                    className="block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    To {paymentPlan !== 'Custom' && '(auto)'}
                  </label>
                  {paymentPlan === 'Custom' ? (
                    <input
                      type="month"
                      value={billingEndMonth}
                      min={billingStartMonth}
                      onChange={(e) => setBillingEndMonth(e.target.value)}
                      className="block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  ) : (
                    <input
                      type="month"
                      value={billingEndMonth}
                      readOnly
                      className="block w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-gray-600 cursor-not-allowed"
                    />
                  )}
                </div>
              </div>

              {/* Preview of line items */}
              {billingPeriods.length > 0 && (
                <div className="mt-3 rounded-lg bg-gray-50 p-3">
                  <div className="text-xs font-medium text-gray-500 mb-2">
                    Line Items Preview ({billingPeriods.length} {billingPeriods.length === 1 ? 'item' : 'items'}) - {paymentPlan}
                  </div>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {billingPeriods.map((period, idx) => (
                      <div key={idx} className="flex justify-between text-sm">
                        <span className="text-gray-600">{description || 'Services'} - {period.label}</span>
                        <span className="font-medium text-gray-900">
                          {new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(parseFloat(monthlyRate || '0') * period.multiplier)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 pt-2 border-t flex justify-between">
                    <span className="text-sm font-medium text-gray-700">Total</span>
                    <span className="text-lg font-bold text-blue-600">
                      {new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(totalBillingAmount)}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Description</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g., Monthly Payroll Services"
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Due Date *</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">VAT Type</label>
                <select
                  value={vatType}
                  onChange={(e) => setVatType(e.target.value as 'VAT' | 'NON_VAT')}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="VAT">VAT (12%)</option>
                  <option value="NON_VAT">Non-VAT</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Withholding Tax</label>
                <select
                  value={hasWithholding ? `${selectedWithholdingRate}:${selectedWithholdingCode}` : 'none'}
                  onChange={(e) => {
                    if (e.target.value === 'none') {
                      setHasWithholding(false);
                    } else {
                      const [rate, code] = e.target.value.split(':');
                      setHasWithholding(true);
                      setSelectedWithholdingRate(parseFloat(rate));
                      setSelectedWithholdingCode(code);
                    }
                  }}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="none">No Withholding</option>
                  {withholdingPresets.map((preset) => (
                    <option key={preset.code} value={`${preset.rate}:${preset.code}`}>
                      {preset.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Remarks</label>
              <textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                rows={2}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex items-center justify-between border-t pt-4">
          <div className="flex gap-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={autoApprove}
                onChange={(e) => {
                  setAutoApprove(e.target.checked);
                  if (!e.target.checked) setSendImmediately(false);
                }}
                className="h-4 w-4 rounded border-gray-300 text-blue-600"
              />
              <span className="text-sm text-gray-700">Auto-approve</span>
            </label>
            <label className={`flex items-center gap-2 ${!autoApprove ? 'opacity-50' : ''}`}>
              <input
                type="checkbox"
                checked={sendImmediately}
                onChange={(e) => setSendImmediately(e.target.checked)}
                disabled={!autoApprove}
                className="h-4 w-4 rounded border-gray-300 text-blue-600"
              />
              <span className="text-sm text-gray-700">Send immediately</span>
            </label>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" disabled={generating || !isFormValid()} onClick={() => setShowPreview(true)}>
              <FileText className="mr-2 h-4 w-4" />
              Preview
            </Button>
            <Button onClick={handleGenerate} disabled={!isFormValid() || generating}>
              {generating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : sendImmediately ? (
                <Send className="mr-2 h-4 w-4" />
              ) : (
                <FileText className="mr-2 h-4 w-4" />
              )}
              {generating ? 'Generating...' : sendImmediately ? 'Generate & Send' : 'Generate Invoice'}
            </Button>
          </div>
        </div>
      </div>

      {/* Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white shadow-xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">Invoice Preview</h2>
              <button onClick={() => setShowPreview(false)} className="rounded-full p-1 hover:bg-gray-100">
                <span className="text-xl">&times;</span>
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Bill To */}
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-2">Bill To</h3>
                <div className="rounded-lg border p-4">
                  {useCustomBillTo ? (
                    <>
                      <p className="font-semibold text-gray-900">{customBillTo.name}</p>
                      {customBillTo.attention && <p className="text-sm text-gray-600">Attn: {customBillTo.attention}</p>}
                      {customBillTo.address && <p className="text-sm text-gray-600">{customBillTo.address}</p>}
                      {customBillTo.emails && <p className="text-sm text-gray-600">{customBillTo.emails}</p>}
                      {customBillTo.tin && <p className="text-sm text-gray-600">TIN: {customBillTo.tin}</p>}
                    </>
                  ) : (
                    <>
                      <p className="font-semibold text-gray-900">
                        {contracts.find(c => c.id === selectedContractId)?.companyName}
                      </p>
                      <p className="text-sm text-gray-600">
                        {contracts.find(c => c.id === selectedContractId)?.email || 'No email'}
                      </p>
                    </>
                  )}
                </div>
              </div>

              {/* Invoice Details */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h3 className="text-sm font-medium text-gray-500 mb-1">Billing Entity</h3>
                  <p className="text-gray-900">{companies.find(c => c.id === billingEntityId)?.name}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500 mb-1">Due Date</h3>
                  <p className="text-gray-900">{format(new Date(dueDate), 'MMMM d, yyyy')}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500 mb-1">VAT Type</h3>
                  <p className="text-gray-900">{vatType === 'VAT' ? 'VAT' : 'Non-VAT'}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500 mb-1">Withholding Tax</h3>
                  <p className="text-gray-900">{hasWithholding ? `${(selectedWithholdingRate * 100).toFixed(0)}% EWT (${selectedWithholdingCode})` : 'None'}</p>
                </div>
              </div>

              {/* Line Items */}
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-2">Line Items ({paymentPlan})</h3>
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Description</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {billingPeriods.map((period, idx) => (
                        <tr key={idx}>
                          <td className="px-4 py-3 text-sm text-gray-900">
                            {description || 'Services'} - {period.label}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 text-right">
                            {new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(parseFloat(monthlyRate || '0') * period.multiplier)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50">
                      <tr>
                        <td className="px-4 py-3 text-sm font-semibold text-gray-900">Total</td>
                        <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">
                          {new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(totalBillingAmount)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Billing Breakdown */}
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-2">Billing Breakdown</h3>
                <div className="rounded-lg border p-4 space-y-2">
                  {(() => {
                    const isVatClient = vatType === 'VAT';
                    const serviceFee = isVatClient ? totalBillingAmount / 1.12 : totalBillingAmount;
                    const vatAmount = isVatClient ? serviceFee * 0.12 : 0;
                    const grossAmount = serviceFee + vatAmount;
                    const withholdingTax = hasWithholding ? serviceFee * selectedWithholdingRate : 0;
                    const netAmount = grossAmount - withholdingTax;
                    const formatAmount = (amt: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amt);

                    return (
                      <>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Service Fee</span>
                          <span className="text-gray-900">{formatAmount(serviceFee)}</span>
                        </div>
                        {isVatClient && (
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">ADD: VAT (12%)</span>
                            <span className="text-gray-900">{formatAmount(vatAmount)}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Gross Amount</span>
                          <span className="text-gray-900">{formatAmount(grossAmount)}</span>
                        </div>
                        {hasWithholding && (
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">LESS: Withholding Tax ({(selectedWithholdingRate * 100).toFixed(0)}% - {selectedWithholdingCode})</span>
                            <span className="text-red-600">({formatAmount(withholdingTax)})</span>
                          </div>
                        )}
                        <div className="flex justify-between text-sm font-semibold border-t pt-2 mt-2">
                          <span className="text-gray-900">Net Amount Due</span>
                          <span className="text-gray-900">{formatAmount(netAmount)}</span>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* Remarks */}
              {remarks && (
                <div>
                  <h3 className="text-sm font-medium text-gray-500 mb-1">Remarks</h3>
                  <p className="text-sm text-gray-700">{remarks}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={autoApprove}
                    onChange={(e) => {
                      setAutoApprove(e.target.checked);
                      if (!e.target.checked) setSendImmediately(false);
                    }}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600"
                  />
                  <span className="text-sm text-gray-700">Auto-approve</span>
                </label>
                <label className={`flex items-center gap-2 ${!autoApprove ? 'opacity-50' : ''}`}>
                  <input
                    type="checkbox"
                    checked={sendImmediately}
                    onChange={(e) => setSendImmediately(e.target.checked)}
                    disabled={!autoApprove}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600"
                  />
                  <span className="text-sm text-gray-700">Send immediately</span>
                </label>
              </div>
            </div>

            <div className="sticky bottom-0 flex justify-end gap-3 border-t bg-white px-6 py-4">
              <Button variant="outline" onClick={() => setShowPreview(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  setShowPreview(false);
                  handleGenerate();
                }}
                disabled={generating}
              >
                {generating ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : sendImmediately ? (
                  <Send className="mr-2 h-4 w-4" />
                ) : (
                  <FileText className="mr-2 h-4 w-4" />
                )}
                {sendImmediately ? 'Generate & Send' : 'Generate Invoice'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
