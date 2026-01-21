import { formatCurrency, formatDate } from './utils';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fs from 'fs';
import path from 'path';
import { getVatRate } from './settings';

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
  withholdingRate?: number;  // Rate as decimal (e.g., 0.02 = 2%)
  vatRate?: number;  // VAT rate as decimal (e.g., 0.12 = 12%)
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
        <span>ADD: VAT (${((invoice.vatRate ?? 0.12) * 100).toFixed(0)}%):</span>
        <span>${formatCurrency(invoice.vatAmount)}</span>
      </div>
      <div class="summary-row">
        <span>Total Service Fee (VAT Inclusive):</span>
        <span>${formatCurrency(invoice.grossAmount)}</span>
      </div>
      ` : ''}
      ${invoice.hasWithholding ? `
      <div class="summary-row">
        <span>LESS: Withholding Tax (${((invoice.withholdingRate ?? 0.02) * 100).toFixed(0)}%):</span>
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

export interface TemplateConfig {
  primaryColor: string;    // Hex color for accent (logo text, headers)
  secondaryColor: string;  // Secondary accent
  footerBgColor: string;   // Footer bar background
  logoPath?: string;
  invoiceTitle: string;    // e.g., "Invoice" or "Statement of Account"
  footerText: string;      // e.g., "Powered by: YAHSHUA"
  showDisclaimer: boolean;
  notes?: string;          // Optional notes displayed on invoice
}

// Convert hex color to RGB values (0-1 range for pdf-lib)
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) {
    return { r: 0, g: 0, b: 0 }; // Default to black
  }
  return {
    r: parseInt(result[1], 16) / 255,
    g: parseInt(result[2], 16) / 255,
    b: parseInt(result[3], 16) / 255,
  };
}

type BillingFrequency = 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY';

// Default template config
const defaultTemplate: TemplateConfig = {
  primaryColor: '#2563eb',
  secondaryColor: '#1e40af',
  footerBgColor: '#dbeafe',
  invoiceTitle: 'Invoice',
  footerText: 'Powered by: YAHSHUA',
  showDisclaimer: true,
};

/**
 * Generate invoice PDF using pdf-lib with customizable template
 * Supports multi-page for invoices with many line items
 */
export async function generateInvoicePdfLib(
  invoice: any,
  soaSettings: SOASettings,
  template?: TemplateConfig
): Promise<Uint8Array> {
  // Fetch VAT rate from settings
  const vatRate = await getVatRate();

  // Use provided template or default
  const tmpl = template || defaultTemplate;

  // Debug logging to verify template is being applied
  console.log('[PDF-Generator] Template received:', template ? 'YES' : 'NO (using default)');
  console.log('[PDF-Generator] Using colors:', {
    primary: tmpl.primaryColor,
    secondary: tmpl.secondaryColor,
    footerBg: tmpl.footerBgColor,
    title: tmpl.invoiceTitle,
  });

  const primaryRgb = hexToRgb(tmpl.primaryColor);
  const secondaryRgb = hexToRgb(tmpl.secondaryColor);
  const footerBgRgb = hexToRgb(tmpl.footerBgColor);

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const company = invoice.company;
  const isYOWI = company?.code === 'YOWI';
  const companyName = company?.name || (isYOWI ? 'YAHSHUA OUTSOURCING WORLDWIDE INC.' : 'THE ABBA INITIATIVE, OPC');

  // Page dimensions
  const PAGE_WIDTH = 612;
  const PAGE_HEIGHT = 792;
  const MARGIN_LEFT = 50;
  const MARGIN_RIGHT = 50;
  const MARGIN_TOP = 50;
  const MARGIN_BOTTOM = 80;
  const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;
  const LINE_ITEM_HEIGHT = 20;
  const TABLE_HEADER_HEIGHT = 25;

  // Table column positions (improved alignment)
  const COL_ITEM = MARGIN_LEFT;
  const COL_ITEM_WIDTH = 25;
  const COL_DESC = MARGIN_LEFT + 28;
  const COL_DESC_WIDTH = 175;  // Max width for description text
  const COL_QTY = 210;
  const COL_QTY_WIDTH = 30;
  const COL_PRICE = 245;
  const COL_PRICE_WIDTH = 65;
  const COL_TAX = 315;
  const COL_TAX_WIDTH = 35;
  const COL_WTAX = 355;
  const COL_WTAX_WIDTH = 55;
  const COL_AMOUNT = 415;
  const COL_AMOUNT_WIDTH = 90;

  // Check if invoice has withholding tax
  const invoiceHasWithholding = Number(invoice.withholdingTax) > 0;

  // Load logo once
  let logoImage: any = null;
  const logoSize = 55;
  try {
    const logoFileName = tmpl.logoPath
      ? path.basename(tmpl.logoPath)
      : (isYOWI ? 'yowi-logo.png' : 'abba-logo.png');
    const logoPath = path.join(process.cwd(), 'public', 'assets', logoFileName);

    if (fs.existsSync(logoPath)) {
      const logoBytes = fs.readFileSync(logoPath);
      if (logoBytes.length > 100) {
        if (logoBytes[0] === 0x89 && logoBytes[1] === 0x50) {
          logoImage = await pdfDoc.embedPng(logoBytes);
        } else if (logoBytes[0] === 0xFF && logoBytes[1] === 0xD8) {
          logoImage = await pdfDoc.embedJpg(logoBytes);
        }
      }
    }
  } catch (error) {
    console.log('Could not load logo:', error);
  }

  // Helper function to draw NEW page header (Logo left, Company info right)
  const drawPageHeader = (page: any, pageNum: number, totalPages: number): number => {
    let y = PAGE_HEIGHT - MARGIN_TOP;

    // === LEFT SIDE: Logo + Invoice Title ===
    if (logoImage) {
      const aspectRatio = logoImage.width / logoImage.height;
      const logoWidth = logoSize * aspectRatio;
      const logoHeight = logoSize;
      page.drawImage(logoImage, {
        x: MARGIN_LEFT,
        y: y - logoHeight + 10,
        width: logoWidth,
        height: logoHeight,
      });
    }

    // Invoice title with accent color (below or beside logo)
    const titleY = y - logoSize - 10;
    page.drawText(tmpl.invoiceTitle.toUpperCase(), {
      x: MARGIN_LEFT,
      y: titleY,
      size: 18,
      font: fontBold,
      color: rgb(primaryRgb.r, primaryRgb.g, primaryRgb.b),
    });

    // === RIGHT SIDE: Company info ===
    const rightX = PAGE_WIDTH - MARGIN_RIGHT;
    let rightY = y;

    // Company name (right aligned)
    const companyNameWidth = fontBold.widthOfTextAtSize(companyName, 11);
    page.drawText(companyName, {
      x: rightX - companyNameWidth,
      y: rightY,
      size: 11,
      font: fontBold,
      color: rgb(0, 0, 0),
    });
    rightY -= 14;

    // Address (right aligned, wrapped)
    const address = company?.address || '';
    if (address) {
      const addressLines = wrapTextForPdf(address, font, 9, 250);
      for (const line of addressLines) {
        const lineWidth = font.widthOfTextAtSize(line, 9);
        page.drawText(line, {
          x: rightX - lineWidth,
          y: rightY,
          size: 9,
          font,
          color: rgb(0.3, 0.3, 0.3),
        });
        rightY -= 12;
      }
    }

    // TIN
    const tin = company?.tin || (isYOWI ? '010-143-230-000' : '010-143-231-000');
    const tinText = `TIN: ${tin}`;
    const tinWidth = font.widthOfTextAtSize(tinText, 9);
    page.drawText(tinText, {
      x: rightX - tinWidth,
      y: rightY,
      size: 9,
      font,
      color: rgb(0.3, 0.3, 0.3),
    });
    rightY -= 12;

    // Contact
    if (company?.contactNumber) {
      const contactText = `Tel: ${company.contactNumber}`;
      const contactWidth = font.widthOfTextAtSize(contactText, 9);
      page.drawText(contactText, {
        x: rightX - contactWidth,
        y: rightY,
        size: 9,
        font,
        color: rgb(0.3, 0.3, 0.3),
      });
    }

    // Page number if multiple pages
    if (totalPages > 1) {
      const pageText = `Page ${pageNum} of ${totalPages}`;
      const pageTextWidth = font.widthOfTextAtSize(pageText, 9);
      page.drawText(pageText, {
        x: rightX - pageTextWidth,
        y: PAGE_HEIGHT - 30,
        size: 9,
        font,
        color: rgb(0.5, 0.5, 0.5),
      });
    }

    // Separator line
    const separatorY = titleY - 15;
    page.drawLine({
      start: { x: MARGIN_LEFT, y: separatorY },
      end: { x: PAGE_WIDTH - MARGIN_RIGHT, y: separatorY },
      thickness: 1,
      color: rgb(0.85, 0.85, 0.85),
    });

    return separatorY - 20;
  };

  // Helper function to draw table header with new columns
  const drawTableHeader = (page: any, y: number): number => {
    // Header background with accent color
    page.drawRectangle({
      x: MARGIN_LEFT,
      y: y - 5,
      width: CONTENT_WIDTH,
      height: TABLE_HEADER_HEIGHT,
      color: rgb(secondaryRgb.r, secondaryRgb.g, secondaryRgb.b),
    });

    const headerY = y + 5;
    const headerColor = rgb(1, 1, 1); // White text on colored background

    // # column (centered)
    page.drawText('#', { x: COL_ITEM + 10, y: headerY, size: 8, font: fontBold, color: headerColor });
    // DESCRIPTION (left aligned)
    page.drawText('DESCRIPTION', { x: COL_DESC, y: headerY, size: 8, font: fontBold, color: headerColor });
    // QTY (right aligned in column)
    const qtyHeaderWidth = fontBold.widthOfTextAtSize('QTY', 8);
    page.drawText('QTY', { x: COL_QTY + COL_QTY_WIDTH - qtyHeaderWidth - 3, y: headerY, size: 8, font: fontBold, color: headerColor });
    // PRICE (right aligned)
    const priceHeaderWidth = fontBold.widthOfTextAtSize('PRICE', 8);
    page.drawText('PRICE', { x: COL_PRICE + COL_PRICE_WIDTH - priceHeaderWidth - 3, y: headerY, size: 8, font: fontBold, color: headerColor });
    // TAX (centered)
    const taxHeaderWidth = fontBold.widthOfTextAtSize('TAX', 8);
    page.drawText('TAX', { x: COL_TAX + (COL_TAX_WIDTH - taxHeaderWidth) / 2, y: headerY, size: 8, font: fontBold, color: headerColor });
    // W/TAX - Withholding Tax (right aligned) - only show if invoice has withholding
    if (invoiceHasWithholding) {
      const wtaxHeaderWidth = fontBold.widthOfTextAtSize('W/TAX', 8);
      page.drawText('W/TAX', { x: COL_WTAX + COL_WTAX_WIDTH - wtaxHeaderWidth - 3, y: headerY, size: 8, font: fontBold, color: headerColor });
    }
    // AMOUNT (right aligned)
    const amountHeaderWidth = fontBold.widthOfTextAtSize('AMOUNT', 8);
    page.drawText('AMOUNT', { x: COL_AMOUNT + COL_AMOUNT_WIDTH - amountHeaderWidth - 3, y: headerY, size: 8, font: fontBold, color: headerColor });

    return y - TABLE_HEADER_HEIGHT - 5;
  };

  // Helper to draw colored footer bar
  const drawFooter = (page: any) => {
    const footerHeight = 55;
    const footerY = 15;

    // Colored footer bar with slight gradient effect (darker at top)
    page.drawRectangle({
      x: MARGIN_LEFT,
      y: footerY,
      width: CONTENT_WIDTH,
      height: footerHeight,
      color: rgb(footerBgRgb.r, footerBgRgb.g, footerBgRgb.b),
    });

    // Top accent line
    page.drawLine({
      start: { x: MARGIN_LEFT, y: footerY + footerHeight },
      end: { x: PAGE_WIDTH - MARGIN_RIGHT, y: footerY + footerHeight },
      thickness: 2,
      color: rgb(secondaryRgb.r, secondaryRgb.g, secondaryRgb.b),
    });

    // Footer text (centered)
    const footerTextY = footerY + footerHeight - 20;
    const footerTextWidth = fontBold.widthOfTextAtSize(tmpl.footerText, 11);
    page.drawText(tmpl.footerText, {
      x: (PAGE_WIDTH - footerTextWidth) / 2,
      y: footerTextY,
      size: 11,
      font: fontBold,
      color: rgb(secondaryRgb.r, secondaryRgb.g, secondaryRgb.b),
    });

    // Disclaimer (if enabled)
    if (tmpl.showDisclaimer) {
      const disclaimer = '**This is a system-generated document and does not require a signature.**';
      const disclaimerWidth = font.widthOfTextAtSize(disclaimer, 8);
      page.drawText(disclaimer, {
        x: (PAGE_WIDTH - disclaimerWidth) / 2,
        y: footerY + 14,
        size: 8,
        font,
        color: rgb(0.45, 0.45, 0.45),
      });
    }
  };

  // Calculate how many pages we need
  const lineItems = invoice.lineItems || [];
  const hasLineItems = lineItems.length > 0;
  const itemCount = hasLineItems ? lineItems.length : 1;

  // Calculate remarks height if present (needed for page planning)
  let estimatedRemarksHeight = 0;
  if (invoice.remarks) {
    // Estimate lines needed (roughly 50 chars per line at font size 9)
    const estimatedLines = Math.ceil(invoice.remarks.length / 45) + 1;
    estimatedRemarksHeight = 25 + (estimatedLines * 12) + 20; // Title + lines + padding + gap
  }

  // Space needed for totals, payment details, remarks, and signatures section
  const BASE_TOTALS_SECTION_HEIGHT = 180;
  const SIGNATURES_HEIGHT = 60;
  const TOTALS_SECTION_HEIGHT = BASE_TOTALS_SECTION_HEIGHT + estimatedRemarksHeight + SIGNATURES_HEIGHT;
  const BILL_TO_HEIGHT = 90;

  // Calculate available space
  const firstPageHeaderHeight = 140;
  const continuationHeaderHeight = 100;
  const firstPageAvailableHeight = PAGE_HEIGHT - MARGIN_TOP - firstPageHeaderHeight - BILL_TO_HEIGHT - MARGIN_BOTTOM - TABLE_HEADER_HEIGHT;
  const continuationAvailableHeight = PAGE_HEIGHT - MARGIN_TOP - continuationHeaderHeight - MARGIN_BOTTOM - TABLE_HEADER_HEIGHT;

  const itemsOnFirstPageWithTotals = Math.max(0, Math.floor((firstPageAvailableHeight - TOTALS_SECTION_HEIGHT) / LINE_ITEM_HEIGHT));
  const itemsOnFirstPage = Math.max(1, Math.floor(firstPageAvailableHeight / LINE_ITEM_HEIGHT));
  const itemsOnContinuationPage = Math.max(1, Math.floor(continuationAvailableHeight / LINE_ITEM_HEIGHT));
  const itemsOnContinuationWithTotals = Math.max(0, Math.floor((continuationAvailableHeight - TOTALS_SECTION_HEIGHT) / LINE_ITEM_HEIGHT));

  // Determine total pages needed and whether totals need a separate page
  let totalPages = 1;
  let totalsOnSeparatePage = false;

  if (itemCount <= itemsOnFirstPageWithTotals) {
    // Everything fits on one page
    totalPages = 1;
  } else if (itemCount <= itemsOnFirstPage) {
    // Items fit on first page but totals section doesn't - add separate page for totals
    totalPages = 2;
    totalsOnSeparatePage = true;
  } else {
    // Multiple pages needed for items
    let remainingItems = itemCount - itemsOnFirstPage;
    totalPages = 1;

    while (remainingItems > 0) {
      totalPages++;
      // Check if this could be the last page with items + totals
      if (remainingItems <= itemsOnContinuationWithTotals) {
        // Items + totals fit on this page
        remainingItems = 0;
      } else if (remainingItems <= itemsOnContinuationPage) {
        // Items fit but totals don't - need separate page for totals
        totalPages++;
        totalsOnSeparatePage = true;
        remainingItems = 0;
      } else {
        // Need more pages for items
        remainingItems -= itemsOnContinuationPage;
      }
    }
  }

  let currentItemIndex = 0;

  // Generate each page
  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    let y = drawPageHeader(page, pageNum, totalPages);

    // First page: Bill To section and invoice details
    if (pageNum === 1) {
      // === BILL TO (left) and INVOICE DETAILS (right) ===
      const billToY = y;

      // Bill To label
      page.drawText('BILL TO:', {
        x: MARGIN_LEFT,
        y: billToY,
        size: 10,
        font: fontBold,
        color: rgb(0.4, 0.4, 0.4),
      });
      y -= 18;

      // Customer name (wrap if too long to avoid overlapping invoice box)
      const maxCustomerNameWidth = 240; // Leave space for wider invoice box
      const customerNameLines = wrapTextForPdf(invoice.customerName, fontBold, 12, maxCustomerNameWidth);
      for (let i = 0; i < customerNameLines.length; i++) {
        page.drawText(customerNameLines[i], {
          x: MARGIN_LEFT,
          y,
          size: 12,
          font: fontBold,
          color: rgb(0, 0, 0),
        });
        if (i < customerNameLines.length - 1) y -= 15;
      }

      // Customer address
      if (invoice.customerAddress) {
        const customerAddressLines = wrapTextForPdf(invoice.customerAddress, font, 10, maxCustomerNameWidth);
        for (const line of customerAddressLines) {
          y -= 14;
          page.drawText(line, {
            x: MARGIN_LEFT,
            y,
            size: 10,
            font,
            color: rgb(0.3, 0.3, 0.3),
          });
        }
      }

      // Customer TIN if available
      if (invoice.customerTin) {
        y -= 14;
        page.drawText(`TIN: ${invoice.customerTin}`, {
          x: MARGIN_LEFT,
          y,
          size: 10,
          font,
          color: rgb(0.3, 0.3, 0.3),
        });
      }

      // === INVOICE DETAILS (right side) ===
      const rightX = PAGE_WIDTH - MARGIN_RIGHT;
      let rightY = billToY;
      const boxWidth = 200; // Wider box for 10-digit invoice numbers
      const boxHeight = 70;
      const boxX = rightX - boxWidth;

      // Invoice number box with subtle background
      page.drawRectangle({
        x: boxX,
        y: rightY - boxHeight + 15,
        width: boxWidth,
        height: boxHeight,
        color: rgb(0.98, 0.98, 0.98),
        borderColor: rgb(0.9, 0.9, 0.9),
        borderWidth: 1,
      });

      const invoiceNo = invoice.billingNo || invoice.invoiceNo || 'N/A';
      const invoiceNoLabel = 'INVOICE #';
      const invoiceNoLabelWidth = font.widthOfTextAtSize(invoiceNoLabel, 9);
      page.drawText(invoiceNoLabel, {
        x: boxX + (boxWidth - invoiceNoLabelWidth) / 2,
        y: rightY,
        size: 9,
        font,
        color: rgb(0.5, 0.5, 0.5),
      });

      // Dynamic font size for invoice number to fit in box
      let invoiceNoFontSize = 16;
      let invoiceNoWidth = fontBold.widthOfTextAtSize(invoiceNo, invoiceNoFontSize);
      // Reduce font size if too wide for box (with 20px padding)
      while (invoiceNoWidth > boxWidth - 20 && invoiceNoFontSize > 10) {
        invoiceNoFontSize -= 1;
        invoiceNoWidth = fontBold.widthOfTextAtSize(invoiceNo, invoiceNoFontSize);
      }
      page.drawText(invoiceNo, {
        x: boxX + (boxWidth - invoiceNoWidth) / 2,
        y: rightY - 18,
        size: invoiceNoFontSize,
        font: fontBold,
        color: rgb(0, 0, 0),
      });

      // Date and Due Date (better aligned)
      const dateStr = new Date(invoice.statementDate || invoice.createdAt).toLocaleDateString('en-PH', { month: '2-digit', day: '2-digit', year: 'numeric' });
      const dueDateStr = new Date(invoice.dueDate).toLocaleDateString('en-PH', { month: '2-digit', day: '2-digit', year: 'numeric' });

      const dateLabel = `DATE: ${dateStr}`;
      const dateLabelWidth = font.widthOfTextAtSize(dateLabel, 9);
      page.drawText(dateLabel, {
        x: boxX + (boxWidth - dateLabelWidth) / 2,
        y: rightY - 38,
        size: 9,
        font,
        color: rgb(0.3, 0.3, 0.3),
      });

      const dueDateLabel = `DUE DATE: ${dueDateStr}`;
      const dueDateLabelWidth = font.widthOfTextAtSize(dueDateLabel, 9);
      page.drawText(dueDateLabel, {
        x: boxX + (boxWidth - dueDateLabelWidth) / 2,
        y: rightY - 52,
        size: 9,
        font,
        color: rgb(0.3, 0.3, 0.3),
      });

      y -= 50; // Space after bill to section
    }

    // Determine if this page has line items or is a totals-only page
    const isLastPage = pageNum === totalPages;
    const isTotalsOnlyPage = totalsOnSeparatePage && isLastPage;

    // Only draw table header and items if not a totals-only page
    if (!isTotalsOnlyPage) {
      // Draw table header
      y = drawTableHeader(page, y);
    }

    // Calculate items for this page
    let itemsThisPage: number;

    if (isTotalsOnlyPage) {
      // Totals-only page has no line items
      itemsThisPage = 0;
    } else if (totalPages === 1) {
      itemsThisPage = itemCount;
    } else if (pageNum === 1) {
      itemsThisPage = Math.min(itemsOnFirstPage, itemCount - currentItemIndex);
    } else if (isLastPage) {
      itemsThisPage = itemCount - currentItemIndex;
    } else if (totalsOnSeparatePage && pageNum === totalPages - 1) {
      // Second-to-last page when totals are separate - draw remaining items
      itemsThisPage = itemCount - currentItemIndex;
    } else {
      itemsThisPage = Math.min(itemsOnContinuationPage, itemCount - currentItemIndex);
    }

    // Helper to draw right-aligned text
    const drawRightAligned = (text: string, x: number, width: number, yPos: number, fontSize: number = 9) => {
      const textWidth = font.widthOfTextAtSize(text, fontSize);
      page.drawText(text, { x: x + width - textWidth - 5, y: yPos, size: fontSize, font, color: rgb(0.1, 0.1, 0.1) });
    };

    // Helper to draw centered text
    const drawCentered = (text: string, x: number, width: number, yPos: number, fontSize: number = 9) => {
      const textWidth = font.widthOfTextAtSize(text, fontSize);
      page.drawText(text, { x: x + (width - textWidth) / 2, y: yPos, size: fontSize, font, color: rgb(0.1, 0.1, 0.1) });
    };

    // Helper to wrap description text to multiple lines
    const wrapDescText = (text: string, maxWidth: number, fontSize: number = 9): string[] => {
      const words = text.split(' ');
      const lines: string[] = [];
      let currentLine = '';

      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        if (font.widthOfTextAtSize(testLine, fontSize) <= maxWidth) {
          currentLine = testLine;
        } else {
          if (currentLine) lines.push(currentLine);
          currentLine = word;
        }
      }
      if (currentLine) lines.push(currentLine);

      return lines.length > 0 ? lines : [text];
    };

    // Calculate line item height based on description length
    const getLineItemHeight = (desc: string, maxWidth: number): number => {
      const lines = wrapDescText(desc, maxWidth);
      const baseHeight = 20;
      const lineHeight = 11;
      return Math.max(baseHeight, 8 + (lines.length * lineHeight));
    };

    // Draw line items with new columns (skip if totals-only page)
    if (!isTotalsOnlyPage) {
      if (hasLineItems) {
        for (let i = 0; i < itemsThisPage && currentItemIndex < lineItems.length; i++) {
          const item = lineItems[currentItemIndex];
          const itemNum = currentItemIndex + 1;
          const desc = item.description || 'Professional Services';
          const qty = item.quantity || 1;
          const price = Number(item.unitPrice);
          const vatRateDisplay = invoice.vatType === 'VAT' ? `${(vatRate * 100).toFixed(0)}%` : '0%';
          const amount = Number(item.amount);

          // Wrap description text and calculate dynamic height
          const descLines = wrapDescText(desc, COL_DESC_WIDTH);
          const itemHeight = getLineItemHeight(desc, COL_DESC_WIDTH);

          // Alternate row background
          if (i % 2 === 1) {
            page.drawRectangle({
              x: MARGIN_LEFT,
              y: y - itemHeight + 15,
              width: CONTENT_WIDTH,
              height: itemHeight,
              color: rgb(0.97, 0.97, 0.97),
            });
          }

          // # (centered in column)
          drawCentered(String(itemNum), COL_ITEM, COL_ITEM_WIDTH, y, 8);
          // Description (left aligned, wrapped to multiple lines)
          let descY = y;
          for (const line of descLines) {
            page.drawText(line, { x: COL_DESC, y: descY, size: 8, font, color: rgb(0.1, 0.1, 0.1) });
            descY -= 11;
          }
          // QTY (right aligned)
          drawRightAligned(String(qty), COL_QTY, COL_QTY_WIDTH, y, 8);
          // PRICE (right aligned)
          drawRightAligned(formatPdfCurrency(price), COL_PRICE, COL_PRICE_WIDTH, y, 8);
          // TAX (centered)
          drawCentered(vatRateDisplay, COL_TAX, COL_TAX_WIDTH, y, 8);
          // W/TAX - Withholding Tax (right aligned, shown as negative)
          if (invoiceHasWithholding) {
            const itemWtax = Number(item.withholdingTax || 0);
            if (itemWtax > 0) {
              const wtaxText = `(${formatPdfCurrency(itemWtax)})`;
              const wtaxWidth = font.widthOfTextAtSize(wtaxText, 8);
              page.drawText(wtaxText, { x: COL_WTAX + COL_WTAX_WIDTH - wtaxWidth - 3, y, size: 8, font, color: rgb(0.6, 0.15, 0.15) });
            } else {
              drawRightAligned('-', COL_WTAX, COL_WTAX_WIDTH, y, 8);
            }
          }
          // AMOUNT (right aligned)
          drawRightAligned(formatPdfCurrency(amount), COL_AMOUNT, COL_AMOUNT_WIDTH, y, 8);

          y -= itemHeight;
          currentItemIndex++;
        }
      } else {
        // Single line item for invoices without detailed items
        const desc = invoice.lineItems?.[0]?.description || `Professional services for ${invoice.customerName}`;
        const descLines = wrapDescText(desc, COL_DESC_WIDTH);
        const itemHeight = getLineItemHeight(desc, COL_DESC_WIDTH);

        drawCentered('1', COL_ITEM, COL_ITEM_WIDTH, y, 8);
        // Description (wrapped to multiple lines)
        let descY = y;
        for (const line of descLines) {
          page.drawText(line, { x: COL_DESC, y: descY, size: 8, font, color: rgb(0.1, 0.1, 0.1) });
          descY -= 11;
        }
        drawRightAligned('1', COL_QTY, COL_QTY_WIDTH, y, 8);
        drawRightAligned(formatPdfCurrency(Number(invoice.serviceFee)), COL_PRICE, COL_PRICE_WIDTH, y, 8);
        drawCentered(invoice.vatType === 'VAT' ? `${(vatRate * 100).toFixed(0)}%` : '0%', COL_TAX, COL_TAX_WIDTH, y, 8);
        // W/TAX - Withholding Tax for single line item
        if (invoiceHasWithholding) {
          const singleWtax = Number(invoice.withholdingTax || 0);
          if (singleWtax > 0) {
            const wtaxText = `(${formatPdfCurrency(singleWtax)})`;
            const wtaxWidth = font.widthOfTextAtSize(wtaxText, 8);
            page.drawText(wtaxText, { x: COL_WTAX + COL_WTAX_WIDTH - wtaxWidth - 3, y, size: 8, font, color: rgb(0.6, 0.15, 0.15) });
          } else {
            drawRightAligned('-', COL_WTAX, COL_WTAX_WIDTH, y, 8);
          }
        }
        drawRightAligned(formatPdfCurrency(Number(invoice.grossAmount || invoice.serviceFee)), COL_AMOUNT, COL_AMOUNT_WIDTH, y, 8);
        y -= itemHeight;
      }
    }

    // Draw totals and payment details on last page (or totals-only page)
    if (isLastPage) {
      // For totals-only page, position content at a nice spot below header
      if (isTotalsOnlyPage) {
        y = PAGE_HEIGHT - MARGIN_TOP - 120; // Start below the header
      } else {
        y -= 30;
      }

      // === PAYMENT DETAILS (left) ===
      const paymentY = y;
      const paymentBoxWidth = 250;
      const paymentBoxPadding = 10;
      const paymentTextMaxWidth = paymentBoxWidth - paymentBoxPadding * 2;

      // Calculate box height based on content
      let paymentBoxHeight = 20; // Title
      paymentBoxHeight += 14; // Bank
      const accountNameLines = wrapTextForPdf(soaSettings.bankAccountName, font, 8, paymentTextMaxWidth - 70);
      paymentBoxHeight += accountNameLines.length * 11 + 3; // Account name lines
      if (soaSettings.bankAccountNo) paymentBoxHeight += 14; // Account number

      // Calculate notes height if provided
      let notesLines: string[] = [];
      if (template?.notes) {
        // First split by newlines, then wrap each line
        const rawLines = template.notes.split('\n');
        for (const rawLine of rawLines) {
          if (rawLine.trim()) {
            const wrappedLines = wrapTextForPdf(rawLine, font, 9, paymentTextMaxWidth - 5);
            notesLines.push(...wrappedLines);
          } else {
            notesLines.push(''); // Preserve empty lines
          }
        }
        paymentBoxHeight += 10 + notesLines.length * 12; // Notes section
      }

      paymentBoxHeight += 10; // Padding

      // Payment details box
      page.drawRectangle({
        x: MARGIN_LEFT,
        y: paymentY - paymentBoxHeight + 15,
        width: paymentBoxWidth,
        height: paymentBoxHeight,
        color: rgb(0.98, 0.98, 0.98),
        borderColor: rgb(0.92, 0.92, 0.92),
        borderWidth: 1,
      });

      page.drawText('Payment Details', {
        x: MARGIN_LEFT + paymentBoxPadding,
        y: paymentY,
        size: 11,
        font: fontBold,
        color: rgb(0.2, 0.2, 0.2),
      });

      let payY = paymentY - 18;
      page.drawText(`Bank: ${soaSettings.bankName}`, {
        x: MARGIN_LEFT + paymentBoxPadding,
        y: payY,
        size: 9,
        font,
        color: rgb(0.35, 0.35, 0.35),
      });

      // Account name with wrapping support
      payY -= 13;
      page.drawText('Account Name:', {
        x: MARGIN_LEFT + paymentBoxPadding,
        y: payY,
        size: 9,
        font,
        color: rgb(0.35, 0.35, 0.35),
      });
      // Draw account name, wrapping if needed
      for (let i = 0; i < accountNameLines.length; i++) {
        if (i === 0) {
          // First line after "Account Name:"
          page.drawText(accountNameLines[i], {
            x: MARGIN_LEFT + paymentBoxPadding + 75,
            y: payY,
            size: 8,
            font,
            color: rgb(0.35, 0.35, 0.35),
          });
        } else {
          payY -= 11;
          page.drawText(accountNameLines[i], {
            x: MARGIN_LEFT + paymentBoxPadding + 75,
            y: payY,
            size: 8,
            font,
            color: rgb(0.35, 0.35, 0.35),
          });
        }
      }

      if (soaSettings.bankAccountNo) {
        payY -= 14;
        page.drawText(`Account Number: ${soaSettings.bankAccountNo}`, {
          x: MARGIN_LEFT + paymentBoxPadding,
          y: payY,
          size: 9,
          font,
          color: rgb(0.35, 0.35, 0.35),
        });
      }

      // Show notes if provided in template (using pre-wrapped lines)
      if (notesLines.length > 0) {
        payY -= 14;
        for (const line of notesLines) {
          page.drawText(line, {
            x: MARGIN_LEFT + paymentBoxPadding,
            y: payY,
            size: 9,
            font,
            color: rgb(0.5, 0.5, 0.5),
          });
          payY -= 12;
        }
      }

      // === TOTALS (right side) ===
      const totalsBoxWidth = 210;
      const totalsX = PAGE_WIDTH - MARGIN_RIGHT - totalsBoxWidth;
      const totalsRightEdge = PAGE_WIDTH - MARGIN_RIGHT - 10;
      let totY = paymentY;

      // Calculate box height based on whether withholding tax is present
      const hasWithholding = Number(invoice.withholdingTax) > 0;
      const totalsBoxHeight = hasWithholding ? 115 : 100;

      // Totals box with accent border
      page.drawRectangle({
        x: totalsX,
        y: totY - totalsBoxHeight + 15,
        width: totalsBoxWidth,
        height: totalsBoxHeight,
        color: rgb(0.98, 0.98, 0.98),
        borderColor: rgb(secondaryRgb.r, secondaryRgb.g, secondaryRgb.b),
        borderWidth: 1.5,
      });

      const labelX = totalsX + 10;

      // Subtotal
      page.drawText('Subtotal:', { x: labelX, y: totY, size: 10, font, color: rgb(0.35, 0.35, 0.35) });
      const subtotalText = formatPdfCurrency(Number(invoice.serviceFee));
      const subtotalWidth = font.widthOfTextAtSize(subtotalText, 10);
      page.drawText(subtotalText, { x: totalsRightEdge - subtotalWidth, y: totY, size: 10, font, color: rgb(0.1, 0.1, 0.1) });
      totY -= 16;

      // VAT
      const vatRatePercent = (vatRate * 100).toFixed(0);
      page.drawText(`VAT (${vatRatePercent}%):`, { x: labelX, y: totY, size: 10, font, color: rgb(0.35, 0.35, 0.35) });
      const vatText = formatPdfCurrency(Number(invoice.vatAmount));
      const vatWidth = font.widthOfTextAtSize(vatText, 10);
      page.drawText(vatText, { x: totalsRightEdge - vatWidth, y: totY, size: 10, font, color: rgb(0.1, 0.1, 0.1) });
      totY -= 16;

      // Gross Amount
      page.drawText('Gross Amount:', { x: labelX, y: totY, size: 10, font, color: rgb(0.35, 0.35, 0.35) });
      const grossText = formatPdfCurrency(Number(invoice.grossAmount));
      const grossWidth = font.widthOfTextAtSize(grossText, 10);
      page.drawText(grossText, { x: totalsRightEdge - grossWidth, y: totY, size: 10, font, color: rgb(0.1, 0.1, 0.1) });
      totY -= 16;

      // Withholding Tax (as deduction)
      if (hasWithholding) {
        const whRatePercent = ((invoice.withholdingRate ? Number(invoice.withholdingRate) : 0.02) * 100).toFixed(0);
        page.drawText(`Withholding Tax (${whRatePercent}%):`, { x: labelX, y: totY, size: 10, font, color: rgb(0.35, 0.35, 0.35) });
        const whText = `(${formatPdfCurrency(Number(invoice.withholdingTax))})`;
        const whWidth = font.widthOfTextAtSize(whText, 10);
        page.drawText(whText, { x: totalsRightEdge - whWidth, y: totY, size: 10, font, color: rgb(0.75, 0.15, 0.15) });
        totY -= 16;
      }

      // Separator line
      totY -= 2;
      page.drawLine({
        start: { x: labelX - 5, y: totY + 5 },
        end: { x: totalsRightEdge + 5, y: totY + 5 },
        thickness: 1,
        color: rgb(0.75, 0.75, 0.75),
      });

      // TOTAL DUE (on same line, smaller text for large amounts)
      totY -= 8;
      page.drawText('TOTAL DUE:', { x: labelX, y: totY, size: 10, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
      const totalText = formatPdfCurrency(Number(invoice.netAmount));
      // Use smaller font for large amounts to prevent overlap
      const totalFontSize = totalText.length > 15 ? 11 : 12;
      const totalWidth = fontBold.widthOfTextAtSize(totalText, totalFontSize);
      page.drawText(totalText, {
        x: totalsRightEdge - totalWidth,
        y: totY - 1,
        size: totalFontSize,
        font: fontBold,
        color: rgb(primaryRgb.r, primaryRgb.g, primaryRgb.b),
      });

      // === REMARKS SECTION (below payment details on the left side) ===
      // Calculate remarks dimensions first (needed for signatures positioning)
      let remarksBoxHeight = 0;
      let actualRemarksY = 0;
      const remarksBoxWidth = paymentBoxWidth; // Same width as payment details box
      const remarksBoxPadding = 10;
      const remarksTextMaxWidth = remarksBoxWidth - remarksBoxPadding * 2;

      // Footer and signatures constraints
      const footerTopY = 80;
      const signaturesHeight = 50;
      const minSignaturesY = footerTopY + signaturesHeight; // 130

      let remarksLines: string[] = [];
      if (invoice.remarks) {
        // Calculate remarks box height based on content
        remarksLines = wrapTextForPdf(invoice.remarks, font, 9, remarksTextMaxWidth);
        remarksBoxHeight = 25 + (remarksLines.length * 12) + 10;

        // Position remarks below payment details box (on the left side)
        const paymentBoxBottom = paymentY - paymentBoxHeight + 15;
        const remarksGap = 10; // Small gap between payment details and remarks
        actualRemarksY = paymentBoxBottom - remarksGap;
        const remarksBoxBottom = actualRemarksY - remarksBoxHeight + 15;

        // Check if remarks fit above the signatures area
        if (remarksBoxBottom >= minSignaturesY + 15) {
          // Remarks fit below payment details box
          page.drawRectangle({
            x: MARGIN_LEFT,
            y: remarksBoxBottom,
            width: remarksBoxWidth,
            height: remarksBoxHeight,
            color: rgb(1, 0.98, 0.94),  // Light cream background
            borderColor: rgb(0.92, 0.88, 0.80),
            borderWidth: 1,
          });

          page.drawText('Remarks', {
            x: MARGIN_LEFT + remarksBoxPadding,
            y: actualRemarksY,
            size: 10,
            font: fontBold,
            color: rgb(0.4, 0.35, 0.2),
          });

          let remY = actualRemarksY - 16;
          for (const line of remarksLines) {
            page.drawText(line, {
              x: MARGIN_LEFT + remarksBoxPadding,
              y: remY,
              size: 9,
              font,
              color: rgb(0.35, 0.35, 0.35),
            });
            remY -= 12;
          }
        } else {
          // Not enough space - this shouldn't happen often with multi-page support
          // The page calculation should have created a separate page for totals
          console.log('[PDF] Warning: No space for remarks below payment details');
          remarksBoxHeight = 0;
        }
      }

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

        const breakdownY = totY - 40;
        page.drawRectangle({
          x: MARGIN_LEFT,
          y: breakdownY - 25,
          width: 200,
          height: 35,
          color: rgb(0.95, 0.97, 1),
        });

        page.drawText(`${frequencyLabel} Billing:`, {
          x: MARGIN_LEFT + 5,
          y: breakdownY,
          size: 9,
          font: fontBold,
          color: rgb(0.2, 0.2, 0.6),
        });
        page.drawText(`${formatPdfCurrency(monthlyFee)}/month x ${months} months`, {
          x: MARGIN_LEFT + 5,
          y: breakdownY - 14,
          size: 9,
          font,
          color: rgb(0.3, 0.3, 0.3),
        });
      }

      // === SIGNATURES SECTION ===
      // Position signatures between the payment/totals section and the footer
      // footerTopY, signaturesHeight, minSignaturesY already defined above

      // Calculate Y position: below payment box, remarks (if shown), or totals box, whichever is lower
      const afterPaymentY = paymentY - paymentBoxHeight - 20;
      const afterTotalsY = totY - totalsBoxHeight - 20;
      // If remarks were drawn, calculate where they end
      const afterRemarksY = remarksBoxHeight > 0 ? (actualRemarksY - remarksBoxHeight + 15) - 25 : Math.min(afterPaymentY, afterTotalsY);
      const calculatedY = Math.min(afterPaymentY, afterRemarksY, afterTotalsY);

      // Ensure signatures don't go below the footer
      const signaturesY = Math.max(calculatedY, minSignaturesY);
      const signatureBoxWidth = (CONTENT_WIDTH - 30) / 3;  // 3 boxes with gaps
      const signatureLineY = signaturesY - 20;

      // Prepared By
      const preparedByX = MARGIN_LEFT;
      const preparedByNameWidth = fontBold.widthOfTextAtSize(soaSettings.preparedBy, 9);
      page.drawText(soaSettings.preparedBy, {
        x: preparedByX + (signatureBoxWidth - preparedByNameWidth) / 2,
        y: signatureLineY - 12,
        size: 9,
        font: fontBold,
        color: rgb(0.1, 0.1, 0.1),
      });
      const preparedByLabelWidth = font.widthOfTextAtSize('Prepared by', 8);
      page.drawText('Prepared by', {
        x: preparedByX + (signatureBoxWidth - preparedByLabelWidth) / 2,
        y: signatureLineY - 24,
        size: 8,
        font,
        color: rgb(0.5, 0.5, 0.5),
      });

      // Reviewed By
      const reviewedByX = MARGIN_LEFT + signatureBoxWidth + 15;
      const reviewedByNameWidth = fontBold.widthOfTextAtSize(soaSettings.reviewedBy, 9);
      page.drawText(soaSettings.reviewedBy, {
        x: reviewedByX + (signatureBoxWidth - reviewedByNameWidth) / 2,
        y: signatureLineY - 12,
        size: 9,
        font: fontBold,
        color: rgb(0.1, 0.1, 0.1),
      });
      const reviewedByLabelWidth = font.widthOfTextAtSize('Reviewed by', 8);
      page.drawText('Reviewed by', {
        x: reviewedByX + (signatureBoxWidth - reviewedByLabelWidth) / 2,
        y: signatureLineY - 24,
        size: 8,
        font,
        color: rgb(0.5, 0.5, 0.5),
      });

      // Received By (blank for client)
      const receivedByX = MARGIN_LEFT + (signatureBoxWidth + 15) * 2;
      const receivedByLabelWidth = font.widthOfTextAtSize('Received by', 8);
      page.drawText('Received by', {
        x: receivedByX + (signatureBoxWidth - receivedByLabelWidth) / 2,
        y: signatureLineY - 12,
        size: 8,
        font,
        color: rgb(0.5, 0.5, 0.5),
      });
      // Date line for received by
      page.drawText('Date: ________________', {
        x: receivedByX + 10,
        y: signatureLineY - 26,
        size: 8,
        font,
        color: rgb(0.5, 0.5, 0.5),
      });
    }

    // Draw footer on all pages
    drawFooter(page);
  }

  return pdfDoc.save();
}

export function formatPdfCurrency(amount: number): string {
  return 'PHP ' + new Intl.NumberFormat('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function wrapTextForPdf(text: string, font: any, fontSize: number, maxWidth: number): string[] {
  // First, handle explicit newlines in the text
  const paragraphs = text.split(/\r?\n/);
  const allLines: string[] = [];

  for (const paragraph of paragraphs) {
    // Skip empty paragraphs but preserve them as empty lines
    if (!paragraph.trim()) {
      allLines.push('');
      continue;
    }

    const words = paragraph.split(' ').filter(w => w.length > 0);
    let currentLine = '';

    for (const word of words) {
      // Clean the word of any remaining control characters
      const cleanWord = word.replace(/[\x00-\x1F\x7F]/g, '');
      if (!cleanWord) continue;

      const testLine = currentLine ? `${currentLine} ${cleanWord}` : cleanWord;
      const width = font.widthOfTextAtSize(testLine, fontSize);

      if (width > maxWidth && currentLine) {
        allLines.push(currentLine);
        currentLine = cleanWord;
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine) {
      allLines.push(currentLine);
    }
  }

  return allLines;
}
