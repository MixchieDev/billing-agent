/**
 * One-off backfill for the collections upgrade (Phase 1, PR-1).
 *
 * Populates the new payment/collections columns from the existing single-payment
 * fields, WITHOUT dropping the legacy fields:
 *   1. amountPaidTotal / balanceDue on every invoice.
 *   2. one InvoicePayment row per already-PAID invoice (legacy payment → row).
 *   3. wht2307Status = PENDING for PAID invoices that had withholding.
 *
 * Idempotent: re-running recomputes the same totals and skips invoices that
 * already have payment rows, so it will not duplicate or inflate anything.
 *
 * Run against a target by setting DATABASE_URL, e.g. staging:
 *   set -a && . ./.env.staging && set +a && \
 *   DATABASE_URL="$STAGING_DATABASE_URL" npx tsx prisma/backfill-collections.ts
 */

import { PrismaClient, Prisma } from '../src/generated/prisma';

const prisma = new PrismaClient();

const PAGE = 200;

// Fields the backfill reads; keeps the query lean.
const select = {
  id: true,
  status: true,
  netAmount: true,
  paidAmount: true,
  paidAt: true,
  paymentMethod: true,
  paymentReference: true,
  withholdingTax: true,
} as const;

async function main() {
  const total = await prisma.invoice.count();
  console.log(`[backfill] invoices on target: ${total}`);

  let processed = 0;
  let paymentsCreated = 0;
  let wht2307Pending = 0;
  let cursor: string | undefined;

  // Walk the whole table by id cursor so memory stays flat on large datasets.
  for (;;) {
    const batch = await prisma.invoice.findMany({
      take: PAGE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
      select,
    });
    if (batch.length === 0) break;

    for (const inv of batch) {
      const net = inv.netAmount; // Decimal
      const isPaid = inv.status === 'PAID';
      const amountPaidTotal = isPaid
        ? inv.paidAmount ?? net
        : new Prisma.Decimal(0);
      const balanceDue = net.minus(amountPaidTotal);

      const hasWithholding =
        inv.withholdingTax != null && inv.withholdingTax.greaterThan(0);
      const wht2307Status =
        isPaid && hasWithholding ? 'PENDING' : 'NOT_APPLICABLE';
      if (wht2307Status === 'PENDING') wht2307Pending++;

      await prisma.invoice.update({
        where: { id: inv.id },
        data: { amountPaidTotal, balanceDue, wht2307Status },
      });

      // Convert the legacy single payment into an InvoicePayment row, once.
      if (isPaid && inv.paidAt) {
        const existing = await prisma.invoicePayment.count({
          where: { invoiceId: inv.id },
        });
        if (existing === 0) {
          await prisma.invoicePayment.create({
            data: {
              invoiceId: inv.id,
              amount: inv.paidAmount ?? net,
              method: inv.paymentMethod ?? 'BANK_TRANSFER',
              reference: inv.paymentReference,
              paidDate: inv.paidAt,
              source: 'MANUAL',
            },
          });
          paymentsCreated++;
        }
      }

      processed++;
      cursor = inv.id;
    }
    console.log(`[backfill] processed ${processed}/${total}…`);
  }

  console.log(
    `[backfill] done. processed=${processed} paymentsCreated=${paymentsCreated} wht2307Pending=${wht2307Pending}`
  );
}

main()
  .catch((e) => {
    console.error('[backfill] FAILED:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
