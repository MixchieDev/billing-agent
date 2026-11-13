import { PrismaClient } from '../src/generated/prisma';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

/** The first admin's password must be given, never a default in the repo. */
function adminPassword(): string {
  const pw = process.env.ADMIN_INITIAL_PASSWORD;
  if (!pw || pw.length < 12) {
    throw new Error('Set ADMIN_INITIAL_PASSWORD (12+ characters) to create the admin user');
  }
  return pw;
}

async function main() {
  const hashedPassword = await bcrypt.hash(adminPassword(), 12);

  const user = await prisma.user.upsert({
    where: { email: 'admin@yahshua-abba.com' },
    update: {},
    create: {
      name: 'Admin',
      email: 'admin@yahshua-abba.com',
      password: hashedPassword,
      role: 'ADMIN',
    },
  });

  console.log('Created admin user:', user.email);

  // Also create the companies
  await prisma.company.upsert({
    where: { code: 'YOWI' },
    update: {},
    create: {
      code: 'YOWI',
      name: 'YAHSHUA OUTSOURCING WORLDWIDE INC.',
      invoicePrefix: 'S',
      nextInvoiceNo: 1,
    },
  });

  await prisma.company.upsert({
    where: { code: 'ABBA' },
    update: {},
    create: {
      code: 'ABBA',
      name: 'THE ABBA INITIATIVE, OPC',
      invoicePrefix: 'A',
      nextInvoiceNo: 1,
    },
  });

  console.log('Created companies: YOWI, ABBA');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
