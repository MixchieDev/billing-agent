/**
 * Unit tests for billing service functions
 */

import { prismaMock } from './mocks/prisma';
import {
  getContractsDueWithin,
  generateDraftInvoices,
  approveInvoice,
  rejectInvoice,
  bulkApproveInvoices,
  getInvoiceStats,
} from '@/lib/billing-service';

// Mock the Prisma module
jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: prismaMock,
}));

describe('Billing Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getContractsDueWithin', () => {
    it('queries active contracts with due dates in range', async () => {
      prismaMock.contract.findMany.mockResolvedValue([]);

      await getContractsDueWithin(15);

      expect(prismaMock.contract.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'ACTIVE',
            nextDueDate: expect.objectContaining({
              gte: expect.any(Date),
              lte: expect.any(Date),
            }),
          }),
          include: expect.objectContaining({
            partner: true,
            billingEntity: true,
          }),
        })
      );
    });

    it('excludes contracts past their end date', async () => {
      prismaMock.contract.findMany.mockResolvedValue([]);

      await getContractsDueWithin(7);

      expect(prismaMock.contract.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { contractEndDate: null },
              expect.objectContaining({ contractEndDate: expect.any(Object) }),
            ]),
          }),
        })
      );
    });
  });

  describe('generateDraftInvoices', () => {
    it('generates drafts for contracts without existing invoices', async () => {
      const mockContract = {
        id: 'contract-1',
        companyName: 'Test Client',
        productType: 'ACCOUNTING',
        monthlyFee: 10000,
        billingAmount: null,
        nextDueDate: new Date(),
        vatType: 'VAT',
        withholdingTax: null,
        autoSendEnabled: true,
        billingEntity: { code: 'YOWI' },
        partner: null,
      };

      prismaMock.contract.findMany.mockResolvedValue([mockContract as any]);
      prismaMock.invoice.findFirst.mockResolvedValue(null);

      const drafts = await generateDraftInvoices(15);

      expect(drafts).toHaveLength(1);
      expect(drafts[0].customerName).toBe('Test Client');
      expect(drafts[0].productType).toBe('ACCOUNTING');
      expect(drafts[0].billingEntity).toBe('YOWI');
      expect(drafts[0].autoSendEnabled).toBe(true);
    });

    it('skips contracts with existing invoices', async () => {
      const mockContract = {
        id: 'contract-1',
        companyName: 'Test Client',
        productType: 'ACCOUNTING',
        monthlyFee: 10000,
        billingAmount: null,
        nextDueDate: new Date(),
        vatType: 'VAT',
        withholdingTax: null,
        autoSendEnabled: true,
        billingEntity: { code: 'YOWI' },
        partner: null,
      };

      const existingInvoice = { id: 'inv-1', status: 'PENDING' };

      prismaMock.contract.findMany.mockResolvedValue([mockContract as any]);
      prismaMock.invoice.findFirst.mockResolvedValue(existingInvoice as any);

      const drafts = await generateDraftInvoices(15);

      expect(drafts).toHaveLength(0);
    });

    it('calculates VAT correctly for VAT clients', async () => {
      const mockContract = {
        id: 'contract-1',
        companyName: 'VAT Client',
        productType: 'ACCOUNTING',
        monthlyFee: 11200, // VAT-inclusive
        billingAmount: 11200,
        nextDueDate: new Date(),
        vatType: 'VAT',
        withholdingTax: null,
        autoSendEnabled: true,
        billingEntity: { code: 'YOWI' },
        partner: null,
      };

      prismaMock.contract.findMany.mockResolvedValue([mockContract as any]);
      prismaMock.invoice.findFirst.mockResolvedValue(null);

      const drafts = await generateDraftInvoices(15);

      expect(drafts[0].serviceFee).toBe(10000);
      expect(drafts[0].vatAmount).toBe(1200);
      expect(drafts[0].grossAmount).toBe(11200);
    });

    it('calculates withholding tax when applicable', async () => {
      const mockContract = {
        id: 'contract-1',
        companyName: 'Withholding Client',
        productType: 'ACCOUNTING',
        monthlyFee: 11200,
        billingAmount: 11200,
        nextDueDate: new Date(),
        vatType: 'VAT',
        withholdingTax: 200, // Has withholding
        autoSendEnabled: true,
        billingEntity: { code: 'YOWI' },
        partner: null,
      };

      prismaMock.contract.findMany.mockResolvedValue([mockContract as any]);
      prismaMock.invoice.findFirst.mockResolvedValue(null);

      const drafts = await generateDraftInvoices(15);

      expect(drafts[0].withholdingTax).toBe(200);
      expect(drafts[0].netAmount).toBe(11000);
      expect(drafts[0].hasWithholding).toBe(true);
    });
  });

  describe('approveInvoice', () => {
    it('updates invoice status to APPROVED', async () => {
      const mockInvoice = {
        id: 'inv-1',
        status: 'APPROVED',
        approvedById: 'user-1',
        approvedAt: new Date(),
      };

      prismaMock.invoice.update.mockResolvedValue(mockInvoice as any);

      const result = await approveInvoice('inv-1', 'user-1');

      expect(prismaMock.invoice.update).toHaveBeenCalledWith({
        where: { id: 'inv-1' },
        data: {
          status: 'APPROVED',
          approvedById: 'user-1',
          approvedAt: expect.any(Date),
        },
      });
      expect(result.status).toBe('APPROVED');
    });
  });

  describe('rejectInvoice', () => {
    it('updates invoice status to REJECTED with reason', async () => {
      const mockInvoice = {
        id: 'inv-1',
        status: 'REJECTED',
        rejectedById: 'user-1',
        rejectedAt: new Date(),
        rejectionReason: 'Invalid amount',
      };

      prismaMock.invoice.update.mockResolvedValue(mockInvoice as any);

      const result = await rejectInvoice('inv-1', 'user-1', 'Invalid amount');

      expect(prismaMock.invoice.update).toHaveBeenCalledWith({
        where: { id: 'inv-1' },
        data: expect.objectContaining({
          status: 'REJECTED',
          rejectedById: 'user-1',
          rejectionReason: 'Invalid amount',
        }),
      });
      expect(result.rejectionReason).toBe('Invalid amount');
    });

    it('sets reschedule date when provided', async () => {
      const rescheduleDate = new Date('2026-02-15');
      const mockInvoice = {
        id: 'inv-1',
        status: 'REJECTED',
        rescheduleDate,
      };

      prismaMock.invoice.update.mockResolvedValue(mockInvoice as any);

      await rejectInvoice('inv-1', 'user-1', 'Reschedule needed', rescheduleDate);

      expect(prismaMock.invoice.update).toHaveBeenCalledWith({
        where: { id: 'inv-1' },
        data: expect.objectContaining({
          rescheduleDate,
        }),
      });
    });
  });

  describe('bulkApproveInvoices', () => {
    it('approves multiple invoices at once', async () => {
      prismaMock.invoice.updateMany.mockResolvedValue({ count: 3 });

      const result = await bulkApproveInvoices(['inv-1', 'inv-2', 'inv-3'], 'user-1');

      expect(prismaMock.invoice.updateMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['inv-1', 'inv-2', 'inv-3'] },
          status: 'PENDING',
        },
        data: expect.objectContaining({
          status: 'APPROVED',
          approvedById: 'user-1',
        }),
      });
      expect(result.count).toBe(3);
    });

    it('only approves pending invoices', async () => {
      prismaMock.invoice.updateMany.mockResolvedValue({ count: 2 });

      await bulkApproveInvoices(['inv-1', 'inv-2', 'inv-3'], 'user-1');

      expect(prismaMock.invoice.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'PENDING',
          }),
        })
      );
    });
  });

  describe('getInvoiceStats', () => {
    it('returns aggregated statistics', async () => {
      prismaMock.invoice.aggregate
        .mockResolvedValueOnce({ _count: 5, _sum: { netAmount: 50000 } } as any) // pending
        .mockResolvedValueOnce({ _count: 3, _sum: { netAmount: 30000 } } as any); // approved

      prismaMock.invoice.count
        .mockResolvedValueOnce(2) // rejected
        .mockResolvedValueOnce(10); // sent

      const result = await getInvoiceStats();

      expect(result.pending).toBe(5);
      expect(result.approved).toBe(3);
      expect(result.rejected).toBe(2);
      expect(result.sent).toBe(10);
      expect(result.totalPendingAmount).toBe(50000);
      expect(result.totalApprovedAmount).toBe(30000);
    });
  });
});
