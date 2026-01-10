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
    const status = searchParams.get('status');
    const billingEntity = searchParams.get('billingEntity');
    const productType = searchParams.get('productType');

    const contracts = await prisma.contract.findMany({
      where: {
        ...(status && { status: status as any }),
        ...(billingEntity && { billingEntity: { code: billingEntity } }),
        ...(productType && { productType: productType as any }),
      },
      include: {
        billingEntity: true,
        partner: true,
      },
      orderBy: { nextDueDate: 'asc' },
    });

    return NextResponse.json(contracts);
  } catch (error) {
    console.error('Error fetching contracts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch contracts' },
      { status: 500 }
    );
  }
}
