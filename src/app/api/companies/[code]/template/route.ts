import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { clearTemplateCache } from '@/lib/settings';

// GET template for a company (includes bank details and signatories)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { code } = await params;

    const company = await prisma.company.findUnique({
      where: { code: code.toUpperCase() },
      include: {
        template: true,
        signatories: {
          where: { isDefault: true },
        },
      },
    });

    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    // Get signatories by role
    const preparedBySignatory = company.signatories.find(s => s.role === 'prepared_by');
    const reviewedBySignatory = company.signatories.find(s => s.role === 'reviewed_by');

    // Return template or default values
    const template = company.template || {
      primaryColor: '#2563eb',
      secondaryColor: '#1e40af',
      footerBgColor: '#dbeafe',
      logoPath: company.logoPath,
      invoiceTitle: 'Invoice',
      footerText: `Powered by: ${company.name}`,
      showDisclaimer: true,
      notes: '',
    };

    return NextResponse.json({
      companyId: company.id,
      companyCode: company.code,
      companyName: company.name,
      // Template settings
      ...template,
      // Bank details (from Company model)
      bankName: company.bankName || 'BDO',
      bankAccountName: company.bankAccountName || company.name,
      bankAccountNo: company.bankAccountNo || '',
      // Invoice numbering (from Company model)
      invoicePrefix: company.invoicePrefix || 'INV',
      nextInvoiceNo: company.nextInvoiceNo || 1,
      // Signatories
      preparedBy: preparedBySignatory?.name || 'VANESSA L. DONOSO',
      reviewedBy: reviewedBySignatory?.name || 'RUTH MICHELLE C. BAYRON',
    });
  } catch (error) {
    console.error('Error fetching template:', error);
    return NextResponse.json(
      { error: 'Failed to fetch template' },
      { status: 500 }
    );
  }
}

// PUT update template for a company (includes bank details and signatories)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admins can update templates
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { code } = await params;
    const body = await request.json();

    const company = await prisma.company.findUnique({
      where: { code: code.toUpperCase() },
    });

    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    const {
      // Template settings
      primaryColor,
      secondaryColor,
      footerBgColor,
      logoPath,
      invoiceTitle,
      footerText,
      showDisclaimer,
      notes,
      // Bank details
      bankName,
      bankAccountName,
      bankAccountNo,
      // Invoice numbering
      invoicePrefix,
      nextInvoiceNo,
      // Signatories
      preparedBy,
      reviewedBy,
    } = body;

    // Update company bank details, invoice prefix, and next invoice number if provided
    if (bankName !== undefined || bankAccountName !== undefined || bankAccountNo !== undefined || invoicePrefix !== undefined || nextInvoiceNo !== undefined) {
      await prisma.company.update({
        where: { id: company.id },
        data: {
          ...(bankName !== undefined && { bankName }),
          ...(bankAccountName !== undefined && { bankAccountName }),
          ...(bankAccountNo !== undefined && { bankAccountNo }),
          ...(invoicePrefix !== undefined && { invoicePrefix }),
          ...(nextInvoiceNo !== undefined && { nextInvoiceNo: parseInt(nextInvoiceNo) }),
        },
      });
    }

    // Update signatories if provided
    if (preparedBy !== undefined) {
      await prisma.signatory.upsert({
        where: {
          companyId_role_isDefault: {
            companyId: company.id,
            role: 'prepared_by',
            isDefault: true,
          },
        },
        update: { name: preparedBy },
        create: {
          companyId: company.id,
          role: 'prepared_by',
          name: preparedBy,
          isDefault: true,
        },
      });
    }

    if (reviewedBy !== undefined) {
      await prisma.signatory.upsert({
        where: {
          companyId_role_isDefault: {
            companyId: company.id,
            role: 'reviewed_by',
            isDefault: true,
          },
        },
        update: { name: reviewedBy },
        create: {
          companyId: company.id,
          role: 'reviewed_by',
          name: reviewedBy,
          isDefault: true,
        },
      });
    }

    // Upsert template
    const template = await prisma.invoiceTemplate.upsert({
      where: { companyId: company.id },
      update: {
        primaryColor,
        secondaryColor,
        footerBgColor,
        logoPath,
        invoiceTitle,
        footerText,
        showDisclaimer,
        notes,
      },
      create: {
        companyId: company.id,
        primaryColor: primaryColor || '#2563eb',
        secondaryColor: secondaryColor || '#1e40af',
        footerBgColor: footerBgColor || '#dbeafe',
        logoPath,
        invoiceTitle: invoiceTitle || 'Invoice',
        footerText: footerText || `Powered by: ${company.name}`,
        showDisclaimer: showDisclaimer ?? true,
        notes: notes || null,
      },
    });

    // Clear the template cache so changes take effect immediately
    clearTemplateCache();

    return NextResponse.json({
      ...template,
      bankName,
      bankAccountName,
      bankAccountNo,
      invoicePrefix,
      preparedBy,
      reviewedBy,
    });
  } catch (error) {
    console.error('Error updating template:', error);
    return NextResponse.json(
      { error: 'Failed to update template' },
      { status: 500 }
    );
  }
}
