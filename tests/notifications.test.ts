/**
 * Unit tests for notification functions
 */

import { prismaMock } from './mocks/prisma';
import {
  createNotification,
  notifyInvoicePending,
  notifyInvoiceApproved,
  notifyInvoiceRejected,
  notifyInvoiceSent,
  notifyInvoiceOverdue,
  notifyInvoicePaid,
  notifyAnnualRenewalPending,
} from '@/lib/notifications';

// Mock the Prisma module
jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: prismaMock,
}));

describe('Notifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createNotification', () => {
    it('creates a notification with all fields', async () => {
      const mockNotification = {
        id: 'notif-1',
        userId: 'user-1',
        type: 'INVOICE_PENDING',
        title: 'Test Title',
        message: 'Test Message',
        link: '/dashboard',
        entityType: 'Invoice',
        entityId: 'inv-1',
      };

      prismaMock.notification.create.mockResolvedValue(mockNotification as any);

      const result = await createNotification({
        userId: 'user-1',
        type: 'INVOICE_PENDING',
        title: 'Test Title',
        message: 'Test Message',
        link: '/dashboard',
        entityType: 'Invoice',
        entityId: 'inv-1',
      });

      expect(prismaMock.notification.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          type: 'INVOICE_PENDING',
          title: 'Test Title',
          message: 'Test Message',
          link: '/dashboard',
          entityType: 'Invoice',
          entityId: 'inv-1',
        },
      });
      expect(result).toEqual(mockNotification);
    });

    it('creates broadcast notification when userId is null', async () => {
      prismaMock.notification.create.mockResolvedValue({ id: 'notif-1' } as any);

      await createNotification({
        userId: null,
        type: 'INVOICE_PENDING',
        title: 'Broadcast',
        message: 'For all users',
      });

      expect(prismaMock.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: null,
        }),
      });
    });

    it('returns null and does not throw on error', async () => {
      prismaMock.notification.create.mockRejectedValue(new Error('DB Error'));

      const result = await createNotification({
        type: 'INVOICE_PENDING',
        title: 'Test',
        message: 'Test',
      });

      expect(result).toBeNull();
    });
  });

  describe('notifyInvoicePending', () => {
    it('creates pending invoice notification', async () => {
      prismaMock.notification.create.mockResolvedValue({ id: 'notif-1' } as any);

      await notifyInvoicePending({
        id: 'inv-1',
        billingNo: 'S-2026-00001',
        customerName: 'Test Client',
      });

      expect(prismaMock.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'INVOICE_PENDING',
          title: 'Invoice Pending Approval',
          message: expect.stringContaining('S-2026-00001'),
          message: expect.stringContaining('Test Client'),
          link: '/dashboard/pending',
          entityType: 'Invoice',
          entityId: 'inv-1',
        }),
      });
    });

    it('uses truncated id when billingNo is null', async () => {
      prismaMock.notification.create.mockResolvedValue({ id: 'notif-1' } as any);

      await notifyInvoicePending({
        id: 'inv-12345678-full-id',
        billingNo: null,
        customerName: 'Test Client',
      });

      expect(prismaMock.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          message: expect.stringContaining('inv-1234'),
        }),
      });
    });
  });

  describe('notifyAnnualRenewalPending', () => {
    it('creates annual renewal notification with special message', async () => {
      prismaMock.notification.create.mockResolvedValue({ id: 'notif-1' } as any);

      await notifyAnnualRenewalPending({
        id: 'inv-1',
        billingNo: 'S-2026-00001',
        customerName: 'Annual Client',
      });

      expect(prismaMock.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'INVOICE_PENDING',
          title: 'Annual Invoice Pending Renewal Review',
          message: expect.stringContaining('requires approval'),
          message: expect.stringContaining('review contract renewal'),
        }),
      });
    });
  });

  describe('notifyInvoiceApproved', () => {
    it('creates approved notification with approver name', async () => {
      prismaMock.notification.create.mockResolvedValue({ id: 'notif-1' } as any);

      await notifyInvoiceApproved(
        {
          id: 'inv-1',
          billingNo: 'S-2026-00001',
          customerName: 'Test Client',
        },
        'John Approver'
      );

      expect(prismaMock.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'INVOICE_APPROVED',
          title: 'Invoice Approved',
          message: expect.stringContaining('John Approver'),
          link: '/dashboard/approved',
        }),
      });
    });
  });

  describe('notifyInvoiceRejected', () => {
    it('creates rejected notification with reason', async () => {
      prismaMock.notification.create.mockResolvedValue({ id: 'notif-1' } as any);

      await notifyInvoiceRejected(
        {
          id: 'inv-1',
          billingNo: 'S-2026-00001',
          customerName: 'Test Client',
        },
        'Jane Rejector',
        'Incorrect amount'
      );

      expect(prismaMock.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'INVOICE_REJECTED',
          title: 'Invoice Rejected',
          message: expect.stringContaining('Jane Rejector'),
          message: expect.stringContaining('Incorrect amount'),
          link: '/dashboard/rejected',
        }),
      });
    });

    it('handles missing reason gracefully', async () => {
      prismaMock.notification.create.mockResolvedValue({ id: 'notif-1' } as any);

      await notifyInvoiceRejected(
        {
          id: 'inv-1',
          billingNo: 'S-2026-00001',
          customerName: 'Test Client',
        },
        'Jane Rejector'
      );

      expect(prismaMock.notification.create).toHaveBeenCalled();
    });
  });

  describe('notifyInvoiceSent', () => {
    it('creates sent notification with email address', async () => {
      prismaMock.notification.create.mockResolvedValue({ id: 'notif-1' } as any);

      await notifyInvoiceSent({
        id: 'inv-1',
        billingNo: 'S-2026-00001',
        customerName: 'Test Client',
        customerEmail: 'client@test.com',
      });

      expect(prismaMock.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'INVOICE_SENT',
          title: 'Invoice Sent',
          message: expect.stringContaining('client@test.com'),
          link: '/dashboard/invoices',
        }),
      });
    });
  });

  describe('notifyInvoiceOverdue', () => {
    it('creates overdue notification with days count', async () => {
      prismaMock.notification.create.mockResolvedValue({ id: 'notif-1' } as any);

      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 10);

      await notifyInvoiceOverdue({
        id: 'inv-1',
        billingNo: 'S-2026-00001',
        customerName: 'Late Client',
        dueDate: pastDate,
      });

      expect(prismaMock.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'INVOICE_OVERDUE',
          title: 'Invoice Overdue',
          message: expect.stringMatching(/\d+ days overdue/),
        }),
      });
    });
  });

  describe('notifyInvoicePaid', () => {
    it('creates paid notification with payment details', async () => {
      prismaMock.notification.create.mockResolvedValue({ id: 'notif-1' } as any);

      await notifyInvoicePaid({
        id: 'inv-1',
        billingNo: 'S-2026-00001',
        customerName: 'Paying Client',
        paidAmount: 10000,
        paymentMethod: 'BANK_TRANSFER',
      });

      expect(prismaMock.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'INVOICE_PAID',
          title: 'Invoice Paid',
          message: expect.stringContaining('Bank Transfer'),
        }),
      });
    });

    it('formats CASH payment method', async () => {
      prismaMock.notification.create.mockResolvedValue({ id: 'notif-1' } as any);

      await notifyInvoicePaid({
        id: 'inv-1',
        billingNo: 'S-2026-00001',
        customerName: 'Cash Client',
        paidAmount: 5000,
        paymentMethod: 'CASH',
      });

      expect(prismaMock.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          message: expect.stringContaining('Cash'),
        }),
      });
    });

    it('formats CHECK payment method', async () => {
      prismaMock.notification.create.mockResolvedValue({ id: 'notif-1' } as any);

      await notifyInvoicePaid({
        id: 'inv-1',
        billingNo: 'S-2026-00001',
        customerName: 'Check Client',
        paidAmount: 15000,
        paymentMethod: 'CHECK',
      });

      expect(prismaMock.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          message: expect.stringContaining('Check'),
        }),
      });
    });
  });
});
