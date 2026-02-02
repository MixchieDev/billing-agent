import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const minimal = searchParams.get('minimal') === 'true';

    if (minimal) {
      // Lightweight query for dropdowns
      const companies = await prisma.company.findMany({
        select: {
          id: true,
          code: true,
          name: true,
        },
        orderBy: { code: 'asc' },
      });
      return NextResponse.json(companies);
    }

    // Full query with relations
    const companies = await prisma.company.findMany({
      include: {
        signatories: true,
        _count: {
          select: {
            contracts: true,
            invoices: true,
          },
        },
      },
      orderBy: { code: 'asc' },
    });

    return NextResponse.json(companies);
  } catch (error) {
    console.error('Error fetching companies:', error);
    return NextResponse.json(
      { error: 'Failed to fetch companies' },
      { status: 500 }
    );
  }
}
