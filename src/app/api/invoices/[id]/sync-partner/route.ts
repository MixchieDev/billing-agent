import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { convexClient, api } from '@/lib/convex';
import { InvoiceStatus } from '@/lib/enums';

// POST - Sync invoice recipient details from linked partner
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admins can sync
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;

    // Get invoice with partner (using full hydrated query)
    const invoice = await convexClient.query(api.invoices.getByIdFull, {
      id: id as any,
    });

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // Only allow syncing for pending/approved invoices (not sent/paid)
    if (invoice.status === InvoiceStatus.SENT || invoice.status === InvoiceStatus.PAID) {
      return NextResponse.json(
        { error: 'Cannot update invoice that has already been sent or paid' },
        { status: 400 }
      );
    }

    if (!invoice.partnerId || !invoice.partner) {
      return NextResponse.json(
        { error: 'Invoice is not linked to a partner' },
        { status: 400 }
      );
    }

    const partner = invoice.partner;

    // Update invoice with partner details
    await convexClient.mutation(api.invoices.update, {
      id: id as any,
      data: {
        customerName: partner.invoiceTo || invoice.customerName,
        attention: partner.attention,
        customerAddress: partner.address,
        customerEmail: partner.email,
      },
    });

    // Fetch updated invoice with relations
    const updatedInvoice = await convexClient.query(api.invoices.getByIdFull, {
      id: id as any,
    });

    // Create audit log
    await convexClient.mutation(api.auditLogs.create, {
      userId: session.user.id as any,
      action: 'INVOICE_SYNCED_FROM_PARTNER',
      entityType: 'Invoice',
      entityId: id,
      details: {
        partnerId: partner._id,
        partnerCode: partner.code,
        updates: {
          customerName: partner.invoiceTo,
          attention: partner.attention,
          customerAddress: partner.address,
          customerEmail: partner.email,
        },
      },
    });

    return NextResponse.json({
      success: true,
      invoice: {
        id: updatedInvoice?._id,
        ...updatedInvoice,
      },
      message: `Invoice updated with details from partner ${partner.code}`,
    });
  } catch (error) {
    console.error('Error syncing invoice from partner:', error);
    return NextResponse.json(
      { error: 'Failed to sync invoice from partner' },
      { status: 500 }
    );
  }
}
