import { PrismaClient } from '../src/generated/prisma';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const hashedPassword = await bcrypt.hash('admin123', 10);

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
