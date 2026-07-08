/** Unit tests for the pure settlement decision (collections PR-2). */
import { Prisma } from '@/generated/prisma';
import { computeSettlement } from '@/lib/payment-service';

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
