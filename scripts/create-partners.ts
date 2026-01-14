import { PrismaClient } from '../src/generated/prisma';

const prisma = new PrismaClient();

async function main() {
  // Get company IDs
  const yowi = await prisma.company.findUnique({ where: { code: 'YOWI' } });
  const abba = await prisma.company.findUnique({ where: { code: 'ABBA' } });

  if (!yowi || !abba) {
    throw new Error('Companies not found');
  }

  // Create partners
  const partners = [
    { code: 'Direct-YOWI', name: 'Direct Billing (YOWI)', billingModel: 'DIRECT' as const, companyId: yowi.id },
    { code: 'Direct-ABBA', name: 'Direct Billing (ABBA)', billingModel: 'DIRECT' as const, companyId: abba.id },
    { code: 'Globe', name: 'Globe Telecom', invoiceTo: 'INNOVE COMMUNICATIONS INC.', billingModel: 'GLOBE_INNOVE' as const, companyId: yowi.id },
    { code: 'RCBC', name: 'RCBC', invoiceTo: 'RIZAL COMMERCIAL BANKING CORPORATION', billingModel: 'RCBC_CONSOLIDATED' as const, companyId: yowi.id },
  ];

  for (const p of partners) {
    await prisma.partner.upsert({
      where: { code: p.code },
      update: {},
      create: p,
    });
    console.log('Created partner:', p.code);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
