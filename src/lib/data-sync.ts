import { PrismaClient } from '@/generated/prisma';
import {
  fetchContracts,
  fetchRcbcEndClients,
  ContractSheetRow,
} from './google-sheets';

const prisma = new PrismaClient();

// Sync result for tracking
interface SyncResult {
  contractsCreated: number;
  contractsUpdated: number;
  contractsSkipped: number;
  rcbcClientsCreated: number;
  rcbcClientsUpdated: number;
  errors: string[];
}

// Map billing entity from sheet to company code
function mapBillingEntityToCompanyCode(billingEntity: string): 'YOWI' | 'ABBA' {
  const normalized = billingEntity.toUpperCase().trim();
  if (normalized.includes('ABBA')) return 'ABBA';
  // Handle variations: YOWI, YOWWI, YAHSHUA, etc.
  if (normalized.includes('YOWI') || normalized.includes('YOWWI') || normalized.includes('YAHSHUA')) return 'YOWI';
  return 'YOWI'; // Default to YOWI
}

// Map partner from sheet to partner code
function mapPartnerCode(partner: string, billingEntity: string): string {
  const normalized = partner.toLowerCase().trim();

  if (normalized.includes('globe') || normalized.includes('innove')) {
    return 'Globe';
  }
  if (normalized.includes('rcbc')) {
    return 'RCBC';
  }

  // Direct clients - use entity-specific partner
  // Handle variations: Direct-YOWI, Direct-YOWWI, Direct
  const companyCode = mapBillingEntityToCompanyCode(billingEntity);
  return companyCode === 'ABBA' ? 'Direct-ABBA' : 'Direct-YOWI';
}

// Sync contracts from Google Sheet to database
export async function syncContracts(): Promise<SyncResult> {
  const result: SyncResult = {
    contractsCreated: 0,
    contractsUpdated: 0,
    contractsSkipped: 0,
    rcbcClientsCreated: 0,
    rcbcClientsUpdated: 0,
    errors: [],
  };

  console.log('[Data Sync] Starting contract sync...');

  try {
    // Fetch contracts from Google Sheets
    const sheetContracts = await fetchContracts();
    console.log(`[Data Sync] Fetched ${sheetContracts.length} contracts from sheet`);

    // Get companies and partners from database
    const companies = await prisma.company.findMany();
    const partners = await prisma.partner.findMany();

    const companyMap = new Map(companies.map(c => [c.code, c]));
    const partnerMap = new Map(partners.map(p => [p.code, p]));

    for (const sheetContract of sheetContracts) {
      try {
        // Skip contracts without required fields
        if (!sheetContract.customerId || !sheetContract.companyName) {
          result.contractsSkipped++;
          continue;
        }

        // Determine company and partner
        const companyCode = mapBillingEntityToCompanyCode(sheetContract.billingEntity);
        const company = companyMap.get(companyCode);

        if (!company) {
          result.errors.push(`Company not found: ${companyCode} for ${sheetContract.companyName}`);
          result.contractsSkipped++;
          continue;
        }

        const partnerCode = mapPartnerCode(sheetContract.partner, sheetContract.billingEntity);
        const partner = partnerMap.get(partnerCode);

        if (!partner) {
          result.errors.push(`Partner not found: ${partnerCode} for ${sheetContract.companyName}`);
          result.contractsSkipped++;
          continue;
        }

        // Prepare contract data - using correct field names from schema
        const contractData = {
          customerId: sheetContract.customerId,
          companyName: sheetContract.companyName,  // This is the field name in schema
          productType: sheetContract.productType,
          monthlyFee: sheetContract.monthlyFee,
          paymentPlan: sheetContract.paymentPlan || null,
          contractStart: sheetContract.contractStart,
          nextDueDate: sheetContract.nextDueDate,
          lastPaymentDate: sheetContract.lastPaymentDate,
          status: sheetContract.status,
          vatType: sheetContract.vatType,
          billingType: sheetContract.billingType,
          contactPerson: sheetContract.contactPerson || null,
          email: sheetContract.email || null,
          tin: sheetContract.tin || null,
          mobile: sheetContract.mobile || null,
          remarks: sheetContract.remarks || null,
          billingEntityId: company.id,  // Correct field name
          partnerId: partner.id,
          sheetRowIndex: sheetContract.rowIndex,
        };

        // Check if contract exists - using correct field names
        const existingContract = await prisma.contract.findFirst({
          where: {
            customerId: sheetContract.customerId,
            billingEntityId: company.id,  // Correct field name
          },
        });

        if (existingContract) {
          // Update existing contract
          await prisma.contract.update({
            where: { id: existingContract.id },
            data: contractData,
          });
          result.contractsUpdated++;
        } else {
          // Create new contract
          await prisma.contract.create({
            data: contractData,
          });
          result.contractsCreated++;
        }
      } catch (error: any) {
        result.errors.push(`Error processing ${sheetContract.companyName}: ${error.message}`);
        result.contractsSkipped++;
      }
    }

    console.log(`[Data Sync] Contract sync complete:
      Created: ${result.contractsCreated}
      Updated: ${result.contractsUpdated}
      Skipped: ${result.contractsSkipped}
      Errors: ${result.errors.length}`);

  } catch (error: any) {
    result.errors.push(`Fatal error during sync: ${error.message}`);
    console.error('[Data Sync] Fatal error:', error);
  }

  return result;
}

// Sync RCBC end-clients from Google Sheet to database
export async function syncRcbcEndClients(monthStr?: string): Promise<SyncResult> {
  const result: SyncResult = {
    contractsCreated: 0,
    contractsUpdated: 0,
    contractsSkipped: 0,
    rcbcClientsCreated: 0,
    rcbcClientsUpdated: 0,
    errors: [],
  };

  console.log(`[Data Sync] Starting RCBC end-client sync for ${monthStr || 'current month'}...`);

  try {
    // Fetch RCBC end-clients from Google Sheets
    const rcbcClients = await fetchRcbcEndClients(undefined, monthStr);
    console.log(`[Data Sync] Fetched ${rcbcClients.length} RCBC end-clients from sheet`);

    // Parse the month string to a Date (first of the month)
    // Example: "JANUARY 2026" -> Date(2026, 0, 1)
    const parseMonthDate = (str: string): Date => {
      const parts = str.trim().split(/\s+/);
      if (parts.length < 2) return new Date();

      const monthNames: Record<string, number> = {
        'january': 0, 'february': 1, 'march': 2, 'april': 3,
        'may': 4, 'june': 5, 'july': 6, 'august': 7,
        'september': 8, 'october': 9, 'november': 10, 'december': 11,
        'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3,
        'jun': 5, 'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11,
      };

      const monthNum = monthNames[parts[0].toLowerCase()] ?? 0;
      const year = parseInt(parts[1]) || new Date().getFullYear();

      return new Date(year, monthNum, 1);
    };

    const billingMonth = parseMonthDate(monthStr || new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' }));

    for (const client of rcbcClients) {
      try {
        if (!client.companyName) {
          result.contractsSkipped++;
          continue;
        }

        // RcbcEndClient uses name + month as unique key
        const existingClient = await prisma.rcbcEndClient.findUnique({
          where: {
            name_month: {
              name: client.companyName,
              month: billingMonth,
            },
          },
        });

        const clientData = {
          name: client.companyName,
          employeeCount: client.employeeCount,
          month: billingMonth,
          isActive: true,
        };

        if (existingClient) {
          await prisma.rcbcEndClient.update({
            where: { id: existingClient.id },
            data: clientData,
          });
          result.rcbcClientsUpdated++;
        } else {
          await prisma.rcbcEndClient.create({
            data: clientData,
          });
          result.rcbcClientsCreated++;
        }
      } catch (error: any) {
        result.errors.push(`Error processing RCBC client ${client.companyName}: ${error.message}`);
      }
    }

    console.log(`[Data Sync] RCBC end-client sync complete:
      Created: ${result.rcbcClientsCreated}
      Updated: ${result.rcbcClientsUpdated}
      Errors: ${result.errors.length}`);

  } catch (error: any) {
    result.errors.push(`Fatal error during RCBC sync: ${error.message}`);
    console.error('[Data Sync] Fatal error:', error);
  }

  return result;
}

// Full sync: contracts + RCBC end-clients
export async function fullSync(rcbcMonth?: string): Promise<{
  contracts: SyncResult;
  rcbc: SyncResult;
}> {
  console.log('[Data Sync] Starting full sync...');

  const contracts = await syncContracts();
  const rcbc = await syncRcbcEndClients(rcbcMonth);

  console.log('[Data Sync] Full sync complete!');

  return { contracts, rcbc };
}

// Get sync status / preview without making changes
export async function previewSync(): Promise<{
  sheetContracts: number;
  dbContracts: number;
  newContracts: number;
  updateableContracts: number;
  partners: { code: string; count: number }[];
  entities: { entity: string; count: number }[];
}> {
  const sheetContracts = await fetchContracts();
  const dbContracts = await prisma.contract.count();

  // Get existing customer IDs
  const existingCustomerIds = new Set(
    (await prisma.contract.findMany({ select: { customerId: true } }))
      .map(c => c.customerId)
      .filter((id): id is string => id !== null)
  );

  // Count new vs updateable
  let newCount = 0;
  let updateCount = 0;
  const partnerCounts: Record<string, number> = {};
  const entityCounts: Record<string, number> = {};

  for (const contract of sheetContracts) {
    if (contract.customerId && existingCustomerIds.has(contract.customerId)) {
      updateCount++;
    } else {
      newCount++;
    }

    // Count by partner
    const partner = contract.partner || 'Direct';
    partnerCounts[partner] = (partnerCounts[partner] || 0) + 1;

    // Count by entity
    const entity = contract.billingEntity || 'Unknown';
    entityCounts[entity] = (entityCounts[entity] || 0) + 1;
  }

  return {
    sheetContracts: sheetContracts.length,
    dbContracts,
    newContracts: newCount,
    updateableContracts: updateCount,
    partners: Object.entries(partnerCounts).map(([code, count]) => ({ code, count })),
    entities: Object.entries(entityCounts).map(([entity, count]) => ({ entity, count })),
  };
}
