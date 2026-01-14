/**
 * Migration Script: Contracts -> ScheduledBilling
 *
 * This script migrates existing contracts with billingDayOfMonth
 * to the new ScheduledBilling model.
 *
 * Run with: npx tsx scripts/migrate-to-scheduled-billing.ts
 */

import { PrismaClient, ContractStatus, BillingFrequency, VatType, ScheduleStatus } from '../src/generated/prisma';

const prisma = new PrismaClient();

async function migrateToScheduledBilling() {
  console.log('Starting migration: Contracts -> ScheduledBilling\n');

  // Get all active contracts with billingDayOfMonth set
  const contracts = await prisma.contract.findMany({
    where: {
      status: ContractStatus.ACTIVE,
      billingDayOfMonth: { not: null },
    },
    include: {
      billingEntity: true,
      partner: true,
    },
  });

  console.log(`Found ${contracts.length} contracts with billingDayOfMonth set\n`);

  let migrated = 0;
  let skipped = 0;
  let errors = 0;

  for (const contract of contracts) {
    try {
      // Check if a ScheduledBilling already exists for this contract
      const existing = await prisma.scheduledBilling.findFirst({
        where: { contractId: contract.id },
      });

      if (existing) {
        console.log(`  [SKIP] ${contract.companyName} - ScheduledBilling already exists`);
        skipped++;
        continue;
      }

      // Determine billing frequency from paymentPlan
      let frequency = BillingFrequency.MONTHLY;
      const paymentPlan = (contract.paymentPlan || '').toLowerCase();
      if (paymentPlan.includes('annual') || paymentPlan.includes('yearly')) {
        frequency = BillingFrequency.ANNUALLY;
      } else if (paymentPlan.includes('quarter')) {
        frequency = BillingFrequency.QUARTERLY;
      }

      // Calculate billing amount
      const billingAmount = Number(contract.billingAmount || contract.monthlyFee);

      // Calculate next billing date
      const now = new Date();
      const billingDay = contract.billingDayOfMonth!;
      let nextBillingDate = new Date(now.getFullYear(), now.getMonth(), billingDay);

      // Handle months with fewer days
      const lastDayOfMonth = new Date(nextBillingDate.getFullYear(), nextBillingDate.getMonth() + 1, 0).getDate();
      if (billingDay > lastDayOfMonth) {
        nextBillingDate.setDate(lastDayOfMonth);
      }

      // If date has passed, move to next period
      if (nextBillingDate <= now) {
        switch (frequency) {
          case BillingFrequency.MONTHLY:
            nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
            break;
          case BillingFrequency.QUARTERLY:
            nextBillingDate.setMonth(nextBillingDate.getMonth() + 3);
            break;
          case BillingFrequency.ANNUALLY:
            nextBillingDate.setFullYear(nextBillingDate.getFullYear() + 1);
            break;
        }

        // Re-adjust for month length
        const newLastDay = new Date(nextBillingDate.getFullYear(), nextBillingDate.getMonth() + 1, 0).getDate();
        if (billingDay > newLastDay) {
          nextBillingDate.setDate(newLastDay);
        } else {
          nextBillingDate.setDate(billingDay);
        }
      }

      // Create description from product type
      const description = contract.productType.charAt(0) + contract.productType.slice(1).toLowerCase() + ' Services';

      // Create ScheduledBilling
      const scheduledBilling = await prisma.scheduledBilling.create({
        data: {
          contractId: contract.id,
          billingEntityId: contract.billingEntityId,
          billingAmount,
          vatType: contract.vatType || VatType.VAT,
          hasWithholding: Number(contract.withholdingTax || 0) > 0,
          description,
          frequency,
          billingDayOfMonth: billingDay,
          startDate: contract.contractStart || new Date(),
          endDate: contract.contractEndDate,
          nextBillingDate,
          autoApprove: contract.autoApprove,
          autoSendEnabled: contract.autoSendEnabled,
          status: ScheduleStatus.ACTIVE,
          remarks: contract.remarks,
        },
      });

      console.log(`  [OK] ${contract.companyName}`);
      console.log(`       - Amount: ${billingAmount.toLocaleString()}`);
      console.log(`       - Day: ${billingDay}, Freq: ${frequency}`);
      console.log(`       - Next: ${nextBillingDate.toLocaleDateString()}`);
      console.log(`       - AutoApprove: ${contract.autoApprove}, AutoSend: ${contract.autoSendEnabled}`);
      console.log(`       - ID: ${scheduledBilling.id}`);
      console.log('');

      migrated++;
    } catch (error) {
      console.error(`  [ERROR] ${contract.companyName}:`, error);
      errors++;
    }
  }

  console.log('\n========================================');
  console.log('Migration Complete');
  console.log('========================================');
  console.log(`Migrated: ${migrated}`);
  console.log(`Skipped:  ${skipped}`);
  console.log(`Errors:   ${errors}`);
  console.log(`Total:    ${contracts.length}`);
}

async function main() {
  try {
    await migrateToScheduledBilling();
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
