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

  // General Settings
  'general.vatRate': 0.12,
  'general.withholdingRate': 0.02,
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
 */
export async function getSOASettings(companyCode: 'YOWI' | 'ABBA'): Promise<{
  bankName: string;
  bankAccountName: string;
  bankAccountNo: string;
  footer: string;
  preparedBy: string;
  reviewedBy: string;
}> {
  const prefix = companyCode.toLowerCase();
  const settings = await getSettings([
    `soa.${prefix}.bankName`,
    `soa.${prefix}.bankAccountName`,
    `soa.${prefix}.bankAccountNo`,
    'soa.footer',
    'soa.preparedBy',
    'soa.reviewedBy',
  ]);

  return {
    bankName: settings[`soa.${prefix}.bankName`],
    bankAccountName: settings[`soa.${prefix}.bankAccountName`],
    bankAccountNo: settings[`soa.${prefix}.bankAccountNo`],
    footer: settings['soa.footer'],
    preparedBy: settings['soa.preparedBy'],
    reviewedBy: settings['soa.reviewedBy'],
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
