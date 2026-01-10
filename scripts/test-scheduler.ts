/**
 * Test script for the scheduler's frequency-based auto-send logic
 * Run with: npx tsx scripts/test-scheduler.ts
 */

import { triggerBillingJob } from '../src/lib/scheduler';

async function main() {
  console.log('='.repeat(60));
  console.log('Testing Scheduler with Frequency-Based Auto-Send');
  console.log('='.repeat(60));
  console.log('');
  console.log('Expected behavior:');
  console.log('- MONTHLY invoices: Auto-approve + Auto-send');
  console.log('- QUARTERLY invoices: Auto-approve + Auto-send');
  console.log('- ANNUALLY invoices: Stay PENDING + Renewal notification');
  console.log('');
  console.log('-'.repeat(60));
  console.log('Starting billing job...');
  console.log('-'.repeat(60));
  console.log('');

  try {
    const result = await triggerBillingJob();

    console.log('');
    console.log('='.repeat(60));
    console.log('RESULTS:');
    console.log('='.repeat(60));
    console.log(`Total processed: ${result.processed}`);
    console.log(`Auto-sent: ${result.autoSent}`);
    console.log(`Pending approval: ${result.pendingApproval}`);
    console.log(`Errors: ${result.errors.length}`);

    if (result.errors.length > 0) {
      console.log('');
      console.log('Errors:');
      result.errors.forEach((err: any, i: number) => {
        console.log(`  ${i + 1}. ${err.billingNo || err.contractId}: ${err.error}`);
      });
    }
  } catch (error) {
    console.error('Job failed:', error);
  }

  process.exit(0);
}

main();
