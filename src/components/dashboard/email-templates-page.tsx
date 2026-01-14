'use client';

import { useState, useEffect } from 'react';
import { RefreshCw, Plus, Edit, Trash2, Star, Mail, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Partner {
  id: string;
  code: string;
  name: string;
}

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  greeting: string;
  body: string;
  closing: string;
  isDefault: boolean;
  partners: Partner[];
  createdAt: string;
  updatedAt: string;
}

const PLACEHOLDERS = [
  { key: '{{customerName}}', desc: 'Invoice recipient (e.g., Innove Communications)' },
  { key: '{{clientCompanyName}}', desc: 'Client company name (from contract)' },
  { key: '{{billingNo}}', desc: 'Invoice number' },
  { key: '{{dueDate}}', desc: 'Due date' },
  { key: '{{totalAmount}}', desc: 'Total amount' },
  { key: '{{periodStart}}', desc: 'Period start' },
  { key: '{{periodEnd}}', desc: 'Period end' },
  { key: '{{companyName}}', desc: 'Your company (YOWI/ABBA)' },
];

export function EmailTemplatesPage() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    subject: '',
    greeting: '',
    body: '',
    closing: '',
    isDefault: false,
  });

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/email-templates');
      if (!res.ok) throw new Error('Failed to fetch templates');
      const data = await res.json();
      setTemplates(data);
      setError(null);
    } catch (err) {
      setError('Failed to load email templates');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const handleCreate = () => {
    setFormData({
      name: '',
      subject: 'Billing Statement - {{billingNo}}',
      greeting: 'A blessed day, Beloved Client!',
      body: 'Please find attached the billing statement for {{customerName}}.\n\nInvoice Number: {{billingNo}}\nBilling Period: {{periodStart}} to {{periodEnd}}\nTotal Amount Due: {{totalAmount}}\nDue Date: {{dueDate}}',
      closing: 'Thank you and God bless!\n\nBest regards,\n{{companyName}} Billing Team',
      isDefault: false,
    });
    setIsCreating(true);
    setEditingTemplate(null);
  };

  const handleEdit = (template: EmailTemplate) => {
    setFormData({
      name: template.name,
      subject: template.subject,
      greeting: template.greeting,
      body: template.body,
      closing: template.closing,
      isDefault: template.isDefault,
    });
    setEditingTemplate(template);
    setIsCreating(false);
  };

  const handleCancel = () => {
    setEditingTemplate(null);
    setIsCreating(false);
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      if (isCreating) {
        const res = await fetch('/api/email-templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to create template');
        }
      } else if (editingTemplate) {
        const res = await fetch(`/api/email-templates/${editingTemplate.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to update template');
        }
      }

      await fetchTemplates();
      handleCancel();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (template: EmailTemplate) => {
    if (!confirm(`Delete template "${template.name}"?`)) return;

    try {
      const res = await fetch(`/api/email-templates/${template.id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete template');
      }

      await fetchTemplates();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-red-600">{error}</p>
        <Button onClick={fetchTemplates} className="mt-4">
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  // Show form for creating/editing
  if (isCreating || editingTemplate) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">
            {isCreating ? 'Create Email Template' : 'Edit Email Template'}
          </h2>
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
        </div>

        <div className="bg-white rounded-lg border p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Template Name
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., Globe Innove Template"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email Subject
            </label>
            <input
              type="text"
              value={formData.subject}
              onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Billing Statement - {{billingNo}}"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Greeting
            </label>
            <textarea
              value={formData.greeting}
              onChange={(e) => setFormData({ ...formData, greeting: e.target.value })}
              rows={2}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="A blessed day, Beloved Client!"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Body
            </label>
            <textarea
              value={formData.body}
              onChange={(e) => setFormData({ ...formData, body: e.target.value })}
              rows={8}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
              placeholder="Main email content..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Closing
            </label>
            <textarea
              value={formData.closing}
              onChange={(e) => setFormData({ ...formData, closing: e.target.value })}
              rows={4}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Thank you and God bless!"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isDefault"
              checked={formData.isDefault}
              onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })}
              className="rounded border-gray-300"
            />
            <label htmlFor="isDefault" className="text-sm text-gray-700">
              Set as Default Template
            </label>
          </div>

          {/* Placeholders Reference */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Available Placeholders</h4>
            <div className="flex flex-wrap gap-2">
              {PLACEHOLDERS.map((p) => (
                <span
                  key={p.key}
                  className="inline-flex items-center px-2 py-1 bg-white rounded border text-xs font-mono cursor-pointer hover:bg-blue-50"
                  onClick={() => navigator.clipboard.writeText(p.key)}
                  title={`${p.desc} - Click to copy`}
                >
                  {p.key}
                </span>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-2">Click a placeholder to copy it</p>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !formData.name}>
              {saving ? 'Saving...' : isCreating ? 'Create Template' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Show template list
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Email Templates</h2>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchTemplates}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-2" />
            New Template
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {templates.map((template) => (
          <div
            key={template.id}
            className="bg-white rounded-lg border p-4 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-blue-600" />
                <h3 className="font-semibold text-gray-900">{template.name}</h3>
              </div>
              {template.isDefault && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-yellow-100 text-yellow-800 text-xs font-medium rounded">
                  <Star className="h-3 w-3" />
                  Default
                </span>
              )}
            </div>

            <div className="space-y-2 mb-4">
              <div className="text-sm">
                <span className="text-gray-500">Subject:</span>
                <p className="text-gray-700 truncate">{template.subject}</p>
              </div>

              {template.partners.length > 0 && (
                <div className="flex items-center gap-1 text-sm text-gray-600">
                  <Users className="h-4 w-4" />
                  <span>
                    Assigned to: {template.partners.map((p) => p.name).join(', ')}
                  </span>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleEdit(template)}
              >
                <Edit className="h-4 w-4 mr-1" />
                Edit
              </Button>
              {!template.isDefault && template.partners.length === 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDelete(template)}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Delete
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      {templates.length === 0 && (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <Mail className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">No email templates found</p>
          <Button className="mt-4" onClick={handleCreate}>
            Create Your First Template
          </Button>
        </div>
      )}
    </div>
  );
}
