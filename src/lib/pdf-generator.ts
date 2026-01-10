import { formatCurrency, formatDate } from './utils';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

// PDF generation configuration
interface PdfConfig {
  companyName: string;
  companyAddress: string;
  companyContact: string;
  bankName: string;
  bankAccount: string;
  formReference: string;
  logoPath?: string;
  preparedBy: string;
  reviewedBy: string;
}

// Invoice data for PDF
export interface InvoicePdfData {
  billingNo: string;
  statementDate: Date;
  dueDate: Date;
  customerName: string;
  attention?: string;
  customerAddress?: string;
  lineItems: {
    date: Date;
    reference?: string;
    description: string;
    poNumber?: string;
    serviceFee: number;
    vatAmount: number;
    withholdingTax: number;
    amount: number;
  }[];
  serviceFee: number;
  vatAmount: number;
  grossAmount: number;
  withholdingTax: number;
  netAmount: number;
  remarks?: string;
  vatType: 'VAT' | 'NON_VAT';
  hasWithholding: boolean;
}

// Generate SOA HTML (for PDF conversion)
export function generateSoaHtml(invoice: InvoicePdfData, config: PdfConfig): string {
  const lineItemRows = invoice.lineItems
    .map(
      (item) => `
      <tr>
        <td>${formatDate(item.date)}</td>
        <td>${item.reference || ''}</td>
        <td>${item.description}</td>
        <td>${item.poNumber || ''}</td>
        <td class="amount">${formatCurrency(item.serviceFee)}</td>
        <td class="amount">${formatCurrency(item.vatAmount)}</td>
        <td class="amount">${item.withholdingTax > 0 ? `(${formatCurrency(item.withholdingTax)})` : ''}</td>
        <td class="amount">${formatCurrency(item.amount)}</td>
      </tr>
    `
    )
    .join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: Arial, sans-serif;
      font-size: 10pt;
      margin: 40px;
      color: #333;
    }
    .header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 20px;
    }
    .company-info {
      text-align: left;
    }
    .company-name {
      font-size: 14pt;
      font-weight: bold;
      color: #1a365d;
    }
    .document-title {
      text-align: center;
      font-size: 16pt;
      font-weight: bold;
      margin: 20px 0;
      color: #1a365d;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 10px;
    }
    .info-left, .info-right {
      width: 48%;
    }
    .info-right {
      text-align: right;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
    }
    th, td {
      border: 1px solid #ddd;
      padding: 8px;
      text-align: left;
    }
    th {
      background-color: #1a365d;
      color: white;
      font-weight: bold;
    }
    .amount {
      text-align: right;
    }
    .totals {
      margin-top: 20px;
      display: flex;
      justify-content: space-between;
    }
    .remarks {
      width: 50%;
    }
    .summary {
      width: 45%;
    }
    .summary-row {
      display: flex;
      justify-content: space-between;
      padding: 5px 0;
      border-bottom: 1px solid #eee;
    }
    .summary-row.total {
      font-weight: bold;
      border-top: 2px solid #333;
      border-bottom: none;
      padding-top: 10px;
    }
    .note {
      margin-top: 30px;
      padding: 15px;
      background-color: #f5f5f5;
      border-radius: 4px;
    }
    .signatures {
      display: flex;
      justify-content: space-between;
      margin-top: 40px;
    }
    .signature-box {
      width: 30%;
      text-align: center;
    }
    .signature-line {
      border-top: 1px solid #333;
      margin-top: 50px;
      padding-top: 5px;
    }
    .footer {
      margin-top: 30px;
      text-align: center;
      font-size: 9pt;
      color: #666;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="company-info">
      ${config.logoPath ? `<img src="${config.logoPath}" height="60" />` : ''}
      <div class="company-name">${config.companyName}</div>
      <div>${config.companyAddress}</div>
      <div>Contact #: ${config.companyContact}</div>
    </div>
    <div style="text-align: right;">
      <div>${config.formReference}</div>
    </div>
  </div>

  <div class="document-title">Statement of Account</div>

  <div class="info-row">
    <div class="info-left">
      <strong>Customer:</strong> ${invoice.customerName}<br>
      ${invoice.attention ? `<strong>Attention:</strong> ${invoice.attention}<br>` : ''}
      ${invoice.customerAddress ? `<strong>Address:</strong> ${invoice.customerAddress}` : ''}
    </div>
    <div class="info-right">
      <strong>Billing No.:</strong> ${invoice.billingNo}<br>
      <strong>Statement Date:</strong> ${formatDate(invoice.statementDate)}<br>
      <strong>Due Date:</strong> ${formatDate(invoice.dueDate)}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Reference</th>
        <th>Item Description</th>
        <th>PO No.</th>
        <th>Service Fee</th>
        <th>VAT</th>
        <th>W/Tax</th>
        <th>Amount</th>
      </tr>
    </thead>
    <tbody>
      ${lineItemRows}
    </tbody>
  </table>

  <div class="totals">
    <div class="remarks">
      <strong>REMARKS:</strong><br>
      ${invoice.remarks || 'N/A'}
    </div>
    <div class="summary">
      <div class="summary-row">
        <span>Service Fee:</span>
        <span>${formatCurrency(invoice.serviceFee)}</span>
      </div>
      ${invoice.vatType === 'VAT' ? `
      <div class="summary-row">
        <span>ADD: VAT (12%):</span>
        <span>${formatCurrency(invoice.vatAmount)}</span>
      </div>
      <div class="summary-row">
        <span>Total Service Fee (VAT Inclusive):</span>
        <span>${formatCurrency(invoice.grossAmount)}</span>
      </div>
      ` : ''}
      ${invoice.hasWithholding ? `
      <div class="summary-row">
        <span>LESS: Withholding Tax (2%):</span>
        <span>(${formatCurrency(invoice.withholdingTax)})</span>
      </div>
      ` : ''}
      <div class="summary-row total">
        <span>Total Amount:</span>
        <span>${formatCurrency(invoice.netAmount)}</span>
      </div>
    </div>
  </div>

  <div class="note">
    <strong>Note:</strong><br>
    Please make all payments in check form, payable to <strong>${config.companyName}</strong>
    or fund transfer to ${config.bankName} Account Number: ${config.bankAccount}
  </div>

  <div class="signatures">
    <div class="signature-box">
      <div class="signature-line">
        <strong>${config.preparedBy}</strong><br>
        Prepared by
      </div>
    </div>
    <div class="signature-box">
      <div class="signature-line">
        <strong>${config.reviewedBy}</strong><br>
        Reviewed by
      </div>
    </div>
    <div class="signature-box">
      <div class="signature-line">
        RECEIVED BY: ____________<br>
        SIGNATURE: _____________<br>
        POSITION: ______________<br>
        CONTACT #: _____________<br>
        DATE: __________________
      </div>
    </div>
  </div>

  <div class="footer">
    <strong>**This is a system-generated document and does not require a signature.**</strong>
  </div>
</body>
</html>
  `;
}

// Generate PDF from HTML (placeholder - implement with Puppeteer in production)
export async function generatePdf(invoice: InvoicePdfData, config: PdfConfig): Promise<Buffer> {
  const html = generateSoaHtml(invoice, config);

  // In production, use Puppeteer to convert HTML to PDF
  // For now, return the HTML as a buffer for demonstration
  //
  // const puppeteer = require('puppeteer');
  // const browser = await puppeteer.launch();
  // const page = await browser.newPage();
  // await page.setContent(html);
  // const pdf = await page.pdf({ format: 'A4', printBackground: true });
  // await browser.close();
  // return pdf;

  console.log('[PDF Generator] PDF generation would use Puppeteer in production');
  return Buffer.from(html, 'utf-8');
}

// Get PDF config for a company
export function getPdfConfig(companyCode: 'YOWI' | 'ABBA'): PdfConfig {
  if (companyCode === 'YOWI') {
    return {
      companyName: 'YAHSHUA OUTSOURCING WORLDWIDE, INC.',
      companyAddress: 'Unit #12 2F E-Max Building, Xavier Estates, Masterson Avenue, Upper Balulang, Cagayan De Oro City Misamis Oriental 9000',
      companyContact: '0917-650-4003',
      bankName: 'RCBC',
      bankAccount: '7-590-53889-5',
      formReference: 'YOWI-FRM-03-012',
      logoPath: '/assets/yowi-logo.png',
      preparedBy: 'VANESSA L. DONOSO',
      reviewedBy: 'RUTH MICHELLE C. BAYRON',
    };
  }

  // ABBA
  return {
    companyName: 'THE ABBA INITIATIVE, OPC',
    companyAddress: 'Unit #12 2F E-Max Building Xavier Estates Masterson Avenue, Upper Balulang, Cagayan De Oro City Misamis Oriental 9000',
    companyContact: '0917-106-5249',
    bankName: 'RCBC',
    bankAccount: '7-590-59122-2',
    formReference: 'YOWI-FRM-03-012',
    logoPath: '/assets/abba-logo.png',
    preparedBy: 'VANESSA L. DONOSO',
    reviewedBy: 'RUTH MICHELLE C. BAYRON',
  };
}

// ==================== PDF-LIB Based Generation ====================

export interface SOASettings {
  bankName: string;
  bankAccountName: string;
  bankAccountNo: string;
  footer: string;
  preparedBy: string;
  reviewedBy: string;
}

type BillingFrequency = 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY';

/**
 * Generate invoice PDF using pdf-lib (used by send route and auto-send)
 */
export async function generateInvoicePdfLib(invoice: any, soaSettings: SOASettings): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]); // Letter size
  const { height } = page.getSize();

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const company = invoice.company;
  const isYOWI = company?.code === 'YOWI';

  let y = height - 50;
  const logoSize = 50;
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

  // Header - Company Name
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
  const addressLines = wrapTextForPdf(address, font, 9, 400);
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

  // Invoice details on the right
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

  // Bill To section
  page.drawText('Bill To:', { x: 50, y, size: 10, font, color: rgb(0, 0, 0) });
  y -= 15;
  page.drawText(invoice.customerName, { x: 50, y, size: 12, font: fontBold, color: rgb(0, 0, 0) });

  if (invoice.customerAddress) {
    const maxWidth = 300;
    const customerAddressLines = wrapTextForPdf(invoice.customerAddress, font, 10, maxWidth);
    for (const line of customerAddressLines) {
      y -= 15;
      page.drawText(line, { x: 50, y, size: 10, font, color: rgb(0.3, 0.3, 0.3) });
    }
  }

  y -= 40;

  // Table header background
  page.drawRectangle({
    x: 50,
    y: y - 8,
    width: 512,
    height: 22,
    color: rgb(0.9, 0.9, 0.9),
  });

  // Table headers - vertically centered in the rectangle
  const headerTextY = y - 2;
  page.drawText('Description', { x: 55, y: headerTextY, size: 10, font: fontBold, color: rgb(0, 0, 0) });
  page.drawText('Qty', { x: 320, y: headerTextY, size: 10, font: fontBold, color: rgb(0, 0, 0) });
  page.drawText('Rate', { x: 380, y: headerTextY, size: 10, font: fontBold, color: rgb(0, 0, 0) });
  page.drawText('Amount', { x: 480, y: headerTextY, size: 10, font: fontBold, color: rgb(0, 0, 0) });

  y -= 30;

  // Line items
  if (invoice.lineItems && invoice.lineItems.length > 0) {
    for (const item of invoice.lineItems) {
      const desc = item.description || 'Professional Services';
      page.drawText(desc.substring(0, 45), { x: 55, y, size: 10, font, color: rgb(0, 0, 0) });
      page.drawText(String(item.quantity || 1), { x: 320, y, size: 10, font, color: rgb(0, 0, 0) });
      page.drawText(formatPdfCurrency(Number(item.unitPrice)), { x: 380, y, size: 10, font, color: rgb(0, 0, 0) });
      page.drawText(formatPdfCurrency(Number(item.amount)), { x: 480, y, size: 10, font, color: rgb(0, 0, 0) });
      y -= 18;
    }
  } else {
    const desc = `Professional services for ${invoice.customerName}`;
    page.drawText(desc.substring(0, 45), { x: 55, y, size: 10, font, color: rgb(0, 0, 0) });
    page.drawText('1', { x: 320, y, size: 10, font, color: rgb(0, 0, 0) });
    page.drawText(formatPdfCurrency(Number(invoice.serviceFee)), { x: 380, y, size: 10, font, color: rgb(0, 0, 0) });
    page.drawText(formatPdfCurrency(Number(invoice.serviceFee)), { x: 480, y, size: 10, font, color: rgb(0, 0, 0) });
    y -= 18;
  }

  y -= 20;

  // Totals
  const totalsX = 380;

  page.drawText('Subtotal:', { x: totalsX, y, size: 10, font, color: rgb(0, 0, 0) });
  page.drawText(formatPdfCurrency(Number(invoice.serviceFee)), { x: 480, y, size: 10, font, color: rgb(0, 0, 0) });
  y -= 18;

  page.drawText('VAT (12%):', { x: totalsX, y, size: 10, font, color: rgb(0, 0, 0) });
  page.drawText(formatPdfCurrency(Number(invoice.vatAmount)), { x: 480, y, size: 10, font, color: rgb(0, 0, 0) });
  y -= 18;

  if (Number(invoice.withholdingTax) > 0) {
    page.drawText('Withholding Tax:', { x: totalsX, y, size: 10, font, color: rgb(0, 0, 0) });
    page.drawText(`(${formatPdfCurrency(Number(invoice.withholdingTax))})`, { x: 480, y, size: 10, font, color: rgb(0, 0, 0) });
    y -= 18;
  }

  page.drawText('Total Due:', { x: totalsX, y, size: 11, font: fontBold, color: rgb(0, 0, 0) });
  page.drawText(formatPdfCurrency(Number(invoice.netAmount)), { x: 480, y, size: 11, font: fontBold, color: rgb(0, 0, 0) });

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
    page.drawText(`Monthly Fee: ${formatPdfCurrency(monthlyFee)}`, { x: 55, y, size: 9, font, color: rgb(0.3, 0.3, 0.3) });
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

function formatPdfCurrency(amount: number): string {
  return 'PHP ' + new Intl.NumberFormat('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function wrapTextForPdf(text: string, font: any, fontSize: number, maxWidth: number): string[] {
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
