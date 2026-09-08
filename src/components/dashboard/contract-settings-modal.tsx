'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X } from 'lucide-react';

export interface ContractForSettings {
  id: string;
  companyName: string;
  autoSendEnabled: boolean;
  contractEndDate: Date | string | null;
}

interface ContractSettingsModalProps {
  contract: ContractForSettings | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (id: string, data: { autoSendEnabled: boolean; contractEndDate: string | null }) => Promise<void>;
}

export function ContractSettingsModal({ contract, isOpen, onClose, onSave }: ContractSettingsModalProps) {
  const [autoSendEnabled, setAutoSendEnabled] = useState(true);
  const [contractEndDate, setContractEndDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Update form when contract changes
  useEffect(() => {
    if (contract) {
      setAutoSendEnabled(contract.autoSendEnabled ?? true);
      if (contract.contractEndDate) {
        const date = new Date(contract.contractEndDate);
        setContractEndDate(date.toISOString().split('T')[0]);
      } else {
        setContractEndDate('');
      }
      setError(null);
    }
  }, [contract]);

  const handleSave = async () => {
    if (!contract) return;

    setSaving(true);
    setError(null);

    try {
      await onSave(contract.id, {
        autoSendEnabled,
        contractEndDate: contractEndDate || null,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen || !contract) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-card rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Contract Settings</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-muted-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Contract Name */}
        <p className="text-sm text-muted-foreground mb-6 pb-4 border-b">
          {contract.companyName}
        </p>

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Form Fields */}
        <div className="space-y-6">
          {/* Auto-Send Toggle */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <label className="text-sm font-medium text-foreground">
                Auto-Send Invoices
              </label>
              <p className="text-xs text-muted-foreground mt-1">
                When enabled, monthly and quarterly invoices are automatically approved and sent.
                When disabled, all invoices require manual approval.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer mt-1">
              <input
                type="checkbox"
                checked={autoSendEnabled}
                onChange={(e) => setAutoSendEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-100 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-card after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          {/* Contract End Date */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Contract End Date
            </label>
            <p className="text-xs text-muted-foreground mb-2">
              No invoices will be generated after this date. Leave empty for no end date.
            </p>
            <Input
              type="date"
              value={contractEndDate}
              onChange={(e) => setContractEndDate(e.target.value)}
              className="w-full"
            />
            {contractEndDate && (
              <button
                type="button"
                onClick={() => setContractEndDate('')}
                className="mt-1 text-xs text-blue-600 hover:text-blue-800"
              >
                Clear end date
              </button>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="mt-8 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>
    </div>
  );
}
