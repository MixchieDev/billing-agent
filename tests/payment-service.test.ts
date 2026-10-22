/** Unit tests for the pure settlement decision (collections PR-2). */
import { Prisma } from '@/generated/prisma';
import { computeSettlement, resolveReceivedIn } from '@/lib/payment-service';

const D = (n: number) => new Prisma.Decimal(n);

describe('computeSettlement', () => {
  it('full payment of the net → PAID, no 2307 when no withholding', () => {
    const s = computeSettlement(D(1000), D(0), D(1000));
    expect(s.status).toBe('PAID');
    expect(s.balanceDue.toNumber()).toBe(0);
    expect(s.wht2307Pending).toBe(false);
    expect(s.isEwtShort).toBe(false);
  });

  it('full payment of the net WITH withholding → PAID + 2307 pending', () => {
    // net is already net of withholding; paying it in full still owes a 2307.
    const s = computeSettlement(D(1100), D(20), D(1100));
    expect(s.status).toBe('PAID');
    expect(s.wht2307Pending).toBe(true);
    expect(s.isEwtShort).toBe(false);
  });

  it('partial payment → PARTIALLY_PAID', () => {
    const s = computeSettlement(D(1000), D(0), D(400));
    expect(s.status).toBe('PARTIALLY_PAID');
    expect(s.balanceDue.toNumber()).toBe(600);
    expect(s.wht2307Pending).toBe(false);
  });

  it('short by exactly the EWT (client withheld on the net) → PAID + 2307 pending + isEwtShort', () => {
    const s = computeSettlement(D(1100), D(20), D(1080)); // balance 20 == withholding
    expect(s.status).toBe('PAID');
    expect(s.wht2307Pending).toBe(true);
    expect(s.isEwtShort).toBe(true);
  });

  it('within ₱1 tolerance counts as settled', () => {
    const s = computeSettlement(D(1000), D(0), D(999.5));
    expect(s.status).toBe('PAID');
  });

  it('overpayment → PAID (negative balance)', () => {
    const s = computeSettlement(D(1000), D(0), D(1050));
    expect(s.status).toBe('PAID');
    expect(s.balanceDue.toNumber()).toBe(-50);
  });

  it('a genuine partial that is NOT near the EWT stays PARTIALLY_PAID', () => {
    const s = computeSettlement(D(1100), D(20), D(500));
    expect(s.status).toBe('PARTIALLY_PAID');
    expect(s.isEwtShort).toBe(false);
  });
});

describe('resolveReceivedIn', () => {
  const accounts = [
    { bankName: 'BDO', bankAccountName: 'YOWI', bankAccountNo: '001' },
    { bankName: 'RCBC', bankAccountName: 'YOWI', bankAccountNo: '777' },
  ];

  it('returns the matching account snapshot', () => {
    expect(resolveReceivedIn('BANK_TRANSFER', { bankName: 'RCBC', bankAccountNo: ' 777 ' }, accounts, true))
      .toEqual({ bankName: 'RCBC', bankAccountNo: '777' });
  });

  it('rejects an account the entity does not have', () => {
    expect(() => resolveReceivedIn('CHECK', { bankName: 'BPI', bankAccountNo: '1' }, accounts, true))
      .toThrow(/not one of this entity/);
  });

  it('requires an account for a manual bank transfer or check', () => {
    expect(() => resolveReceivedIn('BANK_TRANSFER', null, accounts, true)).toThrow(/Choose the bank account/);
    expect(() => resolveReceivedIn('CHECK', undefined, accounts, true)).toThrow(/Choose the bank account/);
  });

  it('lets cash and non-manual payments go without one', () => {
    expect(resolveReceivedIn('CASH', null, accounts, true)).toBeNull();
    expect(resolveReceivedIn('HITPAY', null, accounts, false)).toBeNull();
  });
});
