/**
 * Auto-send module for scheduled invoice sending
 * Used by the scheduler to automatically send invoices for MONTHLY/QUARTERLY billing
 */

import prisma from './prisma';
import { InvoiceStatus } from '@/generated/prisma';
import { getSOASettings, getInvoiceTemplate, clearTemplateCache } from './settings';
import { generateInvoicePdfLib } from './pdf-generator';
import {
  initEmailServiceFromEnv,
  sendBillingEmail,
  getEmailTemplateForPartner,
  generateEmailSubjectFromTemplate,
  generateEmailBodyFromTemplate,
  generateEmailHtmlFromTemplate,
  EmailPlaceholderData,
  EmailAttachment,
} from './email-service';
import { notifyInvoiceSent } from './notifications';
import { validateEmails, formatCurrency } from './utils';

export interface AutoSendResult {
  success: boolean;
  invoiceId: string;
  billingNo?: string;
  sentTo?: string;
  messageId?: string;
  error?: string;
}

/**
 * Auto-send an invoice (generate PDF and send email)
 * This function is called by the scheduler for MONTHLY/QUARTERLY invoices
 */
export async function autoSendInvoice(invoiceId: string): Promise<AutoSendResult> {
  try {
    // Fetch invoice with company, line items (including contract), and attachments
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        company: true,
        lineItems: {
          include: {
            contract: true,
          },
        },
        attachments: true,
      },
    });

    if (!invoice) {
      return {
        success: false,
        invoiceId,
        error: 'Invoice not found',
      };
    }

    // Validate invoice is in APPROVED status
    if (invoice.status !== InvoiceStatus.APPROVED) {
      return {
        success: false,
        invoiceId,
        billingNo: invoice.billingNo || undefined,
        error: `Invoice must be approved before sending. Current status: ${invoice.status}`,
      };
    }

    // Validate customer email(s) exist - prioritize customerEmails, fallback to customerEmail
    const clientEmailsString = invoice.customerEmails || invoice.customerEmail;
    if (!clientEmailsString) {
      return {
        success: false,
        invoiceId,
        billingNo: invoice.billingNo || undefined,
        error: 'No email address found for this client',
      };
    }

    // Validate emails
    const { valid: validEmails, invalid: invalidEmails } = validateEmails(clientEmailsString);
    if (validEmails.length === 0) {
      return {
        success: false,
        invoiceId,
        billingNo: invoice.billingNo || undefined,
        error: `No valid email addresses. Invalid: ${invalidEmails.join(', ')}`,
      };
    }

    // Initialize email service
    initEmailServiceFromEnv();

    // Get SOA settings and invoice template
    const companyCode = invoice.company?.code === 'YOWI' ? 'YOWI' : 'ABBA';

    // Clear template cache to ensure we always use the latest template
    clearTemplateCache();

    const [soaSettings, template] = await Promise.all([
      getSOASettings(companyCode),
      getInvoiceTemplate(companyCode),
    ]);

    // Generate PDF with template
    const pdfBytes = await generateInvoicePdfLib(invoice, soaSettings, template);
    const pdfBuffer = Buffer.from(pdfBytes);

    // Generate email content using templates
    const billingNo = invoice.billingNo || invoice.invoiceNo || invoice.id;

    // Fetch email template based on partner
    const emailTemplate = await getEmailTemplateForPartner(invoice.partnerId);

    // Format dates for placeholders
    const formatDate = (date: Date | null) => {
      if (!date) return 'N/A';
      return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    };

    // Get the client company name from the first line item's contract
    const clientCompanyName = invoice.lineItems?.[0]?.contract?.companyName || invoice.customerName;

    // Build placeholder data
    const placeholderData: EmailPlaceholderData = {
      customerName: invoice.customerName,
      billingNo,
      dueDate: formatDate(invoice.dueDate),
      totalAmount: formatCurrency(Number(invoice.netAmount)),
      periodStart: formatDate(invoice.periodStart),
      periodEnd: formatDate(invoice.periodEnd),
      companyName: invoice.company?.name || 'YAHSHUA-ABBA',
      clientCompanyName,
    };

    const subject = generateEmailSubjectFromTemplate(emailTemplate, placeholderData);
    const body = generateEmailBodyFromTemplate(emailTemplate, placeholderData);
    const htmlBody = generateEmailHtmlFromTemplate(emailTemplate, placeholderData);

    // Convert invoice attachments to email attachments
    const additionalAttachments: EmailAttachment[] = invoice.attachments.map((att) => ({
      filename: att.filename,
      content: Buffer.from(att.data),
      contentType: att.mimeType,
    }));

    // Send email to all valid recipients
    const result = await sendBillingEmail(
      invoice.id,
      validEmails,
      subject,
      body,
      htmlBody,
      pdfBuffer,
      `${billingNo}.pdf`,
      additionalAttachments.length > 0 ? additionalAttachments : undefined
    );

    if (!result.success) {
      return {
        success: false,
        invoiceId,
        billingNo,
        error: result.error || 'Failed to send email',
      };
    }

    // Update invoice status to SENT
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: InvoiceStatus.SENT,
      },
    });

    // Log the action (system-generated, no userId)
    await prisma.auditLog.create({
      data: {
        userId: null, // System automated
        action: 'INVOICE_AUTO_SENT',
        entityType: 'Invoice',
        entityId: invoiceId,
        details: {
          invoiceNo: billingNo,
          sentTo: validEmails.join(', '),
          messageId: result.messageId,
          attachmentCount: additionalAttachments.length,
          automated: true,
        },
      },
    });

    // Create notification
    await notifyInvoiceSent({
      id: invoice.id,
      billingNo: invoice.billingNo,
      customerName: invoice.customerName,
      customerEmail: validEmails[0],  // Use first email for notification
    });

    console.log(`[Auto-Send] Successfully sent invoice ${billingNo} to ${validEmails.join(', ')}`);

    return {
      success: true,
      invoiceId,
      billingNo,
      sentTo: validEmails.join(', '),
      messageId: result.messageId,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Auto-Send] Error sending invoice ${invoiceId}:`, errorMessage);

    return {
      success: false,
      invoiceId,
      error: errorMessage,
    };
  }
}

/**
 * Auto-send multiple invoices (for batch processing)
 */
export async function autoSendInvoices(invoiceIds: string[]): Promise<{
  successful: AutoSendResult[];
  failed: AutoSendResult[];
}> {
  const successful: AutoSendResult[] = [];
  const failed: AutoSendResult[] = [];

  for (const invoiceId of invoiceIds) {
    const result = await autoSendInvoice(invoiceId);

    if (result.success) {
      successful.push(result);
    } else {
      failed.push(result);
    }
  }

  console.log(`[Auto-Send] Batch complete: ${successful.length} sent, ${failed.length} failed`);

  return { successful, failed };
}
