import { certificateAmount, daysPending, ageBucket } from '@/lib/wht2307';

describe('certificateAmount', () => {
  it('uses the billed withholding when the invoice carried one', () => {
    expect(certificateAmount({ withholdingTax: 200, balanceDue: 0 })).toBe(200);
  });

  it('falls back to the residual balance for an unbilled withholding deduction', () => {
    // Operator ticked "client deducted withholding" on an invoice billed
    // without it: the shortfall left on the settled invoice IS the certificate.
    expect(certificateAmount({ withholdingTax: 0, balanceDue: 200 })).toBe(200);
  });

  it('prefers the billed withholding over any residual', () => {
    expect(certificateAmount({ withholdingTax: 200, balanceDue: 999 })).toBe(200);
  });

  it('returns 0 when there is nothing to certify', () => {
    expect(certificateAmount({ withholdingTax: 0, balanceDue: 0 })).toBe(0);
    expect(certificateAmount({ withholdingTax: null, balanceDue: null })).toBe(0);
  });

  it('never returns a negative amount from an overpaid invoice', () => {
    expect(certificateAmount({ withholdingTax: 0, balanceDue: -50 })).toBe(0);
  });

  it('handles Decimal-like values (objects with toString)', () => {
    const decimalish = { toString: () => '200.50' } as unknown;
    expect(certificateAmount({ withholdingTax: decimalish, balanceDue: 0 })).toBe(200.5);
  });
});

describe('daysPending', () => {
  const today = new Date('2026-09-30T12:00:00Z');

  it('counts whole days since the invoice settled', () => {
    expect(daysPending(new Date('2026-09-20T09:00:00Z'), today)).toBe(10);
  });

  it('is 0 on the day it settled', () => {
    expect(daysPending(new Date('2026-09-30T01:00:00Z'), today)).toBe(0);
  });

  it('never goes negative for a future date', () => {
    expect(daysPending(new Date('2026-10-05T00:00:00Z'), today)).toBe(0);
  });

  it('returns 0 when the settle date is unknown', () => {
    expect(daysPending(null, today)).toBe(0);
  });
});

describe('ageBucket', () => {
  it('places days in the right bucket', () => {
    expect(ageBucket(0)).toBe('d0_30');
    expect(ageBucket(30)).toBe('d0_30');
    expect(ageBucket(31)).toBe('d31_60');
    expect(ageBucket(60)).toBe('d31_60');
    expect(ageBucket(61)).toBe('d61_90');
    expect(ageBucket(90)).toBe('d61_90');
    expect(ageBucket(91)).toBe('d90plus');
    expect(ageBucket(365)).toBe('d90plus');
  });
});
