import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

/** Codes end up in CSV exports and contract imports, so keep them plain. */
const CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 _-]{1,19}$/;
const BILLING_MODELS = ['DIRECT', 'GLOBE_INNOVE', 'RCBC_CONSOLIDATED'] as const;

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const partners = await prisma.partner.findMany({
      include: {
        company: true,
        emailTemplate: {
          select: {
            id: true,
            name: true,
            isDefault: true,
          },
        },
      },
      orderBy: { code: 'asc' },
    });

    return NextResponse.json(partners);
  } catch (error) {
    console.error('Error fetching partners:', error);
    return NextResponse.json(
      { error: 'Failed to fetch partners' },
      { status: 500 }
    );
  }
}

// POST - create a partner
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admins can create partners
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const code = typeof body.code === 'string' ? body.code.trim() : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const billingModel = body.billingModel ?? 'DIRECT';

    if (!CODE_PATTERN.test(code)) {
      return NextResponse.json(
        { error: 'Code must be 2–20 characters: letters, numbers, spaces, hyphens or underscores' },
        { status: 400 }
      );
    }
    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }
    if (!BILLING_MODELS.includes(billingModel)) {
      return NextResponse.json({ error: 'Unknown billing model' }, { status: 400 });
    }
    if (!body.companyId) {
      return NextResponse.json({ error: 'Billing entity is required' }, { status: 400 });
    }

    const company = await prisma.company.findUnique({ where: { id: body.companyId } });
    if (!company) {
      return NextResponse.json({ error: 'Billing entity not found' }, { status: 400 });
    }

    // Codes are how contracts and CSV imports name a partner, so a clash has to
    // be reported rather than silently joining two partners together.
    const clash = await prisma.partner.findUnique({ where: { code } });
    if (clash) {
      return NextResponse.json(
        { error: `A partner with the code "${code}" already exists` },
        { status: 409 }
      );
    }

    const emails = typeof body.emails === 'string' ? body.emails.trim() : null;

    const partner = await prisma.partner.create({
      data: {
        code,
        name,
        billingModel,
        companyId: company.id,
        invoiceTo: body.invoiceTo?.trim() || null,
        attention: body.attention?.trim() || null,
        address: body.address?.trim() || null,
        emails: emails || null,
        // Legacy single-address field mirrors the first of the list.
        email: emails ? emails.split(',')[0].trim() : null,
        emailTemplateId: body.emailTemplateId || null,
      },
      include: {
        company: true,
        emailTemplate: { select: { id: true, name: true, isDefault: true } },
      },
    });

    await prisma.auditLog
      .create({
        data: {
          userId: session.user.id,
          action: 'PARTNER_CREATED',
          entityType: 'Partner',
          entityId: partner.id,
          details: { code: partner.code, name: partner.name, billingModel, entity: company.code },
        },
      })
      .catch(() => {});

    return NextResponse.json(partner, { status: 201 });
  } catch (error) {
    console.error('Error creating partner:', error);
    return NextResponse.json({ error: 'Failed to create partner' }, { status: 500 });
  }
}
