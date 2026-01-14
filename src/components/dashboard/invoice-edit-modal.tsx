'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { MultiEmailInput } from '@/components/ui/multi-email-input';
import { parseEmails, joinEmails } from '@/lib/utils';
import { RefreshCw, Building2, User, Mail, MapPin, Link2 } from 'lucide-react';

interface Partner {
  id: string;
  code: string;
  name: string;
  invoiceTo: string | null;
  attention: string | null;
  address: string | null;
  email: string | null;
  billingModel: string;
}

interface Invoice {
  id: string;
  billingNo: string | null;
  customerName: string;
  attention: string | null;
  customerAddress: string | null;
  customerEmail: string | null;
  customerEmails: string | null;
  status: string;
  partnerId: string | null;
  partner: Partner | null;
}

interface InvoiceEditModalProps {
  invoiceId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
}

export function InvoiceEditModal({
  invoiceId,
  isOpen,
  onClose,
  onSave,
}: InvoiceEditModalProps) {
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [customerName, setCustomerName] = useState('');
  const [attention, setAttention] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerEmails, setCustomerEmails] = useState('');
  const [partnerId, setPartnerId] = useState<string>('');

  // Fetch invoice and partners
  useEffect(() => {
    if (!isOpen || !invoiceId) return;

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [invoiceRes, partnersRes] = await Promise.all([
          fetch(`/api/invoices/${invoiceId}`),
          fetch('/api/partners'),
        ]);

        if (!invoiceRes.ok) {
          const errData = await invoiceRes.json();
          throw new Error(errData.details || errData.error || 'Failed to fetch invoice');
        }
        if (!partnersRes.ok) {
          throw new Error('Failed to fetch partners');
        }

        const invoiceData = await invoiceRes.json();
        const partnersData = await partnersRes.json();

        setInvoice(invoiceData);
        setPartners(partnersData);

        // Set form state (prefer customerEmails, fallback to customerEmail)
        setCustomerName(invoiceData.customerName || '');
        setAttention(invoiceData.attention || '');
        setCustomerAddress(invoiceData.customerAddress || '');
        setCustomerEmails(invoiceData.customerEmails || invoiceData.customerEmail || '');
        setPartnerId(invoiceData.partnerId || '');
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [isOpen, invoiceId]);

  const handleSave = async () => {
    if (!invoiceId) return;

    setSaving(true);
    setError(null);
    try {
      // Get first email for backward compatibility (customerEmail field)
      const emailList = parseEmails(customerEmails);
      const firstEmail = emailList.length > 0 ? emailList[0] : null;

      const response = await fetch(`/api/invoices/${invoiceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName,
          attention,
          customerAddress,
          customerEmail: firstEmail,
          customerEmails: customerEmails || null,
          partnerId: partnerId || null,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save');
      }

      onSave();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSyncFromPartner = async () => {
    if (!invoiceId || !partnerId) return;

    setSyncing(true);
    setError(null);
    try {
      const response = await fetch(`/api/invoices/${invoiceId}/sync-partner`, {
        method: 'POST',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to sync');
      }

      const data = await response.json();
      const updatedInvoice = data.invoice;

      // Update form state with synced values (prefer customerEmails)
      setCustomerName(updatedInvoice.customerName || '');
      setAttention(updatedInvoice.attention || '');
      setCustomerAddress(updatedInvoice.customerAddress || '');
      setCustomerEmails(updatedInvoice.customerEmails || updatedInvoice.customerEmail || '');

      alert('Invoice updated with partner details');
      onSave();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSyncing(false);
    }
  };

  // Update form when partner selection changes
  const handlePartnerChange = (newPartnerId: string) => {
    setPartnerId(newPartnerId);

    // Optionally pre-fill from selected partner
    const selectedPartner = partners.find((p) => p.id === newPartnerId);
    if (selectedPartner) {
      if (selectedPartner.invoiceTo) setCustomerName(selectedPartner.invoiceTo);
      if (selectedPartner.attention) setAttention(selectedPartner.attention);
      if (selectedPartner.address) setCustomerAddress(selectedPartner.address);
      if (selectedPartner.email) setCustomerEmails(selectedPartner.email);
    }
  };

  if (!isOpen) return null;

  const canEdit = invoice && !['SENT', 'PAID'].includes(invoice.status);
  const selectedPartner = partners.find((p) => p.id === partnerId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold text-gray-900">
          Edit Invoice: {invoice?.billingNo || invoiceId}
        </h3>

        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : error ? (
          <div className="my-4 rounded-md bg-red-50 p-4 text-red-700">
            {error}
          </div>
        ) : !canEdit ? (
          <div className="my-4 rounded-md bg-yellow-50 p-4 text-yellow-700">
            This invoice has already been sent or paid and cannot be edited.
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {/* Partner Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700">
                <Link2 className="inline h-4 w-4 mr-1" />
                Linked Partner
              </label>
              <div className="flex gap-2 mt-1">
                <select
                  value={partnerId}
                  onChange={(e) => handlePartnerChange(e.target.value)}
                  className="flex-1 rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">No partner (Direct billing)</option>
                  {partners.map((partner) => (
                    <option key={partner.id} value={partner.id}>
                      {partner.code} - {partner.name}
                    </option>
                  ))}
                </select>
                {partnerId && (
                  <Button
                    variant="outline"
                    onClick={handleSyncFromPartner}
                    disabled={syncing}
                    title="Sync details from partner"
                  >
                    {syncing ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                  </Button>
                )}
              </div>
              {selectedPartner && (
                <p className="mt-1 text-xs text-gray-500">
                  Partner email: {selectedPartner.email || 'Not set'}
                </p>
              )}
            </div>

            {/* Recipient Details */}
            <div className="border-t pt-4">
              <h4 className="text-sm font-medium text-gray-700 mb-3">
                Invoice Recipient Details
              </h4>

              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    <Building2 className="inline h-4 w-4 mr-1" />
                    Customer Name (Invoice To)
                  </label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    <User className="inline h-4 w-4 mr-1" />
                    Attention (Contact Person)
                  </label>
                  <input
                    type="text"
                    value={attention}
                    onChange={(e) => setAttention(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    <Mail className="inline h-4 w-4 mr-1" />
                    Email Recipients
                  </label>
                  <MultiEmailInput
                    value={parseEmails(customerEmails)}
                    onChange={(emails) => setCustomerEmails(joinEmails(emails))}
                    placeholder="Enter email address"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    All emails will receive the invoice when sent
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    <MapPin className="inline h-4 w-4 mr-1" />
                    Address
                  </label>
                  <textarea
                    value={customerAddress}
                    onChange={(e) => setCustomerAddress(e.target.value)}
                    rows={2}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          {canEdit && (
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
