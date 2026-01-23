// Follow-up email service for sent invoices
import prisma from './prisma';
import { EmailStatus } from '@/generated/prisma';
import {
  initEmailServiceFromEnv,
  getFollowUpTemplate,
  replacePlaceholders,
  generateEmailHtmlFromTemplate,
  sendBillingEmail,
  EmailPlaceholderData,
} from './email-service';
import { generateInvoicePdfLib, SOASettings } from './pdf-generator';
import { getSOASettings, getInvoiceTemplate } from './settings';
import { formatCurrency, formatDate } from './utils';

export interface FollowUpResult {
  success: boolean;
  level?: number;
  message: string;
  followUpLogId?: string;
  error?: string;
}

export interface CanSendFollowUpResult {
  canSend: boolean;
  reason?: string;
  nextLevel?: number;
}

const MAX_FOLLOW_UP_LEVEL = 3;

/**
 * Check if a follow-up can be sent for an invoice
 */
export async function canSendFollowUp(invoiceId: string): Promise<CanSendFollowUpResult> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true,
      status: true,
      followUpEnabled: true,
      lastFollowUpLevel: true,
      customerEmail: true,
      customerEmails: true,
    },
  });

  if (!invoice) {
    return { canSend: false, reason: 'Invoice not found' };
  }

  if (invoice.status !== 'SENT') {
    return { canSend: false, reason: 'Invoice must be in SENT status to send follow-up' };
  }

  if (!invoice.followUpEnabled) {
    return { canSend: false, reason: 'Follow-up is disabled for this invoice' };
  }

  const nextLevel = invoice.lastFollowUpLevel + 1;
  if (nextLevel > MAX_FOLLOW_UP_LEVEL) {
    return { canSend: false, reason: 'Maximum follow-up level (3) reached' };
  }

  // Check if customer has email
  const hasEmail = invoice.customerEmails || invoice.customerEmail;
  if (!hasEmail) {
    return { canSend: false, reason: 'No email address for this customer' };
  }

  return { canSend: true, nextLevel };
}

/**
 * Calculate days overdue for an invoice
 */
export function calculateDaysOverdue(dueDate: Date): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  const diffTime = today.getTime() - due.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

/**
 * Send a follow-up email for an invoice
 */
export async function sendFollowUpEmail(
  invoiceId: string,
  userId?: string
): Promise<FollowUpResult> {
  // Initialize email service
  initEmailServiceFromEnv();

  // Check if we can send follow-up
  const canSendResult = await canSendFollowUp(invoiceId);
  if (!canSendResult.canSend) {
    return {
      success: false,
      message: canSendResult.reason || 'Cannot send follow-up',
    };
  }

  const level = canSendResult.nextLevel!;

  // Fetch invoice with all needed relations
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      company: true,
      partner: true,
      lineItems: true,
      attachments: true,
    },
  });

  if (!invoice) {
    return { success: false, message: 'Invoice not found' };
  }

  // Get follow-up template for this level
  const template = await getFollowUpTemplate(level);
  if (!template) {
    return {
      success: false,
      message: `No follow-up template configured for level ${level}. Please set up follow-up templates in Settings.`,
    };
  }

  // Calculate days overdue
  const daysOverdue = calculateDaysOverdue(invoice.dueDate);

  // Prepare placeholder data
  const placeholderData: EmailPlaceholderData = {
    customerName: invoice.customerName,
    billingNo: invoice.billingNo || invoice.id.slice(0, 8),
    dueDate: formatDate(invoice.dueDate),
    totalAmount: formatCurrency(Number(invoice.netAmount)),
    periodStart: invoice.periodStart ? formatDate(invoice.periodStart) : '',
    periodEnd: invoice.periodEnd ? formatDate(invoice.periodEnd) : '',
    companyName: invoice.company?.name || 'YAHSHUA-ABBA',
    clientCompanyName: invoice.customerName,
    daysOverdue: daysOverdue.toString(),
  };

  // Generate email content from template
  const subject = replacePlaceholders(template.subject, placeholderData);
  const greeting = replacePlaceholders(template.greeting, placeholderData);
  const body = replacePlaceholders(template.body, placeholderData);
  const closing = replacePlaceholders(template.closing, placeholderData);
  const plainTextBody = `${greeting}\n\n${body}\n\n${closing}`;
  const htmlBody = generateEmailHtmlFromTemplate(template, placeholderData);

  // Get recipient emails
  const toEmails = invoice.customerEmails || invoice.customerEmail || '';

  // Generate PDF attachment
  let pdfBuffer: Buffer | undefined;
  let pdfFilename: string | undefined;
  try {
    const companyCode = (invoice.company?.code === 'YOWI' || invoice.company?.code === 'ABBA')
      ? invoice.company.code
      : 'ABBA';
    const soaSettings = await getSOASettings(companyCode);
    const templateSettings = await getInvoiceTemplate(companyCode);

    const pdfData = await generateInvoicePdfLib(invoice, soaSettings as SOASettings, templateSettings || undefined);
    pdfBuffer = Buffer.from(pdfData);
    pdfFilename = `Invoice-${invoice.billingNo || invoice.id.slice(0, 8)}.pdf`;
  } catch (error) {
    console.error('[Follow-up Service] Failed to generate PDF:', error);
    // Continue without PDF - it's not critical for follow-up
  }

  // Create follow-up log record
  const followUpLog = await prisma.followUpLog.create({
    data: {
      invoiceId: invoice.id,
      level,
      toEmail: toEmails,
      subject,
      status: EmailStatus.QUEUED,
      templateId: template.id,
    },
  });

  try {
    // Send the email
    const result = await sendBillingEmail(
      invoice.id,
      toEmails,
      subject,
      plainTextBody,
      htmlBody,
      pdfBuffer,
      pdfFilename
    );

    if (result.success) {
      // Update follow-up log
      await prisma.followUpLog.update({
        where: { id: followUpLog.id },
        data: {
          status: EmailStatus.SENT,
          messageId: result.messageId,
          sentAt: new Date(),
        },
      });

      // Update invoice follow-up tracking
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          followUpCount: { increment: 1 },
          lastFollowUpAt: new Date(),
          lastFollowUpLevel: level,
        },
      });

      // Create audit log
      await prisma.auditLog.create({
        data: {
          userId: userId || null,
          action: 'INVOICE_FOLLOW_UP_SENT',
          entityType: 'Invoice',
          entityId: invoice.id,
          details: {
            level,
            to: toEmails,
            subject,
            daysOverdue,
          },
        },
      });

      // Create notification
      await prisma.notification.create({
        data: {
          type: 'INVOICE_FOLLOW_UP',
          title: `Follow-up ${level} Sent`,
          message: `Follow-up email (level ${level}) sent for invoice ${invoice.billingNo || invoice.id.slice(0, 8)} to ${invoice.customerName}`,
          link: '/dashboard/invoices',
          entityType: 'Invoice',
          entityId: invoice.id,
        },
      });

      return {
        success: true,
        level,
        message: `Follow-up level ${level} sent successfully`,
        followUpLogId: followUpLog.id,
      };
    } else {
      // Update follow-up log with error
      await prisma.followUpLog.update({
        where: { id: followUpLog.id },
        data: {
          status: EmailStatus.FAILED,
          error: result.error,
        },
      });

      return {
        success: false,
        level,
        message: `Failed to send follow-up: ${result.error}`,
        error: result.error,
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Update follow-up log with error
    await prisma.followUpLog.update({
      where: { id: followUpLog.id },
      data: {
        status: EmailStatus.FAILED,
        error: errorMessage,
      },
    });

    return {
      success: false,
      level,
      message: `Error sending follow-up: ${errorMessage}`,
      error: errorMessage,
    };
  }
}

/**
 * Get follow-up history for an invoice
 */
export async function getFollowUpHistory(invoiceId: string) {
  return prisma.followUpLog.findMany({
    where: { invoiceId },
    include: {
      template: {
        select: {
          name: true,
          followUpLevel: true,
        },
      },
    },
    orderBy: { sentAt: 'desc' },
  });
}

/**
 * Toggle follow-up enabled/disabled for an invoice
 */
export async function toggleFollowUpEnabled(
  invoiceId: string,
  enabled: boolean,
  userId?: string
): Promise<{ success: boolean; enabled: boolean }> {
  const invoice = await prisma.invoice.update({
    where: { id: invoiceId },
    data: { followUpEnabled: enabled },
  });

  // Create audit log
  await prisma.auditLog.create({
    data: {
      userId: userId || null,
      action: enabled ? 'INVOICE_FOLLOW_UP_ENABLED' : 'INVOICE_FOLLOW_UP_DISABLED',
      entityType: 'Invoice',
      entityId: invoiceId,
      details: { enabled },
    },
  });

  return { success: true, enabled: invoice.followUpEnabled };
}
