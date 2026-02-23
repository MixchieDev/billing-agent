import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { convexClient, api } from '@/lib/convex';

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

    const partner = await convexClient.query(api.partners.getByIdWithCompany, { id: id as any });

    if (!partner) {
      return NextResponse.json({ error: 'Partner not found' }, { status: 404 });
    }

    return NextResponse.json({ ...partner, id: partner._id });
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

    const partner = await convexClient.mutation(api.partners.updateWithRelations, {
      id: id as any,
      name,
      invoiceTo,
      attention,
      address,
      email,
      emails,
      billingModel,
      companyId: companyId as any,
      emailTemplateId: emailTemplateId ? (emailTemplateId as any) : null,
    });

    return NextResponse.json(partner ? { ...partner, id: (partner as any)._id } : partner);
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
    const contractCount = await convexClient.query(api.contracts.countByPartnerId, {
      partnerId: id as any,
    });

    if (contractCount > 0) {
      return NextResponse.json(
        { error: `Cannot delete partner with ${contractCount} active contracts` },
        { status: 400 }
      );
    }

    await convexClient.mutation(api.partners.remove, {
      id: id as any,
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
