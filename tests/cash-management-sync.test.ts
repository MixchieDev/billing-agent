jest.mock('@/lib/prisma', () => ({ __esModule: true, default: {} }));
jest.mock('@/lib/settings', () => ({ getSetting: jest.fn() }));

import { buildPayload, translateStatus } from '@/lib/cash-management-sync';

const contract = (over: Record<string, unknown> = {}) => ({
  id: 'c1',
  customerNumber: 'ABBA-0086',
  companyName: 'Meijin Globalworks Corp.',
  monthlyFee: 5000,
  paymentPlan: 'Monthly',
  contractStart: null,
  contractEndDate: new Date('2027-06-01T00:00:00Z'),
  status: 'ACTIVE',
  billingDayOfMonth: null,
  remarks: 'some remark',
  createdAt: new Date('2026-02-13T00:00:00Z'),
  billingEntity: { name: 'THE ABBA INITIATIVE OPC' },
  partner: { name: 'Direct Billing (ABBA)' },
  ...over,
}) as never;

const derived = { contractStart: '2026-02-13', invoiceDay: 1 };

describe('translateStatus — stopped clients must not read as Active', () => {
  it('maps every billing status to one the receiver understands', () => {
    // The receiver knows NOT_STARTED, ACTIVE, PAUSED, CANCELLED, COMPLETED, OVERDUE
    // and turns anything else into "Active".
    const known = ['NOT_STARTED', 'ACTIVE', 'PAUSED', 'CANCELLED', 'COMPLETED', 'OVERDUE'];
    for (const s of ['ACTIVE', 'NOT_STARTED', 'INACTIVE', 'STOPPED'] as const) {
      expect(known).toContain(translateStatus(s));
    }
  });

  it('sends STOPPED as cancelled and INACTIVE as paused', () => {
    expect(translateStatus('STOPPED' as never)).toBe('CANCELLED');
    expect(translateStatus('INACTIVE' as never)).toBe('PAUSED');
    expect(translateStatus('ACTIVE' as never)).toBe('ACTIVE');
  });
});

describe('buildPayload', () => {
  it('sends a stable start date, never leaving it for the receiver to fill with today', () => {
    const p = buildPayload(contract(), derived);
    expect(p.contractStart).toBe('2026-02-13');
    expect(p.contractStart).not.toBeNull();
  });

  it('sends the invoice day from the scheduled billing, not the always-empty contract field', () => {
    expect(buildPayload(contract({ billingDayOfMonth: null }), derived).billingDayOfMonth).toBe(1);
  });

  it('carries every field billing agent owns', () => {
    const p = buildPayload(contract(), derived);
    expect(p).toMatchObject({
      customerNumber: 'ABBA-0086',
      companyName: 'Meijin Globalworks Corp.',
      entity: 'ABBA',
      monthlyFee: 5000,
      paymentPlan: 'Monthly',
      contractEndDate: '2027-06-01',
      status: 'ACTIVE',
      id: 'c1',
    });
  });

  it('maps the entity from the billing company name', () => {
    expect(buildPayload(contract(), derived).entity).toBe('ABBA');
    expect(
      buildPayload(contract({ billingEntity: { name: 'YAHSHUA OUTSOURCING WORLDWIDE INC.' } }), derived).entity
    ).toBe('YAHSHUA');
  });

  it('sends a cleared renewal date as null so a stale one is removed', () => {
    expect(buildPayload(contract({ contractEndDate: null }), derived).contractEndDate).toBeNull();
  });

  it('turns the Decimal fee into a plain number', () => {
    expect(typeof buildPayload(contract({ monthlyFee: '5600.50' }), derived).monthlyFee).toBe('number');
  });
});
