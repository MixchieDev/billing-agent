/**
 * Unit tests for PDF generator module
 * Tests PDF generation utility functions
 */

import { Decimal } from '@prisma/client/runtime/library';

// Mock prisma first
jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {},
}));

// Mock settings
jest.mock('@/lib/settings', () => ({
  getSOASettings: jest.fn(),
  getInvoiceTemplate: jest.fn(),
}));

import {
  formatPdfCurrency,
  hexToRgb,
} from '@/lib/pdf-generator';

describe('PDF Generator Utilities', () => {
  describe('formatPdfCurrency', () => {
    it('formats positive numbers with PHP prefix', () => {
      expect(formatPdfCurrency(1000)).toBe('PHP 1,000.00');
      expect(formatPdfCurrency(1234567.89)).toBe('PHP 1,234,567.89');
    });

    it('formats zero correctly', () => {
      expect(formatPdfCurrency(0)).toBe('PHP 0.00');
    });

    it('formats small decimals correctly', () => {
      expect(formatPdfCurrency(0.01)).toBe('PHP 0.01');
      expect(formatPdfCurrency(99.99)).toBe('PHP 99.99');
    });

    it('formats large numbers correctly', () => {
      expect(formatPdfCurrency(1000000)).toBe('PHP 1,000,000.00');
      expect(formatPdfCurrency(999999999.99)).toBe('PHP 999,999,999.99');
    });

    it('handles negative numbers', () => {
      expect(formatPdfCurrency(-1000)).toBe('PHP -1,000.00');
    });

    it('handles Decimal type', () => {
      const decimal = new Decimal('12345.67');
      expect(formatPdfCurrency(Number(decimal))).toBe('PHP 12,345.67');
    });

    it('rounds to two decimal places', () => {
      expect(formatPdfCurrency(100.999)).toBe('PHP 101.00');
      expect(formatPdfCurrency(100.001)).toBe('PHP 100.00');
    });
  });

  describe('hexToRgb', () => {
    it('converts hex colors to RGB values (0-1 range)', () => {
      const white = hexToRgb('#ffffff');
      expect(white.r).toBeCloseTo(1, 2);
      expect(white.g).toBeCloseTo(1, 2);
      expect(white.b).toBeCloseTo(1, 2);
    });

    it('converts black correctly', () => {
      const black = hexToRgb('#000000');
      expect(black.r).toBeCloseTo(0, 2);
      expect(black.g).toBeCloseTo(0, 2);
      expect(black.b).toBeCloseTo(0, 2);
    });

    it('converts primary blue correctly', () => {
      const blue = hexToRgb('#2563eb');
      expect(blue.r).toBeCloseTo(0.145, 2);
      expect(blue.g).toBeCloseTo(0.388, 2);
      expect(blue.b).toBeCloseTo(0.922, 2);
    });

    it('converts red correctly', () => {
      const red = hexToRgb('#ff0000');
      expect(red.r).toBeCloseTo(1, 2);
      expect(red.g).toBeCloseTo(0, 2);
      expect(red.b).toBeCloseTo(0, 2);
    });

    it('converts green correctly', () => {
      const green = hexToRgb('#00ff00');
      expect(green.r).toBeCloseTo(0, 2);
      expect(green.g).toBeCloseTo(1, 2);
      expect(green.b).toBeCloseTo(0, 2);
    });

    it('converts various hex colors correctly', () => {
      const color = hexToRgb('#aabbcc');
      expect(color.r).toBeCloseTo(0.667, 2);
      expect(color.g).toBeCloseTo(0.733, 2);
      expect(color.b).toBeCloseTo(0.8, 2);
    });

    it('handles hex without # prefix', () => {
      const color = hexToRgb('ff0000');
      expect(color.r).toBeCloseTo(1, 2);
      expect(color.g).toBeCloseTo(0, 2);
      expect(color.b).toBeCloseTo(0, 2);
    });

    it('returns black for invalid hex', () => {
      const invalid = hexToRgb('invalid');
      expect(invalid.r).toBe(0);
      expect(invalid.g).toBe(0);
      expect(invalid.b).toBe(0);
    });

    it('returns black for empty string', () => {
      const empty = hexToRgb('');
      expect(empty.r).toBe(0);
      expect(empty.g).toBe(0);
      expect(empty.b).toBe(0);
    });
  });

  describe('Currency formatting edge cases', () => {
    it('formats very small amounts correctly', () => {
      expect(formatPdfCurrency(0.10)).toBe('PHP 0.10');
      expect(formatPdfCurrency(0.05)).toBe('PHP 0.05');
    });

    it('formats amounts with trailing zeros', () => {
      expect(formatPdfCurrency(100)).toBe('PHP 100.00');
      expect(formatPdfCurrency(1000.50)).toBe('PHP 1,000.50');
    });

    it('handles very large amounts', () => {
      expect(formatPdfCurrency(1000000000)).toBe('PHP 1,000,000,000.00');
    });

    it('preserves precision for common billing amounts', () => {
      expect(formatPdfCurrency(5000)).toBe('PHP 5,000.00');
      expect(formatPdfCurrency(10000)).toBe('PHP 10,000.00');
      expect(formatPdfCurrency(25000)).toBe('PHP 25,000.00');
      expect(formatPdfCurrency(50000)).toBe('PHP 50,000.00');
    });

    it('handles VAT calculations', () => {
      // Common VAT amounts (12%)
      expect(formatPdfCurrency(1200)).toBe('PHP 1,200.00'); // VAT on 10,000
      expect(formatPdfCurrency(11200)).toBe('PHP 11,200.00'); // Gross amount
    });

    it('handles withholding tax calculations', () => {
      // Common withholding amounts (2%)
      expect(formatPdfCurrency(200)).toBe('PHP 200.00'); // WHT on 10,000
    });
  });

  describe('Color conversion edge cases', () => {
    it('converts YOWI brand color correctly', () => {
      const yowiBlue = hexToRgb('#2563eb');
      expect(yowiBlue.r).toBeCloseTo(37/255, 2);
      expect(yowiBlue.g).toBeCloseTo(99/255, 2);
      expect(yowiBlue.b).toBeCloseTo(235/255, 2);
    });

    it('converts ABBA brand color correctly', () => {
      const abbaGreen = hexToRgb('#059669');
      expect(abbaGreen.r).toBeCloseTo(5/255, 2);
      expect(abbaGreen.g).toBeCloseTo(150/255, 2);
      expect(abbaGreen.b).toBeCloseTo(105/255, 2);
    });

    it('converts footer background colors correctly', () => {
      const yowiFooter = hexToRgb('#dbeafe');
      expect(yowiFooter.r).toBeCloseTo(219/255, 2);
      expect(yowiFooter.g).toBeCloseTo(234/255, 2);
      expect(yowiFooter.b).toBeCloseTo(254/255, 2);

      const abbaFooter = hexToRgb('#d1fae5');
      expect(abbaFooter.r).toBeCloseTo(209/255, 2);
      expect(abbaFooter.g).toBeCloseTo(250/255, 2);
      expect(abbaFooter.b).toBeCloseTo(229/255, 2);
    });

    it('handles uppercase hex colors', () => {
      const color = hexToRgb('#FF0000');
      expect(color.r).toBeCloseTo(1, 2);
      expect(color.g).toBeCloseTo(0, 2);
      expect(color.b).toBeCloseTo(0, 2);
    });

    it('handles mixed case hex colors', () => {
      const color = hexToRgb('#FfAaBb');
      expect(color.r).toBeCloseTo(255/255, 2);
      expect(color.g).toBeCloseTo(170/255, 2);
      expect(color.b).toBeCloseTo(187/255, 2);
    });
  });
});
