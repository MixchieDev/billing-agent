import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
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
    const skip = (page - 1) * limit;

    // Build date range filter for paidAt
    const paidAtFilter: { gte?: Date; lte?: Date } = {};
    if (paidFrom) {
      paidAtFilter.gte = new Date(paidFrom);
    }
    if (paidTo) {
      // Set to end of day
      const endDate = new Date(paidTo);
      endDate.setHours(23, 59, 59, 999);
      paidAtFilter.lte = endDate;
    }

    // Build where clause
    const where = {
      ...(status && { status: status as any }),
      ...(billingEntity && { company: { code: billingEntity } }),
      ...(partner && { billingModel: partner as any }),
      ...(Object.keys(paidAtFilter).length > 0 && { paidAt: paidAtFilter }),
    };

    // Get invoices and total count in parallel
    // Optimized: only select needed fields to reduce payload
    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        select: {
          id: true,
          billingNo: true,
          customerName: true,
          customerEmail: true,
          customerEmails: true,
          serviceFee: true,
          vatAmount: true,
          netAmount: true,
          dueDate: true,
          createdAt: true,
          billingModel: true,
          productType: true,
          status: true,
          paidAt: true,
          paidAmount: true,
          // Follow-up tracking fields
          followUpEnabled: true,
          followUpCount: true,
          lastFollowUpLevel: true,
          company: {
            select: { code: true },
          },
          lineItems: {
            select: { description: true },
            take: 1, // Only need first item for product type detection
          },
          approvedBy: {
            select: { name: true, email: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.invoice.count({ where }),
    ]);

    return NextResponse.json({
      invoices,
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
    const invoice = await prisma.invoice.create({
      data: {
        ...body,
        status: 'PENDING',
      },
    });

    return NextResponse.json(invoice, { status: 201 });
  } catch (error) {
    console.error('Error creating invoice:', error);
    return NextResponse.json(
      { error: 'Failed to create invoice' },
      { status: 500 }
    );
  }
}
