'use client';

import { useState, useEffect } from 'react';
import { Header } from '@/components/dashboard/header';
import { Button } from '@/components/ui/button';
import { Save, Loader2, RefreshCw } from 'lucide-react';

interface Setting {
  key: string;
  value: any;
  category: string;
  description: string;
  isDefault: boolean;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('soa');

  // Fetch settings
  const fetchSettings = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/settings');
      if (!response.ok) throw new Error('Failed to fetch settings');

      const data = await response.json();
      setSettings(data.settings);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

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

  // Group settings by prefix for SOA tab
  const groupedSettings = () => {
    if (activeTab === 'soa') {
      const yowiSettings = filteredSettings.filter((s) => s.key.includes('.yowi.'));
      const abbaSettings = filteredSettings.filter((s) => s.key.includes('.abba.'));
      const otherSettings = filteredSettings.filter(
        (s) => !s.key.includes('.yowi.') && !s.key.includes('.abba.')
      );
      return { yowi: yowiSettings, abba: abbaSettings, other: otherSettings };
    }
    return null;
  };

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
    { id: 'soa', label: 'SOA Template' },
    { id: 'scheduler', label: 'Scheduler' },
    { id: 'email', label: 'Email' },
    { id: 'general', label: 'General' },
  ];

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
            {/* SOA Tab - Grouped by company */}
            {activeTab === 'soa' && (
              <div className="space-y-8">
                {/* YOWI Settings */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b">
                    YOWI Bank Details
                  </h3>
                  <div className="space-y-1">
                    {groupedSettings()?.yowi.map(renderSettingRow)}
                  </div>
                </div>

                {/* ABBA Settings */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b">
                    ABBA Bank Details
                  </h3>
                  <div className="space-y-1">
                    {groupedSettings()?.abba.map(renderSettingRow)}
                  </div>
                </div>

                {/* Other SOA Settings */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b">
                    Document Settings
                  </h3>
                  <div className="space-y-1">
                    {groupedSettings()?.other.map(renderSettingRow)}
                  </div>
                </div>
              </div>
            )}

            {/* Other Tabs */}
            {activeTab !== 'soa' && (
              <div className="space-y-1">
                {filteredSettings.map(renderSettingRow)}
              </div>
            )}

            {/* Save Button */}
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
          </div>
        )}
      </div>
    </div>
  );
}
