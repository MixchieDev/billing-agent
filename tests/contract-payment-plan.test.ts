/** Unit tests for the Contracts page payment plan filter. */
import { paymentPlanWhere, PAYMENT_PLAN_FILTERS, type PaymentPlanFilter } from '@/lib/contract-payment-plan';

// Evaluates the where clause the way Postgres would for one paymentPlan value,
// so the tests check which contracts match rather than the clause's shape.
type Where = { paymentPlan?: any; OR?: Where[]; NOT?: Where[] };
function matches(w: Where, plan: string | null): boolean | null {
  if ('paymentPlan' in w) {
    const f = w.paymentPlan;
    if (f === null) return plan === null;
    if (typeof f === 'string') return plan === null ? null : plan === f;
    if (plan === null) return null; // ILIKE on NULL is NULL
    return plan.toLowerCase().includes(String(f.contains).toLowerCase());
  }
  let result: boolean | null = true;
  if (w.OR) {
    const r = w.OR.map((x) => matches(x, plan));
    result = r.includes(true) ? true : r.includes(null) ? null : false;
  }
  for (const n of w.NOT ?? []) {
    const r = matches(n, plan);
    const negated = r === null ? null : !r;
    if (negated === false || result === false) result = false;
    else if (negated === null || result === null) result = null;
  }
  return result;
}

const SAMPLES: (string | null)[] = [
  'Monthly', 'monthly ', 'Quarterly', 'QUARTER', 'Annual', 'Annually', 'Yearly',
  'Custom', 'Semi-annual', 'Every 2 months', '', null,
];

function planned(filter: PaymentPlanFilter) {
  const w = paymentPlanWhere(filter)!;
  return SAMPLES.filter((p) => matches(w as Where, p) === true);
}

describe('paymentPlanWhere', () => {
  it('unknown or empty choice → no filter', () => {
    expect(paymentPlanWhere(null)).toBeNull();
    expect(paymentPlanWhere('')).toBeNull();
    expect(paymentPlanWhere('weekly')).toBeNull();
  });

  it('matches by keyword, ignoring case', () => {
    expect(planned('annual')).toEqual(['Annual', 'Annually', 'Yearly', 'Semi-annual']);
    expect(planned('quarterly')).toEqual(['Quarterly', 'QUARTER']);
    expect(planned('custom')).toEqual(['Custom']);
    expect(planned('none')).toEqual(['', null]);
    expect(planned('monthly')).toEqual(['Monthly', 'monthly ', 'Every 2 months']);
  });

  it('every contract falls under exactly one choice', () => {
    const choices = Object.keys(PAYMENT_PLAN_FILTERS) as PaymentPlanFilter[];
    for (const p of SAMPLES) {
      const hits = choices.filter((c) => matches(paymentPlanWhere(c) as Where, p) === true);
      expect([p, hits.length]).toEqual([p, 1]);
    }
  });
});
