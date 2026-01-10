import { PrismaClient } from '../src/generated/prisma';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create YOWI company
  const yowi = await prisma.company.upsert({
    where: { code: 'YOWI' },
    update: {},
    create: {
      code: 'YOWI',
      name: 'YAHSHUA OUTSOURCING WORLDWIDE, INC.',
      address: 'Unit #12 2F E-Max Building, Xavier Estates, Masterson Avenue, Upper Balulang, Cagayan De Oro City Misamis Oriental 9000',
      contactNumber: '0917-650-4003',
      bankName: 'RCBC',
      bankAccountName: 'YAHSHUA OUTSOURCING WORLDWIDE, INC.',
      bankAccountNo: '7-590-53889-5',
      formReference: 'YOWI-FRM-03-012',
      invoicePrefix: 'S',
      nextInvoiceNo: 1,
      logoPath: '/assets/yowi-logo.png',
    },
  });
  console.log('Created YOWI company:', yowi.id);

  // Create ABBA company
  const abba = await prisma.company.upsert({
    where: { code: 'ABBA' },
    update: {},
    create: {
      code: 'ABBA',
      name: 'THE ABBA INITIATIVE, OPC',
      address: 'Unit #12 2F E-Max Building Xavier Estates Masterson Avenue, Upper Balulang, Cagayan De Oro City Misamis Oriental 9000',
      contactNumber: '0917-106-5249',
      bankName: 'RCBC',
      bankAccountName: 'THE ABBA INITIATIVE, OPC',
      bankAccountNo: '7-590-59122-2',
      formReference: 'YOWI-FRM-03-012',
      invoicePrefix: 'S',
      nextInvoiceNo: 1,
      logoPath: '/assets/abba-logo.png',
    },
  });
  console.log('Created ABBA company:', abba.id);

  // Create YOWI signatories
  await prisma.signatory.upsert({
    where: { id: 'yowi-prepared' },
    update: {},
    create: {
      id: 'yowi-prepared',
      companyId: yowi.id,
      role: 'prepared_by',
      name: 'VANESSA L. DONOSO',
      isDefault: true,
    },
  });

  await prisma.signatory.upsert({
    where: { id: 'yowi-reviewed' },
    update: {},
    create: {
      id: 'yowi-reviewed',
      companyId: yowi.id,
      role: 'reviewed_by',
      name: 'RUTH MICHELLE C. BAYRON',
      isDefault: true,
    },
  });
  console.log('Created YOWI signatories');

  // Create ABBA signatories (same as YOWI)
  await prisma.signatory.upsert({
    where: { id: 'abba-prepared' },
    update: {},
    create: {
      id: 'abba-prepared',
      companyId: abba.id,
      role: 'prepared_by',
      name: 'VANESSA L. DONOSO',
      isDefault: true,
    },
  });

  await prisma.signatory.upsert({
    where: { id: 'abba-reviewed' },
    update: {},
    create: {
      id: 'abba-reviewed',
      companyId: abba.id,
      role: 'reviewed_by',
      name: 'RUTH MICHELLE C. BAYRON',
      isDefault: true,
    },
  });
  console.log('Created ABBA signatories');

  // Create partners
  const globePartner = await prisma.partner.upsert({
    where: { code: 'Globe' },
    update: {},
    create: {
      code: 'Globe',
      name: 'Globe/Innove',
      invoiceTo: 'INNOVE COMMUNICATIONS INC.',
      attention: 'Dominic Ray Del Rosario',
      address: '9F The Globe Tower-Cebu Samar Loop Cor Panay Rd., Cebu Business Park Cebu City 6000',
      billingModel: 'GLOBE_INNOVE',
      companyId: yowi.id,
    },
  });
  console.log('Created Globe partner:', globePartner.id);

  const rcbcPartner = await prisma.partner.upsert({
    where: { code: 'RCBC' },
    update: {},
    create: {
      code: 'RCBC',
      name: 'RCBC',
      invoiceTo: 'RIZAL COMMERCIAL BANKING CORPORATION',
      attention: 'Ms. Lisa F. Cabance',
      address: '12/F Yuchengco Tower 1 RCBC Plaza 6819 Ayala Avenue, Makati City 0727',
      billingModel: 'RCBC_CONSOLIDATED',
      companyId: yowi.id,
    },
  });
  console.log('Created RCBC partner:', rcbcPartner.id);

  const directYowiPartner = await prisma.partner.upsert({
    where: { code: 'Direct-YOWI' },
    update: {},
    create: {
      code: 'Direct-YOWI',
      name: 'Direct (YOWI)',
      billingModel: 'DIRECT',
      companyId: yowi.id,
    },
  });
  console.log('Created Direct-YOWI partner:', directYowiPartner.id);

  const directAbbaPartner = await prisma.partner.upsert({
    where: { code: 'Direct-ABBA' },
    update: {},
    create: {
      code: 'Direct-ABBA',
      name: 'Direct (ABBA)',
      billingModel: 'DIRECT',
      companyId: abba.id,
    },
  });
  console.log('Created Direct-ABBA partner:', directAbbaPartner.id);

  // Create admin user
  const hashedPassword = await bcrypt.hash('admin123', 12);
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@yahshua-abba.com' },
    update: {},
    create: {
      email: 'admin@yahshua-abba.com',
      name: 'System Admin',
      password: hashedPassword,
      role: 'ADMIN',
    },
  });
  console.log('Created admin user:', adminUser.email);

  // Create scheduled job record
  await prisma.scheduledJob.upsert({
    where: { id: 'daily-billing' },
    update: {},
    create: {
      id: 'daily-billing',
      name: 'Daily Billing Check',
      cronExpr: '0 8 * * *',
      isEnabled: true,
      status: 'IDLE',
    },
  });
  console.log('Created scheduled job record');

  console.log('Database seeding completed!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
