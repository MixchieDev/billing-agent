// CSV Parser utility for importing contracts and RCBC end-clients

export interface ParsedRow {
  data: Record<string, string>;
  rowIndex: number;
  errors: string[];
}

export interface ParseResult<T> {
  success: boolean;
  data: T[];
  errors: { row: number; message: string }[];
  totalRows: number;
  validRows: number;
  skippedRows: number;
}

// Parse CSV string into rows
export function parseCSV(csvContent: string): string[][] {
  const lines = csvContent.split(/\r?\n/);
  const rows: string[][] = [];

  for (const line of lines) {
    if (!line.trim()) continue;

    // Handle quoted fields with commas
    const row: string[] = [];
    let field = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          // Escaped quote
          field += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        row.push(field.trim());
        field = '';
      } else {
        field += char;
      }
    }
    row.push(field.trim());
    rows.push(row);
  }

  return rows;
}

// Contract CSV parsing types
export interface ContractCSVRow {
  customerId: string;
  companyName: string;
  productType: string;
  partner: string;
  billingEntity: string;
  monthlyFee: number;
  paymentPlan?: string;
  contractStart?: Date;
  nextDueDate?: Date;
  status?: string;
  vatType?: string;
  billingType?: string;
  contactPerson?: string;
  email?: string;
  tin?: string;
  mobile?: string;
  remarks?: string;
}

// RCBC CSV parsing types
export interface RcbcClientCSVRow {
  name: string;
  employeeCount: number;
  ratePerEmployee: number;
  month: Date;
  isActive: boolean;
}

// Parse date from various formats
function parseDate(value: string): Date | null {
  if (!value || value.trim() === '') return null;

  // Try ISO format (YYYY-MM-DD or YYYY-MM)
  if (/^\d{4}-\d{2}(-\d{2})?$/.test(value)) {
    const date = new Date(value + (value.length === 7 ? '-01' : ''));
    if (!isNaN(date.getTime())) return date;
  }

  // Try MM/DD/YYYY format
  const mdyMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdyMatch) {
    const date = new Date(parseInt(mdyMatch[3]), parseInt(mdyMatch[1]) - 1, parseInt(mdyMatch[2]));
    if (!isNaN(date.getTime())) return date;
  }

  // Try as-is
  const date = new Date(value);
  if (!isNaN(date.getTime())) return date;

  return null;
}

// Parse number from string
function parseNumber(value: string): number {
  if (!value || value.trim() === '') return 0;
  const cleaned = value.replace(/[₱$,\s]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

// Parse boolean
function parseBoolean(value: string): boolean {
  if (!value) return true;
  const lower = value.toLowerCase().trim();
  return lower === 'true' || lower === 'yes' || lower === '1';
}

// Validate and parse Contracts CSV
export function parseContractsCSV(csvContent: string): ParseResult<ContractCSVRow> {
  const rows = parseCSV(csvContent);
  if (rows.length < 2) {
    return {
      success: false,
      data: [],
      errors: [{ row: 0, message: 'CSV must have at least a header row and one data row' }],
      totalRows: 0,
      validRows: 0,
      skippedRows: 0,
    };
  }

  const headers = rows[0].map(h => h.toLowerCase().trim());
  const result: ParseResult<ContractCSVRow> = {
    success: true,
    data: [],
    errors: [],
    totalRows: rows.length - 1,
    validRows: 0,
    skippedRows: 0,
  };

  // Required columns (customerId is optional — auto-generated if missing)
  const requiredColumns = ['companyname', 'producttype', 'partner', 'billingentity', 'monthlyfee'];
  const missingColumns = requiredColumns.filter(col => !headers.includes(col));
  if (missingColumns.length > 0) {
    result.success = false;
    result.errors.push({
      row: 0,
      message: `Missing required columns: ${missingColumns.join(', ')}`,
    });
    return result;
  }

  // Column index mapping
  const colIndex: Record<string, number> = {};
  headers.forEach((h, i) => {
    colIndex[h] = i;
  });

  // Parse data rows
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const rowErrors: string[] = [];

    // Skip empty rows
    if (row.every(cell => !cell.trim())) {
      result.skippedRows++;
      continue;
    }

    const getValue = (col: string): string => row[colIndex[col]] || '';

    const customerId = getValue('customerid');
    const companyName = getValue('companyname');
    const productType = getValue('producttype');
    const partner = getValue('partner');
    const billingEntity = getValue('billingentity');
    const monthlyFee = parseNumber(getValue('monthlyfee'));

    // Validate required fields
    if (!companyName) rowErrors.push('Missing companyName');
    if (!productType) rowErrors.push('Missing productType');
    if (!partner) rowErrors.push('Missing partner');
    if (!billingEntity) rowErrors.push('Missing billingEntity');
    if (monthlyFee <= 0) rowErrors.push('Invalid monthlyFee');

    // Note: partner, billingEntity, and productType validation is done at the import route level
    // using actual database lookups and settings-backed types

    if (rowErrors.length > 0) {
      result.errors.push({ row: i + 1, message: rowErrors.join('; ') });
      result.skippedRows++;
      continue;
    }

    const contractRow: ContractCSVRow = {
      customerId,
      companyName,
      productType: productType.toUpperCase(),
      partner,
      billingEntity: billingEntity.toUpperCase(),
      monthlyFee,
      paymentPlan: getValue('paymentplan') || undefined,
      contractStart: parseDate(getValue('contractstart')) || undefined,
      nextDueDate: parseDate(getValue('nextduedate')) || undefined,
      status: getValue('status') || 'ACTIVE',
      vatType: getValue('vattype') || 'VAT',
      billingType: getValue('billingtype') || 'RECURRING',
      contactPerson: getValue('contactperson') || undefined,
      email: getValue('email') || undefined,
      tin: getValue('tin') || undefined,
      mobile: getValue('mobile') || undefined,
      remarks: getValue('remarks') || undefined,
    };

    result.data.push(contractRow);
    result.validRows++;
  }

  result.success = result.errors.length === 0 || result.validRows > 0;
  return result;
}

// Validate and parse RCBC End-Clients CSV
export function parseRcbcClientsCSV(csvContent: string): ParseResult<RcbcClientCSVRow> {
  const rows = parseCSV(csvContent);
  if (rows.length < 2) {
    return {
      success: false,
      data: [],
      errors: [{ row: 0, message: 'CSV must have at least a header row and one data row' }],
      totalRows: 0,
      validRows: 0,
      skippedRows: 0,
    };
  }

  const headers = rows[0].map(h => h.toLowerCase().trim());
  const result: ParseResult<RcbcClientCSVRow> = {
    success: true,
    data: [],
    errors: [],
    totalRows: rows.length - 1,
    validRows: 0,
    skippedRows: 0,
  };

  // Required columns
  const requiredColumns = ['name', 'employeecount', 'rateperemployee', 'month'];
  const missingColumns = requiredColumns.filter(col => !headers.includes(col));
  if (missingColumns.length > 0) {
    result.success = false;
    result.errors.push({
      row: 0,
      message: `Missing required columns: ${missingColumns.join(', ')}`,
    });
    return result;
  }

  // Column index mapping
  const colIndex: Record<string, number> = {};
  headers.forEach((h, i) => {
    colIndex[h] = i;
  });

  // Parse data rows
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const rowErrors: string[] = [];

    // Skip empty rows
    if (row.every(cell => !cell.trim())) {
      result.skippedRows++;
      continue;
    }

    const getValue = (col: string): string => row[colIndex[col]] || '';

    const name = getValue('name');
    const employeeCount = parseInt(getValue('employeecount')) || 0;
    const ratePerEmployee = parseNumber(getValue('rateperemployee'));
    const monthStr = getValue('month');
    const month = parseDate(monthStr);

    // Validate required fields
    if (!name) rowErrors.push('Missing name');
    if (employeeCount <= 0) rowErrors.push('Invalid employeeCount');
    if (ratePerEmployee <= 0) rowErrors.push('Invalid ratePerEmployee');
    if (!month) rowErrors.push(`Invalid month format: ${monthStr}. Use YYYY-MM format.`);

    if (rowErrors.length > 0) {
      result.errors.push({ row: i + 1, message: rowErrors.join('; ') });
      result.skippedRows++;
      continue;
    }

    const clientRow: RcbcClientCSVRow = {
      name,
      employeeCount,
      ratePerEmployee,
      month: month!,
      isActive: parseBoolean(getValue('isactive')),
    };

    result.data.push(clientRow);
    result.validRows++;
  }

  result.success = result.errors.length === 0 || result.validRows > 0;
  return result;
}

// Generate CSV template for contracts
export function generateContractsTemplate(): string {
  const headers = [
    'customerId',
    'companyName',
    'productType',
    'partner',
    'billingEntity',
    'monthlyFee',
    'paymentPlan',
    'contractStart',
    'nextDueDate',
    'status',
    'vatType',
    'billingType',
    'contactPerson',
    'email',
    'tin',
    'mobile',
    'remarks',
  ];

  const sampleRow = [
    'CUST001',
    'Sample Company Inc.',
    'ACCOUNTING',
    'Direct-YOWI',
    'YOWI',
    '15000',
    'Monthly',
    '2024-01-15',
    '2026-02-15',
    'ACTIVE',
    'VAT',
    'RECURRING',
    'John Doe',
    'john@sample.com',
    '123-456-789-000',
    '09171234567',
    'Sample remarks',
  ];

  return headers.join(',') + '\n' + sampleRow.join(',');
}

// Generate CSV template for RCBC end-clients
export function generateRcbcClientsTemplate(): string {
  const headers = ['name', 'employeeCount', 'ratePerEmployee', 'month', 'isActive'];
  const sampleRows = [
    ['ABC Corporation', '150', '75.00', '2026-01', 'true'],
    ['XYZ Holdings', '85', '75.00', '2026-01', 'true'],
  ];

  return headers.join(',') + '\n' + sampleRows.map(r => r.join(',')).join('\n');
}
