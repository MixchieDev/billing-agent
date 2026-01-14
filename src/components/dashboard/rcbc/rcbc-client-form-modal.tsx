'use client';

import { useState, useEffect } from 'react';
import { X, Loader2, Save } from 'lucide-react';

interface RcbcClient {
  id: string;
  name: string;
  employeeCount: number;
  ratePerEmployee: number;
  month: string;
  isActive: boolean;
}

interface RcbcClientFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  client?: RcbcClient | null;
  defaultMonth?: string;
}

export function RcbcClientFormModal({
  isOpen,
  onClose,
  onSave,
  client,
  defaultMonth,
}: RcbcClientFormModalProps) {
  const isEditing = !!client;
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    employeeCount: '',
    ratePerEmployee: '75.00',
    month: defaultMonth || new Date().toISOString().slice(0, 7),
    isActive: true,
  });

  // Initialize form when client changes
  useEffect(() => {
    if (client) {
      const monthStr = typeof client.month === 'string'
        ? client.month.slice(0, 7)
        : new Date(client.month).toISOString().slice(0, 7);

      setFormData({
        name: client.name || '',
        employeeCount: client.employeeCount?.toString() || '',
        ratePerEmployee: client.ratePerEmployee?.toString() || '75.00',
        month: monthStr,
        isActive: client.isActive ?? true,
      });
    } else {
      // Reset form for new client
      setFormData({
        name: '',
        employeeCount: '',
        ratePerEmployee: '75.00',
        month: defaultMonth || new Date().toISOString().slice(0, 7),
        isActive: true,
      });
    }
    setError(null);
  }, [client, defaultMonth, isOpen]);

  if (!isOpen) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);

    try {
      const url = isEditing ? `/api/rcbc/clients/${client.id}` : '/api/rcbc/clients';
      const method = isEditing ? 'PATCH' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          employeeCount: parseInt(formData.employeeCount),
          ratePerEmployee: parseFloat(formData.ratePerEmployee),
          month: formData.month,
          isActive: formData.isActive,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save RCBC client');
      }

      onSave();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Calculate amount preview
  const employeeCount = parseInt(formData.employeeCount) || 0;
  const rate = parseFloat(formData.ratePerEmployee) || 0;
  const previewAmount = employeeCount * rate;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-lg font-semibold text-gray-900">
            {isEditing ? 'Edit RCBC Client' : 'New RCBC Client'}
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

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Company Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              placeholder="ABC Corporation"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Employee Count <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                name="employeeCount"
                value={formData.employeeCount}
                onChange={handleChange}
                required
                min="1"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                placeholder="150"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Rate per Employee <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                name="ratePerEmployee"
                value={formData.ratePerEmployee}
                onChange={handleChange}
                required
                min="0"
                step="0.01"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                placeholder="75.00"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Billing Month <span className="text-red-500">*</span>
            </label>
            <input
              type="month"
              name="month"
              value={formData.month}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Amount Preview */}
          <div className="p-3 bg-gray-50 rounded-lg">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Calculated Amount:</span>
              <span className="font-semibold text-gray-900">
                {previewAmount.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {employeeCount} employees x {rate.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })} per employee
            </p>
          </div>

          {/* Active toggle */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isActive"
              name="isActive"
              checked={formData.isActive}
              onChange={handleChange}
              className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label htmlFor="isActive" className="text-sm text-gray-700">
              Active (included in billing)
            </label>
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
                  {isEditing ? 'Update Client' : 'Add Client'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
