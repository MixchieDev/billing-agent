import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { convexClient, api } from '@/lib/convex';
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

    const result = await convexClient.query(api.companies.getWithTemplate, { code: code.toUpperCase() });

    if (!result) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    const company = result;
    const signatories = company.signatories || [];

    // Get signatories by role (filter for default ones)
    const defaultSignatories = signatories.filter((s: any) => s.isDefault);
    const preparedBySignatory = defaultSignatories.find((s: any) => s.role === 'prepared_by');
    const reviewedBySignatory = defaultSignatories.find((s: any) => s.role === 'reviewed_by');

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
      companyId: company._id,
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

    const company = await convexClient.query(api.companies.getByCode, { code: code.toUpperCase() });

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
      const companyUpdateData: Record<string, any> = {};
      if (bankName !== undefined) companyUpdateData.bankName = bankName;
      if (bankAccountName !== undefined) companyUpdateData.bankAccountName = bankAccountName;
      if (bankAccountNo !== undefined) companyUpdateData.bankAccountNo = bankAccountNo;
      if (invoicePrefix !== undefined) companyUpdateData.invoicePrefix = invoicePrefix;
      // Note: nextInvoiceNo is not in the update mutation args, so we skip it or handle via a different approach
      await convexClient.mutation(api.companies.update, {
        id: company._id as any,
        ...companyUpdateData,
      });
    }

    // Update signatories if provided
    if (preparedBy !== undefined) {
      await convexClient.mutation(api.signatories.upsertByCompanyAndRole, {
        companyId: company._id as any,
        role: 'prepared_by',
        name: preparedBy,
        isDefault: true,
      });
    }

    if (reviewedBy !== undefined) {
      await convexClient.mutation(api.signatories.upsertByCompanyAndRole, {
        companyId: company._id as any,
        role: 'reviewed_by',
        name: reviewedBy,
        isDefault: true,
      });
    }

    // Upsert template
    const templateId = await convexClient.mutation(api.invoiceTemplates.upsert, {
      companyId: company._id as any,
      primaryColor: primaryColor || '#2563eb',
      secondaryColor: secondaryColor || '#1e40af',
      footerBgColor: footerBgColor || '#dbeafe',
      logoPath: logoPath || undefined,
      invoiceTitle: invoiceTitle || 'Invoice',
      footerText: footerText || `Powered by: ${company.name}`,
      showDisclaimer: showDisclaimer ?? true,
      notes: notes || undefined,
    });

    // Clear the template cache so changes take effect immediately
    clearTemplateCache();

    return NextResponse.json({
      templateId,
      primaryColor,
      secondaryColor,
      footerBgColor,
      logoPath,
      invoiceTitle,
      footerText,
      showDisclaimer,
      notes,
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
