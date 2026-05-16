import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getProductTypes } from '@/lib/settings';
import { ContractListPage, ContractInitialData } from '@/components/dashboard/contract-list-page';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

export default async function ContractsPage() {
  // Auth gate (runs server-side; no client round-trip)
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect('/login');
  }

  // Pre-fetch everything the page needs in parallel, on the server.
  // Replaces 4 separate client-side API round-trips:
  //   /api/contracts, /api/partners, /api/companies, /api/product-types
  const [contracts, total, partners, companies, productTypes] = await Promise.all([
    prisma.contract.findMany({
      include: { billingEntity: true, partner: true },
      orderBy: { createdAt: 'desc' },
      take: PAGE_SIZE,
    }),
    prisma.contract.count(),
    prisma.partner.findMany({
      select: { id: true, code: true, name: true, billingModel: true },
    }),
    prisma.company.findMany({
      select: { id: true, code: true, name: true },
    }),
    getProductTypes(),
  ]);

  // Shape contracts into the ContractRow form the client component expects.
  // (Also converts Decimal/Date into plain JSON-safe values for the
  // server-to-client boundary.)
  const initialContracts = contracts.map((c) => ({
    id: c.id,
    // Prisma returns null for optional strings; ContractRow uses undefined.
    customerNumber: c.customerNumber ?? undefined,
    customerId: c.customerId ?? undefined,
    companyName: c.companyName,
    productType: c.productType,
    monthlyFee: Number(c.monthlyFee),
    status: c.status,
    nextDueDate: c.nextDueDate ? c.nextDueDate.toISOString() : null,
    billingEntity: c.billingEntity?.code || 'YOWI',
    contactPerson: c.contactPerson,
    email: c.email,
    paymentPlan: c.paymentPlan,
    autoSendEnabled: c.autoSendEnabled ?? true,
    contractEndDate: c.contractEndDate ? c.contractEndDate.toISOString() : null,
    partner: c.partner
      ? {
          id: c.partner.id,
          code: c.partner.code,
          name: c.partner.name,
          billingModel: c.partner.billingModel,
        }
      : null,
  }));

  const initialData: ContractInitialData = {
    contracts: initialContracts,
    total,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    partners: partners.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      billingModel: p.billingModel,
    })),
    companies,
    productTypes,
  };

  return <ContractListPage initialData={initialData} />;
}
