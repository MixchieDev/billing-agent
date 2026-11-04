/** Forecast inputs sent to cash management with each contract. */
jest.mock('@/lib/prisma', () => ({ __esModule: true, default: {} }));
jest.mock('@/lib/settings', () => ({ getSetting: jest.fn(), getVatRate: jest.fn() }));

import { cashPerCycle, lagDays, medianLag, reliability } from '@/lib/forecast-inputs';

const terms = (over: Record<string, unknown> = {}) => ({
  billingAmount: 10000,
  vatType: 'VAT' as const,
  hasWithholding: false,
  withholdingRate: null,
  frequency: 'MONTHLY' as const,
  dueDayOfMonth: 15,
  ...over,
});

describe('cashPerCycle', () => {
  it('adds VAT on top of the schedule amount, like the invoice generator', () => {
    expect(cashPerCycle(terms(), 0.12)).toBe(11200);
  });

  it('takes withholding off the service fee', () => {
    expect(cashPerCycle(terms({ hasWithholding: true, withholdingRate: 0.02 }), 0.12)).toBe(11000);
  });

  it('non-VAT client with withholding', () => {
    expect(cashPerCycle(terms({ vatType: 'NON_VAT', hasWithholding: true, withholdingRate: 0.02 }), 0.12)).toBe(9800);
  });

  it('defaults to 2% when withholding has no rate', () => {
    expect(cashPerCycle(terms({ hasWithholding: true }), 0.12)).toBe(11000);
  });
});

describe('payment lag', () => {
  it('counts days paid after due; early is negative', () => {
    expect(lagDays(new Date('2026-10-01'), new Date('2026-10-11'))).toBe(10);
    expect(lagDays(new Date('2026-10-10'), new Date('2026-10-08'))).toBe(-2);
  });

  it('median needs two settled invoices', () => {
    expect(medianLag([])).toBeNull();
    expect(medianLag([5])).toBeNull();
    expect(medianLag([4, 10])).toBe(7);
    expect(medianLag([30, 2, 9])).toBe(9);
  });

  it('clamps to 0–90: early payers expect the due date, chronic lateness is capped', () => {
    expect(medianLag([-5, -3])).toBe(0);
    expect(medianLag([200, 150, 120])).toBe(90);
  });

  it('reliability is the share paid within 7 days of due', () => {
    expect(reliability([])).toBeNull();
    expect(reliability([0, 7, 8, 30])).toBe(0.5);
    expect(reliability([-1, 2, 3])).toBe(1);
  });
});
