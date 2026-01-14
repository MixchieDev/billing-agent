'use client';

import { useState, useEffect } from 'react';
import { RefreshCw, Edit, Building2, Mail, MapPin, User, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface EmailTemplate {
  id: string;
  name: string;
  isDefault: boolean;
}

interface Partner {
  id: string;
  code: string;
  name: string;
  invoiceTo: string | null;
  attention: string | null;
  address: string | null;
  email: string | null;
  emails: string | null;  // Comma-separated list of emails
  billingModel: string;
  companyId: string;
  emailTemplateId: string | null;
  company: {
    id: string;
    code: string;
    name: string;
  };
  emailTemplate?: EmailTemplate | null;
}

interface Company {
  id: string;
  code: string;
  name: string;
}

export function PartnersPage() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingPartner, setEditingPartner] = useState<Partner | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchPartners = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/partners');
      if (!res.ok) throw new Error('Failed to fetch partners');
      const data = await res.json();
      setPartners(data);
      setError(null);
    } catch (err) {
      setError('Failed to load partners');
    } finally {
      setLoading(false);
    }
  };

  const fetchCompanies = async () => {
    try {
      const res = await fetch('/api/companies');
      if (!res.ok) throw new Error('Failed to fetch companies');
      const data = await res.json();
      setCompanies(data);
    } catch (err) {
      console.error('Failed to load companies');
    }
  };

  const fetchEmailTemplates = async () => {
    try {
      const res = await fetch('/api/email-templates');
      if (!res.ok) throw new Error('Failed to fetch email templates');
      const data = await res.json();
      setEmailTemplates(data);
    } catch (err) {
      console.error('Failed to load email templates');
    }
  };

  useEffect(() => {
    fetchPartners();
    fetchCompanies();
    fetchEmailTemplates();
  }, []);

  const handleSave = async () => {
    if (!editingPartner) return;

    try {
      setSaving(true);
      const res = await fetch(`/api/partners/${editingPartner.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingPartner),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save');
      }

      await fetchPartners();
      setEditingPartner(null);
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const getBillingModelLabel = (model: string) => {
    switch (model) {
      case 'DIRECT':
        return 'Direct';
      case 'GLOBE_INNOVE':
        return 'Globe Innove';
      case 'RCBC_CONSOLIDATED':
        return 'RCBC Consolidated';
      default:
        return model;
    }
  };

  if (loading && partners.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error && partners.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-red-500">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Partners</h2>
          <p className="text-sm text-gray-500">
            Manage billing partners and their contact information
          </p>
        </div>
        <Button variant="outline" onClick={fetchPartners} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Partners Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {partners.map((partner) => (
          <div
            key={partner.id}
            className="rounded-lg border bg-white p-5 shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between">
              <div>
                <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
                  {partner.code}
                </span>
                <h3 className="mt-2 font-semibold text-gray-900">{partner.name}</h3>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditingPartner(partner)}
              >
                <Edit className="h-4 w-4" />
              </Button>
            </div>

            <div className="mt-4 space-y-2 text-sm">
              {partner.invoiceTo && (
                <div className="flex items-start gap-2 text-gray-600">
                  <Building2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>{partner.invoiceTo}</span>
                </div>
              )}
              {partner.attention && (
                <div className="flex items-start gap-2 text-gray-600">
                  <User className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>{partner.attention}</span>
                </div>
              )}
              {(partner.emails || partner.email) && (
                <div className="flex items-start gap-2 text-gray-600">
                  <Mail className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span className="break-all">{partner.emails || partner.email}</span>
                </div>
              )}
              {partner.address && (
                <div className="flex items-start gap-2 text-gray-600">
                  <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span className="line-clamp-2">{partner.address}</span>
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-col gap-2 border-t pt-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">
                  {getBillingModelLabel(partner.billingModel)}
                </span>
                <span className="text-xs text-gray-500">
                  {partner.company?.code}
                </span>
              </div>
              {partner.emailTemplate && (
                <div className="flex items-center gap-1 text-xs text-blue-600">
                  <FileText className="h-3 w-3" />
                  <span>{partner.emailTemplate.name}</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Edit Modal */}
      {editingPartner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">
              Edit Partner: {editingPartner.code}
            </h3>

            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Name
                </label>
                <input
                  type="text"
                  value={editingPartner.name}
                  onChange={(e) =>
                    setEditingPartner({ ...editingPartner, name: e.target.value })
                  }
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Invoice To (Company Name)
                </label>
                <input
                  type="text"
                  value={editingPartner.invoiceTo || ''}
                  onChange={(e) =>
                    setEditingPartner({ ...editingPartner, invoiceTo: e.target.value })
                  }
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Attention (Contact Person)
                </label>
                <input
                  type="text"
                  value={editingPartner.attention || ''}
                  onChange={(e) =>
                    setEditingPartner({ ...editingPartner, attention: e.target.value })
                  }
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Email(s)
                </label>
                <textarea
                  value={editingPartner.emails || editingPartner.email || ''}
                  onChange={(e) =>
                    setEditingPartner({
                      ...editingPartner,
                      emails: e.target.value,
                      email: e.target.value.split(',')[0]?.trim() || null
                    })
                  }
                  rows={2}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="billing@example.com, accounts@example.com"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Separate multiple emails with commas
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Address
                </label>
                <textarea
                  value={editingPartner.address || ''}
                  onChange={(e) =>
                    setEditingPartner({ ...editingPartner, address: e.target.value })
                  }
                  rows={2}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Billing Entity
                </label>
                <select
                  value={editingPartner.companyId}
                  onChange={(e) =>
                    setEditingPartner({ ...editingPartner, companyId: e.target.value })
                  }
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.code} - {company.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Billing Model
                </label>
                <select
                  value={editingPartner.billingModel}
                  onChange={(e) =>
                    setEditingPartner({ ...editingPartner, billingModel: e.target.value })
                  }
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="DIRECT">Direct</option>
                  <option value="GLOBE_INNOVE">Globe Innove</option>
                  <option value="RCBC_CONSOLIDATED">RCBC Consolidated</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Email Template
                </label>
                <select
                  value={editingPartner.emailTemplateId || ''}
                  onChange={(e) =>
                    setEditingPartner({ ...editingPartner, emailTemplateId: e.target.value || null })
                  }
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Use Default Template</option>
                  {emailTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name} {template.isDefault ? '(Default)' : ''}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  Select a custom email template for invoices sent to this partner
                </p>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setEditingPartner(null)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
