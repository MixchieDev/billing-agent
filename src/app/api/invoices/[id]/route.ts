import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { convexClient, api } from '@/lib/convex';
import { InvoiceStatus } from '@/lib/enums';

// GET single invoice
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

    const invoice = await convexClient.query(api.invoices.getByIdFull, { id: id as any });

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // Map _id to id for response
    return NextResponse.json({
      id: invoice._id,
      ...invoice,
    });
  } catch (error: any) {
    console.error('Error fetching invoice:', error);
    return NextResponse.json(
      { error: 'Failed to fetch invoice', details: error?.message || 'Unknown error' },
      { status: 500 }
    );
  }
}

// PUT update invoice (for recipient details)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admins can update invoices
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();

    // Get existing invoice
    const existingInvoice = await convexClient.query(api.invoices.getById, { id: id as any });

    if (!existingInvoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // Only allow updates for pending/approved invoices
    if (existingInvoice.status === InvoiceStatus.SENT || existingInvoice.status === InvoiceStatus.PAID) {
      return NextResponse.json(
        { error: 'Cannot update invoice that has already been sent or paid' },
        { status: 400 }
      );
    }

    // Allowed fields to update
    const {
      customerName,
      attention,
      customerAddress,
      customerEmail,
      customerEmails,
      partnerId,
    } = body;

    const updateData: any = {};

    if (customerName !== undefined) updateData.customerName = customerName;
    if (attention !== undefined) updateData.attention = attention;
    if (customerAddress !== undefined) updateData.customerAddress = customerAddress;
    if (customerEmail !== undefined) updateData.customerEmail = customerEmail;
    if (customerEmails !== undefined) updateData.customerEmails = customerEmails;
    if (partnerId !== undefined) updateData.partnerId = partnerId;

    const updatedInvoice = await convexClient.mutation(api.invoices.update, {
      id: id as any,
      data: updateData,
    });

    // Create audit log
    await convexClient.mutation(api.auditLogs.create, {
      userId: session.user.id as any,
      action: 'INVOICE_UPDATED',
      entityType: 'Invoice',
      entityId: id,
      details: {
        updates: updateData,
      },
    });

    // Fetch updated invoice with relations
    const fullInvoice = await convexClient.query(api.invoices.getByIdFull, { id: id as any });

    return NextResponse.json({
      id: fullInvoice?._id,
      ...fullInvoice,
    });
  } catch (error) {
    console.error('Error updating invoice:', error);
    return NextResponse.json(
      { error: 'Failed to update invoice' },
      { status: 500 }
    );
  }
}
