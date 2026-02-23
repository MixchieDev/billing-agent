// Follow-up email service for sent invoices
import { convexClient, api } from '@/lib/convex';
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
  const invoice = await convexClient.query(api.invoices.getById, { id: invoiceId as any });

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
export function calculateDaysOverdue(dueDate: number | Date): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = typeof dueDate === 'number' ? new Date(dueDate) : new Date(dueDate);
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
  const invoice = await convexClient.query(api.invoices.getByIdFull, { id: invoiceId as any });

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
    billingNo: invoice.billingNo || invoice._id.slice(0, 8),
    dueDate: formatDate(new Date(invoice.dueDate)),
    totalAmount: formatCurrency(Number(invoice.netAmount)),
    periodStart: invoice.periodStart ? formatDate(new Date(invoice.periodStart)) : '',
    periodEnd: invoice.periodEnd ? formatDate(new Date(invoice.periodEnd)) : '',
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

    // Convert timestamps to Dates for the PDF generator
    const invoiceForPdf = {
      ...invoice,
      dueDate: new Date(invoice.dueDate),
      statementDate: new Date(invoice.statementDate),
      periodStart: invoice.periodStart ? new Date(invoice.periodStart) : null,
      periodEnd: invoice.periodEnd ? new Date(invoice.periodEnd) : null,
    };

    const pdfData = await generateInvoicePdfLib(invoiceForPdf, soaSettings as SOASettings, templateSettings || undefined);
    pdfBuffer = Buffer.from(pdfData);
    pdfFilename = `Invoice-${invoice.billingNo || invoice._id.slice(0, 8)}.pdf`;
  } catch (error) {
    console.error('[Follow-up Service] Failed to generate PDF:', error);
    // Continue without PDF - it's not critical for follow-up
  }

  // Create follow-up log record
  const followUpLogId = await convexClient.mutation(api.followUpLogs.create, {
    invoiceId: invoice._id as any,
    level,
    sentAt: Date.now(),
    toEmail: toEmails,
    subject,
    status: 'QUEUED',
    templateId: template._id as any,
  });

  try {
    // Send the email
    const result = await sendBillingEmail(
      invoice._id,
      toEmails,
      subject,
      plainTextBody,
      htmlBody,
      pdfBuffer,
      pdfFilename
    );

    if (result.success) {
      // Update follow-up log
      await convexClient.mutation(api.followUpLogs.update, {
        id: followUpLogId,
        data: {
          status: 'SENT',
          messageId: result.messageId,
          sentAt: Date.now(),
        },
      });

      // Update invoice follow-up tracking
      await convexClient.mutation(api.invoices.update, {
        id: invoice._id as any,
        data: {
          followUpCount: invoice.followUpCount + 1,
          lastFollowUpAt: Date.now(),
          lastFollowUpLevel: level,
        },
      });

      // Create audit log
      await convexClient.mutation(api.auditLogs.create, {
        userId: userId as any || undefined,
        action: 'INVOICE_FOLLOW_UP_SENT',
        entityType: 'Invoice',
        entityId: invoice._id,
        details: {
          level,
          to: toEmails,
          subject,
          daysOverdue,
        },
      });

      // Create notification
      await convexClient.mutation(api.notifications.create, {
        type: 'INVOICE_FOLLOW_UP',
        title: `Follow-up ${level} Sent`,
        message: `Follow-up email (level ${level}) sent for invoice ${invoice.billingNo || invoice._id.slice(0, 8)} to ${invoice.customerName}`,
        link: '/dashboard/invoices',
        entityType: 'Invoice',
        entityId: invoice._id,
      });

      return {
        success: true,
        level,
        message: `Follow-up level ${level} sent successfully`,
        followUpLogId,
      };
    } else {
      // Update follow-up log with error
      await convexClient.mutation(api.followUpLogs.update, {
        id: followUpLogId,
        data: {
          status: 'FAILED',
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
    await convexClient.mutation(api.followUpLogs.update, {
      id: followUpLogId,
      data: {
        status: 'FAILED',
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
  return convexClient.query(api.followUpLogs.listByInvoiceId, { invoiceId: invoiceId as any });
}

/**
 * Toggle follow-up enabled/disabled for an invoice
 */
export async function toggleFollowUpEnabled(
  invoiceId: string,
  enabled: boolean,
  userId?: string
): Promise<{ success: boolean; enabled: boolean }> {
  await convexClient.mutation(api.invoices.update, {
    id: invoiceId as any,
    data: { followUpEnabled: enabled },
  });

  // Create audit log
  await convexClient.mutation(api.auditLogs.create, {
    userId: userId as any || undefined,
    action: enabled ? 'INVOICE_FOLLOW_UP_ENABLED' : 'INVOICE_FOLLOW_UP_DISABLED',
    entityType: 'Invoice',
    entityId: invoiceId,
    details: { enabled },
  });

  return { success: true, enabled };
}
