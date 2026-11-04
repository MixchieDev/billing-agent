/** Receivables feed payloads: what is owed, and when the cash is expected. */
jest.mock('@/lib/prisma', () => ({ __esModule: true, default: {} }));
jest.mock('@/lib/settings', () => ({ getSetting: jest.fn(), getVatRate: jest.fn() }));

import { buildCollection, buildReceivable, expectationFor, stateFor } from '@/lib/receivables-feed';

const today = new Date('2026-10-29T04:00:00Z');
const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe('stateFor', () => {
  it('maps invoice statuses', () => {
    expect(stateFor('PENDING')).toBe('PENDING');
    expect(stateFor('APPROVED')).toBe('OPEN');
    expect(stateFor('SENT')).toBe('OPEN');
    expect(stateFor('PARTIALLY_PAID')).toBe('PARTIAL');
    expect(stateFor('PAID')).toBe('PAID');
    expect(stateFor('VOID')).toBe('VOID');
    expect(stateFor('REJECTED')).toBe('VOID');
  });
});

describe('expectationFor — only commitments count once overdue', () => {
  const base = { state: 'OPEN' as const, promise: null, pdc: null, lagDays: 10, today };

  it('a promise wins, with its amount', () => {
    expect(
      expectationFor({ ...base, dueDate: d('2026-08-01'), promise: { promisedDate: d('2026-11-05'), promisedAmount: 5000 } })
    ).toEqual({ expectedDate: '2026-11-05', expectedSource: 'PROMISE', promisedAmount: 5000 });
  });

  it('then a pending PDC', () => {
    expect(expectationFor({ ...base, dueDate: d('2026-08-01'), pdc: { checkDate: d('2026-11-15') } })).toEqual({
      expectedDate: '2026-11-15', expectedSource: 'PDC', promisedAmount: null,
    });
  });

  it('not yet due: due date plus the client lag', () => {
    expect(expectationFor({ ...base, dueDate: d('2026-11-10') })).toEqual({
      expectedDate: '2026-11-20', expectedSource: 'TERMS', promisedAmount: null,
    });
  });

  it('due today still counts as terms', () => {
    expect(expectationFor({ ...base, lagDays: null, dueDate: d('2026-10-29') }).expectedSource).toBe('TERMS');
  });

  it('overdue with no promise or PDC has no date', () => {
    expect(expectationFor({ ...base, dueDate: d('2026-10-01') })).toEqual({
      expectedDate: null, expectedSource: 'NONE', promisedAmount: null,
    });
  });

  it('nothing is expected for paid, pending or void invoices', () => {
    for (const state of ['PAID', 'PENDING', 'VOID'] as const) {
      expect(
        expectationFor({ ...base, state, dueDate: d('2026-11-10'), promise: { promisedDate: d('2026-11-05'), promisedAmount: null } })
          .expectedSource
      ).toBe('NONE');
    }
  });
});

const invoice = (over: Record<string, unknown> = {}) =>
  ({
    id: 'inv1',
    billingNo: 'S-0101',
    customerName: 'Acme Corp',
    status: 'PARTIALLY_PAID',
    periodStart: null,
    statementDate: d('2026-10-01'),
    dueDate: d('2026-11-15'),
    netAmount: 11200,
    balanceDue: 6200,
    amountPaidTotal: 5000,
    paidAt: null,
    company: { name: 'YAHSHUA Outsourcing Worldwide' },
    contracts: [
      { id: 'c1', customerNumber: 'YOWI-0001' },
      { id: 'c2', customerNumber: null },
    ],
    promises: [],
    pdcChecks: [],
    ...over,
  }) as never;

describe('buildReceivable', () => {
  it('builds the row the cash app stores', () => {
    expect(buildReceivable(invoice(), 4, today)).toEqual({
      invoiceId: 'inv1',
      entity: 'YAHSHUA',
      billingNo: 'S-0101',
      customerName: 'Acme Corp',
      customerNumbers: ['YOWI-0001'],
      periodStart: '2026-10-01', // statement month stands in for a missing period
      statementDate: '2026-10-01',
      dueDate: '2026-11-15',
      netAmount: 11200,
      balanceDue: 6200,
      state: 'PARTIAL',
      expectedDate: '2026-11-19',
      expectedSource: 'TERMS',
      promisedAmount: null,
      paidAt: null,
    });
  });

  it('a paid invoice owes nothing, even with an overpayment', () => {
    const r = buildReceivable(invoice({ status: 'PAID', balanceDue: -50, paidAt: d('2026-10-20') }), null, today);
    expect(r.balanceDue).toBe(0);
    expect(r.paidAt).toBe('2026-10-20');
  });

  it('falls back to net − paid when balanceDue was never set', () => {
    expect(buildReceivable(invoice({ status: 'SENT', balanceDue: null, amountPaidTotal: 0 }), null, today).balanceDue).toBe(11200);
  });

  it('ABBA invoices are entity ABBA', () => {
    expect(buildReceivable(invoice({ company: { name: 'The ABBA Initiative OPC' } }), null, today).entity).toBe('ABBA');
  });
});

describe('buildCollection', () => {
  it('carries the bank the money landed in', () => {
    expect(
      buildCollection({
        id: 'p1',
        invoiceId: 'inv1',
        amount: 5000,
        paidDate: d('2026-10-20'),
        method: 'BANK_TRANSFER',
        receivedInBank: 'RCBC',
        receivedInAccountNo: '777',
        invoice: { company: { name: 'The ABBA Initiative OPC' }, contracts: [{ customerNumber: 'ABBA-0010' }] },
      } as never)
    ).toEqual({
      paymentId: 'p1',
      invoiceId: 'inv1',
      entity: 'ABBA',
      customerNumber: 'ABBA-0010',
      amount: 5000,
      paidDate: '2026-10-20',
      method: 'BANK_TRANSFER',
      receivedInBank: 'RCBC',
      receivedInAccountNo: '777',
    });
  });
});
