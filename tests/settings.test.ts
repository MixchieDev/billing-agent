/**
 * Unit tests for settings module
 * Tests getSOASettings, getInvoiceTemplate, and caching functionality
 */

import {
  getSetting,
  getSettings,
  getAllSettings,
  clearSettingsCache,
  getSOASettings,
  getSchedulerSettings,
  getEmailSettings,
  getInvoiceTemplate,
  clearTemplateCache,
  InvoiceTemplateConfig,
} from '@/lib/settings';

// Mock Prisma
jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    settings: {
      findMany: jest.fn(),
    },
    company: {
      findUnique: jest.fn(),
    },
  },
}));

import prisma from '@/lib/prisma';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('Settings Module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearSettingsCache();
    clearTemplateCache();
  });

  describe('getSetting', () => {
    it('returns default value when setting not in database', async () => {
      (mockPrisma.settings.findMany as jest.Mock).mockResolvedValue([]);

      const result = await getSetting('scheduler.enabled');
      expect(result).toBe(false); // Default value
    });

    it('returns database value when setting exists', async () => {
      (mockPrisma.settings.findMany as jest.Mock).mockResolvedValue([
        { key: 'scheduler.enabled', value: true },
      ]);

      const result = await getSetting('scheduler.enabled');
      expect(result).toBe(true);
    });

    it('returns default for unknown key', async () => {
      (mockPrisma.settings.findMany as jest.Mock).mockResolvedValue([]);

      const result = await getSetting('unknown.key');
      expect(result).toBeUndefined();
    });
  });

  describe('getSettings', () => {
    it('returns multiple settings with defaults', async () => {
      (mockPrisma.settings.findMany as jest.Mock).mockResolvedValue([
        { key: 'scheduler.enabled', value: true },
      ]);

      const result = await getSettings([
        'scheduler.enabled',
        'scheduler.cronExpression',
      ]);

      expect(result['scheduler.enabled']).toBe(true);
      expect(result['scheduler.cronExpression']).toBe('0 8 * * *'); // Default
    });
  });

  describe('getAllSettings', () => {
    it('merges database settings with defaults', async () => {
      (mockPrisma.settings.findMany as jest.Mock).mockResolvedValue([
        { key: 'email.enabled', value: false },
      ]);

      const result = await getAllSettings();

      expect(result['email.enabled']).toBe(false); // From DB
      expect(result['scheduler.enabled']).toBe(false); // Default
      expect(result['tax.vatRate']).toBe(0.12); // Default
    });

    it('caches results for subsequent calls', async () => {
      (mockPrisma.settings.findMany as jest.Mock).mockResolvedValue([]);

      await getAllSettings();
      await getAllSettings();
      await getAllSettings();

      // Should only call database once due to caching
      expect(mockPrisma.settings.findMany).toHaveBeenCalledTimes(1);
    });

    it('returns defaults on database error', async () => {
      (mockPrisma.settings.findMany as jest.Mock).mockRejectedValue(
        new Error('DB Error')
      );

      const result = await getAllSettings();

      expect(result['scheduler.enabled']).toBe(false);
      expect(result['tax.vatRate']).toBe(0.12);
    });
  });

  describe('getSOASettings', () => {
    const mockCompany = {
      id: 'company-1',
      code: 'YOWI',
      name: 'YAHSHUA OUTSOURCING WORLDWIDE INC.',
      bankName: 'BDO',
      bankAccountName: 'YAHSHUA OUTSOURCING WORLDWIDE INC.',
      bankAccountNo: '1234567890',
      signatories: [
        { role: 'prepared_by', name: 'John Doe', isDefault: true },
        { role: 'reviewed_by', name: 'Jane Smith', isDefault: true },
      ],
    };

    it('returns SOA settings from Company model', async () => {
      (mockPrisma.company.findUnique as jest.Mock).mockResolvedValue(mockCompany);
      (mockPrisma.settings.findMany as jest.Mock).mockResolvedValue([]);

      const result = await getSOASettings('YOWI');

      expect(result.bankName).toBe('BDO');
      expect(result.bankAccountName).toBe('YAHSHUA OUTSOURCING WORLDWIDE INC.');
      expect(result.bankAccountNo).toBe('1234567890');
      expect(result.preparedBy).toBe('John Doe');
      expect(result.reviewedBy).toBe('Jane Smith');
    });

    it('returns defaults when company not found', async () => {
      (mockPrisma.company.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await getSOASettings('YOWI');

      expect(result.bankName).toBe('BDO');
      expect(result.bankAccountName).toBe('YAHSHUA OUTSOURCING WORLDWIDE INC.');
      expect(result.preparedBy).toBe('VANESSA L. DONOSO');
      expect(result.reviewedBy).toBe('RUTH MICHELLE C. BAYRON');
    });

    it('returns ABBA defaults when company not found', async () => {
      (mockPrisma.company.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await getSOASettings('ABBA');

      expect(result.bankAccountName).toBe('THE ABBA INITIATIVE OPC');
    });

    it('handles missing signatories gracefully', async () => {
      const companyWithoutSignatories = {
        ...mockCompany,
        signatories: [],
      };
      (mockPrisma.company.findUnique as jest.Mock).mockResolvedValue(
        companyWithoutSignatories
      );
      (mockPrisma.settings.findMany as jest.Mock).mockResolvedValue([]);

      const result = await getSOASettings('YOWI');

      expect(result.preparedBy).toBe('VANESSA L. DONOSO'); // Default
      expect(result.reviewedBy).toBe('RUTH MICHELLE C. BAYRON'); // Default
    });

    it('handles database errors gracefully', async () => {
      (mockPrisma.company.findUnique as jest.Mock).mockRejectedValue(
        new Error('DB Error')
      );

      const result = await getSOASettings('YOWI');

      // Should return defaults
      expect(result.bankName).toBe('BDO');
      expect(result.preparedBy).toBe('VANESSA L. DONOSO');
    });
  });

  describe('getInvoiceTemplate', () => {
    const mockCompanyWithTemplate = {
      id: 'company-1',
      code: 'YOWI',
      template: {
        primaryColor: '#ff0000',
        secondaryColor: '#00ff00',
        footerBgColor: '#0000ff',
        logoPath: '/custom-logo.png',
        invoiceTitle: 'Custom Invoice',
        footerText: 'Custom Footer',
        showDisclaimer: false,
        notes: 'Custom notes here',
      },
    };

    it('returns template from database', async () => {
      (mockPrisma.company.findUnique as jest.Mock).mockResolvedValue(
        mockCompanyWithTemplate
      );

      const result = await getInvoiceTemplate('YOWI');

      expect(result.primaryColor).toBe('#ff0000');
      expect(result.secondaryColor).toBe('#00ff00');
      expect(result.footerBgColor).toBe('#0000ff');
      expect(result.invoiceTitle).toBe('Custom Invoice');
      expect(result.footerText).toBe('Custom Footer');
      expect(result.showDisclaimer).toBe(false);
      expect(result.notes).toBe('Custom notes here');
    });

    it('returns YOWI defaults when template not found', async () => {
      (mockPrisma.company.findUnique as jest.Mock).mockResolvedValue({
        id: 'company-1',
        code: 'YOWI',
        template: null,
      });

      const result = await getInvoiceTemplate('YOWI');

      expect(result.primaryColor).toBe('#2563eb');
      expect(result.secondaryColor).toBe('#1e40af');
      expect(result.footerBgColor).toBe('#dbeafe');
      expect(result.invoiceTitle).toBe('Invoice');
      expect(result.footerText).toBe('Powered by: YAHSHUA');
      expect(result.showDisclaimer).toBe(true);
    });

    it('returns ABBA defaults when template not found', async () => {
      (mockPrisma.company.findUnique as jest.Mock).mockResolvedValue({
        id: 'company-2',
        code: 'ABBA',
        template: null,
      });

      const result = await getInvoiceTemplate('ABBA');

      expect(result.primaryColor).toBe('#059669');
      expect(result.secondaryColor).toBe('#047857');
      expect(result.footerBgColor).toBe('#d1fae5');
      expect(result.footerText).toBe('Powered by: THE ABBA INITIATIVE');
    });

    it('caches template results', async () => {
      (mockPrisma.company.findUnique as jest.Mock).mockResolvedValue(
        mockCompanyWithTemplate
      );

      await getInvoiceTemplate('YOWI');
      await getInvoiceTemplate('YOWI');
      await getInvoiceTemplate('YOWI');

      // Should only call database once due to caching
      expect(mockPrisma.company.findUnique).toHaveBeenCalledTimes(1);
    });

    it('handles database errors gracefully', async () => {
      (mockPrisma.company.findUnique as jest.Mock).mockRejectedValue(
        new Error('DB Error')
      );

      const result = await getInvoiceTemplate('YOWI');

      // Should return defaults
      expect(result.primaryColor).toBe('#2563eb');
      expect(result.invoiceTitle).toBe('Invoice');
    });
  });

  describe('getSchedulerSettings', () => {
    it('returns scheduler settings', async () => {
      (mockPrisma.settings.findMany as jest.Mock).mockResolvedValue([
        { key: 'scheduler.enabled', value: true },
        { key: 'scheduler.cronExpression', value: '0 9 * * *' },
        { key: 'scheduler.daysBeforeDue', value: 10 },
      ]);

      const result = await getSchedulerSettings();

      expect(result.enabled).toBe(true);
      expect(result.cronExpression).toBe('0 9 * * *');
      expect(result.daysBeforeDue).toBe(10);
    });

    it('returns defaults when no settings in database', async () => {
      (mockPrisma.settings.findMany as jest.Mock).mockResolvedValue([]);

      const result = await getSchedulerSettings();

      expect(result.enabled).toBe(false);
      expect(result.cronExpression).toBe('0 8 * * *');
      expect(result.daysBeforeDue).toBe(15);
    });
  });

  describe('getEmailSettings', () => {
    it('returns email settings', async () => {
      (mockPrisma.settings.findMany as jest.Mock).mockResolvedValue([
        { key: 'email.enabled', value: false },
        { key: 'email.bccAddress', value: 'bcc@test.com' },
        { key: 'email.replyTo', value: 'reply@test.com' },
      ]);

      const result = await getEmailSettings();

      expect(result.enabled).toBe(false);
      expect(result.bccAddress).toBe('bcc@test.com');
      expect(result.replyTo).toBe('reply@test.com');
    });

    it('returns defaults when no settings in database', async () => {
      (mockPrisma.settings.findMany as jest.Mock).mockResolvedValue([]);

      const result = await getEmailSettings();

      expect(result.enabled).toBe(true);
      expect(result.bccAddress).toBe('');
      expect(result.replyTo).toBe('');
    });
  });

  describe('Cache clearing', () => {
    it('clearSettingsCache forces refetch', async () => {
      (mockPrisma.settings.findMany as jest.Mock).mockResolvedValue([]);

      await getAllSettings();
      expect(mockPrisma.settings.findMany).toHaveBeenCalledTimes(1);

      clearSettingsCache();

      await getAllSettings();
      expect(mockPrisma.settings.findMany).toHaveBeenCalledTimes(2);
    });

    it('clearTemplateCache forces refetch', async () => {
      (mockPrisma.company.findUnique as jest.Mock).mockResolvedValue({
        id: 'company-1',
        code: 'YOWI',
        template: null,
      });

      await getInvoiceTemplate('YOWI');
      expect(mockPrisma.company.findUnique).toHaveBeenCalledTimes(1);

      clearTemplateCache();

      await getInvoiceTemplate('YOWI');
      expect(mockPrisma.company.findUnique).toHaveBeenCalledTimes(2);
    });
  });
});
