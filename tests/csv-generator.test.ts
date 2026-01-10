/**
 * Unit tests for CSV generator functions
 */

import { generateYtoCsv, InvoiceCsvData } from '@/lib/csv-generator';

describe('generateYtoCsv', () => {
  const baseMockInvoice: InvoiceCsvData = {
    invoiceNo: '',
    statementDate: new Date(2026, 0, 15), // Jan 15, 2026
    dueDate: new Date(2026, 1, 15), // Feb 15, 2026
    customerCode: 'TEST CLIENT INC.',
    productType: 'ACCOUNTING',
    description: 'Accounting Service ftm January 2026',
    serviceFee: 10000,
    grossAmount: 11200,
    vatType: 'VAT',
    withholdingCode: 'WC160',
    remarks: 'Test remarks',
  };

  describe('CSV header generation', () => {
    it('generates CSV with correct headers', () => {
      const csv = generateYtoCsv([baseMockInvoice]);
      const lines = csv.split('\n');
      const headers = lines[0];

      expect(headers).toContain('Invoice No.');
      expect(headers).toContain('Date');
      expect(headers).toContain('Due Date');
      expect(headers).toContain('Customer Code');
      expect(headers).toContain('Location');
      expect(headers).toContain('Accounts Receivable');
      expect(headers).toContain('Withholding Tax');
      expect(headers).toContain('Sales Tax');
      expect(headers).toContain('Service');
      expect(headers).toContain('Description');
      expect(headers).toContain('Quantity');
      expect(headers).toContain('Price');
      expect(headers).toContain('Amount (Gross)');
      expect(headers).toContain('Sales Account Code');
      expect(headers).toContain('Remarks');
      expect(headers).toContain('Taxable');
    });
  });

  describe('Date formatting', () => {
    it('formats dates in MM/DD/YYYY format for YTO import', () => {
      const csv = generateYtoCsv([baseMockInvoice]);
      const lines = csv.split('\n');
      const dataRow = lines[1];

      // Should contain 01/15/2026 for statement date
      expect(dataRow).toContain('01/15/2026');
      // Should contain 02/15/2026 for due date
      expect(dataRow).toContain('02/15/2026');
    });
  });

  describe('Single invoice generation', () => {
    it('generates correct row for VAT client', () => {
      const csv = generateYtoCsv([baseMockInvoice]);
      const lines = csv.split('\n');
      const dataRow = lines[1];

      expect(dataRow).toContain('"TEST CLIENT INC."');
      expect(dataRow).toContain('Accounting');
      expect(dataRow).toContain('10000.00');
      expect(dataRow).toContain('11200.00');
      expect(dataRow).toContain('"12% VAT - 12%"');
      expect(dataRow).toContain('WC160');
      expect(dataRow).toContain('Yes'); // Taxable
    });

    it('generates correct row for NON-VAT client', () => {
      const nonVatInvoice: InvoiceCsvData = {
        ...baseMockInvoice,
        vatType: 'NON_VAT',
        grossAmount: 10000,
      };
      const csv = generateYtoCsv([nonVatInvoice]);
      const lines = csv.split('\n');
      const dataRow = lines[1];

      expect(dataRow).toContain('"Non-Vat"');
      expect(dataRow).toContain('No'); // Not taxable
    });
  });

  describe('Product type to location mapping', () => {
    it('maps ACCOUNTING to Accounting location', () => {
      const csv = generateYtoCsv([baseMockInvoice]);
      expect(csv).toContain('Accounting');
    });

    it('maps PAYROLL to Payroll location', () => {
      const payrollInvoice = { ...baseMockInvoice, productType: 'PAYROLL' };
      const csv = generateYtoCsv([payrollInvoice]);
      expect(csv).toContain('Payroll');
    });

    it('maps COMPLIANCE to Compliance location', () => {
      const complianceInvoice = { ...baseMockInvoice, productType: 'COMPLIANCE' };
      const csv = generateYtoCsv([complianceInvoice]);
      expect(csv).toContain('Compliance');
    });

    it('maps HR to HR location', () => {
      const hrInvoice = { ...baseMockInvoice, productType: 'HR' };
      const csv = generateYtoCsv([hrInvoice]);
      expect(csv).toContain(',HR,');
    });
  });

  describe('Consolidated invoices with line items', () => {
    it('generates multiple rows for invoice with line items', () => {
      const consolidatedInvoice: InvoiceCsvData = {
        ...baseMockInvoice,
        lineItems: [
          {
            endClientName: 'End Client A',
            employeeCount: 50,
            description: 'End Client A (50 Employees)',
            serviceFee: 2232,
            grossAmount: 2500,
          },
          {
            endClientName: 'End Client B',
            employeeCount: 100,
            description: 'End Client B (100 Employees)',
            serviceFee: 4464,
            grossAmount: 5000,
          },
        ],
      };

      const csv = generateYtoCsv([consolidatedInvoice]);
      const lines = csv.split('\n');

      // Should have header + 2 data rows
      expect(lines.length).toBe(3);
      expect(csv).toContain('End Client A');
      expect(csv).toContain('End Client B');
      expect(csv).toContain('2232.00');
      expect(csv).toContain('4464.00');
    });
  });

  describe('Multiple invoices', () => {
    it('generates correct number of rows for multiple invoices', () => {
      const invoices: InvoiceCsvData[] = [
        baseMockInvoice,
        { ...baseMockInvoice, customerCode: 'CLIENT 2' },
        { ...baseMockInvoice, customerCode: 'CLIENT 3' },
      ];

      const csv = generateYtoCsv(invoices);
      const lines = csv.split('\n');

      // Header + 3 data rows
      expect(lines.length).toBe(4);
    });
  });

  describe('Default values', () => {
    it('includes default Accounts Receivable value', () => {
      const csv = generateYtoCsv([baseMockInvoice]);
      expect(csv).toContain('"Accounts Receivable - Trade"');
    });

    it('includes default Sales Account Code', () => {
      const csv = generateYtoCsv([baseMockInvoice]);
      expect(csv).toContain('"5200200 - Sale of Services"');
    });

    it('sets Service to Yes', () => {
      const csv = generateYtoCsv([baseMockInvoice]);
      expect(csv).toContain(',Yes,'); // Service field
    });

    it('sets Quantity to 1', () => {
      const csv = generateYtoCsv([baseMockInvoice]);
      const lines = csv.split('\n');
      const dataRow = lines[1].split(',');
      const quantityIndex = 13; // 0-indexed position of Quantity
      expect(dataRow[quantityIndex]).toBe('1');
    });
  });

  describe('Special character handling', () => {
    it('properly escapes customer names with commas', () => {
      const invoiceWithComma = {
        ...baseMockInvoice,
        customerCode: 'COMPANY, INC.',
      };
      const csv = generateYtoCsv([invoiceWithComma]);
      expect(csv).toContain('"COMPANY, INC."');
    });

    it('properly escapes descriptions with quotes', () => {
      const invoiceWithQuotes = {
        ...baseMockInvoice,
        description: 'Service for "Special" project',
      };
      const csv = generateYtoCsv([invoiceWithQuotes]);
      expect(csv).toContain('Service for "Special" project');
    });
  });

  describe('Empty invoice handling', () => {
    it('returns only headers for empty array', () => {
      const csv = generateYtoCsv([]);
      const lines = csv.split('\n');
      expect(lines.length).toBe(1); // Only header row
    });
  });
});
