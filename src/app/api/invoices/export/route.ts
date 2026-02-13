import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { generateYtoCsv, InvoiceCsvData } from '@/lib/csv-generator';
import { format } from 'date-fns';

/**
 * GET /api/invoices/export
 * Exports paid invoices as YTO CSV for accounting import
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const paidFrom = searchParams.get('paidFrom');
    const paidTo = searchParams.get('paidTo');
    const billingEntity = searchParams.get('billingEntity');

    // Build date range filter for paidAt
    const paidAtFilter: { gte?: Date; lte?: Date } = {};
    if (paidFrom) {
      paidAtFilter.gte = new Date(paidFrom);
    }
    if (paidTo) {
      const endDate = new Date(paidTo);
      endDate.setHours(23, 59, 59, 999);
      paidAtFilter.lte = endDate;
    }

    // Fetch paid invoices with their line items
    const invoices = await prisma.invoice.findMany({
      where: {
        status: 'PAID',
        ...(Object.keys(paidAtFilter).length > 0 && { paidAt: paidAtFilter }),
        ...(billingEntity && { company: { code: billingEntity } }),
      },
      include: {
        company: true,
        lineItems: {
          include: {
            contract: true,
          },
        },
        contracts: true,
      },
      orderBy: { paidAt: 'desc' },
    });

    if (invoices.length === 0) {
      return NextResponse.json(
        { error: 'No paid invoices found for the selected criteria' },
        { status: 404 }
      );
    }

    // Transform invoices to YTO CSV format
    const csvData: InvoiceCsvData[] = invoices.map((invoice) => {
      // Use stored product type, fallback to first line item description
      const productType = invoice.productType || invoice.lineItems[0]?.description || 'ACCOUNTING';

      // Determine customer code based on billing model
      let customerCode = invoice.customerName;
      if (invoice.billingModel === 'GLOBE_INNOVE') {
        customerCode = 'INNOVE COMMUNICATIONS INC.';
      } else if (invoice.billingModel === 'RCBC_CONSOLIDATED') {
        customerCode = 'RIZAL COMMERCIAL BANKING CORPORATION';
      }

      // Generate description with period
      const periodMonth = invoice.periodDescription ||
        format(invoice.statementDate, 'MMMM yyyy');
      const description = `${productType.charAt(0) + productType.slice(1).toLowerCase()} Service ftm ${periodMonth}`;

      // For consolidated invoices (RCBC), include line items
      const isConsolidated = invoice.isConsolidated && invoice.lineItems.length > 1;

      return {
        invoiceNo: '', // Leave blank for YTO to auto-generate
        statementDate: invoice.statementDate,
        dueDate: invoice.dueDate,
        customerCode,
        productType,
        description,
        serviceFee: Number(invoice.serviceFee),
        grossAmount: Number(invoice.grossAmount),
        vatType: invoice.vatType as 'VAT' | 'NON_VAT',
        withholdingCode: invoice.withholdingCode || undefined,
        remarks: invoice.remarks || `${productType.charAt(0) + productType.slice(1).toLowerCase()} services for ${periodMonth}`,
        lineItems: isConsolidated
          ? invoice.lineItems.map((item) => ({
              endClientName: item.endClientName || undefined,
              employeeCount: item.employeeCount || undefined,
              description: item.description,
              serviceFee: Number(item.serviceFee),
              grossAmount: Number(item.serviceFee) * 1.12, // Add VAT
            }))
          : undefined,
      };
    });

    // Generate CSV
    const csvContent = await generateYtoCsv(csvData);

    // Generate filename
    const entity = billingEntity || 'ALL';
    const dateStr = format(new Date(), 'yyyyMMdd');
    const filename = `YTO_Import_${entity}_${dateStr}.csv`;

    // Return CSV as downloadable file
    return new NextResponse(csvContent, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Error exporting invoices:', error);
    return NextResponse.json(
      { error: 'Failed to export invoices' },
      { status: 500 }
    );
  }
}
