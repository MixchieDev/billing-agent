import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

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

    if (code !== 'YOWI' && code !== 'ABBA') {
      return NextResponse.json({ error: 'Invalid company code' }, { status: 400 });
    }

    const company = await prisma.company.findUnique({
      where: { code },
      include: {
        signatories: true,
      },
    });

    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    return NextResponse.json(company);
  } catch (error) {
    console.error('Error fetching company:', error);
    return NextResponse.json(
      { error: 'Failed to fetch company' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admins can update company details
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { code } = await params;

    if (code !== 'YOWI' && code !== 'ABBA') {
      return NextResponse.json({ error: 'Invalid company code' }, { status: 400 });
    }

    const body = await request.json();

    // Only allow updating specific fields
    const allowedFields = [
      'name',
      'address',
      'contactNumber',
      'tin',
      'bankName',
      'bankAccountName',
      'bankAccountNo',
      'invoicePrefix',
      'nextInvoiceNo',
      'logoPath',
      'formReference',
    ];

    const updateData: Record<string, any> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    const company = await prisma.company.update({
      where: { code },
      data: updateData,
      include: {
        signatories: true,
      },
    });

    return NextResponse.json(company);
  } catch (error) {
    console.error('Error updating company:', error);
    return NextResponse.json(
      { error: 'Failed to update company' },
      { status: 500 }
    );
  }
}
