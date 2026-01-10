/**
 * Unit tests for utility functions
 */

import {
  formatCurrency,
  formatDate,
  formatDateShort,
  daysUntil,
  calculateBilling,
  getBillingEntity,
  generateBillingNo,
  getPeriodDescription,
} from '@/lib/utils';
import { Decimal } from '@prisma/client/runtime/library';

describe('formatCurrency', () => {
  it('formats positive numbers correctly', () => {
    expect(formatCurrency(1000)).toBe('P 1,000.00');
    expect(formatCurrency(12345.67)).toBe('P 12,345.67');
    expect(formatCurrency(0.5)).toBe('P 0.50');
  });

  it('handles zero', () => {
    expect(formatCurrency(0)).toBe('P 0.00');
  });

  it('handles null and undefined', () => {
    expect(formatCurrency(null)).toBe('P 0.00');
    expect(formatCurrency(undefined)).toBe('P 0.00');
  });

  it('handles Decimal type from Prisma', () => {
    const decimal = new Decimal(1234.56);
    expect(formatCurrency(decimal)).toBe('P 1,234.56');
  });

  it('formats large numbers with proper comma separation', () => {
    expect(formatCurrency(1000000)).toBe('P 1,000,000.00');
    expect(formatCurrency(999999.99)).toBe('P 999,999.99');
  });
});

describe('formatDate', () => {
  it('formats Date objects correctly', () => {
    const date = new Date(2026, 0, 15); // Jan 15, 2026
    const result = formatDate(date);
    expect(result).toMatch(/January/);
    expect(result).toMatch(/15/);
    expect(result).toMatch(/2026/);
  });

  it('formats date strings correctly', () => {
    const result = formatDate('2026-01-15');
    expect(result).toMatch(/January/);
    expect(result).toMatch(/15/);
    expect(result).toMatch(/2026/);
  });

  it('handles null and undefined', () => {
    expect(formatDate(null)).toBe('');
    expect(formatDate(undefined)).toBe('');
  });
});

describe('formatDateShort', () => {
  it('formats dates in short format', () => {
    const date = new Date(2026, 0, 15);
    const result = formatDateShort(date);
    expect(result).toMatch(/01/);
    expect(result).toMatch(/15/);
    expect(result).toMatch(/2026/);
  });

  it('handles null and undefined', () => {
    expect(formatDateShort(null)).toBe('');
    expect(formatDateShort(undefined)).toBe('');
  });
});

describe('daysUntil', () => {
  it('calculates positive days correctly', () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 5);
    expect(daysUntil(futureDate)).toBe(5);
  });

  it('calculates negative days (past dates)', () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 3);
    expect(daysUntil(pastDate)).toBe(-3);
  });

  it('returns 0 for today', () => {
    const today = new Date();
    expect(daysUntil(today)).toBe(0);
  });

  it('handles null and undefined', () => {
    expect(daysUntil(null)).toBe(0);
    expect(daysUntil(undefined)).toBe(0);
  });

  it('handles date strings', () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 10);
    expect(daysUntil(futureDate.toISOString())).toBe(10);
  });
});

describe('calculateBilling', () => {
  describe('VAT-inclusive calculations', () => {
    it('calculates VAT-inclusive billing correctly', () => {
      const result = calculateBilling(11200, true, true, false);
      expect(result.serviceFee).toBe(10000);
      expect(result.vatAmount).toBe(1200);
      expect(result.grossAmount).toBe(11200);
      expect(result.withholdingTax).toBe(0);
      expect(result.netAmount).toBe(11200);
    });

    it('calculates VAT-inclusive with withholding tax', () => {
      const result = calculateBilling(11200, true, true, true);
      expect(result.serviceFee).toBe(10000);
      expect(result.vatAmount).toBe(1200);
      expect(result.grossAmount).toBe(11200);
      expect(result.withholdingTax).toBe(200); // 2% of 10000
      expect(result.netAmount).toBe(11000); // 11200 - 200
    });
  });

  describe('VAT-exclusive calculations', () => {
    it('calculates VAT-exclusive billing correctly', () => {
      const result = calculateBilling(10000, false, true, false);
      expect(result.serviceFee).toBe(10000);
      expect(result.vatAmount).toBe(1200);
      expect(result.grossAmount).toBe(11200);
      expect(result.netAmount).toBe(11200);
    });

    it('calculates VAT-exclusive with withholding tax', () => {
      const result = calculateBilling(10000, false, true, true);
      expect(result.serviceFee).toBe(10000);
      expect(result.vatAmount).toBe(1200);
      expect(result.grossAmount).toBe(11200);
      expect(result.withholdingTax).toBe(200);
      expect(result.netAmount).toBe(11000);
    });
  });

  describe('Non-VAT client calculations', () => {
    it('calculates non-VAT billing correctly', () => {
      const result = calculateBilling(10000, true, false, false);
      expect(result.serviceFee).toBe(10000);
      expect(result.vatAmount).toBe(0);
      expect(result.grossAmount).toBe(10000);
      expect(result.netAmount).toBe(10000);
    });

    it('calculates non-VAT with withholding tax', () => {
      const result = calculateBilling(10000, true, false, true);
      expect(result.serviceFee).toBe(10000);
      expect(result.vatAmount).toBe(0);
      expect(result.grossAmount).toBe(10000);
      expect(result.withholdingTax).toBe(200);
      expect(result.netAmount).toBe(9800);
    });
  });

  it('handles decimal precision correctly', () => {
    const result = calculateBilling(12345.67, true, true, true);
    // All values should be rounded to 2 decimal places
    expect(result.serviceFee).toBe(Math.round(12345.67 / 1.12 * 100) / 100);
    expect(result.vatAmount).toBe(Math.round(result.serviceFee * 0.12 * 100) / 100);
  });
});

describe('getBillingEntity', () => {
  it('returns YOWI for YOWI partners', () => {
    expect(getBillingEntity('Globe')).toBe('YOWI');
    expect(getBillingEntity('Innove')).toBe('YOWI');
    expect(getBillingEntity('RCBC')).toBe('YOWI');
    expect(getBillingEntity('Direct-YOWI')).toBe('YOWI');
  });

  it('returns YOWI for case-insensitive matches', () => {
    expect(getBillingEntity('globe')).toBe('YOWI');
    expect(getBillingEntity('GLOBE')).toBe('YOWI');
    expect(getBillingEntity('Globe Communications')).toBe('YOWI');
  });

  it('returns ABBA for other partners', () => {
    expect(getBillingEntity('Direct-ABBA')).toBe('ABBA');
    expect(getBillingEntity('Other Company')).toBe('ABBA');
  });

  it('returns ABBA for null or undefined', () => {
    expect(getBillingEntity(null)).toBe('ABBA');
    expect(getBillingEntity(undefined)).toBe('ABBA');
  });
});

describe('generateBillingNo', () => {
  it('generates billing number with correct format', () => {
    const currentYear = new Date().getFullYear();
    expect(generateBillingNo('S', 1)).toBe(`S-${currentYear}-00001`);
    expect(generateBillingNo('S', 123)).toBe(`S-${currentYear}-00123`);
    expect(generateBillingNo('A', 99999)).toBe(`A-${currentYear}-99999`);
  });

  it('pads sequence numbers correctly', () => {
    const currentYear = new Date().getFullYear();
    expect(generateBillingNo('INV', 5)).toBe(`INV-${currentYear}-00005`);
    expect(generateBillingNo('INV', 50)).toBe(`INV-${currentYear}-00050`);
    expect(generateBillingNo('INV', 500)).toBe(`INV-${currentYear}-00500`);
  });
});

describe('getPeriodDescription', () => {
  it('generates monthly period description', () => {
    const jan2026 = new Date(2026, 0, 15);
    const result = getPeriodDescription('monthly', jan2026);
    expect(result).toBe('the month of January 2026');
  });

  it('uses current date for monthly if not provided', () => {
    const result = getPeriodDescription('monthly');
    const currentMonth = new Date().toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
    expect(result).toBe(`the month of ${currentMonth}`);
  });

  it('generates annual period description', () => {
    const start = new Date(2026, 0, 1);
    const end = new Date(2026, 11, 31);
    const result = getPeriodDescription('annual', start, end);
    expect(result).toContain('2026');
    expect(result).toContain('January');
    expect(result).toContain('December');
  });
});
