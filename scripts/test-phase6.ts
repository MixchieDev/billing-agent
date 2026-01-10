import * as dotenv from 'dotenv';
dotenv.config();

import { PrismaClient, InvoiceStatus, VatType, BillingModel } from '../src/generated/prisma';
import { sendBillingEmail, sendTestEmail, initEmailServiceFromEnv } from '../src/lib/email-service';
import { generateSoaHtml, getPdfConfig } from '../src/lib/pdf-generator';
import { generateYtoCsv } from '../src/lib/csv-generator';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function testPhase6() {
  console.log('='.repeat(60));
  console.log('BILLING AGENT - PHASE 6 TESTING');
  console.log('='.repeat(60));

  try {
    // Initialize email service
    console.log('\n[1] INITIALIZING EMAIL SERVICE');
    console.log('-'.repeat(40));
    initEmailServiceFromEnv();
    console.log('Email service initialized');

    // Get first contract for testing
    console.log('\n[2] FETCHING TEST CONTRACT');
    console.log('-'.repeat(40));
    const contract = await prisma.contract.findFirst({
      where: { status: 'ACTIVE' },
      include: {
        billingEntity: true,
        partner: true,
      },
    });

    if (!contract) {
      console.log('No active contracts found. Please run data sync first.');
      return;
    }

    console.log(`Contract: ${contract.companyName}`);
    console.log(`  Customer ID: ${contract.customerId}`);
    console.log(`  Monthly Fee: ₱${Number(contract.monthlyFee).toLocaleString()}`);
    console.log(`  Billing Entity: ${contract.billingEntity.name}`);
    console.log(`  Partner: ${contract.partner?.name || 'Direct'}`);
    console.log(`  VAT Type: ${contract.vatType}`);
    console.log(`  Next Due: ${contract.nextDueDate?.toLocaleDateString() || 'N/A'}`);

    // Calculate billing amounts
    const serviceFee = Number(contract.monthlyFee);
    const vatRate = contract.vatType === VatType.VAT ? 0.12 : 0;
    const vatAmount = serviceFee * vatRate;
    const grossAmount = serviceFee + vatAmount;
    const withholdingRate = 0.02; // 2% withholding for services
    const withholdingTax = grossAmount * withholdingRate;
    const netAmount = grossAmount - withholdingTax;

    // Create test invoice
    console.log('\n[3] CREATING TEST INVOICE');
    console.log('-'.repeat(40));

    const billingNo = `TEST-${Date.now()}`;
    const statementDate = new Date();
    const dueDate = contract.nextDueDate || new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);

    const invoice = await prisma.invoice.create({
      data: {
        billingNo,
        companyId: contract.billingEntityId,
        customerName: contract.companyName,
        attention: contract.contactPerson || undefined,
        customerAddress: contract.partner?.address || undefined,
        customerEmail: contract.partner?.email || undefined,
        customerTin: undefined,
        statementDate,
        dueDate,
        periodDescription: `the month of ${statementDate.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })}`,
        serviceFee,
        vatAmount,
        grossAmount,
        withholdingTax,
        netAmount,
        vatType: contract.vatType,
        hasWithholding: true,
        withholdingCode: 'WC160',
        status: InvoiceStatus.PENDING,
        billingModel: contract.partner?.billingModel || BillingModel.DIRECT,
        preparedBy: 'VANESSA L. DONOSO',
        reviewedBy: 'RUTH MICHELLE C. BAYRON',
        remarks: `Test invoice generated for ${contract.companyName}`,
        contracts: {
          connect: { id: contract.id },
        },
        lineItems: {
          create: {
            contractId: contract.id,
            date: statementDate,
            description: `Professional services for ${statementDate.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })}`,
            quantity: 1,
            unitPrice: serviceFee,
            serviceFee,
            vatAmount,
            withholdingTax,
            amount: netAmount,
          },
        },
      },
      include: {
        company: true,
        lineItems: true,
      },
    });

    console.log(`Created invoice: ${invoice.billingNo}`);
    console.log(`  Service Fee: ₱${serviceFee.toLocaleString()}`);
    console.log(`  VAT (12%): ₱${vatAmount.toLocaleString()}`);
    console.log(`  Gross: ₱${grossAmount.toLocaleString()}`);
    console.log(`  W/Tax (2%): ₱${withholdingTax.toLocaleString()}`);
    console.log(`  Net Amount: ₱${netAmount.toLocaleString()}`);

    // Generate SOA HTML
    console.log('\n[4] GENERATING SOA DOCUMENT');
    console.log('-'.repeat(40));

    const companyCode = invoice.company.code as 'YOWI' | 'ABBA';
    const pdfConfig = getPdfConfig(companyCode);

    const soaHtml = generateSoaHtml(
      {
        billingNo: invoice.billingNo || '',
        statementDate: invoice.statementDate,
        dueDate: invoice.dueDate,
        customerName: invoice.customerName,
        attention: invoice.attention || undefined,
        customerAddress: invoice.customerAddress || undefined,
        lineItems: invoice.lineItems.map((item) => ({
          date: item.date || new Date(),
          reference: item.reference || undefined,
          description: item.description,
          poNumber: item.poNumber || undefined,
          serviceFee: Number(item.serviceFee),
          vatAmount: Number(item.vatAmount),
          withholdingTax: Number(item.withholdingTax),
          amount: Number(item.amount),
        })),
        serviceFee: Number(invoice.serviceFee),
        vatAmount: Number(invoice.vatAmount),
        grossAmount: Number(invoice.grossAmount),
        withholdingTax: Number(invoice.withholdingTax),
        netAmount: Number(invoice.netAmount),
        remarks: invoice.remarks || undefined,
        vatType: invoice.vatType,
        hasWithholding: invoice.hasWithholding,
      },
      pdfConfig
    );

    // Save SOA HTML to file
    const outputDir = path.join(process.cwd(), 'output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const htmlPath = path.join(outputDir, `${invoice.billingNo}.html`);
    fs.writeFileSync(htmlPath, soaHtml);
    console.log(`SOA HTML saved to: ${htmlPath}`);

    // Generate YTO CSV
    console.log('\n[5] GENERATING YTO IMPORT CSV');
    console.log('-'.repeat(40));

    const csvContent = generateYtoCsv([
      {
        invoiceNo: invoice.invoiceNo || undefined,
        statementDate: invoice.statementDate,
        dueDate: invoice.dueDate,
        customerCode: invoice.customerName,
        productType: 'ACCOUNTING',
        description: `Professional services for ${invoice.periodDescription}`,
        serviceFee: Number(invoice.serviceFee),
        grossAmount: Number(invoice.grossAmount),
        vatType: invoice.vatType,
        withholdingCode: invoice.withholdingCode || undefined,
        remarks: invoice.remarks || undefined,
      },
    ]);

    const csvPath = path.join(outputDir, `${invoice.billingNo}.csv`);
    fs.writeFileSync(csvPath, csvContent);
    console.log(`YTO CSV saved to: ${csvPath}`);

    // Test email (with confirmation)
    console.log('\n[6] EMAIL TEST');
    console.log('-'.repeat(40));

    const testEmail = contract.email || process.env.EMAIL_FROM;
    if (testEmail) {
      console.log(`Ready to send test email to: ${testEmail}`);
      console.log('\nTo send a test email, run:');
      console.log(`  npx tsx scripts/send-test-email.ts ${testEmail}`);
    } else {
      console.log('No email address available for testing');
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('PHASE 6 TEST SUMMARY');
    console.log('='.repeat(60));
    console.log(`
✓ Email service initialized
✓ Test contract found: ${contract.companyName}
✓ Test invoice created: ${invoice.billingNo}
✓ SOA HTML generated: ${htmlPath}
✓ YTO CSV generated: ${csvPath}

Dashboard available at: http://localhost:3000/login
  Email: admin@yahshua-abba.com
  Password: admin123

Output files in: ${outputDir}
    `);

  } catch (error: any) {
    console.error('\nError:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testPhase6();
