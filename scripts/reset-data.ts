import { PrismaClient } from '../src/generated/prisma';

const prisma = new PrismaClient();

async function resetData() {
  console.log('Resetting database to fresh state...\n');

  try {
    // Delete in order to respect foreign keys
    console.log('Deleting email logs...');
    await prisma.emailLog.deleteMany();

    console.log('Deleting invoice attachments...');
    await prisma.invoiceAttachment.deleteMany();

    console.log('Deleting invoice line items...');
    await prisma.invoiceLineItem.deleteMany();

    console.log('Deleting scheduled billing runs...');
    await prisma.scheduledBillingRun.deleteMany();

    console.log('Deleting invoices...');
    await prisma.invoice.deleteMany();

    console.log('Deleting scheduled billings...');
    await prisma.scheduledBilling.deleteMany();

    console.log('Deleting job runs...');
    await prisma.jobRun.deleteMany();

    console.log('Deleting audit logs...');
    await prisma.auditLog.deleteMany();

    console.log('Deleting notifications...');
    await prisma.notification.deleteMany();

    console.log('Deleting RCBC end clients...');
    await prisma.rcbcEndClient.deleteMany();

    console.log('Deleting contracts...');
    await prisma.contract.deleteMany();

    console.log('\n✅ Database reset complete!');
    console.log('Kept: Users, Companies, Partners, Email Templates, Settings');
  } catch (error) {
    console.error('Error resetting database:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

resetData();
