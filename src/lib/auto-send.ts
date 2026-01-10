/**
 * Auto-send module for scheduled invoice sending
 * Used by the scheduler to automatically send invoices for MONTHLY/QUARTERLY billing
 */

import prisma from './prisma';
import { InvoiceStatus } from '@/generated/prisma';
import { getSOASettings } from './settings';
import { generateInvoicePdfLib } from './pdf-generator';
import {
  initEmailServiceFromEnv,
  sendBillingEmail,
  generateEmailSubject,
  generateEmailBody,
  generateEmailHtml,
} from './email-service';
import { notifyInvoiceSent } from './notifications';

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
    // Fetch invoice with company and line items
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        company: true,
        lineItems: true,
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

    // Validate customer email exists
    const clientEmail = invoice.customerEmail;
    if (!clientEmail) {
      return {
        success: false,
        invoiceId,
        billingNo: invoice.billingNo || undefined,
        error: 'No email address found for this client',
      };
    }

    // Initialize email service
    initEmailServiceFromEnv();

    // Get SOA settings
    const companyCode = invoice.company?.code === 'YOWI' ? 'YOWI' : 'ABBA';
    const soaSettings = await getSOASettings(companyCode);

    // Generate PDF
    const pdfBytes = await generateInvoicePdfLib(invoice, soaSettings);
    const pdfBuffer = Buffer.from(pdfBytes);

    // Generate email content
    const billingNo = invoice.billingNo || invoice.invoiceNo || invoice.id;
    const subject = generateEmailSubject(billingNo, invoice.customerName);
    const periodDescription = `the month of ${new Date(invoice.dueDate).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`;

    const templateData = {
      clientName: invoice.customerName,
      serviceType: invoice.lineItems?.[0]?.description || 'Professional Services',
      periodDescription,
      billingNo,
    };

    const body = generateEmailBody(templateData);
    const htmlBody = generateEmailHtml(templateData);

    // Send email
    const result = await sendBillingEmail(
      invoice.id,
      clientEmail,
      subject,
      body,
      htmlBody,
      pdfBuffer,
      `${billingNo}.pdf`
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
          sentTo: clientEmail,
          messageId: result.messageId,
          automated: true,
        },
      },
    });

    // Create notification
    await notifyInvoiceSent({
      id: invoice.id,
      billingNo: invoice.billingNo,
      customerName: invoice.customerName,
      customerEmail: clientEmail,
    });

    console.log(`[Auto-Send] Successfully sent invoice ${billingNo} to ${clientEmail}`);

    return {
      success: true,
      invoiceId,
      billingNo,
      sentTo: clientEmail,
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
