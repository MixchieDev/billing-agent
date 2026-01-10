import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fs from 'fs';
import path from 'path';
import { getSOASettings } from '@/lib/settings';
import {
  initEmailServiceFromEnv,
  sendBillingEmail,
  generateEmailSubject,
  generateEmailBody,
  generateEmailHtml,
} from '@/lib/email-service';
import { InvoiceStatus } from '@/generated/prisma';
import { notifyInvoiceSent } from '@/lib/notifications';

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
        lineItems: true,
      },
    });

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // Only send approved invoices
    if (invoice.status !== InvoiceStatus.APPROVED) {
      return NextResponse.json(
        { error: 'Invoice must be approved before sending' },
        { status: 400 }
      );
    }

    // Get client email
    const clientEmail = invoice.customerEmail;
    if (!clientEmail) {
      return NextResponse.json(
        { error: 'No email address found for this client. Please update the invoice with a customer email.' },
        { status: 400 }
      );
    }

    // Initialize email service
    initEmailServiceFromEnv();

    // Get SOA settings
    const companyCode = invoice.company?.code === 'YOWI' ? 'YOWI' : 'ABBA';
    const soaSettings = await getSOASettings(companyCode);

    // Generate PDF
    const pdfBytes = await generateInvoicePdf(invoice, soaSettings);
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
          sentTo: clientEmail,
          messageId: result.messageId,
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

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      sentTo: clientEmail,
    });
  } catch (error) {
    console.error('Error sending invoice:', error);
    return NextResponse.json(
      { error: 'Failed to send invoice' },
      { status: 500 }
    );
  }
}

interface SOASettings {
  bankName: string;
  bankAccountName: string;
  bankAccountNo: string;
  footer: string;
  preparedBy: string;
  reviewedBy: string;
}

type BillingFrequency = 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY';

async function generateInvoicePdf(invoice: any, soaSettings: SOASettings): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]); // Letter size
  const { height } = page.getSize();

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const company = invoice.company;
  const isYOWI = company?.code === 'YOWI';

  let y = height - 50;
  const logoSize = 50; // Small logo
  let hasLogo = false;

  // Try to add logo in top-left corner
  try {
    const logoFileName = isYOWI ? 'yowi-logo.png' : 'abba-logo.png';
    const logoPath = path.join(process.cwd(), 'public', 'assets', logoFileName);

    if (fs.existsSync(logoPath)) {
      const logoBytes = fs.readFileSync(logoPath);

      let logoImage;
      if (logoBytes.length > 100) {
        if (logoBytes[0] === 0x89 && logoBytes[1] === 0x50) {
          logoImage = await pdfDoc.embedPng(logoBytes);
        } else if (logoBytes[0] === 0xFF && logoBytes[1] === 0xD8) {
          logoImage = await pdfDoc.embedJpg(logoBytes);
        }
      }

      if (logoImage) {
        const aspectRatio = logoImage.width / logoImage.height;
        const logoWidth = logoSize * aspectRatio;
        const logoHeight = logoSize;

        page.drawImage(logoImage, {
          x: 50,
          y: y - logoHeight + 15,
          width: logoWidth,
          height: logoHeight,
        });
        hasLogo = true;
      }
    }
  } catch (error) {
    console.log('Could not load logo:', error);
  }

  // Header - Company Name (to the right of logo if present)
  const companyName = isYOWI ? 'YAHSHUA OUTSOURCING WORLDWIDE INC.' : 'THE ABBA INITIATIVE, OPC';
  const headerX = hasLogo ? 115 : 50;

  page.drawText(companyName, {
    x: headerX,
    y,
    size: 14,
    font: fontBold,
    color: rgb(0, 0, 0),
  });

  y -= 15;

  // Address
  const address = company?.address || '8F 8 Rockwell, Hidalgo cor. Plaza Drive, Rockwell Center, Makati City';
  const addressLines = wrapText(address, font, 9, 400);
  for (const line of addressLines) {
    page.drawText(line, {
      x: headerX,
      y,
      size: 9,
      font,
      color: rgb(0.3, 0.3, 0.3),
    });
    y -= 12;
  }

  // TIN
  const tin = `TIN: ${company?.tin || (isYOWI ? '010-143-230-000' : '010-143-231-000')}`;
  page.drawText(tin, {
    x: headerX,
    y,
    size: 9,
    font,
    color: rgb(0.3, 0.3, 0.3),
  });

  y -= 12;

  // Contact Number
  if (company?.contactNumber) {
    page.drawText(`Tel: ${company.contactNumber}`, {
      x: headerX,
      y,
      size: 9,
      font,
      color: rgb(0.3, 0.3, 0.3),
    });
    y -= 12;
  }

  y -= 23;

  // Title - centered
  const title = 'STATEMENT OF ACCOUNT';
  const titleWidth = fontBold.widthOfTextAtSize(title, 14);
  page.drawText(title, {
    x: (612 - titleWidth) / 2,
    y,
    size: 14,
    font: fontBold,
    color: rgb(0, 0, 0),
  });

  y -= 35;

  // Invoice details on the right (draw first so we know the starting position)
  const rightX = 400;
  let rightY = y;

  page.drawText(`Invoice No: ${invoice.billingNo || invoice.invoiceNo || 'N/A'}`, {
    x: rightX, y: rightY, size: 10, font, color: rgb(0, 0, 0)
  });
  rightY -= 15;

  page.drawText(`Date: ${new Date(invoice.createdAt).toLocaleDateString('en-PH')}`, {
    x: rightX, y: rightY, size: 10, font, color: rgb(0, 0, 0)
  });
  rightY -= 15;

  page.drawText(`Due Date: ${new Date(invoice.dueDate).toLocaleDateString('en-PH')}`, {
    x: rightX, y: rightY, size: 10, font, color: rgb(0, 0, 0)
  });

  // Bill To section (left side, limited width to avoid overlap)
  page.drawText('Bill To:', { x: 50, y, size: 10, font, color: rgb(0, 0, 0) });
  y -= 15;
  page.drawText(invoice.customerName, { x: 50, y, size: 12, font: fontBold, color: rgb(0, 0, 0) });

  if (invoice.customerAddress) {
    // Wrap long addresses to multiple lines (max 300px width)
    const maxWidth = 300;
    const addressLines = wrapText(invoice.customerAddress, font, 10, maxWidth);
    for (const line of addressLines) {
      y -= 15;
      page.drawText(line, { x: 50, y, size: 10, font, color: rgb(0.3, 0.3, 0.3) });
    }
  }

  y -= 30;

  // Table header background
  page.drawRectangle({
    x: 50,
    y: y - 5,
    width: 512,
    height: 20,
    color: rgb(0.9, 0.9, 0.9),
  });

  // Table headers
  page.drawText('Description', { x: 55, y, size: 10, font: fontBold, color: rgb(0, 0, 0) });
  page.drawText('Qty', { x: 320, y, size: 10, font: fontBold, color: rgb(0, 0, 0) });
  page.drawText('Rate', { x: 380, y, size: 10, font: fontBold, color: rgb(0, 0, 0) });
  page.drawText('Amount', { x: 480, y, size: 10, font: fontBold, color: rgb(0, 0, 0) });

  y -= 25;

  // Line items
  if (invoice.lineItems && invoice.lineItems.length > 0) {
    for (const item of invoice.lineItems) {
      const desc = item.description || 'Professional Services';
      page.drawText(desc.substring(0, 45), { x: 55, y, size: 10, font, color: rgb(0, 0, 0) });
      page.drawText(String(item.quantity || 1), { x: 320, y, size: 10, font, color: rgb(0, 0, 0) });
      page.drawText(formatCurrency(Number(item.unitPrice)), { x: 380, y, size: 10, font, color: rgb(0, 0, 0) });
      page.drawText(formatCurrency(Number(item.amount)), { x: 480, y, size: 10, font, color: rgb(0, 0, 0) });
      y -= 18;
    }
  } else {
    // Default line item
    const desc = `Professional services for ${invoice.customerName}`;
    page.drawText(desc.substring(0, 45), { x: 55, y, size: 10, font, color: rgb(0, 0, 0) });
    page.drawText('1', { x: 320, y, size: 10, font, color: rgb(0, 0, 0) });
    page.drawText(formatCurrency(Number(invoice.serviceFee)), { x: 380, y, size: 10, font, color: rgb(0, 0, 0) });
    page.drawText(formatCurrency(Number(invoice.serviceFee)), { x: 480, y, size: 10, font, color: rgb(0, 0, 0) });
    y -= 18;
  }

  y -= 20;

  // Totals
  const totalsX = 380;

  page.drawText('Subtotal:', { x: totalsX, y, size: 10, font, color: rgb(0, 0, 0) });
  page.drawText(formatCurrency(Number(invoice.serviceFee)), { x: 480, y, size: 10, font, color: rgb(0, 0, 0) });
  y -= 18;

  page.drawText('VAT (12%):', { x: totalsX, y, size: 10, font, color: rgb(0, 0, 0) });
  page.drawText(formatCurrency(Number(invoice.vatAmount)), { x: 480, y, size: 10, font, color: rgb(0, 0, 0) });
  y -= 18;

  if (Number(invoice.withholdingTax) > 0) {
    page.drawText('Withholding Tax:', { x: totalsX, y, size: 10, font, color: rgb(0, 0, 0) });
    page.drawText(`(${formatCurrency(Number(invoice.withholdingTax))})`, { x: 480, y, size: 10, font, color: rgb(0, 0, 0) });
    y -= 18;
  }

  page.drawText('Total Due:', { x: totalsX, y, size: 11, font: fontBold, color: rgb(0, 0, 0) });
  page.drawText(formatCurrency(Number(invoice.netAmount)), { x: 480, y, size: 11, font: fontBold, color: rgb(0, 0, 0) });

  y -= 25;

  // Billing frequency breakdown (for quarterly/annual)
  const billingFrequency = invoice.billingFrequency as BillingFrequency;
  if (billingFrequency && billingFrequency !== 'MONTHLY') {
    const monthlyFee = invoice.monthlyFee
      ? Number(invoice.monthlyFee)
      : billingFrequency === 'QUARTERLY'
        ? Number(invoice.serviceFee) / 3
        : Number(invoice.serviceFee) / 12;

    const months = billingFrequency === 'QUARTERLY' ? 3 : 12;
    const frequencyLabel = billingFrequency === 'QUARTERLY' ? 'Quarterly' : 'Annual';

    // Draw a light blue background for the breakdown section
    page.drawRectangle({
      x: 50,
      y: y - 45,
      width: 250,
      height: 40,
      color: rgb(0.95, 0.97, 1),
    });

    y -= 15;
    page.drawText(`${frequencyLabel} Billing Breakdown:`, { x: 55, y, size: 9, font: fontBold, color: rgb(0.2, 0.2, 0.6) });
    y -= 14;
    page.drawText(`Monthly Fee: ${formatCurrency(monthlyFee)}`, { x: 55, y, size: 9, font, color: rgb(0.3, 0.3, 0.3) });
    y -= 12;
    page.drawText(`Coverage: ${months} months`, { x: 55, y, size: 9, font, color: rgb(0.3, 0.3, 0.3) });

    y -= 20;
  } else {
    y -= 25;
  }

  // Payment Details
  page.drawText('Payment Details', { x: 50, y, size: 11, font: fontBold, color: rgb(0, 0, 0) });
  y -= 18;

  const bankDetails = [
    `Bank: ${soaSettings.bankName}`,
    `Account Name: ${soaSettings.bankAccountName}`,
  ];
  if (soaSettings.bankAccountNo) {
    bankDetails.push(`Account Number: ${soaSettings.bankAccountNo}`);
  }

  for (const line of bankDetails) {
    page.drawText(line, { x: 50, y, size: 10, font, color: rgb(0.3, 0.3, 0.3) });
    y -= 15;
  }

  // Footer
  const footer = soaSettings.footer;
  const footerWidth = font.widthOfTextAtSize(footer, 8);
  page.drawText(footer, {
    x: (612 - footerWidth) / 2,
    y: 30,
    size: 8,
    font,
    color: rgb(0.5, 0.5, 0.5),
  });

  return pdfDoc.save();
}

function formatCurrency(amount: number): string {
  // Use "PHP" prefix instead of peso symbol (₱) for PDF compatibility
  return 'PHP ' + new Intl.NumberFormat('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function wrapText(text: string, font: any, fontSize: number, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const width = font.widthOfTextAtSize(testLine, fontSize);

    if (width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}
