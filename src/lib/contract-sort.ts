// Type-only: this file is also imported by the client page, which must not
// pull in the Prisma runtime.
import type { Prisma } from '@/generated/prisma';

/** Sort choices offered on the Contracts page; anything else falls back to newest. */
export const CONTRACT_SORTS = {
  newest: 'Newest first',
  name_asc: 'Company A–Z',
  name_desc: 'Company Z–A',
  customer_no: 'Customer No.',
} as const;

export type ContractSort = keyof typeof CONTRACT_SORTS;

export function contractOrderBy(sort: string | null): Prisma.ContractOrderByWithRelationInput[] {
  // id breaks ties so pages never repeat or skip a row between requests.
  switch (sort) {
    case 'name_asc':
      return [{ companyName: 'asc' }, { productType: 'asc' }, { id: 'asc' }];
    case 'name_desc':
      return [{ companyName: 'desc' }, { productType: 'asc' }, { id: 'asc' }];
    case 'customer_no':
      return [{ customerNumber: 'asc' }, { id: 'asc' }];
    default:
      return [{ createdAt: 'desc' }, { id: 'asc' }];
  }
}
