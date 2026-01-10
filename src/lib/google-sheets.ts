import { google, sheets_v4 } from 'googleapis';
import { ProductType, ContractStatus, VatType, BillingType } from '@/generated/prisma';

// Google Sheets configuration
interface SheetsConfig {
  credentialsPath?: string;
  clientEmail?: string;
  privateKey?: string;
  contractSheetId: string;
  rcbcSheetId: string;
}

// Contract row from Google Sheets - mapped to verified column structure
// Columns: A-AF (32 columns total)
export interface ContractSheetRow {
  customerId: string;          // A: Customer ID
  companyName: string;         // B: Company Name
  productType: ProductType;    // C: Product Type
  partner: string;             // D: Partner
  billingEntity: string;       // E: Billing Entity (YOWI or ABBA)
  monthlyFee: number;          // F: Monthly Fee (Net of VAT)
  paymentPlan: string;         // G: Payment Plan
  contractStart: Date | null;  // H: Contract Start
  nextDueDate: Date | null;    // I: Next Due Date
  lastPaymentDate: Date | null; // J: Last Payment Date
  clientSince: Date | null;    // K: Client Since
  monthsUnpaid: number;        // L: Months Unpaid
  amountDue: number;           // M: Amount Due
  vatType: VatType;            // N: VAT Type
  withholdingCode: string;     // O: Withholding Code
  vatRate: number;             // P: VAT Rate
  vatAmount: number;           // Q: VAT Amount
  totalWithVat: number;        // R: Total with VAT
  withholdingRate: number;     // S: Withholding Rate
  withholdingTax: number;      // T: Withholding Tax
  netReceivable: number;       // U: Net Receivable
  lifetimeValue: number;       // V: Lifetime Value
  status: ContractStatus;      // W: Status
  contactPerson: string;       // X: Contact Person
  email: string;               // Y: Email
  tin: string;                 // Z: TIN
  mobile: string;              // AA: Mobile
  address: string;             // AB: Address
  industry: string;            // AC: Industry
  renewalRisk: string;         // AD: Renewal Risk
  billingType: BillingType;    // AE: Billing Type
  remarks: string;             // AF: Remarks
  rowIndex: number;            // Track row for reference
}

// RCBC end-client row from monthly tabs
export interface RcbcEndClientRow {
  count: number;
  companyName: string;
  employeeCount: number;
  netAmount: number;
  vat: number;
  withholdingTax: number;
  total: number;
  totalNetOfWtax: number;
}

let sheetsClient: sheets_v4.Sheets | null = null;
let currentConfig: SheetsConfig | null = null;

// Initialize Google Sheets client
export async function initGoogleSheets(config: SheetsConfig): Promise<sheets_v4.Sheets> {
  currentConfig = config;

  let auth;

  if (config.credentialsPath) {
    // Use credentials file (preferred)
    auth = new google.auth.GoogleAuth({
      keyFile: config.credentialsPath,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
  } else if (config.clientEmail && config.privateKey) {
    // Use inline credentials
    auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: config.clientEmail,
        private_key: config.privateKey.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
  } else {
    throw new Error('Either credentialsPath or clientEmail/privateKey must be provided');
  }

  const authClient = await auth.getClient();
  sheetsClient = google.sheets({ version: 'v4', auth: authClient as any });

  return sheetsClient;
}

// Get the client (initializing with env vars if needed)
export async function getGoogleSheetsClient(): Promise<sheets_v4.Sheets> {
  if (sheetsClient) {
    return sheetsClient;
  }

  // Initialize with environment variables
  const credentialsPath = process.env.GOOGLE_CREDENTIALS_PATH || '/Users/yahshua/Downloads/billing-agent-483909-eeee6543edbd.json';

  return initGoogleSheets({
    credentialsPath,
    contractSheetId: process.env.CONTRACT_SHEET_ID || '',
    rcbcSheetId: process.env.RCBC_SHEET_ID || '',
  });
}

// Parse date from various formats (handles Google Sheets date formats)
function parseDate(value: string | null | undefined): Date | null {
  if (!value || value.trim() === '') return null;

  // Try parsing as-is first
  let date = new Date(value);
  if (!isNaN(date.getTime())) return date;

  // Try MM/DD/YYYY format
  const mdyMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdyMatch) {
    date = new Date(parseInt(mdyMatch[3]), parseInt(mdyMatch[1]) - 1, parseInt(mdyMatch[2]));
    if (!isNaN(date.getTime())) return date;
  }

  // Try DD/MM/YYYY format
  const dmyMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmyMatch) {
    date = new Date(parseInt(dmyMatch[3]), parseInt(dmyMatch[2]) - 1, parseInt(dmyMatch[1]));
    if (!isNaN(date.getTime())) return date;
  }

  return null;
}

// Parse number from string (handles currency formatting)
function parseNumber(value: string | null | undefined): number {
  if (!value || value.trim() === '') return 0;
  // Remove currency symbols, commas, spaces
  const cleaned = value.toString().replace(/[₱$,\s]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

// Map product type string to enum
function mapProductType(value: string): ProductType {
  if (!value) return ProductType.ACCOUNTING;

  const normalized = value.toLowerCase().trim();
  const map: Record<string, ProductType> = {
    'accounting': ProductType.ACCOUNTING,
    'payroll': ProductType.PAYROLL,
    'compliance': ProductType.COMPLIANCE,
    'hr': ProductType.HR,
    'human resources': ProductType.HR,
  };
  return map[normalized] || ProductType.ACCOUNTING;
}

// Map contract status string to enum
function mapContractStatus(value: string): ContractStatus {
  if (!value) return ContractStatus.NOT_STARTED;

  const normalized = value.toLowerCase().trim();
  const map: Record<string, ContractStatus> = {
    'active': ContractStatus.ACTIVE,
    'inactive': ContractStatus.INACTIVE,
    'stopped': ContractStatus.STOPPED,
    'not started': ContractStatus.NOT_STARTED,
    'pending': ContractStatus.NOT_STARTED,
  };
  return map[normalized] || ContractStatus.NOT_STARTED;
}

// Map VAT type string to enum
function mapVatType(value: string): VatType {
  if (!value) return VatType.VAT;
  const normalized = value.toLowerCase().trim();
  return normalized === 'non-vat' || normalized === 'non vat' ? VatType.NON_VAT : VatType.VAT;
}

// Map billing type string to enum
function mapBillingType(value: string): BillingType {
  if (!value) return BillingType.RECURRING;
  const normalized = value.toLowerCase().trim();
  return normalized === 'one-time' || normalized === 'one time' || normalized === 'onetime'
    ? BillingType.ONE_TIME
    : BillingType.RECURRING;
}

// Get sheet metadata (tab names, etc.)
export async function getSheetMetadata(sheetId: string): Promise<{
  title: string;
  sheets: { title: string; rowCount: number }[];
}> {
  const client = await getGoogleSheetsClient();

  const meta = await client.spreadsheets.get({
    spreadsheetId: sheetId,
    fields: 'properties.title,sheets.properties',
  });

  return {
    title: meta.data.properties?.title || '',
    sheets: (meta.data.sheets || []).map((sheet: any) => ({
      title: sheet.properties?.title || '',
      rowCount: sheet.properties?.gridProperties?.rowCount || 0,
    })),
  };
}

// Get headers from a sheet
export async function getSheetHeaders(sheetId: string, sheetName?: string): Promise<string[]> {
  const client = await getGoogleSheetsClient();

  // Get actual sheet name if not provided
  let tabName = sheetName;
  if (!tabName) {
    const meta = await getSheetMetadata(sheetId);
    tabName = meta.sheets[0]?.title || 'Sheet1';
  }

  const response = await client.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `'${tabName}'!1:1`,
  });

  return response.data.values?.[0] || [];
}

// Fetch contracts from Google Sheet with verified column mapping
export async function fetchContracts(sheetId?: string): Promise<ContractSheetRow[]> {
  const client = await getGoogleSheetsClient();
  const spreadsheetId = sheetId || process.env.CONTRACT_SHEET_ID;

  if (!spreadsheetId) {
    throw new Error('Contract Sheet ID not provided');
  }

  // Get the actual sheet name (it's "Contracts" based on testing)
  const meta = await getSheetMetadata(spreadsheetId);
  const contractsTab = meta.sheets.find(s => s.title.toLowerCase() === 'contracts');
  const tabName = contractsTab?.title || meta.sheets[0]?.title || 'Sheet1';

  console.log(`[Google Sheets] Reading from tab: "${tabName}"`);

  // Read all data starting from row 2 (after headers)
  // Columns A through AF (32 columns)
  const response = await client.spreadsheets.values.get({
    spreadsheetId,
    range: `'${tabName}'!A2:AF`,
  });

  const rows = response.data.values || [];
  console.log(`[Google Sheets] Found ${rows.length} contract rows`);

  return rows
    .map((row: string[], index: number) => {
      // Skip empty rows
      if (!row[0] && !row[1]) return null;

      // Skip instruction/header rows (customer ID should start with CUST or be a valid ID format)
      const customerId = row[0] || '';
      if (customerId.includes('INPUT') || customerId.includes('FORMULA') || customerId.includes('⬇️')) {
        return null;
      }

      return {
        customerId: row[0] || '',           // A: Customer ID
        companyName: row[1] || '',          // B: Company Name
        productType: mapProductType(row[2] || ''),  // C: Product Type
        partner: row[3] || '',              // D: Partner
        billingEntity: row[4] || '',        // E: Billing Entity
        monthlyFee: parseNumber(row[5]),    // F: Monthly Fee (Net of VAT)
        paymentPlan: row[6] || '',          // G: Payment Plan
        contractStart: parseDate(row[7]),   // H: Contract Start
        nextDueDate: parseDate(row[8]),     // I: Next Due Date
        lastPaymentDate: parseDate(row[9]), // J: Last Payment Date
        clientSince: parseDate(row[10]),    // K: Client Since
        monthsUnpaid: parseInt(row[11]) || 0, // L: Months Unpaid
        amountDue: parseNumber(row[12]),    // M: Amount Due
        vatType: mapVatType(row[13] || ''), // N: VAT Type
        withholdingCode: row[14] || '',     // O: Withholding Code
        vatRate: parseNumber(row[15]),      // P: VAT Rate
        vatAmount: parseNumber(row[16]),    // Q: VAT Amount
        totalWithVat: parseNumber(row[17]), // R: Total with VAT
        withholdingRate: parseNumber(row[18]), // S: Withholding Rate
        withholdingTax: parseNumber(row[19]), // T: Withholding Tax
        netReceivable: parseNumber(row[20]), // U: Net Receivable
        lifetimeValue: parseNumber(row[21]), // V: Lifetime Value
        status: mapContractStatus(row[22] || ''), // W: Status
        contactPerson: row[23] || '',       // X: Contact Person
        email: row[24] || '',               // Y: Email
        tin: row[25] || '',                 // Z: TIN
        mobile: row[26] || '',              // AA: Mobile
        address: row[27] || '',             // AB: Address
        industry: row[28] || '',            // AC: Industry
        renewalRisk: row[29] || '',         // AD: Renewal Risk
        billingType: mapBillingType(row[30] || ''), // AE: Billing Type
        remarks: row[31] || '',             // AF: Remarks
        rowIndex: index + 2,                // Track row for reference
      };
    })
    .filter((row): row is ContractSheetRow => row !== null);
}

// Fetch RCBC end-clients from monthly tabs
export async function fetchRcbcEndClients(sheetId?: string, month?: string): Promise<RcbcEndClientRow[]> {
  const client = await getGoogleSheetsClient();
  const spreadsheetId = sheetId || process.env.RCBC_SHEET_ID;

  if (!spreadsheetId) {
    throw new Error('RCBC Sheet ID not provided');
  }

  // Get sheet metadata to find available monthly tabs
  const meta = await getSheetMetadata(spreadsheetId);
  console.log(`[Google Sheets] RCBC Sheet tabs: ${meta.sheets.map(s => s.title).join(', ')}`);

  // Find the current month's tab or specified month
  const currentMonth = month || new Date().toLocaleString('en-US', { month: 'long' });
  const targetTab = meta.sheets.find(s =>
    s.title.toLowerCase().includes(currentMonth.toLowerCase())
  );

  if (!targetTab) {
    // If no matching month, use the first/latest tab
    console.log(`[Google Sheets] No tab found for ${currentMonth}, using first available`);
  }

  const tabName = targetTab?.title || meta.sheets[0]?.title || 'Sheet1';
  console.log(`[Google Sheets] Reading RCBC data from tab: "${tabName}"`);

  // Read all data starting from row 2 (after headers)
  // Columns: Count, Company Name, No. of Employees, Net Amount, VAT, Withholding Tax (2%), Total, Total(Net of Wtax)
  const response = await client.spreadsheets.values.get({
    spreadsheetId,
    range: `'${tabName}'!A2:H`,
  });

  const rows = response.data.values || [];
  console.log(`[Google Sheets] Found ${rows.length} RCBC end-client rows`);

  return rows
    .map((row: string[]) => {
      // Skip empty rows
      if (!row[1]) return null;

      // Skip header rows
      const companyName = row[1] || '';
      if (companyName.toLowerCase() === 'company name' || companyName.includes('Company Name')) {
        return null;
      }

      return {
        count: parseInt(row[0]) || 0,
        companyName: companyName,
        employeeCount: parseInt(row[2]) || 0,
        netAmount: parseNumber(row[3]),
        vat: parseNumber(row[4]),
        withholdingTax: parseNumber(row[5]),
        total: parseNumber(row[6]),
        totalNetOfWtax: parseNumber(row[7]),
      };
    })
    .filter((row): row is RcbcEndClientRow => row !== null);
}

// Get all available RCBC months (tab names)
export async function getRcbcAvailableMonths(sheetId?: string): Promise<string[]> {
  const spreadsheetId = sheetId || process.env.RCBC_SHEET_ID;

  if (!spreadsheetId) {
    throw new Error('RCBC Sheet ID not provided');
  }

  const meta = await getSheetMetadata(spreadsheetId);

  // Return all tab names (these should be month names)
  return meta.sheets.map(s => s.title);
}

// Fetch contracts that are due for billing (within N days)
export async function fetchContractsDueForBilling(daysBeforeDue: number = 15): Promise<ContractSheetRow[]> {
  const contracts = await fetchContracts();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const targetDate = new Date(today);
  targetDate.setDate(targetDate.getDate() + daysBeforeDue);

  return contracts.filter(contract => {
    // Only active contracts
    if (contract.status !== 'ACTIVE') return false;

    // Must have a next due date
    if (!contract.nextDueDate) return false;

    // Check if due date is within range
    const dueDate = new Date(contract.nextDueDate);
    dueDate.setHours(0, 0, 0, 0);

    // Due date should be on or before targetDate but after today
    return dueDate >= today && dueDate <= targetDate;
  });
}

// Summary statistics for dashboard
export async function getContractsSummary(): Promise<{
  totalContracts: number;
  activeContracts: number;
  totalMonthlyRevenue: number;
  byPartner: Record<string, number>;
  byEntity: Record<string, number>;
  byStatus: Record<string, number>;
}> {
  const contracts = await fetchContracts();

  const summary = {
    totalContracts: contracts.length,
    activeContracts: 0,
    totalMonthlyRevenue: 0,
    byPartner: {} as Record<string, number>,
    byEntity: {} as Record<string, number>,
    byStatus: {} as Record<string, number>,
  };

  for (const contract of contracts) {
    // Count by status
    const statusKey = contract.status || 'NOT_STARTED';
    summary.byStatus[statusKey] = (summary.byStatus[statusKey] || 0) + 1;

    if (contract.status === 'ACTIVE') {
      summary.activeContracts++;
      summary.totalMonthlyRevenue += contract.monthlyFee;
    }

    // Count by partner
    const partner = contract.partner || 'Direct';
    summary.byPartner[partner] = (summary.byPartner[partner] || 0) + 1;

    // Count by billing entity
    const entity = contract.billingEntity || 'Unknown';
    summary.byEntity[entity] = (summary.byEntity[entity] || 0) + 1;
  }

  return summary;
}
