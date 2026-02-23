import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { convexClient, api } from '@/lib/convex';
import { clearSettingsCache } from '@/lib/settings';

// Default settings
const DEFAULT_SETTINGS = {
  // SOA Template Settings
  'soa.yowi.bankName': { value: 'BDO', category: 'soa', description: 'YOWI Bank Name' },
  'soa.yowi.bankAccountName': { value: 'YAHSHUA OUTSOURCING WORLDWIDE INC.', category: 'soa', description: 'YOWI Bank Account Name' },
  'soa.yowi.bankAccountNo': { value: '', category: 'soa', description: 'YOWI Bank Account Number' },
  'soa.abba.bankName': { value: 'BDO', category: 'soa', description: 'ABBA Bank Name' },
  'soa.abba.bankAccountName': { value: 'THE ABBA INITIATIVE OPC', category: 'soa', description: 'ABBA Bank Account Name' },
  'soa.abba.bankAccountNo': { value: '', category: 'soa', description: 'ABBA Bank Account Number' },
  'soa.footer': { value: 'Thank you for your business. Please include the invoice number in your payment reference.', category: 'soa', description: 'SOA Footer Text' },
  'soa.preparedBy': { value: 'VANESSA L. DONOSO', category: 'soa', description: 'Prepared By (default)' },
  'soa.reviewedBy': { value: 'RUTH MICHELLE C. BAYRON', category: 'soa', description: 'Reviewed By (default)' },

  // Scheduler Settings
  'scheduler.cronExpression': { value: '0 8 * * *', category: 'scheduler', description: 'Cron expression for billing runs (default: 8 AM daily)' },
  'scheduler.daysBeforeDue': { value: 15, category: 'scheduler', description: 'Generate invoices X days before due date' },

  // Email Settings
  'email.enabled': { value: true, category: 'email', description: 'Enable email sending' },
  'email.bccAddress': { value: '', category: 'email', description: 'BCC email address for all sent invoices' },
  'email.replyTo': { value: '', category: 'email', description: 'Reply-to email address' },

  // Tax Settings
  'tax.vatRate': { value: 0.12, category: 'tax', description: 'VAT Rate (decimal)' },
  'tax.withholdingPresets': { value: [
    { rate: 0.01, code: 'WC100', label: '1% - Services' },
    { rate: 0.02, code: 'WC160', label: '2% - Professional Services' },
    { rate: 0.05, code: 'WC058', label: '5% - Rentals' },
    { rate: 0.10, code: 'WC010', label: '10% - Professional Fees' },
  ], category: 'tax', description: 'Withholding Tax Presets' },
  'tax.defaultWithholdingRate': { value: 0.02, category: 'tax', description: 'Default Withholding Rate (decimal)' },
  'tax.defaultWithholdingCode': { value: 'WC160', category: 'tax', description: 'Default Withholding ATC Code' },
};

// GET - Fetch all settings
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get category filter from query params
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');

    // Fetch settings from database
    const dbSettings = await convexClient.query(api.settings.list, {});

    // Filter by category if specified
    const filteredDbSettings = category
      ? dbSettings.filter((s: any) => s.category === category)
      : dbSettings;

    // Merge with defaults (DB values override defaults)
    const settingsMap: Record<string, any> = {};

    // First, add all defaults
    for (const [key, config] of Object.entries(DEFAULT_SETTINGS)) {
      if (!category || config.category === category) {
        settingsMap[key] = {
          key,
          value: config.value,
          category: config.category,
          description: config.description,
          isDefault: true,
        };
      }
    }

    // Then override with DB values
    for (const setting of filteredDbSettings) {
      settingsMap[(setting as any).key] = {
        key: (setting as any).key,
        value: (setting as any).value,
        category: (setting as any).category,
        description: (setting as any).description,
        isDefault: false,
      };
    }

    return NextResponse.json({
      settings: Object.values(settingsMap),
    });
  } catch (error) {
    console.error('Error fetching settings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch settings' },
      { status: 500 }
    );
  }
}

// POST - Update settings
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admins can update settings
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { settings } = body;

    if (!settings || !Array.isArray(settings)) {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }

    // Upsert each setting
    const results = [];
    for (const setting of settings) {
      const { key, value } = setting;

      if (!key) continue;

      // Get default config for category and description
      const defaultConfig = DEFAULT_SETTINGS[key as keyof typeof DEFAULT_SETTINGS];
      const category = defaultConfig?.category || 'general';
      const description = defaultConfig?.description || '';

      const result = await convexClient.mutation(api.settings.upsert, {
        key,
        value,
        category,
        description,
      });

      results.push(result);
    }

    // Log the action
    await convexClient.mutation(api.auditLogs.create, {
      userId: session.user.id as any,
      action: 'SETTINGS_UPDATED',
      entityType: 'Settings',
      entityId: 'bulk',
      details: { updatedKeys: settings.map((s: any) => s.key) },
    });

    // Clear settings cache so new values take effect
    clearSettingsCache();

    // Check if scheduler settings were updated and reload if needed
    const schedulerSettingsUpdated = settings.some((s: any) =>
      s.key?.startsWith('scheduler.')
    );

    if (schedulerSettingsUpdated) {
      console.log('[Settings API] Scheduler settings changed, reloading scheduler...');
      // Dynamic import to avoid loading node-cron in serverless environment
      try {
        const { reloadScheduler } = await import('@/lib/scheduler');
        await reloadScheduler();
      } catch (e) {
        console.log('[Settings API] Scheduler reload skipped (serverless environment)');
      }
    }

    return NextResponse.json({
      success: true,
      updated: results.length,
    });
  } catch (error) {
    console.error('Error updating settings:', error);
    return NextResponse.json(
      { error: 'Failed to update settings' },
      { status: 500 }
    );
  }
}
