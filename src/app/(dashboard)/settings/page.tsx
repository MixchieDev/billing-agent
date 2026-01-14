'use client';

import { useState, useEffect } from 'react';
import { Header } from '@/components/dashboard/header';
import { Button } from '@/components/ui/button';
import { Save, Loader2, RefreshCw, Palette, Building2, Plus, Trash2, Percent } from 'lucide-react';
import { EmailTemplatesPage } from '@/components/dashboard/email-templates-page';

interface Setting {
  key: string;
  value: any;
  category: string;
  description: string;
  isDefault: boolean;
}

interface InvoiceTemplate {
  companyId: string;
  companyCode: string;
  companyName: string;
  // Branding
  primaryColor: string;
  secondaryColor: string;
  footerBgColor: string;
  logoPath?: string;
  invoiceTitle: string;
  footerText: string;
  showDisclaimer: boolean;
  notes?: string;
  // Bank details
  bankName: string;
  bankAccountName: string;
  bankAccountNo: string;
  // Invoice numbering
  invoicePrefix: string;
  nextInvoiceNo: number;
  // Signatories
  preparedBy: string;
  reviewedBy: string;
}

interface Company {
  id: string;
  code: string;
  name: string;
  address: string;
  contactNumber: string;
  tin: string;
  logoPath: string;
}

interface WithholdingPreset {
  rate: number;
  code: string;
  label: string;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('templates');

  // Template state
  const [yowiTemplate, setYowiTemplate] = useState<InvoiceTemplate | null>(null);
  const [abbaTemplate, setAbbaTemplate] = useState<InvoiceTemplate | null>(null);
  const [savingTemplate, setSavingTemplate] = useState<string | null>(null);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState<string | null>(null);

  // Companies state
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companiesLoading, setCompaniesLoading] = useState(false);
  const [companiesError, setCompaniesError] = useState<string | null>(null);
  const [savingCompany, setSavingCompany] = useState<string | null>(null);

  // Tax settings state
  const [vatRate, setVatRate] = useState<number>(0.12);
  const [withholdingPresets, setWithholdingPresets] = useState<WithholdingPreset[]>([]);
  const [defaultWithholdingRate, setDefaultWithholdingRate] = useState<number>(0.02);
  const [defaultWithholdingCode, setDefaultWithholdingCode] = useState<string>('WC160');
  const [newPreset, setNewPreset] = useState<WithholdingPreset>({ rate: 0, code: '', label: '' });
  const [savingTax, setSavingTax] = useState(false);

  // Fetch settings
  const fetchSettings = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/settings');
      if (!response.ok) throw new Error('Failed to fetch settings');

      const data = await response.json();
      setSettings(data.settings);

      // Load tax settings
      if (data['tax.vatRate'] !== undefined) {
        setVatRate(data['tax.vatRate']);
      }
      if (data['tax.withholdingPresets']) {
        setWithholdingPresets(data['tax.withholdingPresets']);
      }
      if (data['tax.defaultWithholdingRate'] !== undefined) {
        setDefaultWithholdingRate(data['tax.defaultWithholdingRate']);
      }
      if (data['tax.defaultWithholdingCode']) {
        setDefaultWithholdingCode(data['tax.defaultWithholdingCode']);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
    // Load templates immediately since it's the default tab
    fetchTemplates();
  }, []);

  // Fetch templates
  const fetchTemplates = async () => {
    try {
      setTemplatesLoading(true);
      setTemplatesError(null);

      const [yowiRes, abbaRes] = await Promise.all([
        fetch('/api/companies/YOWI/template'),
        fetch('/api/companies/ABBA/template'),
      ]);

      if (!yowiRes.ok || !abbaRes.ok) {
        const errorData = !yowiRes.ok ? await yowiRes.json() : await abbaRes.json();
        throw new Error(errorData.error || 'Failed to fetch templates');
      }

      const [yowiData, abbaData] = await Promise.all([
        yowiRes.json(),
        abbaRes.json(),
      ]);

      setYowiTemplate(yowiData);
      setAbbaTemplate(abbaData);
    } catch (err: any) {
      console.error('Error fetching templates:', err);
      setTemplatesError(err.message || 'Failed to load templates');
    } finally {
      setTemplatesLoading(false);
    }
  };

  // Fetch companies
  const fetchCompanies = async () => {
    try {
      setCompaniesLoading(true);
      setCompaniesError(null);

      const response = await fetch('/api/companies');
      if (!response.ok) throw new Error('Failed to fetch companies');

      const data = await response.json();
      setCompanies(data);
    } catch (err: any) {
      console.error('Error fetching companies:', err);
      setCompaniesError(err.message || 'Failed to load companies');
    } finally {
      setCompaniesLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'templates') {
      fetchTemplates();
    } else if (activeTab === 'companies') {
      fetchCompanies();
    }
  }, [activeTab]);

  // Save template (includes branding, bank details, and signatories)
  const saveTemplate = async (companyCode: 'YOWI' | 'ABBA') => {
    const template = companyCode === 'YOWI' ? yowiTemplate : abbaTemplate;
    if (!template) return;

    try {
      setSavingTemplate(companyCode);
      setError(null);
      setSuccess(null);

      const response = await fetch(`/api/companies/${companyCode}/template`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Branding
          primaryColor: template.primaryColor,
          secondaryColor: template.secondaryColor,
          footerBgColor: template.footerBgColor,
          invoiceTitle: template.invoiceTitle,
          footerText: template.footerText,
          showDisclaimer: template.showDisclaimer,
          notes: template.notes,
          // Bank details
          bankName: template.bankName,
          bankAccountName: template.bankAccountName,
          bankAccountNo: template.bankAccountNo,
          // Invoice numbering
          invoicePrefix: template.invoicePrefix,
          nextInvoiceNo: template.nextInvoiceNo,
          // Signatories
          preparedBy: template.preparedBy,
          reviewedBy: template.reviewedBy,
        }),
      });

      if (!response.ok) throw new Error('Failed to save template');

      setSuccess(`${companyCode} template saved successfully!`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSavingTemplate(null);
    }
  };

  // Update template field
  const updateTemplate = (companyCode: 'YOWI' | 'ABBA', field: keyof InvoiceTemplate, value: any) => {
    if (companyCode === 'YOWI' && yowiTemplate) {
      setYowiTemplate({ ...yowiTemplate, [field]: value });
    } else if (companyCode === 'ABBA' && abbaTemplate) {
      setAbbaTemplate({ ...abbaTemplate, [field]: value });
    }
    setSuccess(null);
  };

  // Update company field
  const updateCompany = (companyCode: string, field: keyof Company, value: any) => {
    setCompanies((prev) =>
      prev.map((c) => (c.code === companyCode ? { ...c, [field]: value } : c))
    );
    setSuccess(null);
  };

  // Save company
  const saveCompany = async (companyCode: string) => {
    const company = companies.find((c) => c.code === companyCode);
    if (!company) return;

    try {
      setSavingCompany(companyCode);
      setError(null);
      setSuccess(null);

      const response = await fetch(`/api/companies/${companyCode}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: company.name,
          address: company.address,
          contactNumber: company.contactNumber,
          tin: company.tin,
          logoPath: company.logoPath,
        }),
      });

      if (!response.ok) throw new Error('Failed to save company');

      setSuccess(`${companyCode} company details saved successfully!`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSavingCompany(null);
    }
  };

  // Add a new withholding preset
  const addWithholdingPreset = () => {
    if (!newPreset.rate || !newPreset.code || !newPreset.label) {
      setError('Please fill in all preset fields');
      return;
    }

    // Check for duplicate rate/code
    if (withholdingPresets.some(p => p.rate === newPreset.rate && p.code === newPreset.code)) {
      setError('A preset with this rate and code already exists');
      return;
    }

    setWithholdingPresets([...withholdingPresets, { ...newPreset }]);
    setNewPreset({ rate: 0, code: '', label: '' });
    setSuccess(null);
  };

  // Remove a withholding preset
  const removeWithholdingPreset = (index: number) => {
    setWithholdingPresets(prev => prev.filter((_, i) => i !== index));
    setSuccess(null);
  };

  // Save tax settings
  const saveTaxSettings = async () => {
    try {
      setSavingTax(true);
      setError(null);
      setSuccess(null);

      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: [
            { key: 'tax.vatRate', value: vatRate },
            { key: 'tax.withholdingPresets', value: withholdingPresets },
            { key: 'tax.defaultWithholdingRate', value: defaultWithholdingRate },
            { key: 'tax.defaultWithholdingCode', value: defaultWithholdingCode },
          ],
        }),
      });

      if (!response.ok) throw new Error('Failed to save tax settings');

      setSuccess('Tax settings saved successfully!');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSavingTax(false);
    }
  };

  // Update a setting value locally
  const updateSetting = (key: string, value: any) => {
    setSettings((prev) =>
      prev.map((s) => (s.key === key ? { ...s, value, isDefault: false } : s))
    );
    setSuccess(null);
  };

  // Save settings
  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: settings.map((s) => ({ key: s.key, value: s.value })),
        }),
      });

      if (!response.ok) throw new Error('Failed to save settings');

      setSuccess('Settings saved successfully!');
      await fetchSettings();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Filter settings by category
  const filteredSettings = settings.filter((s) => s.category === activeTab);

  const renderInput = (setting: Setting) => {
    const isBoolean = typeof setting.value === 'boolean';
    const isNumber = typeof setting.value === 'number';

    if (isBoolean) {
      return (
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={setting.value}
            onChange={(e) => updateSetting(setting.key, e.target.checked)}
            className="h-4 w-4 rounded border-gray-300"
          />
          <span className="text-sm text-gray-600">Enabled</span>
        </label>
      );
    }

    if (isNumber) {
      return (
        <input
          type="number"
          value={setting.value}
          onChange={(e) => updateSetting(setting.key, parseFloat(e.target.value) || 0)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          step={setting.key.includes('Rate') ? '0.01' : '1'}
        />
      );
    }

    // Text input
    return (
      <input
        type="text"
        value={setting.value || ''}
        onChange={(e) => updateSetting(setting.key, e.target.value)}
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        placeholder={setting.isDefault ? '(using default)' : ''}
      />
    );
  };

  const renderSettingRow = (setting: Setting) => {
    const label = setting.key.split('.').pop()?.replace(/([A-Z])/g, ' $1').trim() || setting.key;

    return (
      <div key={setting.key} className="grid grid-cols-3 gap-4 items-start py-3 border-b last:border-0">
        <div>
          <label className="text-sm font-medium text-gray-700 capitalize">{label}</label>
          <p className="text-xs text-gray-500 mt-0.5">{setting.description}</p>
        </div>
        <div className="col-span-2">{renderInput(setting)}</div>
      </div>
    );
  };

  const tabs = [
    { id: 'templates', label: 'Invoice Templates' },
    { id: 'companies', label: 'Companies' },
    { id: 'tax', label: 'Tax' },
    { id: 'scheduler', label: 'Scheduler' },
    { id: 'email', label: 'Email Templates' },
  ];

  // Render template editor card
  const renderTemplateEditor = (template: InvoiceTemplate | null, companyCode: 'YOWI' | 'ABBA') => {
    if (!template) {
      return (
        <div className="flex items-center justify-center py-8 text-gray-500">
          No template data available
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {/* Live Preview */}
        <div
          className="border rounded-lg overflow-hidden"
          style={{ minHeight: '280px' }}
        >
          {/* Header preview */}
          <div className="p-4 bg-white border-b">
            <div className="flex justify-between items-start">
              <div>
                <div className="w-12 h-12 bg-gray-200 rounded flex items-center justify-center text-xs text-gray-500 mb-2">
                  Logo
                </div>
                <h3
                  className="text-lg font-bold"
                  style={{ color: template.primaryColor }}
                >
                  {template.invoiceTitle.toUpperCase()}
                </h3>
              </div>
              <div className="text-right text-sm text-gray-600">
                <div className="font-semibold">{template.companyName}</div>
                <div className="text-xs text-gray-400 mt-1">Company Address</div>
                <div className="text-xs text-gray-400">TIN: xxx-xxx-xxx</div>
              </div>
            </div>
          </div>

          {/* Table header preview */}
          <div
            className="px-4 py-2 text-xs font-semibold text-white flex gap-4"
            style={{ backgroundColor: template.secondaryColor }}
          >
            <span className="w-8">#</span>
            <span className="flex-1">DESCRIPTION</span>
            <span className="w-12">QTY</span>
            <span className="w-20">PRICE</span>
            <span className="w-12">TAX</span>
            <span className="w-20">AMOUNT</span>
          </div>

          {/* Sample row */}
          <div className="px-4 py-2 text-xs flex gap-4 border-b bg-gray-50">
            <span className="w-8 text-gray-400">1</span>
            <span className="flex-1">Professional Services</span>
            <span className="w-12">1</span>
            <span className="w-20">PHP 10,000</span>
            <span className="w-12">12%</span>
            <span className="w-20">PHP 11,200</span>
          </div>

          {/* Totals preview */}
          <div className="p-4 flex justify-between items-end">
            <div className="text-xs text-gray-500">
              <div className="font-medium text-gray-700 mb-1">Payment Details</div>
              <div>Bank: {template.bankName || 'BDO'}</div>
              <div>Account: {template.bankAccountNo || 'xxxxxxxxxx'}</div>
              {template.notes && (
                <div className="mt-2 text-gray-400 italic whitespace-pre-line">
                  {template.notes}
                </div>
              )}
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-500 mb-1">Subtotal: PHP 10,000.00</div>
              <div className="text-xs text-gray-500 mb-1">VAT (12%): PHP 1,200.00</div>
              <div
                className="text-lg font-bold"
                style={{ color: template.primaryColor }}
              >
                PHP 11,200.00
              </div>
            </div>
          </div>

          {/* Footer preview */}
          <div
            className="px-4 py-3 text-center"
            style={{ backgroundColor: template.footerBgColor }}
          >
            <div
              className="text-sm font-semibold"
              style={{ color: template.secondaryColor }}
            >
              {template.footerText}
            </div>
            {template.showDisclaimer && (
              <div className="text-xs text-gray-500 mt-1">
                **This is a system-generated document**
              </div>
            )}
          </div>
        </div>

        {/* Color Pickers */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Primary Color
            </label>
            <div className="flex gap-2">
              <input
                type="color"
                value={template.primaryColor}
                onChange={(e) => updateTemplate(companyCode, 'primaryColor', e.target.value)}
                className="h-10 w-14 rounded cursor-pointer"
              />
              <input
                type="text"
                value={template.primaryColor}
                onChange={(e) => updateTemplate(companyCode, 'primaryColor', e.target.value)}
                className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Secondary Color
            </label>
            <div className="flex gap-2">
              <input
                type="color"
                value={template.secondaryColor}
                onChange={(e) => updateTemplate(companyCode, 'secondaryColor', e.target.value)}
                className="h-10 w-14 rounded cursor-pointer"
              />
              <input
                type="text"
                value={template.secondaryColor}
                onChange={(e) => updateTemplate(companyCode, 'secondaryColor', e.target.value)}
                className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Footer Background
            </label>
            <div className="flex gap-2">
              <input
                type="color"
                value={template.footerBgColor}
                onChange={(e) => updateTemplate(companyCode, 'footerBgColor', e.target.value)}
                className="h-10 w-14 rounded cursor-pointer"
              />
              <input
                type="text"
                value={template.footerBgColor}
                onChange={(e) => updateTemplate(companyCode, 'footerBgColor', e.target.value)}
                className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
        </div>

        {/* Text Fields */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Invoice Title
            </label>
            <input
              type="text"
              value={template.invoiceTitle}
              onChange={(e) => updateTemplate(companyCode, 'invoiceTitle', e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              placeholder="Invoice"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Footer Text
            </label>
            <input
              type="text"
              value={template.footerText}
              onChange={(e) => updateTemplate(companyCode, 'footerText', e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              placeholder="Powered by: YAHSHUA"
            />
          </div>
        </div>

        {/* Show Disclaimer Toggle */}
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id={`disclaimer-${companyCode}`}
            checked={template.showDisclaimer}
            onChange={(e) => updateTemplate(companyCode, 'showDisclaimer', e.target.checked)}
            className="h-4 w-4 rounded border-gray-300"
          />
          <label htmlFor={`disclaimer-${companyCode}`} className="text-sm text-gray-700">
            Show system-generated document disclaimer
          </label>
        </div>

        {/* Notes Field */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Invoice Notes
          </label>
          <textarea
            value={template.notes || ''}
            onChange={(e) => updateTemplate(companyCode, 'notes', e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            rows={3}
            placeholder="Optional notes to display on the invoice (e.g., payment instructions, terms)"
          />
          <p className="text-xs text-gray-500 mt-1">
            This text will appear in the payment details section of the invoice
          </p>
        </div>

        {/* Bank Details Section */}
        <div className="pt-4 border-t">
          <h4 className="text-sm font-semibold text-gray-900 mb-3">Payment Details</h4>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Bank Name
              </label>
              <input
                type="text"
                value={template.bankName}
                onChange={(e) => updateTemplate(companyCode, 'bankName', e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                placeholder="BDO"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Account Name
              </label>
              <input
                type="text"
                value={template.bankAccountName}
                onChange={(e) => updateTemplate(companyCode, 'bankAccountName', e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                placeholder="Company Name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Account Number
              </label>
              <input
                type="text"
                value={template.bankAccountNo}
                onChange={(e) => updateTemplate(companyCode, 'bankAccountNo', e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                placeholder="xxxx-xxxx-xxxx"
              />
            </div>
          </div>
        </div>

        {/* Invoice Numbering Section */}
        <div className="pt-4 border-t">
          <h4 className="text-sm font-semibold text-gray-900 mb-3">Invoice Numbering</h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Invoice Prefix
              </label>
              <input
                type="text"
                value={template.invoicePrefix}
                onChange={(e) => updateTemplate(companyCode, 'invoicePrefix', e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                placeholder="S"
              />
              <p className="text-xs text-gray-500 mt-1">
                Prefix for invoice numbers (e.g., "S" → S-00001)
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Next Invoice #
              </label>
              <input
                type="number"
                value={template.nextInvoiceNo}
                onChange={(e) => updateTemplate(companyCode, 'nextInvoiceNo', parseInt(e.target.value) || 1)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                min="1"
              />
              <p className="text-xs text-gray-500 mt-1">
                Next number to be used for new invoices
              </p>
            </div>
          </div>
        </div>

        {/* Signatories Section */}
        <div className="pt-4 border-t">
          <h4 className="text-sm font-semibold text-gray-900 mb-3">Signatories</h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Prepared By
              </label>
              <input
                type="text"
                value={template.preparedBy}
                onChange={(e) => updateTemplate(companyCode, 'preparedBy', e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                placeholder="Name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reviewed By
              </label>
              <input
                type="text"
                value={template.reviewedBy}
                onChange={(e) => updateTemplate(companyCode, 'reviewedBy', e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                placeholder="Name"
              />
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="pt-4 border-t">
          <Button
            onClick={() => saveTemplate(companyCode)}
            disabled={savingTemplate === companyCode}
          >
            {savingTemplate === companyCode ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save {companyCode} Template
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col">
      <Header title="Settings" subtitle="Configure billing system settings" />

      <div className="flex-1 p-6">
        {/* Error/Success messages */}
        {error && (
          <div className="mb-4 rounded-md bg-red-50 p-4 text-red-700">{error}</div>
        )}
        {success && (
          <div className="mb-4 rounded-md bg-green-50 p-4 text-green-700">{success}</div>
        )}

        {/* Tabs */}
        <div className="mb-6 border-b">
          <nav className="flex gap-4">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="bg-white rounded-lg border p-6">
            {/* Templates Tab */}
            {activeTab === 'templates' && (
              <div className="space-y-8">
                {templatesLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                  </div>
                ) : templatesError ? (
                  <div className="rounded-md bg-red-50 p-4 text-red-700">
                    <p className="font-medium">Error loading templates</p>
                    <p className="text-sm mt-1">{templatesError}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={fetchTemplates}
                    >
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Retry
                    </Button>
                  </div>
                ) : (
                  <>
                    {/* YOWI Template */}
                    <div>
                      <div className="flex items-center gap-2 mb-4 pb-2 border-b">
                        <Palette className="h-5 w-5 text-blue-600" />
                        <h3 className="text-lg font-semibold text-gray-900">
                          YOWI Invoice Template
                        </h3>
                      </div>
                      {renderTemplateEditor(yowiTemplate, 'YOWI')}
                    </div>

                    {/* ABBA Template */}
                    <div>
                      <div className="flex items-center gap-2 mb-4 pb-2 border-b">
                        <Palette className="h-5 w-5 text-green-600" />
                        <h3 className="text-lg font-semibold text-gray-900">
                          ABBA Invoice Template
                        </h3>
                      </div>
                      {renderTemplateEditor(abbaTemplate, 'ABBA')}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Companies Tab */}
            {activeTab === 'companies' && (
              <div className="space-y-8">
                {companiesLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                  </div>
                ) : companiesError ? (
                  <div className="rounded-md bg-red-50 p-4 text-red-700">
                    <p className="font-medium">Error loading companies</p>
                    <p className="text-sm mt-1">{companiesError}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={fetchCompanies}
                    >
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Retry
                    </Button>
                  </div>
                ) : (
                  <>
                    {companies.map((company) => (
                      <div key={company.code}>
                        <div className="flex items-center gap-2 mb-4 pb-2 border-b">
                          <Building2 className={`h-5 w-5 ${company.code === 'YOWI' ? 'text-blue-600' : 'text-green-600'}`} />
                          <h3 className="text-lg font-semibold text-gray-900">
                            {company.code} Company Details
                          </h3>
                        </div>
                        <div className="space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Company Name
                              </label>
                              <input
                                type="text"
                                value={company.name}
                                onChange={(e) => updateCompany(company.code, 'name', e.target.value)}
                                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                TIN
                              </label>
                              <input
                                type="text"
                                value={company.tin || ''}
                                onChange={(e) => updateCompany(company.code, 'tin', e.target.value)}
                                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                                placeholder="xxx-xxx-xxx-xxx"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Address
                            </label>
                            <textarea
                              value={company.address || ''}
                              onChange={(e) => updateCompany(company.code, 'address', e.target.value)}
                              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                              rows={2}
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Contact Number
                              </label>
                              <input
                                type="text"
                                value={company.contactNumber || ''}
                                onChange={(e) => updateCompany(company.code, 'contactNumber', e.target.value)}
                                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Logo Path
                              </label>
                              <input
                                type="text"
                                value={company.logoPath || ''}
                                onChange={(e) => updateCompany(company.code, 'logoPath', e.target.value)}
                                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                                placeholder="/assets/logo.png"
                              />
                            </div>
                          </div>
                          <div className="pt-4 border-t">
                            <Button
                              onClick={() => saveCompany(company.code)}
                              disabled={savingCompany === company.code}
                            >
                              {savingCompany === company.code ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <Save className="mr-2 h-4 w-4" />
                              )}
                              Save {company.code} Details
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}

            {/* Tax Tab */}
            {activeTab === 'tax' && (
              <div className="space-y-6">
                {/* VAT Rate Section */}
                <div>
                  <div className="flex items-center gap-2 mb-4 pb-2 border-b">
                    <Percent className="h-5 w-5 text-blue-600" />
                    <h3 className="text-lg font-semibold text-gray-900">
                      VAT Rate
                    </h3>
                  </div>
                  <div className="flex items-center gap-4 p-4 rounded-lg border border-gray-200 bg-gray-50">
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Value Added Tax Rate
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={(vatRate * 100).toFixed(0)}
                          onChange={(e) => setVatRate(parseFloat(e.target.value) / 100 || 0)}
                          className="w-24 rounded-md border border-gray-300 px-3 py-2 text-sm"
                          step="1"
                          min="0"
                          max="100"
                        />
                        <span className="text-gray-500">%</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Applied to VAT-registered clients (default: 12%)
                      </p>
                    </div>
                  </div>
                </div>

                {/* Withholding Tax Section */}
                <div>
                  <div className="flex items-center gap-2 mb-4 pb-2 border-b">
                    <Percent className="h-5 w-5 text-orange-600" />
                    <h3 className="text-lg font-semibold text-gray-900">
                      Withholding Tax Presets
                    </h3>
                  </div>

                  {/* Existing Presets */}
                  <div className="space-y-3">
                    {withholdingPresets.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        No withholding tax presets configured. Add one below.
                      </div>
                    ) : (
                      withholdingPresets.map((preset, index) => (
                        <div
                          key={`${preset.rate}-${preset.code}`}
                          className={`flex items-center justify-between p-4 rounded-lg border ${
                            defaultWithholdingRate === preset.rate && defaultWithholdingCode === preset.code
                              ? 'border-orange-300 bg-orange-50'
                              : 'border-gray-200 bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center gap-4">
                            <div className="text-2xl font-bold text-gray-900">
                              {(preset.rate * 100).toFixed(0)}%
                            </div>
                            <div>
                              <div className="font-medium text-gray-900">{preset.label}</div>
                              <div className="text-sm text-gray-500">ATC Code: {preset.code}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setDefaultWithholdingRate(preset.rate);
                                setDefaultWithholdingCode(preset.code);
                              }}
                              disabled={defaultWithholdingRate === preset.rate && defaultWithholdingCode === preset.code}
                            >
                              {defaultWithholdingRate === preset.rate && defaultWithholdingCode === preset.code
                                ? 'Default'
                                : 'Set as Default'}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => removeWithholdingPreset(index)}
                              className="text-red-600 hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Add New Preset */}
                  <div className="pt-4 border-t mt-4">
                    <h4 className="text-sm font-semibold text-gray-900 mb-3">Add New Preset</h4>
                    <div className="grid grid-cols-4 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Rate (%)
                        </label>
                        <input
                          type="number"
                          value={newPreset.rate ? (newPreset.rate * 100).toString() : ''}
                          onChange={(e) => setNewPreset({ ...newPreset, rate: parseFloat(e.target.value) / 100 || 0 })}
                          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                          placeholder="e.g., 2"
                          step="0.5"
                          min="0"
                          max="100"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          ATC Code
                        </label>
                        <input
                          type="text"
                          value={newPreset.code}
                          onChange={(e) => setNewPreset({ ...newPreset, code: e.target.value.toUpperCase() })}
                          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                          placeholder="e.g., WC160"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Label
                        </label>
                        <input
                          type="text"
                          value={newPreset.label}
                          onChange={(e) => setNewPreset({ ...newPreset, label: e.target.value })}
                          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                          placeholder="e.g., 2% - Professional Services"
                        />
                      </div>
                      <div className="flex items-end">
                        <Button onClick={addWithholdingPreset} className="w-full">
                          <Plus className="mr-2 h-4 w-4" />
                          Add Preset
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Save Button */}
                <div className="pt-4 border-t flex justify-end">
                  <Button onClick={saveTaxSettings} disabled={savingTax}>
                    {savingTax ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    Save Tax Settings
                  </Button>
                </div>
              </div>
            )}

            {/* Email Templates Tab */}
            {activeTab === 'email' && (
              <EmailTemplatesPage />
            )}

            {/* Scheduler Tab */}
            {activeTab === 'scheduler' && (
              <div className="space-y-1">
                {filteredSettings
                  .filter(s => s.key !== 'scheduler.enabled')
                  .map(renderSettingRow)}
              </div>
            )}

            {/* Save Button - only for scheduler tab */}
            {activeTab === 'scheduler' && (
              <div className="mt-8 pt-6 border-t flex justify-end gap-3">
                <Button variant="outline" onClick={fetchSettings} disabled={loading}>
                  <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                  Reset
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Save Settings
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
