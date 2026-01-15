import prisma from './prisma';
import { calculateBilling, generateBillingNo } from './utils';
import { BillingModel, InvoiceStatus, VatType, BillingFrequency } from '@/generated/prisma';

export interface RcbcMonthSummary {
  month: Date;
  monthLabel: string;
  totalClients: number;
  totalEmployees: number;
  serviceFee: number;
  vatAmount: number;
  grossAmount: number;
  withholdingTax: number;
  netAmount: number;
  clients: {
    id: string;
    name: string;
    employeeCount: number;
    ratePerEmployee: number;
    amount: number;
  }[];
}

// Get RCBC billing summary for a specific month
export async function getRcbcMonthSummary(monthStr: string): Promise<RcbcMonthSummary | null> {
  // Parse YYYY-MM to date range
  const [year, month] = monthStr.split('-').map(Number);
  const startOfMonth = new Date(year, month - 1, 1);
  const endOfMonth = new Date(year, month, 0, 23, 59, 59);

  // Fetch all active RCBC end-clients for this month
  const clients = await prisma.rcbcEndClient.findMany({
    where: {
      month: {
        gte: startOfMonth,
        lte: endOfMonth,
      },
      isActive: true,
    },
    orderBy: { name: 'asc' },
  });

  if (clients.length === 0) {
    return null;
  }

  // Calculate totals
  let totalEmployees = 0;
  let totalServiceFee = 0;

  const clientDetails = clients.map(client => {
    const rate = Number(client.ratePerEmployee);
    const amount = client.employeeCount * rate;
    totalEmployees += client.employeeCount;
    totalServiceFee += amount;

    return {
      id: client.id,
      name: client.name,
      employeeCount: client.employeeCount,
      ratePerEmployee: rate,
      amount,
    };
  });

  // Calculate billing amounts (VAT-exclusive, with withholding)
  const calculation = calculateBilling(totalServiceFee, false, true, true);

  // Format month label
  const monthLabel = startOfMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return {
    month: startOfMonth,
    monthLabel,
    totalClients: clients.length,
    totalEmployees,
    serviceFee: calculation.serviceFee,
    vatAmount: calculation.vatAmount,
    grossAmount: calculation.grossAmount,
    withholdingTax: calculation.withholdingTax,
    netAmount: calculation.netAmount,
    clients: clientDetails,
  };
}

// Get available months that have RCBC clients
export async function getRcbcAvailableMonths(): Promise<string[]> {
  const clients = await prisma.rcbcEndClient.findMany({
    select: { month: true },
    distinct: ['month'],
    orderBy: { month: 'desc' },
  });

  return clients.map(c => {
    const date = new Date(c.month);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  });
}

// Generate consolidated RCBC invoice for a month
export async function generateRcbcInvoice(monthStr: string, userId: string): Promise<{
  success: boolean;
  invoiceId?: string;
  error?: string;
}> {
  // Get month summary
  const summary = await getRcbcMonthSummary(monthStr);

  if (!summary || summary.clients.length === 0) {
    return {
      success: false,
      error: `No active RCBC clients found for ${monthStr}`,
    };
  }

  // Check if invoice already exists for this month (excluding cancelled and rejected)
  const existingInvoice = await prisma.invoice.findFirst({
    where: {
      billingModel: BillingModel.RCBC_CONSOLIDATED,
      isConsolidated: true,
      periodStart: {
        gte: summary.month,
      },
      periodEnd: {
        lte: new Date(summary.month.getFullYear(), summary.month.getMonth() + 1, 0),
      },
      status: {
        notIn: [InvoiceStatus.CANCELLED, InvoiceStatus.REJECTED, InvoiceStatus.VOID],
      },
    },
  });

  if (existingInvoice) {
    return {
      success: false,
      error: `An invoice already exists for ${summary.monthLabel}. Invoice #${existingInvoice.billingNo}`,
    };
  }

  // Get RCBC partner
  const rcbcPartner = await prisma.partner.findUnique({
    where: { code: 'RCBC' },
    include: { company: true },
  });

  if (!rcbcPartner) {
    return {
      success: false,
      error: 'RCBC partner not found. Please create it first.',
    };
  }

  // Get company (YOWI by default for RCBC)
  const company = rcbcPartner.company;

  // Generate billing number
  const billingNo = generateBillingNo(
    company.invoicePrefix || 'INV',
    company.nextInvoiceNo
  );

  // Period dates
  const periodStart = summary.month;
  const periodEnd = new Date(summary.month.getFullYear(), summary.month.getMonth() + 1, 0);

  // Create invoice with line items
  const invoice = await prisma.invoice.create({
    data: {
      billingNo,
      companyId: company.id,
      partnerId: rcbcPartner.id, // Link to partner for traceability
      customerName: rcbcPartner.invoiceTo || 'RIZAL COMMERCIAL BANKING CORPORATION',
      attention: rcbcPartner.attention,
      customerAddress: rcbcPartner.address,
      customerEmail: rcbcPartner.email,
      statementDate: new Date(),
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      periodStart,
      periodEnd,
      periodDescription: `for the month of ${summary.monthLabel}`,
      serviceFee: summary.serviceFee,
      vatAmount: summary.vatAmount,
      grossAmount: summary.grossAmount,
      withholdingTax: summary.withholdingTax,
      netAmount: summary.netAmount,
      vatType: VatType.VAT,
      hasWithholding: true,
      withholdingCode: 'WC160',
      billingFrequency: BillingFrequency.MONTHLY,
      status: InvoiceStatus.PENDING,
      billingModel: BillingModel.RCBC_CONSOLIDATED,
      isConsolidated: true,
      remarks: `Consolidated billing for ${summary.totalClients} RCBC end-clients`,
      lineItems: {
        create: summary.clients.map((client, index) => ({
          description: `Payroll - ${client.name}`,
          quantity: client.employeeCount,
          unitPrice: client.ratePerEmployee,
          serviceFee: client.amount,
          vatAmount: client.amount * 0.12,
          withholdingTax: client.amount * 0.02,
          amount: client.amount * 1.12 - client.amount * 0.02,
          endClientName: client.name,
          employeeCount: client.employeeCount,
          sortOrder: index,
        })),
      },
    },
    include: {
      lineItems: true,
    },
  });

  // Update company's next invoice number
  await prisma.company.update({
    where: { id: company.id },
    data: {
      nextInvoiceNo: {
        increment: 1,
      },
    },
  });

  // Audit log - only create if user exists
  try {
    const userExists = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (userExists) {
      await prisma.auditLog.create({
        data: {
          userId,
          action: 'RCBC_INVOICE_GENERATED',
          entityType: 'Invoice',
          entityId: invoice.id,
          details: {
            month: monthStr,
            totalClients: summary.totalClients,
            netAmount: summary.netAmount,
          },
        },
      });
    }
  } catch (auditError) {
    console.warn('Failed to create audit log:', auditError);
  }

  // Create notification
  await prisma.notification.create({
    data: {
      type: 'INVOICE_PENDING',
      title: 'RCBC Consolidated Invoice Created',
      message: `Invoice ${billingNo} for ${summary.monthLabel} is pending approval. Total: ${summary.netAmount.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })}`,
      link: `/dashboard/pending`,
      entityType: 'Invoice',
      entityId: invoice.id,
    },
  });

  return {
    success: true,
    invoiceId: invoice.id,
  };
}
