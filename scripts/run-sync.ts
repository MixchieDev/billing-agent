import * as dotenv from 'dotenv';
dotenv.config();

import { syncContracts, syncRcbcEndClients, previewSync } from '../src/lib/data-sync';

async function runSync() {
  console.log('='.repeat(60));
  console.log('BILLING AGENT - DATA SYNC');
  console.log('='.repeat(60));

  try {
    // Preview first
    console.log('\n[1] SYNC PREVIEW');
    console.log('-'.repeat(40));
    const preview = await previewSync();
    console.log(`Sheet contracts: ${preview.sheetContracts}`);
    console.log(`DB contracts: ${preview.dbContracts}`);
    console.log(`New to create: ${preview.newContracts}`);
    console.log(`To update: ${preview.updateableContracts}`);

    // Sync contracts
    console.log('\n[2] SYNCING CONTRACTS');
    console.log('-'.repeat(40));
    const contractResult = await syncContracts();
    console.log(`Created: ${contractResult.contractsCreated}`);
    console.log(`Updated: ${contractResult.contractsUpdated}`);
    console.log(`Skipped: ${contractResult.contractsSkipped}`);
    if (contractResult.errors.length > 0) {
      console.log('\nErrors:');
      contractResult.errors.forEach(err => console.log(`  - ${err}`));
    }

    // Sync RCBC end-clients (use latest month)
    console.log('\n[3] SYNCING RCBC END-CLIENTS');
    console.log('-'.repeat(40));
    const rcbcResult = await syncRcbcEndClients('JANUARY 2026');
    console.log(`Created: ${rcbcResult.rcbcClientsCreated}`);
    console.log(`Updated: ${rcbcResult.rcbcClientsUpdated}`);
    if (rcbcResult.errors.length > 0) {
      console.log('\nErrors:');
      rcbcResult.errors.forEach(err => console.log(`  - ${err}`));
    }

    // Verify
    console.log('\n[4] VERIFICATION');
    console.log('-'.repeat(40));
    const afterPreview = await previewSync();
    console.log(`DB contracts after sync: ${afterPreview.dbContracts}`);

    console.log('\n' + '='.repeat(60));
    console.log('DATA SYNC COMPLETE');
    console.log('='.repeat(60));

  } catch (error: any) {
    console.error('\nError:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

runSync();
