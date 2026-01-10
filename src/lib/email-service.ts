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

// Email template data
interface EmailTemplateData {
  clientName: string;
  serviceType: string;
  periodDescription: string;
  billingNo: string;
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

// Generate email subject
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
  toEmail: string,
  subject: string,
  body: string,
  htmlBody?: string,
  pdfAttachment?: Buffer,
  pdfFilename?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!transporter || !emailConfig) {
    return { success: false, error: 'Email service not configured' };
  }

  // Log the email attempt
  const emailLog = await prisma.emailLog.create({
    data: {
      invoiceId,
      toEmail,
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
      to: toEmail,
      replyTo: emailConfig.replyTo || emailConfig.fromEmail,
      subject,
      text: body,
      html: htmlBody,
    };

    // Add BCC for tracking
    if (emailConfig.bccEmail) {
      mailOptions.bcc = emailConfig.bccEmail;
    }

    // Add PDF attachment if provided
    if (pdfAttachment && pdfFilename) {
      mailOptions.attachments = [
        {
          filename: pdfFilename,
          content: pdfAttachment,
          contentType: 'application/pdf',
        },
      ];
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
