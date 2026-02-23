import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { convexClient, api } from '@/lib/convex';
import { getPendingInvoices, getInvoiceStats } from '@/lib/billing-service';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const billingEntity = searchParams.get('billingEntity');
    const partner = searchParams.get('partner');
    const paidFrom = searchParams.get('paidFrom');
    const paidTo = searchParams.get('paidTo');

    // Pagination params
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');

    // Fetch invoices from Convex (list returns invoices with company hydrated)
    const allInvoices = await convexClient.query(api.invoices.list, {
      ...(status ? { status } : {}),
    });

    // Apply client-side filters that Convex list doesn't handle directly
    let filtered = allInvoices;

    if (billingEntity) {
      filtered = filtered.filter((inv: any) => inv.company?.code === billingEntity);
    }
    if (partner) {
      filtered = filtered.filter((inv: any) => inv.billingModel === partner);
    }
    if (paidFrom) {
      const paidFromTime = new Date(paidFrom).getTime();
      filtered = filtered.filter((inv: any) => inv.paidAt && inv.paidAt >= paidFromTime);
    }
    if (paidTo) {
      const endDate = new Date(paidTo);
      endDate.setHours(23, 59, 59, 999);
      const paidToTime = endDate.getTime();
      filtered = filtered.filter((inv: any) => inv.paidAt && inv.paidAt <= paidToTime);
    }

    // Paginate
    const total = filtered.length;
    const skip = (page - 1) * limit;
    const invoices = filtered.slice(skip, skip + limit);

    // Map _id to id for response
    const mappedInvoices = invoices.map((inv: any) => ({
      id: inv._id,
      billingNo: inv.billingNo,
      customerName: inv.customerName,
      customerEmail: inv.customerEmail,
      customerEmails: inv.customerEmails,
      serviceFee: inv.serviceFee,
      vatAmount: inv.vatAmount,
      netAmount: inv.netAmount,
      dueDate: inv.dueDate,
      createdAt: inv.createdAt,
      billingModel: inv.billingModel,
      status: inv.status,
      paidAt: inv.paidAt,
      paidAmount: inv.paidAmount,
      followUpEnabled: inv.followUpEnabled,
      followUpCount: inv.followUpCount,
      lastFollowUpLevel: inv.lastFollowUpLevel,
      company: inv.company ? { code: inv.company.code } : null,
      approvedBy: inv.approvedBy ? { name: inv.approvedBy.name, email: inv.approvedBy.email } : null,
    }));

    return NextResponse.json({
      invoices: mappedInvoices,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Error fetching invoices:', error);
    return NextResponse.json(
      { error: 'Failed to fetch invoices' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // Create manual invoice
    const invoiceId = await convexClient.mutation(api.invoices.create, {
      data: {
        ...body,
        status: 'PENDING',
      },
    });

    const invoice = await convexClient.query(api.invoices.getById, { id: invoiceId as any });

    return NextResponse.json({ id: invoiceId, ...invoice }, { status: 201 });
  } catch (error) {
    console.error('Error creating invoice:', error);
    return NextResponse.json(
      { error: 'Failed to create invoice' },
      { status: 500 }
    );
  }
}
