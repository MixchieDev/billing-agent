// Type-only: this file is also imported by the client page, which must not
// pull in the Prisma runtime.
import type { Prisma } from '@/generated/prisma';

/**
 * Payment plan choices offered on the Contracts page. The field is free text
 * (the form writes Monthly / Quarterly / Annual / Custom, CSV imports write
 * whatever the sheet said), so each choice matches by keyword the same way
 * billing-service maps a plan to a billing frequency.
 */
export const PAYMENT_PLAN_FILTERS = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annual: 'Annual',
  custom: 'Custom',
  none: 'Not set',
} as const;

export type PaymentPlanFilter = keyof typeof PAYMENT_PLAN_FILTERS;

const has = (word: string): Prisma.ContractWhereInput => ({
  paymentPlan: { contains: word, mode: 'insensitive' },
});
const ANNUAL = [has('annual'), has('yearly')];
const QUARTERLY = [has('quarter')];
const CUSTOM = [has('custom')];
const NOT_SET: Prisma.ContractWhereInput[] = [{ paymentPlan: null }, { paymentPlan: '' }];

/** Where clause for one payment plan choice; null for anything unrecognised. */
export function paymentPlanWhere(plan: string | null): Prisma.ContractWhereInput | null {
  switch (plan) {
    case 'annual':
      return { OR: ANNUAL };
    case 'quarterly':
      return { OR: QUARTERLY, NOT: ANNUAL };
    case 'custom':
      return { OR: CUSTOM, NOT: [...ANNUAL, ...QUARTERLY] };
    case 'none':
      return { OR: NOT_SET };
    case 'monthly':
      // Everything with a plan that isn't one of the others, as billing does.
      return { NOT: [...NOT_SET, ...ANNUAL, ...QUARTERLY, ...CUSTOM] };
    default:
      return null;
  }
}
