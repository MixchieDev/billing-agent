import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

// GET single partner
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

    const partner = await prisma.partner.findUnique({
      where: { id },
      include: { company: true },
    });

    if (!partner) {
      return NextResponse.json({ error: 'Partner not found' }, { status: 404 });
    }

    return NextResponse.json(partner);
  } catch (error) {
    console.error('Error fetching partner:', error);
    return NextResponse.json(
      { error: 'Failed to fetch partner' },
      { status: 500 }
    );
  }
}

// PUT update partner
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admins can update partners
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();

    const { name, invoiceTo, attention, address, email, emails, billingModel, companyId, emailTemplateId } = body;
    const followUpEnabled = typeof body.followUpEnabled === 'boolean' ? body.followUpEnabled : undefined;

    const partner = await prisma.partner.update({
      where: { id },
      data: {
        name,
        invoiceTo,
        attention,
        address,
        email,
        emails,
        billingModel,
        companyId,
        emailTemplateId: emailTemplateId || null,
        ...(followUpEnabled === undefined ? {} : { followUpEnabled }),
      },
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
    });

    // The switch is a default for NEW contracts. Changing it for the clients
    // already on the books is a separate, explicit choice — otherwise one
    // click would silently stop chasing (or start chasing) a whole book.
    let applied: { contracts: number; invoices: number } | undefined;
    if (followUpEnabled !== undefined && body.applyToExisting === true) {
      const contracts = await prisma.contract.updateMany({
        where: { partnerId: id },
        data: { followUpEnabled },
      });
      // Only invoices still open can be chased, so only those are touched.
      const invoices = await prisma.invoice.updateMany({
        where: { partnerId: id, status: { in: ['SENT', 'PARTIALLY_PAID'] } },
        data: { followUpEnabled },
      });
      applied = { contracts: contracts.count, invoices: invoices.count };

      await prisma.auditLog
        .create({
          data: {
            userId: session.user.id,
            action: followUpEnabled ? 'FOLLOW_UP_ENABLED_BULK' : 'FOLLOW_UP_DISABLED_BULK',
            entityType: 'Partner',
            entityId: id,
            details: { partner: partner.code, followUpEnabled, ...applied },
          },
        })
        .catch(() => {});
    }

    return NextResponse.json({ ...partner, applied });
  } catch (error) {
    console.error('Error updating partner:', error);
    return NextResponse.json(
      { error: 'Failed to update partner' },
      { status: 500 }
    );
  }
}

// DELETE partner
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admins can delete partners
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;

    // Check if partner has contracts
    const contractCount = await prisma.contract.count({
      where: { partnerId: id },
    });

    if (contractCount > 0) {
      return NextResponse.json(
        { error: `Cannot delete partner with ${contractCount} active contracts` },
        { status: 400 }
      );
    }

    await prisma.partner.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting partner:', error);
    return NextResponse.json(
      { error: 'Failed to delete partner' },
      { status: 500 }
    );
  }
}
