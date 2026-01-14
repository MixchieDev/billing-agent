import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getSOASettings, getInvoiceTemplate, clearTemplateCache } from '@/lib/settings';
import { generateInvoicePdfLib } from '@/lib/pdf-generator';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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

    // Get SOA settings and invoice template
    const companyCode = invoice.company?.code === 'YOWI' ? 'YOWI' : 'ABBA';
    console.log('[PDF] Generating PDF for invoice:', invoice.billingNo, 'Company:', companyCode);

    // Clear template cache to ensure we always use the latest template
    clearTemplateCache();

    const [soaSettings, template] = await Promise.all([
      getSOASettings(companyCode),
      getInvoiceTemplate(companyCode),
    ]);

    console.log('[PDF] Template loaded:', {
      primaryColor: template.primaryColor,
      invoiceTitle: template.invoiceTitle,
      footerText: template.footerText,
    });

    // Generate PDF using the shared multi-page generator with template
    const pdfBytes = await generateInvoicePdfLib(invoice, soaSettings, template);
    const pdfBuffer = Buffer.from(pdfBytes);

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${invoice.billingNo || invoice.id}.pdf"`,
      },
    });
  } catch (error) {
    console.error('Error generating PDF:', error);
    return NextResponse.json(
      { error: 'Failed to generate PDF' },
      { status: 500 }
    );
  }
}
