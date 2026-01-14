import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getSOASettings, getInvoiceTemplate, clearTemplateCache } from '@/lib/settings';
import { generateInvoicePdfLib } from '@/lib/pdf-generator';
import {
  initEmailServiceFromEnv,
  sendBillingEmail,
  getEmailTemplateForPartner,
  generateEmailSubjectFromTemplate,
  generateEmailBodyFromTemplate,
  generateEmailHtmlFromTemplate,
  EmailPlaceholderData,
  EmailAttachment,
} from '@/lib/email-service';
import { InvoiceStatus } from '@/generated/prisma';
import { notifyInvoiceSent } from '@/lib/notifications';
import { validateEmails, formatCurrency } from '@/lib/utils';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check user role
    if (session.user.role !== 'ADMIN' && session.user.role !== 'APPROVER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        company: true,
        lineItems: {
          include: {
            contract: true,
          },
        },
        attachments: true,  // Include saved attachments
      },
    });

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // Allow sending approved or already sent invoices (for resending)
    if (invoice.status !== InvoiceStatus.APPROVED && invoice.status !== InvoiceStatus.SENT) {
      return NextResponse.json(
        { error: 'Invoice must be approved before sending' },
        { status: 400 }
      );
    }

    // Get client email(s) - prioritize customerEmails, fallback to customerEmail
    const clientEmailsString = invoice.customerEmails || invoice.customerEmail;
    if (!clientEmailsString) {
      return NextResponse.json(
        { error: 'No email address found for this client. Please update the invoice with customer emails.' },
        { status: 400 }
      );
    }

    // Validate emails
    const { valid: validEmails, invalid: invalidEmails } = validateEmails(clientEmailsString);
    if (validEmails.length === 0) {
      return NextResponse.json(
        { error: `No valid email addresses found. Invalid emails: ${invalidEmails.join(', ')}` },
        { status: 400 }
      );
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

    // Generate PDF using shared multi-page generator with template
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
    // This is the actual client company (e.g., for Globe Innove invoices)
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
      return NextResponse.json(
        { error: result.error || 'Failed to send email' },
        { status: 500 }
      );
    }

    // Update invoice status to SENT
    await prisma.invoice.update({
      where: { id },
      data: {
        status: InvoiceStatus.SENT,
      },
    });

    // Log the action
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'INVOICE_SENT',
        entityType: 'Invoice',
        entityId: id,
        details: {
          invoiceNo: billingNo,
          sentTo: validEmails.join(', '),
          messageId: result.messageId,
          attachmentCount: additionalAttachments.length,
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

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      sentTo: validEmails.join(', '),
    });
  } catch (error) {
    console.error('Error sending invoice:', error);
    return NextResponse.json(
      { error: 'Failed to send invoice' },
      { status: 500 }
    );
  }
}
