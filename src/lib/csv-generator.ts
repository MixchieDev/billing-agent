// Format date as MM/DD/YYYY for YTO import
function formatDateYto(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const year = d.getFullYear();
  return `${month}/${day}/${year}`;
}

// YTO Import CSV row structure
export interface YtoImportRow {
  invoiceNo: string;
  date: string;
  dueDate: string;
  customerCode: string;
  location: string;
  accountsReceivable: string;
  withholdingTax: string;
  poNo: string;
  salesRep: string;
  salesTax: string;
  service: string;
  productCode: string;
  description: string;
  quantity: number;
  price: number;
  amount: number;
  discount: string;
  discountAmount: number;
  salesAccountCode: string;
  remarks: string;
  taxable: string;
  noOfDistribution: number;
}

// Invoice data for CSV generation
export interface InvoiceCsvData {
  invoiceNo?: string;
  statementDate: Date;
  dueDate: Date;
  customerCode: string;
  productType: string;
  description: string;
  serviceFee: number;
  grossAmount: number;
  vatType: 'VAT' | 'NON_VAT';
  withholdingCode?: string;
  remarks?: string;
  lineItems?: {
    endClientName?: string;
    employeeCount?: number;
    description: string;
    serviceFee: number;
    grossAmount: number;
  }[];
}

// Default YTO settings
const YTO_DEFAULTS = {
  accountsReceivable: 'Accounts Receivable - Trade',
  salesAccountCode: '5200200 - Sale of Services',
  defaultDistribution: 1,
};

// Map product type to YTO location
function mapProductTypeToLocation(productType: string): string {
  const map: Record<string, string> = {
    ACCOUNTING: 'Accounting',
    PAYROLL: 'Payroll',
    COMPLIANCE: 'Compliance',
    HR: 'HR',
  };
  return map[productType] || productType;
}

// Line item type
type LineItem = NonNullable<InvoiceCsvData['lineItems']>[number];

// Generate a single YTO CSV row
function generateRow(data: InvoiceCsvData, lineItem?: LineItem): YtoImportRow {
  const isLineItem = !!lineItem;

  return {
    invoiceNo: data.invoiceNo || '', // Leave blank for YTO to auto-generate
    date: formatDateYto(data.statementDate),
    dueDate: formatDateYto(data.dueDate),
    customerCode: data.customerCode,
    location: mapProductTypeToLocation(data.productType),
    accountsReceivable: YTO_DEFAULTS.accountsReceivable,
    withholdingTax: data.withholdingCode || '',
    poNo: '',
    salesRep: '',
    salesTax: data.vatType === 'VAT' ? '12% VAT - 12%' : 'Non-Vat',
    service: 'Yes',
    productCode: '',
    description: isLineItem ? lineItem.description : data.description,
    quantity: 1,
    price: isLineItem ? lineItem.serviceFee : data.serviceFee,
    amount: isLineItem ? lineItem.grossAmount : data.grossAmount,
    discount: '',
    discountAmount: 0,
    salesAccountCode: YTO_DEFAULTS.salesAccountCode,
    remarks: data.remarks || '',
    taxable: data.vatType === 'VAT' ? 'Yes' : 'No',
    noOfDistribution: YTO_DEFAULTS.defaultDistribution,
  };
}

// Generate CSV content from invoice data
export function generateYtoCsv(invoices: InvoiceCsvData[]): string {
  const headers = [
    'Invoice No.',
    'Date',
    'Due Date',
    'Customer Code',
    'Location',
    'Accounts Receivable',
    'Withholding Tax',
    'PO No.',
    'Sales Rep',
    'Sales Tax',
    'Service',
    'Product Code',
    'Description',
    'Quantity',
    'Price',
    'Amount (Gross)',
    'Discount',
    'Discount Amount',
    'Sales Account Code',
    'Remarks',
    'Taxable',
    'No. of Distribution',
  ];

  const rows: YtoImportRow[] = [];

  for (const invoice of invoices) {
    // If invoice has line items (like RCBC consolidated), generate row per line item
    if (invoice.lineItems && invoice.lineItems.length > 0) {
      for (const lineItem of invoice.lineItems) {
        rows.push(generateRow(invoice, lineItem));
      }
    } else {
      // Single row for direct billing
      rows.push(generateRow(invoice));
    }
  }

  // Convert to CSV
  const csvRows = [
    headers.join(','),
    ...rows.map((row) =>
      [
        row.invoiceNo,
        row.date,
        row.dueDate,
        `"${row.customerCode}"`,
        row.location,
        `"${row.accountsReceivable}"`,
        row.withholdingTax,
        row.poNo,
        row.salesRep,
        `"${row.salesTax}"`,
        row.service,
        row.productCode,
        `"${row.description}"`,
        row.quantity,
        row.price.toFixed(2),
        row.amount.toFixed(2),
        row.discount,
        row.discountAmount.toFixed(2),
        `"${row.salesAccountCode}"`,
        `"${row.remarks}"`,
        row.taxable,
        row.noOfDistribution,
      ].join(',')
    ),
  ];

  return csvRows.join('\n');
}

// Generate CSV for RCBC consolidated billing
export function generateRcbcConsolidatedCsv(
  month: Date,
  endClients: { name: string; employeeCount: number; ratePerEmployee: number }[]
): string {
  const baseRate = 44.64; // Base rate per employee before VAT

  const invoice: InvoiceCsvData = {
    statementDate: new Date(),
    dueDate: new Date(),
    customerCode: 'RIZAL COMMERCIAL BANKING CORPORATION',
    productType: 'PAYROLL',
    description: '',
    serviceFee: 0,
    grossAmount: 0,
    vatType: 'VAT',
    withholdingCode: 'WC160',
    remarks: `Payroll service fee for the month of ${month.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })}.`,
    lineItems: endClients.map((client) => ({
      endClientName: client.name,
      employeeCount: client.employeeCount,
      description: `${client.name} (${client.employeeCount} Employees)`,
      serviceFee: client.employeeCount * (client.ratePerEmployee || baseRate),
      grossAmount: client.employeeCount * (client.ratePerEmployee || baseRate) * 1.12,
    })),
  };

  return generateYtoCsv([invoice]);
}
