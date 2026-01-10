import * as dotenv from 'dotenv';
dotenv.config();

import { triggerBillingJob, getSchedulerStatus } from '../src/lib/scheduler';

async function main() {
  console.log('='.repeat(50));
  console.log('MANUAL BILLING RUN');
  console.log('='.repeat(50));

  console.log('\n[1] Scheduler Status:');
  const status = getSchedulerStatus();
  console.log(`  Running: ${status.running}`);
  console.log(`  Config: ${JSON.stringify(status.config)}`);

  console.log('\n[2] Triggering billing job...');
  console.log('-'.repeat(50));

  try {
    const result = await triggerBillingJob();
    console.log('\n[3] Results:');
    console.log(`  Processed: ${result.processed}`);
    console.log(`  Errors: ${result.errors?.length || 0}`);

    if (result.errors && result.errors.length > 0) {
      console.log('\n  Error details:');
      result.errors.forEach((err: string, i: number) => {
        console.log(`    ${i + 1}. ${err}`);
      });
    }

    console.log('\n' + '='.repeat(50));
    console.log('BILLING RUN COMPLETE');
    console.log('='.repeat(50));
  } catch (error: any) {
    console.error('\nError:', error.message);
    process.exit(1);
  }
}

main();
