import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { bankAccountsOrLegacy } from '@/lib/settings';

/**
 * GET /api/bank-accounts
 * Every entity's bank accounts (the list printed on its invoices), for the
 * "received in" filters.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [companies, rows] = await prisma.$transaction([
      prisma.company.findMany({
        select: { code: true, name: true, bankName: true, bankAccountName: true, bankAccountNo: true },
        orderBy: { code: 'asc' },
      }),
      prisma.settings.findMany({ where: { key: { startsWith: 'soa.', endsWith: '.bankAccounts' } } }),
    ]);
    const byKey = new Map(rows.map((r) => [r.key, r.value]));

    const accounts = companies.flatMap((c) =>
      bankAccountsOrLegacy(byKey.get(`soa.${c.code.toLowerCase()}.bankAccounts`), c).map((a) => ({
        entity: c.code,
        ...a,
      }))
    );
    return NextResponse.json({ accounts });
  } catch (error) {
    console.error('Error fetching bank accounts:', error);
    return NextResponse.json({ error: 'Failed to fetch bank accounts' }, { status: 500 });
  }
}
