import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { InvoiceStatus } from '@/generated/prisma';

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

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        company: true,
        partner: true,
        lineItems: true,
        contracts: {
          include: {
            partner: true,
          },
        },
      },
    });

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    return NextResponse.json(invoice);
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
    const existingInvoice = await prisma.invoice.findUnique({
      where: { id },
    });

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

    const updatedInvoice = await prisma.invoice.update({
      where: { id },
      data: updateData,
      include: {
        company: true,
        partner: true,
        lineItems: true,
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'INVOICE_UPDATED',
        entityType: 'Invoice',
        entityId: id,
        details: {
          updates: updateData,
        },
      },
    });

    return NextResponse.json(updatedInvoice);
  } catch (error) {
    console.error('Error updating invoice:', error);
    return NextResponse.json(
      { error: 'Failed to update invoice' },
      { status: 500 }
    );
  }
}
