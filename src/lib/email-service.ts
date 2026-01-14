// Email service using Google Workspace SMTP
import nodemailer from 'nodemailer';
import prisma from './prisma';
import { EmailStatus } from '@/generated/prisma';

// Email configuration
interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  fromEmail: string;
  fromName: string;
  replyTo?: string;
  bccEmail?: string;
}

// Email template data (legacy, kept for backwards compatibility)
interface EmailTemplateData {
  clientName: string;
  serviceType: string;
  periodDescription: string;
  billingNo: string;
}

// Email placeholder data for template replacement
export interface EmailPlaceholderData {
  customerName: string;
  billingNo: string;
  dueDate: string;
  totalAmount: string;
  periodStart: string;
  periodEnd: string;
  companyName: string;
  clientCompanyName: string; // The actual client company name (from contract)
}

// Additional email attachment (for invoice attachments from database)
export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

// Email template from database
export interface EmailTemplateContent {
  id: string;
  name: string;
  subject: string;
  greeting: string;
  body: string;
  closing: string;
  isDefault: boolean;
}

let transporter: nodemailer.Transporter | null = null;
let emailConfig: EmailConfig | null = null;

// Initialize email service with Google Workspace SMTP
export function initEmailService(config: EmailConfig) {
  emailConfig = config;

  transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure, // false for TLS (port 587)
    auth: {
      user: config.user,
      pass: config.password,
    },
  });

  console.log('[Email Service] Initialized with SMTP:', config.host);
}

// Initialize from environment variables
export function initEmailServiceFromEnv() {
  const config: EmailConfig = {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    password: process.env.SMTP_PASSWORD || '',
    fromEmail: process.env.EMAIL_FROM || 'billingcollection@abba.works',
    fromName: process.env.EMAIL_FROM_NAME || 'YAHSHUA-ABBA Billing',
    replyTo: process.env.EMAIL_REPLY_TO,
    bccEmail: process.env.EMAIL_BCC,
  };

  if (!config.user || !config.password) {
    console.warn('[Email Service] SMTP credentials not configured');
    return;
  }

  initEmailService(config);
}

// Verify SMTP connection
export async function verifyEmailConnection(): Promise<boolean> {
  if (!transporter) {
    console.error('[Email Service] Transporter not initialized');
    return false;
  }

  try {
    await transporter.verify();
    console.log('[Email Service] SMTP connection verified');
    return true;
  } catch (error) {
    console.error('[Email Service] SMTP verification failed:', error);
    return false;
  }
}

// Get email template for a partner (or default template if no partner-specific)
export async function getEmailTemplateForPartner(partnerId: string | null): Promise<EmailTemplateContent | null> {
  try {
    // If partner has a template assigned, use it
    if (partnerId) {
      const partner = await prisma.partner.findUnique({
        where: { id: partnerId },
        include: { emailTemplate: true },
      });

      if (partner?.emailTemplate) {
        return partner.emailTemplate;
      }
    }

    // Fall back to default template
    const defaultTemplate = await prisma.emailTemplate.findFirst({
      where: { isDefault: true },
    });

    return defaultTemplate;
  } catch (error) {
    console.error('[Email Service] Failed to fetch email template:', error);
    return null;
  }
}

// Replace placeholders in template text
export function replacePlaceholders(text: string, data: EmailPlaceholderData): string {
  return text
    .replace(/\{\{customerName\}\}/g, data.customerName)
    .replace(/\{\{billingNo\}\}/g, data.billingNo)
    .replace(/\{\{dueDate\}\}/g, data.dueDate)
    .replace(/\{\{totalAmount\}\}/g, data.totalAmount)
    .replace(/\{\{periodStart\}\}/g, data.periodStart)
    .replace(/\{\{periodEnd\}\}/g, data.periodEnd)
    .replace(/\{\{companyName\}\}/g, data.companyName)
    .replace(/\{\{clientCompanyName\}\}/g, data.clientCompanyName);
}

// Generate email subject from template
export function generateEmailSubjectFromTemplate(
  template: EmailTemplateContent | null,
  data: EmailPlaceholderData
): string {
  if (template) {
    return replacePlaceholders(template.subject, data);
  }
  // Fallback to legacy format
  return `Bill No. ${data.billingNo} | ${data.customerName}`;
}

// Generate email body from template (plain text)
export function generateEmailBodyFromTemplate(
  template: EmailTemplateContent | null,
  data: EmailPlaceholderData
): string {
  if (template) {
    const greeting = replacePlaceholders(template.greeting, data);
    const body = replacePlaceholders(template.body, data);
    const closing = replacePlaceholders(template.closing, data);
    return `${greeting}\n\n${body}\n\n${closing}`;
  }
  // Fallback to legacy format
  return generateEmailBody({
    clientName: data.customerName,
    serviceType: 'Professional Services',
    periodDescription: `${data.periodStart} to ${data.periodEnd}`,
    billingNo: data.billingNo,
  });
}

// Generate HTML email body from template
export function generateEmailHtmlFromTemplate(
  template: EmailTemplateContent | null,
  data: EmailPlaceholderData
): string {
  if (template) {
    const greeting = replacePlaceholders(template.greeting, data);
    const body = replacePlaceholders(template.body, data);
    const closing = replacePlaceholders(template.closing, data);

    // Convert newlines to HTML breaks
    const formatHtml = (text: string) => text.replace(/\n/g, '<br>');

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .greeting { color: #1a365d; font-weight: bold; }
    .body { margin: 20px 0; }
    .signature { margin-top: 30px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <p class="greeting">${formatHtml(greeting)}</p>
    <div class="body">${formatHtml(body)}</div>
    <div class="signature">${formatHtml(closing)}</div>
  </div>
</body>
</html>
    `;
  }
  // Fallback to legacy format
  return generateEmailHtml({
    clientName: data.customerName,
    serviceType: 'Professional Services',
    periodDescription: `${data.periodStart} to ${data.periodEnd}`,
    billingNo: data.billingNo,
  });
}

// Generate email subject (legacy - kept for backwards compatibility)
export function generateEmailSubject(billingNo: string, clientName: string): string {
  return `Bill No. ${billingNo} | ${clientName}`;
}

// Generate email body
export function generateEmailBody(data: EmailTemplateData): string {
  return `A blessed day, Beloved Client!

Please see attached Billing for the ${data.serviceType} for ${data.clientName}, covering ${data.periodDescription}.

Kindly reply to this email to confirm receipt.

Also, if paid already, kindly provide a copy of proof of payment attached with your corresponding 2307.

Please don't hesitate to contact us if you have any questions or concerns.

Thank you for trusting YAHSHUA-ABBA Solutions.

GOD bless,

YAHSHUA-ABBA Billing Team`;
}

// Generate HTML email body
export function generateEmailHtml(data: EmailTemplateData): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .greeting { color: #1a365d; font-weight: bold; }
    .signature { margin-top: 30px; color: #666; }
    .team-name { font-weight: bold; color: #1a365d; }
  </style>
</head>
<body>
  <div class="container">
    <p class="greeting">A blessed day, Beloved Client!</p>

    <p>Please see attached Billing for the <strong>${data.serviceType}</strong> for
    <strong>${data.clientName}</strong>, covering ${data.periodDescription}.</p>

    <p>Kindly reply to this email to confirm receipt.</p>

    <p>Also, if paid already, kindly provide a copy of proof of payment
    attached with your corresponding 2307.</p>

    <p>Please don't hesitate to contact us if you have any questions or concerns.</p>

    <p>Thank you for trusting YAHSHUA-ABBA Solutions.</p>

    <div class="signature">
      <p>GOD bless,</p>
      <p class="team-name">YAHSHUA-ABBA Billing Team</p>
    </div>
  </div>
</body>
</html>
  `;
}

// Send billing email
export async function sendBillingEmail(
  invoiceId: string,
  toEmails: string | string[],  // Accept single email or array
  subject: string,
  body: string,
  htmlBody?: string,
  pdfAttachment?: Buffer,
  pdfFilename?: string,
  additionalAttachments?: EmailAttachment[]  // Additional files to attach
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!transporter || !emailConfig) {
    return { success: false, error: 'Email service not configured' };
  }

  // Normalize to comma-separated string for nodemailer (supports multiple recipients)
  const emailString = Array.isArray(toEmails) ? toEmails.join(', ') : toEmails;

  // Log the email attempt (store all recipients)
  const emailLog = await prisma.emailLog.create({
    data: {
      invoiceId,
      toEmail: emailString,
      subject,
      status: EmailStatus.QUEUED,
    },
  });

  try {
    const mailOptions: nodemailer.SendMailOptions = {
      from: {
        name: emailConfig.fromName,
        address: emailConfig.fromEmail,
      },
      to: emailString,  // Nodemailer supports comma-separated emails
      replyTo: emailConfig.replyTo || emailConfig.fromEmail,
      subject,
      text: body,
      html: htmlBody,
    };

    // Add BCC for tracking
    if (emailConfig.bccEmail) {
      mailOptions.bcc = emailConfig.bccEmail;
    }

    // Build attachments array
    const attachments: Array<{
      filename: string;
      content: Buffer;
      contentType: string;
    }> = [];

    // Add PDF attachment if provided
    if (pdfAttachment && pdfFilename) {
      attachments.push({
        filename: pdfFilename,
        content: pdfAttachment,
        contentType: 'application/pdf',
      });
    }

    // Add additional attachments (from invoice attachments)
    if (additionalAttachments && additionalAttachments.length > 0) {
      for (const att of additionalAttachments) {
        attachments.push({
          filename: att.filename,
          content: att.content,
          contentType: att.contentType,
        });
      }
    }

    if (attachments.length > 0) {
      mailOptions.attachments = attachments;
    }

    const result = await transporter.sendMail(mailOptions);
    const messageId = result.messageId;

    console.log('[Email Service] Email sent successfully:', messageId);

    // Update email log
    await prisma.emailLog.update({
      where: { id: emailLog.id },
      data: {
        status: EmailStatus.SENT,
        sendGridId: messageId, // Reusing field for message ID
        sentAt: new Date(),
      },
    });

    // Update invoice email status
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        emailStatus: EmailStatus.SENT,
        emailSentAt: new Date(),
      },
    });

    return { success: true, messageId };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Email Service] Failed to send email:', errorMessage);

    // Update email log with error
    await prisma.emailLog.update({
      where: { id: emailLog.id },
      data: {
        status: EmailStatus.FAILED,
        error: errorMessage,
      },
    });

    // Update invoice email status
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        emailStatus: EmailStatus.FAILED,
        emailError: errorMessage,
      },
    });

    return { success: false, error: errorMessage };
  }
}

// Send test email
export async function sendTestEmail(toEmail: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!transporter || !emailConfig) {
    return { success: false, error: 'Email service not configured' };
  }

  try {
    const result = await transporter.sendMail({
      from: {
        name: emailConfig.fromName,
        address: emailConfig.fromEmail,
      },
      to: toEmail,
      subject: 'Test Email - YAHSHUA-ABBA Billing System',
      text: 'This is a test email from the YAHSHUA-ABBA Billing Agent system. If you received this, email delivery is working correctly!',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2 style="color: #1a365d;">Test Email</h2>
          <p>This is a test email from the <strong>YAHSHUA-ABBA Billing Agent</strong> system.</p>
          <p>If you received this, email delivery is working correctly!</p>
          <p style="color: #666; margin-top: 20px;">GOD bless,<br>YAHSHUA-ABBA Billing Team</p>
        </div>
      `,
    });

    console.log('[Email Service] Test email sent:', result.messageId);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Email Service] Test email failed:', errorMessage);
    return { success: false, error: errorMessage };
  }
}

// Retry failed emails
export async function retryFailedEmails(maxRetries: number = 3): Promise<number> {
  const failedEmails = await prisma.emailLog.findMany({
    where: {
      status: EmailStatus.FAILED,
    },
    include: {
      invoice: true,
    },
    take: 10, // Process in batches
  });

  let retried = 0;

  for (const emailLog of failedEmails) {
    console.log(`[Email Service] Retrying email for invoice ${emailLog.invoiceId}`);
    // Implement retry logic here
    retried++;
  }

  return retried;
}
