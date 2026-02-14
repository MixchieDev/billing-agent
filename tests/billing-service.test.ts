/**
 * Unit tests for billing service functions
 */

import { prismaMock } from './mocks/prisma';
import {
  getContractsDueWithin,
  createInvoiceFromContract,
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

// Mock settings
jest.mock('@/lib/settings', () => ({
  getProductTypes: jest.fn(() => Promise.resolve([
    { value: 'ACCOUNTING', label: 'Accounting' },
    { value: 'PAYROLL', label: 'Payroll' },
  ])),
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

  describe('createInvoiceFromContract', () => {
    const mockBillingEntity = {
      id: 'company-1',
      code: 'YOWI',
      name: 'YAHSHUA OUTSOURCING WORLDWIDE INC.',
      invoicePrefix: 'S',
      nextInvoiceNo: 1,
    };

    const mockContract = {
      id: 'contract-1',
      companyName: 'Test Client',
      productType: 'ACCOUNTING',
      monthlyFee: 10000,
      billingAmount: 10000,
      nextDueDate: new Date(),
      vatType: 'VAT',
      contactPerson: 'John Doe',
      email: 'john@test.com',
      tin: '123-456-789',
      paymentPlan: 'Monthly',
      partnerId: null,
      partner: null,
      billingEntityId: 'company-1',
      billingEntity: mockBillingEntity,
    };

    it('creates an invoice from a contract', async () => {
      prismaMock.contract.findUnique.mockResolvedValue(mockContract as any);
      prismaMock.invoice.create.mockResolvedValue({
        id: 'inv-1',
        billingNo: 'S-2026-00001',
        customerName: 'Test Client',
        serviceFee: 10000,
        vatAmount: 1200,
        grossAmount: 11200,
        netAmount: 11200,
        status: 'PENDING',
      } as any);
      prismaMock.company.update.mockResolvedValue({} as any);

      const result = await createInvoiceFromContract({
        contractId: 'contract-1',
        billingAmount: 10000,
      });

      expect(result.customerName).toBe('Test Client');
      expect(prismaMock.invoice.create).toHaveBeenCalled();
      expect(prismaMock.company.update).toHaveBeenCalled();
    });

    it('throws when contract not found', async () => {
      prismaMock.contract.findUnique.mockResolvedValue(null);

      await expect(
        createInvoiceFromContract({ contractId: 'bad-id', billingAmount: 10000 })
      ).rejects.toThrow('Contract not found');
    });

    it('calculates VAT for VAT clients', async () => {
      prismaMock.contract.findUnique.mockResolvedValue(mockContract as any);
      prismaMock.invoice.create.mockImplementation(async (args: any) => ({
        id: 'inv-1',
        ...args.data,
      }));
      prismaMock.company.update.mockResolvedValue({} as any);

      const result = await createInvoiceFromContract({
        contractId: 'contract-1',
        billingAmount: 10000,
      });

      // VAT-exclusive: 10000 service fee + 1200 VAT = 11200 gross
      expect(Number(result.serviceFee)).toBe(10000);
      expect(Number(result.vatAmount)).toBe(1200);
      expect(Number(result.grossAmount)).toBe(11200);
    });

    it('applies withholding tax when enabled', async () => {
      prismaMock.contract.findUnique.mockResolvedValue(mockContract as any);
      prismaMock.invoice.create.mockImplementation(async (args: any) => ({
        id: 'inv-1',
        ...args.data,
      }));
      prismaMock.company.update.mockResolvedValue({} as any);

      const result = await createInvoiceFromContract({
        contractId: 'contract-1',
        billingAmount: 10000,
        hasWithholding: true,
      });

      // 10000 * 0.02 = 200 withholding, net = 11200 - 200 = 11000
      expect(Number(result.withholdingTax)).toBe(200);
      expect(Number(result.netAmount)).toBe(11000);
      expect(result.hasWithholding).toBe(true);
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
    it('returns aggregated statistics from groupBy', async () => {
      prismaMock.invoice.groupBy.mockResolvedValue([
        { status: 'PENDING', _count: 5, _sum: { netAmount: 50000 } },
        { status: 'APPROVED', _count: 3, _sum: { netAmount: 30000 } },
        { status: 'REJECTED', _count: 2, _sum: { netAmount: 20000 } },
        { status: 'SENT', _count: 10, _sum: { netAmount: 100000 } },
      ] as any);

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
