/**
 * Unit tests for AI chat tools
 */

import { prismaMock } from './mocks/prisma';
import {
  getContractsDueSoon,
  getContractDetails,
  getInvoiceStats,
  getPendingInvoices,
  getOverdueInvoices,
  searchContracts,
  getBillingTotals,
  executeTool,
  chatToolDefinitions,
} from '@/lib/chat-tools';

// Mock the Prisma module
jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: prismaMock,
}));

describe('Chat Tools', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getContractsDueSoon', () => {
    it('returns contracts with upcoming due dates', async () => {
      const mockContracts = [
        {
          id: 'contract-1',
          companyName: 'Test Company',
          productType: 'ACCOUNTING',
          monthlyFee: { toNumber: () => 10000 },
          nextDueDate: new Date(),
          status: 'ACTIVE',
          autoSendEnabled: true,
          vatType: 'VAT',
          email: 'test@test.com',
          remarks: null,
          billingEntity: { code: 'YOWI' },
        },
      ];

      prismaMock.contract.findMany.mockResolvedValue(mockContracts as any);

      const result = await getContractsDueSoon(7);

      expect(prismaMock.contract.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'ACTIVE',
          }),
          include: expect.objectContaining({
            billingEntity: true,
          }),
        })
      );
      expect(result).toHaveLength(1);
      expect(result[0].companyName).toBe('Test Company');
      expect(result[0].billingEntity).toBe('YOWI');
    });

    it('returns empty array when no contracts due', async () => {
      prismaMock.contract.findMany.mockResolvedValue([]);

      const result = await getContractsDueSoon(7);

      expect(result).toHaveLength(0);
    });
  });

  describe('getContractDetails', () => {
    it('returns contract details for matching company name', async () => {
      const mockContract = {
        id: 'contract-1',
        companyName: 'Test Company Inc.',
        productType: 'PAYROLL',
        monthlyFee: { toNumber: () => 15000 },
        nextDueDate: new Date(),
        status: 'ACTIVE',
        autoSendEnabled: true,
        vatType: 'VAT',
        email: 'test@test.com',
        remarks: 'Test remarks',
        billingEntity: { code: 'ABBA' },
      };

      prismaMock.contract.findFirst.mockResolvedValue(mockContract as any);

      const result = await getContractDetails('Test Company');

      expect(prismaMock.contract.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            companyName: {
              contains: 'Test Company',
              mode: 'insensitive',
            },
          },
        })
      );
      expect(result).not.toBeNull();
      expect(result?.companyName).toBe('Test Company Inc.');
      expect(result?.billingEntity).toBe('ABBA');
    });

    it('returns null when contract not found', async () => {
      prismaMock.contract.findFirst.mockResolvedValue(null);

      const result = await getContractDetails('Nonexistent Company');

      expect(result).toBeNull();
    });
  });

  describe('getInvoiceStats', () => {
    it('returns aggregated invoice statistics', async () => {
      const mockPending = [
        { netAmount: 10000 },
        { netAmount: 15000 },
      ];
      const mockApproved = [{ netAmount: 20000 }];
      const mockRejected = [{ netAmount: 5000 }];
      const mockSent = [{ netAmount: 12000 }];
      const mockPaid = [
        { netAmount: 8000, paidAmount: 8000 },
      ];

      prismaMock.invoice.findMany
        .mockResolvedValueOnce(mockPending as any) // PENDING
        .mockResolvedValueOnce(mockApproved as any) // APPROVED
        .mockResolvedValueOnce(mockRejected as any) // REJECTED
        .mockResolvedValueOnce(mockSent as any) // SENT
        .mockResolvedValueOnce(mockPaid as any); // PAID

      const result = await getInvoiceStats();

      expect(result.pending).toBe(2);
      expect(result.approved).toBe(1);
      expect(result.rejected).toBe(1);
      expect(result.sent).toBe(1);
      expect(result.paid).toBe(1);
      expect(result.pendingAmount).toBe(25000);
      expect(result.approvedAmount).toBe(20000);
      expect(result.paidAmount).toBe(8000);
    });
  });

  describe('getPendingInvoices', () => {
    it('returns pending invoices list', async () => {
      const mockInvoices = [
        {
          id: 'inv-1',
          billingNo: 'S-2026-00001',
          customerName: 'Client A',
          netAmount: { toNumber: () => 10000 },
          dueDate: new Date(),
          createdAt: new Date(),
          company: { code: 'YOWI' },
        },
      ];

      prismaMock.invoice.findMany.mockResolvedValue(mockInvoices as any);

      const result = await getPendingInvoices();

      expect(prismaMock.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'PENDING' },
        })
      );
      expect(result).toHaveLength(1);
      expect(result[0].billingNo).toBe('S-2026-00001');
    });

    it('filters by billing entity when provided', async () => {
      prismaMock.invoice.findMany.mockResolvedValue([]);

      await getPendingInvoices('YOWI');

      expect(prismaMock.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'PENDING',
            company: { code: 'YOWI' },
          }),
        })
      );
    });
  });

  describe('getOverdueInvoices', () => {
    it('returns invoices past due date', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 10);

      const mockInvoices = [
        {
          id: 'inv-1',
          billingNo: 'S-2026-00001',
          customerName: 'Late Client',
          netAmount: { toNumber: () => 10000 },
          dueDate: pastDate,
          company: { code: 'YOWI' },
        },
      ];

      prismaMock.invoice.findMany.mockResolvedValue(mockInvoices as any);

      const result = await getOverdueInvoices();

      expect(prismaMock.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'SENT',
          }),
        })
      );
      expect(result).toHaveLength(1);
      expect(result[0].daysPastDue).toBeGreaterThan(0);
    });
  });

  describe('searchContracts', () => {
    it('searches by company name', async () => {
      const mockContracts = [
        {
          id: 'contract-1',
          companyName: 'ABC Corporation',
          productType: 'ACCOUNTING',
          monthlyFee: { toNumber: () => 10000 },
          nextDueDate: new Date(),
          status: 'ACTIVE',
          autoSendEnabled: true,
          vatType: 'VAT',
          email: 'abc@test.com',
          remarks: null,
          billingEntity: { code: 'YOWI' },
        },
      ];

      prismaMock.contract.findMany.mockResolvedValue(mockContracts as any);

      const result = await searchContracts('ABC');

      expect(result).toHaveLength(1);
      expect(result[0].companyName).toBe('ABC Corporation');
    });

    it('searches by product type', async () => {
      prismaMock.contract.findMany.mockResolvedValue([]);

      await searchContracts('payroll');

      expect(prismaMock.contract.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({
                productType: 'PAYROLL',
              }),
            ]),
          }),
        })
      );
    });
  });

  describe('getBillingTotals', () => {
    it('returns totals for all invoices', async () => {
      const mockInvoices = [
        {
          serviceFee: 10000,
          vatAmount: 1200,
          netAmount: 11200,
          status: 'SENT',
          paidAmount: null,
          company: { code: 'YOWI' },
        },
        {
          serviceFee: 15000,
          vatAmount: 1800,
          netAmount: 16800,
          status: 'PAID',
          paidAmount: 16800,
          company: { code: 'YOWI' },
        },
      ];

      prismaMock.invoice.findMany.mockResolvedValue(mockInvoices as any);

      const result = await getBillingTotals();

      expect(result.entity).toBe('ALL');
      expect(result.period).toBe('ALL TIME');
      expect(result.invoiceCount).toBe(2);
      expect(result.totalServiceFee).toBe(25000);
      expect(result.totalVat).toBe(3000);
      expect(result.totalNet).toBe(28000);
      expect(result.paidCount).toBe(1);
      expect(result.paidAmount).toBe(16800);
    });

    it('filters by entity when provided', async () => {
      prismaMock.invoice.findMany.mockResolvedValue([]);

      await getBillingTotals('YOWI');

      expect(prismaMock.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            company: { code: 'YOWI' },
          }),
        })
      );
    });

    it('filters by month when provided', async () => {
      prismaMock.invoice.findMany.mockResolvedValue([]);

      await getBillingTotals(undefined, '2026-01');

      expect(prismaMock.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            statementDate: expect.objectContaining({
              gte: expect.any(Date),
              lte: expect.any(Date),
            }),
          }),
        })
      );
    });
  });

  describe('executeTool', () => {
    beforeEach(() => {
      prismaMock.contract.findMany.mockResolvedValue([]);
      prismaMock.contract.findFirst.mockResolvedValue(null);
      prismaMock.invoice.findMany.mockResolvedValue([]);
    });

    it('executes get_contracts_due_soon', async () => {
      await executeTool('get_contracts_due_soon', { days: 7 });
      expect(prismaMock.contract.findMany).toHaveBeenCalled();
    });

    it('executes get_contract_details', async () => {
      await executeTool('get_contract_details', { companyName: 'Test' });
      expect(prismaMock.contract.findFirst).toHaveBeenCalled();
    });

    it('executes get_invoice_stats', async () => {
      await executeTool('get_invoice_stats', {});
      expect(prismaMock.invoice.findMany).toHaveBeenCalled();
    });

    it('executes get_pending_invoices', async () => {
      await executeTool('get_pending_invoices', {});
      expect(prismaMock.invoice.findMany).toHaveBeenCalled();
    });

    it('executes get_overdue_invoices', async () => {
      await executeTool('get_overdue_invoices', {});
      expect(prismaMock.invoice.findMany).toHaveBeenCalled();
    });

    it('executes search_contracts', async () => {
      await executeTool('search_contracts', { query: 'test' });
      expect(prismaMock.contract.findMany).toHaveBeenCalled();
    });

    it('executes get_billing_totals', async () => {
      await executeTool('get_billing_totals', { entity: 'YOWI', month: '2026-01' });
      expect(prismaMock.invoice.findMany).toHaveBeenCalled();
    });

    it('throws error for unknown tool', async () => {
      await expect(executeTool('unknown_tool', {})).rejects.toThrow('Unknown tool: unknown_tool');
    });
  });

  describe('chatToolDefinitions', () => {
    it('has all required tool definitions', () => {
      const toolNames = chatToolDefinitions.map((t) => t.name);

      expect(toolNames).toContain('get_contracts_due_soon');
      expect(toolNames).toContain('get_contract_details');
      expect(toolNames).toContain('get_invoice_stats');
      expect(toolNames).toContain('get_pending_invoices');
      expect(toolNames).toContain('get_overdue_invoices');
      expect(toolNames).toContain('search_contracts');
      expect(toolNames).toContain('get_billing_totals');
    });

    it('all tools have valid input_schema', () => {
      for (const tool of chatToolDefinitions) {
        expect(tool.input_schema).toBeDefined();
        expect(tool.input_schema.type).toBe('object');
        expect(tool.input_schema.properties).toBeDefined();
        expect(tool.input_schema.required).toBeDefined();
      }
    });

    it('all tools have descriptions', () => {
      for (const tool of chatToolDefinitions) {
        expect(tool.description).toBeDefined();
        expect(tool.description.length).toBeGreaterThan(10);
      }
    });
  });
});
