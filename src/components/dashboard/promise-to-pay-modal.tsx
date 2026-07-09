'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X } from 'lucide-react';

export interface InvoiceForPromise {
  id: string;
  billingNo: string | null;
  customerName: string;
  netAmount: number;
  balanceDue?: number | null;
}

interface PromiseToPayModalProps {
  invoice: InvoiceForPromise | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (
    invoiceId: string,
    data: {
      promisedDate: string;
      promisedAmount?: number;
      channel?: string;
      notes?: string;
    }
  ) => Promise<void>;
}

export function PromiseToPayModal({ invoice, isOpen, onClose, onSave }: PromiseToPayModalProps) {
  const [promisedDate, setPromisedDate] = useState('');
  const [promisedAmount, setPromisedAmount] = useState('');
  const [channel, setChannel] = useState('CALL');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (invoice) {
      const bal = invoice.balanceDue != null ? invoice.balanceDue : invoice.netAmount;
      setPromisedDate('');
      setPromisedAmount(bal.toFixed(2));
      setChannel('CALL');
      setNotes('');
      setError(null);
    }
  }, [invoice]);

  const handleSave = async () => {
    if (!invoice) return;
    if (!promisedDate) {
      setError('Please choose the promised payment date');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(invoice.id, {
        promisedDate,
        promisedAmount: promisedAmount ? parseFloat(promisedAmount) : undefined,
        channel: channel || undefined,
        notes: notes || undefined,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to log promise');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen || !invoice) return null;

  const selectClassName =
    'h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Log Promise to Pay</h2>
          <button onClick={onClose} className="text-gray-400 transition-colors hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-6 border-b pb-4">
          <p className="text-sm font-medium text-gray-900">
            {invoice.billingNo || invoice.id.slice(0, 8)}
          </p>
          <p className="text-sm text-gray-600">{invoice.customerName}</p>
          <p className="mt-1 text-xs text-gray-500">
            Follow-ups will be paused until the promised date.
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-900">Promised Date</label>
            <Input type="date" value={promisedDate} onChange={(e) => setPromisedDate(e.target.value)} className="w-full" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-900">Promised Amount (Optional)</label>
            <Input type="number" step="0.01" min="0" value={promisedAmount} onChange={(e) => setPromisedAmount(e.target.value)} className="w-full" placeholder="0.00" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-900">Channel</label>
            <select value={channel} onChange={(e) => setChannel(e.target.value)} className={selectClassName}>
              <option value="CALL">Call</option>
              <option value="EMAIL">Email</option>
              <option value="VIBER">Viber</option>
              <option value="MEETING">Meeting</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-900">Notes (Optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Who promised, any conditions, etc."
            />
          </div>
        </div>

        <div className="mt-8 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Log Promise'}
          </Button>
        </div>
      </div>
    </div>
  );
}
