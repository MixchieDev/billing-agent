import prisma from '@/lib/prisma';
import { NotificationType } from '@/generated/prisma';

interface CreateNotificationParams {
  userId?: string | null; // null = broadcast to all users
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  entityType?: string;
  entityId?: string;
}

export async function createNotification(params: CreateNotificationParams) {
  try {
    return await prisma.notification.create({
      data: {
        userId: params.userId,
        type: params.type,
        title: params.title,
        message: params.message,
        link: params.link,
        entityType: params.entityType,
        entityId: params.entityId,
      },
    });
  } catch (error) {
    console.error('Error creating notification:', error);
    // Don't throw - notifications shouldn't break main functionality
    return null;
  }
}

// Helper functions for common notification types

export async function notifyInvoicePending(invoice: {
  id: string;
  billingNo?: string | null;
  customerName: string;
}) {
  const billingNo = invoice.billingNo || invoice.id.slice(0, 8);
  return createNotification({
    userId: null, // Notify all approvers
    type: 'INVOICE_PENDING',
    title: 'Invoice Pending Approval',
    message: `Invoice ${billingNo} for ${invoice.customerName} needs approval`,
    link: '/dashboard/pending',
    entityType: 'Invoice',
    entityId: invoice.id,
  });
}

export async function notifyAnnualRenewalPending(invoice: {
  id: string;
  billingNo?: string | null;
  customerName: string;
}) {
  const billingNo = invoice.billingNo || invoice.id.slice(0, 8);
  return createNotification({
    userId: null, // Notify all approvers
    type: 'INVOICE_PENDING',
    title: 'Annual Invoice Pending Renewal Review',
    message: `Invoice ${billingNo} for ${invoice.customerName} requires approval. Please review contract renewal before sending.`,
    link: '/dashboard/pending',
    entityType: 'Invoice',
    entityId: invoice.id,
  });
}

export async function notifyInvoiceApproved(invoice: {
  id: string;
  billingNo?: string | null;
  customerName: string;
}, approverName: string) {
  const billingNo = invoice.billingNo || invoice.id.slice(0, 8);
  return createNotification({
    userId: null,
    type: 'INVOICE_APPROVED',
    title: 'Invoice Approved',
    message: `Invoice ${billingNo} for ${invoice.customerName} was approved by ${approverName}`,
    link: '/dashboard/approved',
    entityType: 'Invoice',
    entityId: invoice.id,
  });
}

export async function notifyInvoiceRejected(invoice: {
  id: string;
  billingNo?: string | null;
  customerName: string;
}, rejectorName: string, reason?: string) {
  const billingNo = invoice.billingNo || invoice.id.slice(0, 8);
  const reasonText = reason ? `: ${reason}` : '';
  return createNotification({
    userId: null,
    type: 'INVOICE_REJECTED',
    title: 'Invoice Rejected',
    message: `Invoice ${billingNo} for ${invoice.customerName} was rejected by ${rejectorName}${reasonText}`,
    link: '/dashboard/rejected',
    entityType: 'Invoice',
    entityId: invoice.id,
  });
}

export async function notifyInvoiceSent(invoice: {
  id: string;
  billingNo?: string | null;
  customerName: string;
  customerEmail?: string | null;
}) {
  const billingNo = invoice.billingNo || invoice.id.slice(0, 8);
  return createNotification({
    userId: null,
    type: 'INVOICE_SENT',
    title: 'Invoice Sent',
    message: `Invoice ${billingNo} was sent to ${invoice.customerName} (${invoice.customerEmail})`,
    link: '/dashboard/invoices',
    entityType: 'Invoice',
    entityId: invoice.id,
  });
}

export async function notifyInvoiceOverdue(invoice: {
  id: string;
  billingNo?: string | null;
  customerName: string;
  dueDate: Date;
}) {
  const billingNo = invoice.billingNo || invoice.id.slice(0, 8);
  const daysOverdue = Math.floor((Date.now() - invoice.dueDate.getTime()) / (1000 * 60 * 60 * 24));
  return createNotification({
    userId: null,
    type: 'INVOICE_OVERDUE',
    title: 'Invoice Overdue',
    message: `Invoice ${billingNo} for ${invoice.customerName} is ${daysOverdue} days overdue`,
    link: '/dashboard/invoices',
    entityType: 'Invoice',
    entityId: invoice.id,
  });
}

export async function notifyInvoicePaid(invoice: {
  id: string;
  billingNo?: string | null;
  customerName: string;
  paidAmount: number;
  paymentMethod: string;
}) {
  const billingNo = invoice.billingNo || invoice.id.slice(0, 8);
  const methodLabels: Record<string, string> = {
    CASH: 'Cash',
    BANK_TRANSFER: 'Bank Transfer',
    CHECK: 'Check',
  };
  const method = methodLabels[invoice.paymentMethod] || invoice.paymentMethod;
  return createNotification({
    userId: null,
    type: 'INVOICE_PAID',
    title: 'Invoice Paid',
    message: `Invoice ${billingNo} for ${invoice.customerName} was marked as paid (${method})`,
    link: '/dashboard/invoices',
    entityType: 'Invoice',
    entityId: invoice.id,
  });
}
