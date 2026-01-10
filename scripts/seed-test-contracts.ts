import { PrismaClient } from '../src/generated/prisma';

const prisma = new PrismaClient();

async function main() {
  console.log('Creating 20 test contracts...\n');

  // Get companies and partners
  const yowi = await prisma.company.findUnique({ where: { code: 'YOWI' } });
  const abba = await prisma.company.findUnique({ where: { code: 'ABBA' } });
  const globePartner = await prisma.partner.findUnique({ where: { code: 'Globe' } });
  const rcbcPartner = await prisma.partner.findUnique({ where: { code: 'RCBC' } });
  const directYowi = await prisma.partner.findUnique({ where: { code: 'Direct-YOWI' } });
  const directAbba = await prisma.partner.findUnique({ where: { code: 'Direct-ABBA' } });

  if (!yowi || !abba) {
    console.error('Companies not found. Please run db:seed first.');
    process.exit(1);
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Helper functions
  const addDays = (date: Date, days: number) => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  };

  const addMonths = (date: Date, months: number) => {
    const result = new Date(date);
    result.setMonth(result.getMonth() + months);
    return result;
  };

  // Test contracts data - diverse scenarios for testing
  const testContracts = [
    // === SCHEDULE SENDING TESTS (Due within next 7 days) ===
    {
      companyName: 'TechStart Solutions Inc.',
      productType: 'ACCOUNTING' as const,
      monthlyFee: 15000,
      paymentPlan: 'Monthly',
      contractStart: addMonths(today, -6),
      nextDueDate: addDays(today, 1), // Due tomorrow
      status: 'ACTIVE' as const,
      contactPerson: 'John Reyes',
      email: 'john.reyes@techstart.ph',
      mobile: '0917-123-4567',
      industry: 'Technology',
      billingEntityId: yowi.id,
      partnerId: directYowi?.id,
      vatType: 'VAT' as const,
      billingType: 'RECURRING' as const,
      remarks: 'Priority client - test schedule sending',
    },
    {
      companyName: 'Digital Marketing Pro',
      productType: 'PAYROLL' as const,
      monthlyFee: 8500,
      paymentPlan: 'Monthly',
      contractStart: addMonths(today, -3),
      nextDueDate: addDays(today, 3), // Due in 3 days
      status: 'ACTIVE' as const,
      contactPerson: 'Maria Santos',
      email: 'maria@digitalmarketing.ph',
      mobile: '0918-234-5678',
      industry: 'Marketing',
      billingEntityId: yowi.id,
      partnerId: directYowi?.id,
      vatType: 'VAT' as const,
      billingType: 'RECURRING' as const,
    },
    {
      companyName: 'Cloud Nine Enterprises',
      productType: 'COMPLIANCE' as const,
      monthlyFee: 12000,
      paymentPlan: 'Monthly',
      contractStart: addMonths(today, -12),
      nextDueDate: addDays(today, 5), // Due in 5 days
      status: 'ACTIVE' as const,
      contactPerson: 'Peter Tan',
      email: 'peter.tan@cloudnine.com',
      mobile: '0919-345-6789',
      industry: 'Cloud Services',
      billingEntityId: abba.id,
      partnerId: directAbba?.id,
      vatType: 'VAT' as const,
      billingType: 'RECURRING' as const,
    },
    {
      companyName: 'Quick Logistics Corp.',
      productType: 'ACCOUNTING' as const,
      monthlyFee: 25000,
      paymentPlan: 'Monthly',
      contractStart: addMonths(today, -8),
      nextDueDate: addDays(today, 7), // Due in 7 days
      status: 'ACTIVE' as const,
      contactPerson: 'Carlos Mendoza',
      email: 'carlos@quicklogistics.ph',
      mobile: '0920-456-7890',
      industry: 'Logistics',
      billingEntityId: yowi.id,
      partnerId: directYowi?.id,
      vatType: 'VAT' as const,
      billingType: 'RECURRING' as const,
    },

    // === ANNUAL RENEWAL NOTIFICATION TESTS ===
    {
      companyName: 'Global Trade Partners',
      productType: 'ACCOUNTING' as const,
      monthlyFee: 45000,
      paymentPlan: 'Annually',
      contractStart: addMonths(today, -11), // Started 11 months ago
      nextDueDate: addMonths(today, 1), // Renewal due in 1 month
      status: 'ACTIVE' as const,
      contactPerson: 'Anna Lim',
      email: 'anna.lim@globaltrade.ph',
      mobile: '0921-567-8901',
      industry: 'Import/Export',
      billingEntityId: yowi.id,
      partnerId: directYowi?.id,
      vatType: 'VAT' as const,
      billingType: 'RECURRING' as const,
      clientSince: addMonths(today, -24),
      lifetimeValue: 540000,
      remarks: 'Annual contract - renewal notification test',
    },
    {
      companyName: 'Premier Manufacturing Inc.',
      productType: 'PAYROLL' as const,
      monthlyFee: 35000,
      paymentPlan: 'Annually',
      contractStart: addMonths(today, -10), // Renewal in ~2 months
      nextDueDate: addMonths(today, 2),
      status: 'ACTIVE' as const,
      contactPerson: 'Robert Cruz',
      email: 'robert@premiermfg.com',
      mobile: '0922-678-9012',
      industry: 'Manufacturing',
      billingEntityId: abba.id,
      partnerId: directAbba?.id,
      vatType: 'VAT' as const,
      billingType: 'RECURRING' as const,
      clientSince: addMonths(today, -36),
      lifetimeValue: 1260000,
      renewalRisk: 'Low',
    },
    {
      companyName: 'Sunrise Healthcare Systems',
      productType: 'HR' as const,
      monthlyFee: 55000,
      paymentPlan: 'Annually',
      contractStart: addMonths(today, -11),
      nextDueDate: addDays(today, 15), // Renewal very soon
      status: 'ACTIVE' as const,
      contactPerson: 'Dr. Elena Gomez',
      email: 'elena.gomez@sunrisehealthcare.ph',
      mobile: '0923-789-0123',
      industry: 'Healthcare',
      billingEntityId: yowi.id,
      partnerId: directYowi?.id,
      vatType: 'VAT' as const,
      billingType: 'RECURRING' as const,
      clientSince: addMonths(today, -48),
      lifetimeValue: 2640000,
      renewalRisk: 'Medium',
      remarks: 'High-value annual client - urgent renewal',
    },

    // === QUARTERLY BILLING TESTS ===
    {
      companyName: 'Metro Construction Co.',
      productType: 'ACCOUNTING' as const,
      monthlyFee: 20000,
      paymentPlan: 'Quarterly',
      contractStart: addMonths(today, -9),
      nextDueDate: addDays(today, 10),
      status: 'ACTIVE' as const,
      contactPerson: 'Miguel Torres',
      email: 'miguel@metroconstruction.ph',
      mobile: '0924-890-1234',
      industry: 'Construction',
      billingEntityId: yowi.id,
      partnerId: directYowi?.id,
      vatType: 'VAT' as const,
      billingType: 'RECURRING' as const,
    },
    {
      companyName: 'Pacific Retail Group',
      productType: 'COMPLIANCE' as const,
      monthlyFee: 18000,
      paymentPlan: 'Quarterly',
      contractStart: addMonths(today, -6),
      nextDueDate: addMonths(today, 1),
      status: 'ACTIVE' as const,
      contactPerson: 'Lisa Chen',
      email: 'lisa.chen@pacificretail.com',
      mobile: '0925-901-2345',
      industry: 'Retail',
      billingEntityId: abba.id,
      partnerId: directAbba?.id,
      vatType: 'VAT' as const,
      billingType: 'RECURRING' as const,
    },

    // === GLOBE/INNOVE PARTNER TESTS ===
    {
      companyName: 'Globe Client Alpha Corp.',
      productType: 'PAYROLL' as const,
      monthlyFee: 28000,
      paymentPlan: 'Monthly',
      contractStart: addMonths(today, -4),
      nextDueDate: addDays(today, 2),
      status: 'ACTIVE' as const,
      contactPerson: 'James Villanueva',
      email: 'james@globeclientalpha.ph',
      mobile: '0926-012-3456',
      industry: 'Telecommunications',
      billingEntityId: yowi.id,
      partnerId: globePartner?.id,
      vatType: 'VAT' as const,
      billingType: 'RECURRING' as const,
      remarks: 'Globe/Innove billing model test',
    },
    {
      companyName: 'Innove Solutions Beta',
      productType: 'ACCOUNTING' as const,
      monthlyFee: 32000,
      paymentPlan: 'Monthly',
      contractStart: addMonths(today, -7),
      nextDueDate: addDays(today, 4),
      status: 'ACTIVE' as const,
      contactPerson: 'Sarah Aquino',
      email: 'sarah@innovebeta.com',
      mobile: '0927-123-4567',
      industry: 'IT Services',
      billingEntityId: yowi.id,
      partnerId: globePartner?.id,
      vatType: 'VAT' as const,
      billingType: 'RECURRING' as const,
    },

    // === RCBC CONSOLIDATED TESTS ===
    {
      companyName: 'RCBC End-Client One',
      productType: 'PAYROLL' as const,
      monthlyFee: 0, // Calculated based on employee count
      paymentPlan: 'Monthly',
      contractStart: addMonths(today, -5),
      nextDueDate: addDays(today, 6),
      status: 'ACTIVE' as const,
      contactPerson: 'Andrew Sy',
      email: 'andrew.sy@rcbcclient1.ph',
      mobile: '0928-234-5678',
      industry: 'Banking',
      billingEntityId: yowi.id,
      partnerId: rcbcPartner?.id,
      employeeCount: 150,
      ratePerEmployee: 85,
      vatType: 'VAT' as const,
      billingType: 'RECURRING' as const,
      remarks: 'RCBC consolidated billing test',
    },
    {
      companyName: 'RCBC End-Client Two',
      productType: 'PAYROLL' as const,
      monthlyFee: 0,
      paymentPlan: 'Monthly',
      contractStart: addMonths(today, -3),
      nextDueDate: addDays(today, 6),
      status: 'ACTIVE' as const,
      contactPerson: 'Betty Co',
      email: 'betty.co@rcbcclient2.ph',
      mobile: '0929-345-6789',
      industry: 'Finance',
      billingEntityId: yowi.id,
      partnerId: rcbcPartner?.id,
      employeeCount: 85,
      ratePerEmployee: 85,
      vatType: 'VAT' as const,
      billingType: 'RECURRING' as const,
    },

    // === OVERDUE CONTRACTS (for notification tests) ===
    {
      companyName: 'Late Payments LLC',
      productType: 'ACCOUNTING' as const,
      monthlyFee: 10000,
      paymentPlan: 'Monthly',
      contractStart: addMonths(today, -8),
      nextDueDate: addDays(today, -15), // 15 days overdue
      lastPaymentDate: addDays(today, -45),
      daysOverdue: 15,
      status: 'ACTIVE' as const,
      contactPerson: 'Mark Delayed',
      email: 'mark@latepayments.com',
      mobile: '0930-456-7890',
      industry: 'Consulting',
      billingEntityId: yowi.id,
      partnerId: directYowi?.id,
      vatType: 'VAT' as const,
      billingType: 'RECURRING' as const,
      renewalRisk: 'High',
      remarks: 'Overdue - follow up required',
    },
    {
      companyName: 'Delayed Services Corp.',
      productType: 'PAYROLL' as const,
      monthlyFee: 7500,
      paymentPlan: 'Monthly',
      contractStart: addMonths(today, -10),
      nextDueDate: addDays(today, -30), // 30 days overdue
      lastPaymentDate: addDays(today, -60),
      daysOverdue: 30,
      status: 'ACTIVE' as const,
      contactPerson: 'Nancy Behind',
      email: 'nancy@delayedservices.ph',
      mobile: '0931-567-8901',
      industry: 'Services',
      billingEntityId: abba.id,
      partnerId: directAbba?.id,
      vatType: 'VAT' as const,
      billingType: 'RECURRING' as const,
      renewalRisk: 'High',
    },

    // === INACTIVE/STOPPED CONTRACTS (for status testing) ===
    {
      companyName: 'Paused Projects Inc.',
      productType: 'COMPLIANCE' as const,
      monthlyFee: 12500,
      paymentPlan: 'Monthly',
      contractStart: addMonths(today, -12),
      nextDueDate: null,
      status: 'INACTIVE' as const,
      contactPerson: 'Grace Paused',
      email: 'grace@pausedprojects.com',
      mobile: '0932-678-9012',
      industry: 'Real Estate',
      billingEntityId: yowi.id,
      partnerId: directYowi?.id,
      vatType: 'VAT' as const,
      billingType: 'RECURRING' as const,
      remarks: 'Contract paused - client requested hold',
    },
    {
      companyName: 'Terminated Tech',
      productType: 'HR' as const,
      monthlyFee: 9000,
      paymentPlan: 'Monthly',
      contractStart: addMonths(today, -18),
      nextDueDate: null,
      status: 'STOPPED' as const,
      contactPerson: 'Henry Stopped',
      email: 'henry@terminatedtech.ph',
      mobile: '0933-789-0123',
      industry: 'Technology',
      billingEntityId: abba.id,
      partnerId: directAbba?.id,
      vatType: 'VAT' as const,
      billingType: 'RECURRING' as const,
      remarks: 'Contract terminated',
    },

    // === NON-VAT CONTRACTS ===
    {
      companyName: 'Non-VAT Nonprofit Org',
      productType: 'ACCOUNTING' as const,
      monthlyFee: 5000,
      paymentPlan: 'Monthly',
      contractStart: addMonths(today, -2),
      nextDueDate: addDays(today, 8),
      status: 'ACTIVE' as const,
      contactPerson: 'Sister Maria',
      email: 'sister.maria@nonprofit.org',
      mobile: '0934-890-1234',
      industry: 'Non-Profit',
      billingEntityId: abba.id,
      partnerId: directAbba?.id,
      vatType: 'NON_VAT' as const,
      billingType: 'RECURRING' as const,
      remarks: 'Non-VAT client',
    },

    // === ONE-TIME BILLING ===
    {
      companyName: 'Setup Services Client',
      productType: 'COMPLIANCE' as const,
      monthlyFee: 50000,
      paymentPlan: 'One-Time',
      contractStart: today,
      nextDueDate: addDays(today, 14),
      status: 'NOT_STARTED' as const,
      contactPerson: 'Oliver Onetime',
      email: 'oliver@setupservices.ph',
      mobile: '0935-901-2345',
      industry: 'Consulting',
      billingEntityId: yowi.id,
      partnerId: directYowi?.id,
      vatType: 'VAT' as const,
      billingType: 'ONE_TIME' as const,
      remarks: 'Initial setup fee - one-time billing',
    },
  ];

  // Create all test contracts
  let created = 0;
  for (const contractData of testContracts) {
    const contract = await prisma.contract.create({
      data: contractData as any,
    });
    created++;
    console.log(`✓ Created contract ${created}/20: ${contract.companyName}`);
  }

  console.log(`\n✅ Successfully created ${created} test contracts!`);
  console.log('\nContract breakdown:');
  console.log('- 4 contracts due within 7 days (schedule sending test)');
  console.log('- 3 annual renewal contracts (renewal notification test)');
  console.log('- 2 quarterly billing contracts');
  console.log('- 2 Globe/Innove partner contracts');
  console.log('- 2 RCBC consolidated contracts');
  console.log('- 2 overdue contracts');
  console.log('- 2 inactive/stopped contracts');
  console.log('- 1 non-VAT contract');
  console.log('- 1 one-time billing contract');
  console.log('- 1 not-started contract');
}

main()
  .catch((e) => {
    console.error('Error creating test contracts:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
