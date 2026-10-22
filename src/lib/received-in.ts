/**
 * "Received in" — which of an entity's bank accounts a payment landed in.
 * Client-safe (no Prisma client import) so the filter UI can share the keys.
 */
import type { Prisma } from '@/generated/prisma';

export interface ReceivedIn {
  bankName: string;
  bankAccountNo: string;
}

/** Filter value for paid invoices whose payments name no account. */
export const RECEIVED_IN_NONE = 'NONE';

/** One account as a single filter / select value: `BANK|NUMBER`. */
export const receivedInKey = (a: ReceivedIn) => `${a.bankName}|${a.bankAccountNo}`;

/** Invoice filter for a `receivedIn` query value; empty when unset or malformed. */
export function receivedInWhere(value: string | null | undefined): Prisma.InvoiceWhereInput {
  if (!value) return {};
  if (value === RECEIVED_IN_NONE) {
    // Has payments, none of them with an account (older or HitPay payments).
    return { payments: { some: {}, none: { receivedInBank: { not: null } } } };
  }
  const sep = value.indexOf('|');
  if (sep < 0) return {};
  return {
    payments: {
      some: { receivedInBank: value.slice(0, sep), receivedInAccountNo: value.slice(sep + 1) },
    },
  };
}
