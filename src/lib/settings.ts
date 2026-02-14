import prisma from './prisma';

// Default settings values
const DEFAULTS: Record<string, any> = {
  // SOA Template Settings
  'soa.yowi.bankName': 'BDO',
  'soa.yowi.bankAccountName': 'YAHSHUA OUTSOURCING WORLDWIDE INC.',
  'soa.yowi.bankAccountNo': '',
  'soa.abba.bankName': 'BDO',
  'soa.abba.bankAccountName': 'THE ABBA INITIATIVE OPC',
  'soa.abba.bankAccountNo': '',
  'soa.footer': 'Thank you for your business. Please include the invoice number in your payment reference.',
  'soa.preparedBy': 'VANESSA L. DONOSO',
  'soa.reviewedBy': 'RUTH MICHELLE C. BAYRON',

  // Scheduler Settings
  'scheduler.enabled': false,
  'scheduler.cronExpression': '0 8 * * *',
  'scheduler.daysBeforeDue': 15,

  // Email Settings
  'email.enabled': true,
  'email.bccAddress': '',
  'email.replyTo': '',

  // Tax Settings
  'tax.vatRate': 0.12,
  'tax.withholdingPresets': [
    { rate: 0.01, code: 'WC100', label: '1% - Services' },
    { rate: 0.02, code: 'WC160', label: '2% - Professional Services' },
    { rate: 0.05, code: 'WC058', label: '5% - Rentals' },
    { rate: 0.10, code: 'WC010', label: '10% - Professional Fees' },
  ],
  'tax.defaultWithholdingRate': 0.02,
  'tax.defaultWithholdingCode': 'WC160',

  // Product Types
  'productTypes.list': [
    { value: 'ACCOUNTING', label: 'Accounting' },
    { value: 'PAYROLL', label: 'Payroll' },
    { value: 'COMPLIANCE', label: 'Compliance' },
    { value: 'HR', label: 'HR' },
  ],
};

// Cache for settings (refreshed every 5 minutes)
let settingsCache: Record<string, any> | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get a single setting value
 */
export async function getSetting(key: string): Promise<any> {
  const settings = await getAllSettings();
  return settings[key] ?? DEFAULTS[key];
}

/**
 * Get multiple settings by keys
 */
export async function getSettings(keys: string[]): Promise<Record<string, any>> {
  const settings = await getAllSettings();
  const result: Record<string, any> = {};

  for (const key of keys) {
    result[key] = settings[key] ?? DEFAULTS[key];
  }

  return result;
}

/**
 * Get all settings (with caching)
 */
export async function getAllSettings(): Promise<Record<string, any>> {
  const now = Date.now();

  // Return cached settings if still valid
  if (settingsCache && now - cacheTimestamp < CACHE_TTL) {
    return settingsCache;
  }

  try {
    const dbSettings = await prisma.settings.findMany();

    // Merge defaults with DB values
    const settings: Record<string, any> = { ...DEFAULTS };

    for (const setting of dbSettings) {
      settings[setting.key] = setting.value;
    }

    // Update cache
    settingsCache = settings;
    cacheTimestamp = now;

    return settings;
  } catch (error) {
    console.error('Error fetching settings:', error);
    // Return defaults on error
    return DEFAULTS;
  }
}

/**
 * Clear the settings cache (call after updating settings)
 */
export function clearSettingsCache(): void {
  settingsCache = null;
  cacheTimestamp = 0;
}

/**
 * Get SOA/PDF template settings for a company
 * Now fetches from Company model (bank details) and Signatory model (signatories)
 */
export async function getSOASettings(companyCode: 'YOWI' | 'ABBA'): Promise<{
  bankName: string;
  bankAccountName: string;
  bankAccountNo: string;
  footer: string;
  preparedBy: string;
  reviewedBy: string;
}> {
  try {
    // Fetch company with signatories
    const company = await prisma.company.findUnique({
      where: { code: companyCode },
      include: {
        signatories: {
          where: { isDefault: true },
        },
      },
    });

    if (!company) {
      // Fallback to defaults if company not found
      return getSOASettingsDefaults(companyCode);
    }

    // Get signatories by role
    const preparedBySignatory = company.signatories.find(s => s.role === 'prepared_by');
    const reviewedBySignatory = company.signatories.find(s => s.role === 'reviewed_by');

    // Get footer from Settings (shared setting)
    const footerSetting = await getSetting('soa.footer');

    return {
      bankName: company.bankName || 'BDO',
      bankAccountName: company.bankAccountName || company.name,
      bankAccountNo: company.bankAccountNo || '',
      footer: footerSetting || 'Thank you for your business. Please include the invoice number in your payment reference.',
      preparedBy: preparedBySignatory?.name || 'VANESSA L. DONOSO',
      reviewedBy: reviewedBySignatory?.name || 'RUTH MICHELLE C. BAYRON',
    };
  } catch (error) {
    console.error('Error fetching SOA settings:', error);
    return getSOASettingsDefaults(companyCode);
  }
}

/**
 * Get default SOA settings (fallback)
 */
function getSOASettingsDefaults(companyCode: 'YOWI' | 'ABBA'): {
  bankName: string;
  bankAccountName: string;
  bankAccountNo: string;
  footer: string;
  preparedBy: string;
  reviewedBy: string;
} {
  const isYowi = companyCode === 'YOWI';
  return {
    bankName: 'BDO',
    bankAccountName: isYowi ? 'YAHSHUA OUTSOURCING WORLDWIDE INC.' : 'THE ABBA INITIATIVE OPC',
    bankAccountNo: '',
    footer: 'Thank you for your business. Please include the invoice number in your payment reference.',
    preparedBy: 'VANESSA L. DONOSO',
    reviewedBy: 'RUTH MICHELLE C. BAYRON',
  };
}

/**
 * Get scheduler settings
 */
export async function getSchedulerSettings(): Promise<{
  enabled: boolean;
  cronExpression: string;
  daysBeforeDue: number;
}> {
  const settings = await getSettings([
    'scheduler.enabled',
    'scheduler.cronExpression',
    'scheduler.daysBeforeDue',
  ]);

  return {
    enabled: settings['scheduler.enabled'],
    cronExpression: settings['scheduler.cronExpression'],
    daysBeforeDue: settings['scheduler.daysBeforeDue'],
  };
}

/**
 * Get email settings
 */
export async function getEmailSettings(): Promise<{
  enabled: boolean;
  bccAddress: string;
  replyTo: string;
}> {
  const settings = await getSettings([
    'email.enabled',
    'email.bccAddress',
    'email.replyTo',
  ]);

  return {
    enabled: settings['email.enabled'],
    bccAddress: settings['email.bccAddress'],
    replyTo: settings['email.replyTo'],
  };
}

// Invoice template type (matches TemplateConfig in pdf-generator.ts)
export interface InvoiceTemplateConfig {
  primaryColor: string;
  secondaryColor: string;
  footerBgColor: string;
  logoPath?: string;
  invoiceTitle: string;
  footerText: string;
  showDisclaimer: boolean;
  notes?: string;
}

// Cache for invoice templates (per-company cache with individual timestamps)
let templateCache: Record<string, { template: InvoiceTemplateConfig; timestamp: number }> = {};

/**
 * Get invoice template for a company
 */
export async function getInvoiceTemplate(companyCode: 'YOWI' | 'ABBA'): Promise<InvoiceTemplateConfig> {
  const now = Date.now();

  // Check cache (per-company timestamp)
  const cached = templateCache[companyCode];
  if (cached && now - cached.timestamp < CACHE_TTL) {
    console.log('[Template] Using cached template for:', companyCode);
    return cached.template;
  }

  try {
    const company = await prisma.company.findUnique({
      where: { code: companyCode },
      include: { template: true },
    });

    if (company?.template) {
      console.log('[Template] Loaded from database for:', companyCode, company.template.id);
      const template: InvoiceTemplateConfig = {
        primaryColor: company.template.primaryColor,
        secondaryColor: company.template.secondaryColor,
        footerBgColor: company.template.footerBgColor,
        logoPath: company.template.logoPath || undefined,
        invoiceTitle: company.template.invoiceTitle,
        footerText: company.template.footerText,
        showDisclaimer: company.template.showDisclaimer,
        notes: company.template.notes || undefined,
      };

      // Update cache with per-company timestamp
      templateCache[companyCode] = { template, timestamp: now };

      return template;
    }

    console.log('[Template] No template found in DB, using defaults for:', companyCode);
    // Return defaults based on company
    const defaultTemplate: InvoiceTemplateConfig = companyCode === 'YOWI'
      ? {
          primaryColor: '#2563eb',
          secondaryColor: '#1e40af',
          footerBgColor: '#dbeafe',
          logoPath: '/assets/yowi-logo.png',
          invoiceTitle: 'Invoice',
          footerText: 'Powered by: YAHSHUA',
          showDisclaimer: true,
        }
      : {
          primaryColor: '#059669',
          secondaryColor: '#047857',
          footerBgColor: '#d1fae5',
          logoPath: '/assets/abba-logo.png',
          invoiceTitle: 'Invoice',
          footerText: 'Powered by: THE ABBA INITIATIVE',
          showDisclaimer: true,
        };

    return defaultTemplate;
  } catch (error) {
    console.error('Error fetching invoice template:', error);
    // Return YOWI defaults on error
    return {
      primaryColor: '#2563eb',
      secondaryColor: '#1e40af',
      footerBgColor: '#dbeafe',
      invoiceTitle: 'Invoice',
      footerText: 'Powered by: YAHSHUA',
      showDisclaimer: true,
    };
  }
}

/**
 * Clear template cache (call after updating templates)
 */
export function clearTemplateCache(): void {
  templateCache = {};
  console.log('[Template] Cache cleared');
}

// ==================== TAX SETTINGS ====================

export interface WithholdingPreset {
  rate: number;
  code: string;
  label: string;
}

/**
 * Get VAT rate
 */
export async function getVatRate(): Promise<number> {
  return await getSetting('tax.vatRate') ?? 0.12;
}

/**
 * Get withholding tax presets
 */
export async function getWithholdingPresets(): Promise<WithholdingPreset[]> {
  const presets = await getSetting('tax.withholdingPresets');
  return presets || DEFAULTS['tax.withholdingPresets'];
}

/**
 * Get default withholding rate
 */
export async function getDefaultWithholdingRate(): Promise<number> {
  return await getSetting('tax.defaultWithholdingRate') ?? 0.02;
}

/**
 * Get default withholding code
 */
export async function getDefaultWithholdingCode(): Promise<string> {
  return await getSetting('tax.defaultWithholdingCode') ?? 'WC160';
}

// ==================== PRODUCT TYPE SETTINGS ====================

export interface ProductTypeConfig {
  value: string;
  label: string;
}

/**
 * Get configured product types
 */
export async function getProductTypes(): Promise<ProductTypeConfig[]> {
  const types = await getSetting('productTypes.list');
  return types || DEFAULTS['productTypes.list'];
}
