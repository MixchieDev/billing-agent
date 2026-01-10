'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X } from 'lucide-react';

export interface InvoiceForPayment {
  id: string;
  billingNo: string | null;
  customerName: string;
  netAmount: number;
}

interface MarkPaidModalProps {
  invoice: InvoiceForPayment | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (
    invoiceId: string,
    data: {
      paidAmount: number;
      paymentMethod: 'CASH' | 'BANK_TRANSFER' | 'CHECK';
      paymentReference?: string;
      paidAt?: string;
    }
  ) => Promise<void>;
}

export function MarkPaidModal({ invoice, isOpen, onClose, onSave }: MarkPaidModalProps) {
  const [paidAmount, setPaidAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'BANK_TRANSFER' | 'CHECK'>('BANK_TRANSFER');
  const [paymentReference, setPaymentReference] = useState('');
  const [paidAt, setPaidAt] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Update form when invoice changes
  useEffect(() => {
    if (invoice) {
      setPaidAmount(invoice.netAmount.toFixed(2));
      setPaymentMethod('BANK_TRANSFER');
      setPaymentReference('');
      setPaidAt(new Date().toISOString().split('T')[0]);
      setError(null);
    }
  }, [invoice]);

  const handleSave = async () => {
    if (!invoice) return;

    const amount = parseFloat(paidAmount);
    if (isNaN(amount) || amount <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await onSave(invoice.id, {
        paidAmount: amount,
        paymentMethod,
        paymentReference: paymentReference || undefined,
        paidAt: paidAt || undefined,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark as paid');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen || !invoice) return null;

  const selectClassName = "h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Mark Invoice as Paid</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Invoice Info */}
        <div className="mb-6 pb-4 border-b">
          <p className="text-sm font-medium text-gray-900">
            {invoice.billingNo || invoice.id.slice(0, 8)}
          </p>
          <p className="text-sm text-gray-600">{invoice.customerName}</p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Form Fields */}
        <div className="space-y-4">
          {/* Amount Paid */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">
              Amount Paid
            </label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={paidAmount}
              onChange={(e) => setPaidAmount(e.target.value)}
              className="w-full"
              placeholder="0.00"
            />
            <p className="text-xs text-gray-500 mt-1">
              Invoice amount: PHP {invoice.netAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
            </p>
          </div>

          {/* Payment Method */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">
              Payment Method
            </label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as 'CASH' | 'BANK_TRANSFER' | 'CHECK')}
              className={selectClassName}
            >
              <option value="BANK_TRANSFER">Bank Transfer</option>
              <option value="CASH">Cash</option>
              <option value="CHECK">Check</option>
            </select>
          </div>

          {/* Payment Reference */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">
              Reference Number (Optional)
            </label>
            <Input
              type="text"
              value={paymentReference}
              onChange={(e) => setPaymentReference(e.target.value)}
              className="w-full"
              placeholder="Transaction ID, check number, etc."
            />
          </div>

          {/* Payment Date */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">
              Payment Date
            </label>
            <Input
              type="date"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
              className="w-full"
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="mt-8 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Mark as Paid'}
          </Button>
        </div>
      </div>
    </div>
  );
}
