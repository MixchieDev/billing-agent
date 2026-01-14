/**
 * Data migration script to populate billingDayOfMonth and autoApprove fields
 * from existing contract data.
 *
 * Run with: npx tsx scripts/migrate-billing-fields.ts
 */

import { PrismaClient } from '../src/generated/prisma';

const prisma = new PrismaClient();

async function migrateBillingFields() {
  console.log('Starting billing fields migration...');

  const contracts = await prisma.contract.findMany({
    select: {
      id: true,
      companyName: true,
      nextDueDate: true,
      paymentPlan: true,
      billingDayOfMonth: true,
      autoApprove: true,
    },
  });

  console.log(`Found ${contracts.length} contracts to process`);

  let updated = 0;
  let skipped = 0;

  for (const contract of contracts) {
    // Skip if already migrated
    if (contract.billingDayOfMonth !== null) {
      console.log(`Skipping ${contract.companyName} - already has billingDayOfMonth`);
      skipped++;
      continue;
    }

    // Extract day of month from nextDueDate
    let billingDayOfMonth: number | null = null;
    if (contract.nextDueDate) {
      billingDayOfMonth = contract.nextDueDate.getDate();
    }

    // Determine autoApprove based on paymentPlan
    // Annual contracts require manual review, others can be auto-approved
    const paymentPlan = contract.paymentPlan?.toLowerCase() || '';
    const isAnnual = paymentPlan.includes('annual') || paymentPlan.includes('yearly');
    const autoApprove = !isAnnual;

    await prisma.contract.update({
      where: { id: contract.id },
      data: {
        billingDayOfMonth,
        autoApprove,
      },
    });

    console.log(
      `Updated ${contract.companyName}: billingDayOfMonth=${billingDayOfMonth}, autoApprove=${autoApprove}`
    );
    updated++;
  }

  console.log('\n--- Migration Summary ---');
  console.log(`Total contracts: ${contracts.length}`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped (already migrated): ${skipped}`);
  console.log('Migration complete!');
}

migrateBillingFields()
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
