import * as dotenv from 'dotenv';
dotenv.config();

import {
  fetchContracts,
  fetchRcbcEndClients,
  getSheetMetadata,
  getContractsSummary,
  getRcbcAvailableMonths,
} from '../src/lib/google-sheets';
import { previewSync } from '../src/lib/data-sync';

async function testDataSync() {
  console.log('='.repeat(60));
  console.log('BILLING AGENT - DATA SYNC TEST');
  console.log('='.repeat(60));

  try {
    // Test 1: Contract Sheet Metadata
    console.log('\n[1] CONTRACT SHEET METADATA');
    console.log('-'.repeat(40));
    const contractSheetId = process.env.CONTRACT_SHEET_ID;
    if (!contractSheetId) {
      throw new Error('CONTRACT_SHEET_ID not set in .env');
    }
    const contractMeta = await getSheetMetadata(contractSheetId);
    console.log(`Title: ${contractMeta.title}`);
    console.log('Tabs:');
    contractMeta.sheets.forEach((sheet, i) => {
      console.log(`  ${i + 1}. "${sheet.title}" (${sheet.rowCount} rows)`);
    });

    // Test 2: Fetch Contracts
    console.log('\n[2] FETCH CONTRACTS');
    console.log('-'.repeat(40));
    const contracts = await fetchContracts();
    console.log(`Total contracts fetched: ${contracts.length}`);

    if (contracts.length > 0) {
      console.log('\nFirst 5 contracts:');
      contracts.slice(0, 5).forEach((c, i) => {
        console.log(`  ${i + 1}. ${c.companyName}`);
        console.log(`     ID: ${c.customerId}, Partner: ${c.partner}, Entity: ${c.billingEntity}`);
        console.log(`     Fee: ₱${c.monthlyFee.toLocaleString()}, Status: ${c.status}`);
        console.log(`     Next Due: ${c.nextDueDate?.toLocaleDateString() || 'N/A'}`);
      });
    }

    // Test 3: Contracts Summary
    console.log('\n[3] CONTRACTS SUMMARY');
    console.log('-'.repeat(40));
    const summary = await getContractsSummary();
    console.log(`Total Contracts: ${summary.totalContracts}`);
    console.log(`Active Contracts: ${summary.activeContracts}`);
    console.log(`Total Monthly Revenue: ₱${summary.totalMonthlyRevenue.toLocaleString()}`);
    console.log('\nBy Partner:');
    Object.entries(summary.byPartner).forEach(([partner, count]) => {
      console.log(`  ${partner}: ${count}`);
    });
    console.log('\nBy Billing Entity:');
    Object.entries(summary.byEntity).forEach(([entity, count]) => {
      console.log(`  ${entity}: ${count}`);
    });
    console.log('\nBy Status:');
    Object.entries(summary.byStatus).forEach(([status, count]) => {
      console.log(`  ${status}: ${count}`);
    });

    // Test 4: RCBC Sheet
    console.log('\n[4] RCBC SHEET');
    console.log('-'.repeat(40));
    const rcbcSheetId = process.env.RCBC_SHEET_ID;
    if (!rcbcSheetId) {
      console.log('RCBC_SHEET_ID not set - skipping');
    } else {
      const rcbcMeta = await getSheetMetadata(rcbcSheetId);
      console.log(`Title: ${rcbcMeta.title}`);
      console.log('Available months:');
      const months = await getRcbcAvailableMonths();
      months.forEach((month, i) => {
        console.log(`  ${i + 1}. ${month}`);
      });

      // Fetch from first available month
      if (months.length > 0) {
        console.log(`\nFetching from "${months[0]}"...`);
        const rcbcClients = await fetchRcbcEndClients(undefined, months[0]);
        console.log(`RCBC end-clients: ${rcbcClients.length}`);

        if (rcbcClients.length > 0) {
          console.log('\nFirst 5 RCBC end-clients:');
          rcbcClients.slice(0, 5).forEach((c, i) => {
            console.log(`  ${i + 1}. ${c.companyName}`);
            console.log(`     Employees: ${c.employeeCount}, Net: ₱${c.netAmount.toLocaleString()}`);
          });
        }
      }
    }

    // Test 5: Preview Sync
    console.log('\n[5] SYNC PREVIEW');
    console.log('-'.repeat(40));
    try {
      const preview = await previewSync();
      console.log(`Sheet contracts: ${preview.sheetContracts}`);
      console.log(`DB contracts: ${preview.dbContracts}`);
      console.log(`New to create: ${preview.newContracts}`);
      console.log(`To update: ${preview.updateableContracts}`);
    } catch (error: any) {
      console.log(`Note: Preview requires database connection`);
      console.log(`Error: ${error.message}`);
    }

    console.log('\n' + '='.repeat(60));
    console.log('DATA SYNC TEST COMPLETE');
    console.log('='.repeat(60));

  } catch (error: any) {
    console.error('\nError:', error.message);
    if (error.message.includes('not found') || error.message.includes('403')) {
      console.log('\nMake sure the sheets are shared with:');
      console.log('  billing-agent@billing-agent-483909.iam.gserviceaccount.com');
    }
    process.exit(1);
  }
}

testDataSync();
