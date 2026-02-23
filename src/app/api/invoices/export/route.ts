import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { convexClient, api } from '@/lib/convex';
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

    // Fetch paid invoices from Convex
    const allPaidInvoices = await convexClient.query(api.invoices.list, {
      status: 'PAID',
    });

    // Apply client-side filters
    let invoices = allPaidInvoices;

    if (paidFrom) {
      const paidFromTime = new Date(paidFrom).getTime();
      invoices = invoices.filter((inv: any) => inv.paidAt && inv.paidAt >= paidFromTime);
    }
    if (paidTo) {
      const endDate = new Date(paidTo);
      endDate.setHours(23, 59, 59, 999);
      const paidToTime = endDate.getTime();
      invoices = invoices.filter((inv: any) => inv.paidAt && inv.paidAt <= paidToTime);
    }
    if (billingEntity) {
      invoices = invoices.filter((inv: any) => inv.company?.code === billingEntity);
    }

    // Sort by paidAt descending
    invoices.sort((a: any, b: any) => (b.paidAt || 0) - (a.paidAt || 0));

    if (invoices.length === 0) {
      return NextResponse.json(
        { error: 'No paid invoices found for the selected criteria' },
        { status: 404 }
      );
    }

    // For each invoice, fetch full data (line items, contracts, etc.)
    const fullInvoices = await Promise.all(
      invoices.map((inv: any) => convexClient.query(api.invoices.getByIdFull, { id: inv._id as any }))
    );

    // Transform invoices to YTO CSV format
    const csvData: InvoiceCsvData[] = fullInvoices.filter(Boolean).map((invoice: any) => {
      // Get product type from line items or default
      const productType = invoice.lineItems[0]?.description?.includes('Payroll')
        ? 'PAYROLL'
        : invoice.lineItems[0]?.description?.includes('Compliance')
        ? 'COMPLIANCE'
        : invoice.lineItems[0]?.description?.includes('HR')
        ? 'HR'
        : 'ACCOUNTING';

      // Determine customer code based on billing model
      let customerCode = invoice.customerName;
      if (invoice.billingModel === 'GLOBE_INNOVE') {
        customerCode = 'INNOVE COMMUNICATIONS INC.';
      } else if (invoice.billingModel === 'RCBC_CONSOLIDATED') {
        customerCode = 'RIZAL COMMERCIAL BANKING CORPORATION';
      }

      // Generate description with period
      const periodMonth = invoice.periodDescription ||
        format(new Date(invoice.statementDate), 'MMMM yyyy');
      const description = `${productType.charAt(0) + productType.slice(1).toLowerCase()} Service ftm ${periodMonth}`;

      // For consolidated invoices (RCBC), include line items
      const isConsolidated = invoice.isConsolidated && invoice.lineItems.length > 1;

      return {
        invoiceNo: '', // Leave blank for YTO to auto-generate
        statementDate: new Date(invoice.statementDate),
        dueDate: new Date(invoice.dueDate),
        customerCode,
        productType,
        description,
        serviceFee: Number(invoice.serviceFee),
        grossAmount: Number(invoice.grossAmount),
        vatType: invoice.vatType as 'VAT' | 'NON_VAT',
        withholdingCode: invoice.withholdingCode || undefined,
        remarks: invoice.remarks || `${productType.charAt(0) + productType.slice(1).toLowerCase()} services for ${periodMonth}`,
        lineItems: isConsolidated
          ? invoice.lineItems.map((item: any) => ({
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
    const csvContent = generateYtoCsv(csvData);

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
