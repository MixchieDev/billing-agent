import prisma from './prisma';
import { calculateBilling, getBillingEntity, generateBillingNo } from './utils';
import { BillingModel, InvoiceStatus, ContractStatus, VatType, BillingFrequency } from '@/generated/prisma';

// Map contract paymentPlan string to BillingFrequency enum
function mapPaymentPlanToFrequency(paymentPlan: string | null | undefined): BillingFrequency {
  if (!paymentPlan) return BillingFrequency.MONTHLY;

  const plan = paymentPlan.toLowerCase();
  if (plan.includes('annual') || plan.includes('yearly')) {
    return BillingFrequency.ANNUALLY;
  }
  if (plan.includes('quarter')) {
    return BillingFrequency.QUARTERLY;
  }
  return BillingFrequency.MONTHLY;
}

export interface CreateInvoiceParams {
  contractId: string;
  billingAmount: number;
  isVatInclusive?: boolean;
  hasWithholding?: boolean;
  periodStart?: Date;
  periodEnd?: Date;
  remarks?: string;
}

export interface DraftInvoice {
  contractId: string;
  customerName: string;
  productType: string;
  serviceFee: number;
  vatAmount: number;
  grossAmount: number;
  withholdingTax: number;
  netAmount: number;
  dueDate: Date;
  billingEntity: string;
  billingModel: BillingModel;
  vatType: VatType;
  hasWithholding: boolean;
  autoSendEnabled: boolean;  // Per-contract auto-send control
}

// Get contracts due within specified days
export async function getContractsDueWithin(days: number) {
  const today = new Date();
  const futureDate = new Date();
  futureDate.setDate(today.getDate() + days);

  return prisma.contract.findMany({
    where: {
      status: ContractStatus.ACTIVE,
      nextDueDate: {
        gte: today,
        lte: futureDate,
      },
      // Exclude contracts that have ended
      OR: [
        { contractEndDate: null },
        { contractEndDate: { gt: today } },
      ],
    },
    include: {
      partner: true,
      billingEntity: true,
    },
  });
}

// Generate draft invoices for contracts due soon
export async function generateDraftInvoices(daysBeforeDue: number = 15): Promise<DraftInvoice[]> {
  const contracts = await getContractsDueWithin(daysBeforeDue);
  const drafts: DraftInvoice[] = [];

  for (const contract of contracts) {
    // Check if invoice already exists for this due date
    const existingInvoice = await prisma.invoice.findFirst({
      where: {
        contracts: {
          some: { id: contract.id },
        },
        dueDate: contract.nextDueDate!,
        status: {
          not: InvoiceStatus.CANCELLED,
        },
      },
    });

    if (existingInvoice) continue;

    const billingAmount = Number(contract.billingAmount || contract.monthlyFee);
    const isVatClient = contract.vatType === VatType.VAT;
    const hasWithholding = Number(contract.withholdingTax || 0) > 0;

    const calculation = calculateBilling(
      billingAmount,
      true, // assume VAT-inclusive
      isVatClient,
      hasWithholding
    );

    drafts.push({
      contractId: contract.id,
      customerName: contract.companyName,
      productType: contract.productType,
      serviceFee: calculation.serviceFee,
      vatAmount: calculation.vatAmount,
      grossAmount: calculation.grossAmount,
      withholdingTax: calculation.withholdingTax,
      netAmount: calculation.netAmount,
      dueDate: contract.nextDueDate!,
      billingEntity: contract.billingEntity.code,
      billingModel: contract.partner?.billingModel || BillingModel.DIRECT,
      vatType: contract.vatType,
      hasWithholding,
      autoSendEnabled: contract.autoSendEnabled,
    });
  }

  return drafts;
}

// Create invoice from draft
export async function createInvoiceFromContract(params: CreateInvoiceParams) {
  const contract = await prisma.contract.findUnique({
    where: { id: params.contractId },
    include: {
      partner: true,
      billingEntity: true,
    },
  });

  if (!contract) {
    throw new Error('Contract not found');
  }

  const isVatClient = contract.vatType === VatType.VAT;
  const calculation = calculateBilling(
    params.billingAmount,
    params.isVatInclusive ?? true,
    isVatClient,
    params.hasWithholding ?? false
  );

  // Determine invoice recipient based on billing model
  let customerName = contract.companyName;
  let attention = contract.contactPerson;
  let customerAddress = '';
  let customerEmail = contract.email;

  if (contract.partner) {
    if (contract.partner.billingModel === BillingModel.GLOBE_INNOVE) {
      customerName = contract.partner.invoiceTo || 'INNOVE COMMUNICATIONS INC.';
      attention = contract.partner.attention;
      customerAddress = contract.partner.address || '';
      customerEmail = contract.partner.email;
    } else if (contract.partner.billingModel === BillingModel.RCBC_CONSOLIDATED) {
      customerName = contract.partner.invoiceTo || 'RIZAL COMMERCIAL BANKING CORPORATION';
      attention = contract.partner.attention;
      customerAddress = contract.partner.address || '';
      customerEmail = contract.partner.email;
    }
  }

  // Generate billing number
  const billingNo = generateBillingNo(
    contract.billingEntity.invoicePrefix || 'INV',
    contract.billingEntity.nextInvoiceNo
  );

  // Determine billing frequency from contract's paymentPlan
  const billingFrequency = mapPaymentPlanToFrequency(contract.paymentPlan);

  // Create the invoice
  const invoice = await prisma.invoice.create({
    data: {
      billingNo,
      companyId: contract.billingEntityId,
      customerName,
      attention,
      customerAddress,
      customerEmail,
      customerTin: contract.tin,
      statementDate: new Date(),
      dueDate: contract.nextDueDate || new Date(),
      periodStart: params.periodStart,
      periodEnd: params.periodEnd,
      serviceFee: calculation.serviceFee,
      vatAmount: calculation.vatAmount,
      grossAmount: calculation.grossAmount,
      withholdingTax: calculation.withholdingTax,
      netAmount: calculation.netAmount,
      vatType: contract.vatType,
      hasWithholding: params.hasWithholding ?? false,
      withholdingCode: params.hasWithholding ? 'WC160' : null,
      billingFrequency,
      monthlyFee: Number(contract.monthlyFee),
      status: InvoiceStatus.PENDING,
      billingModel: contract.partner?.billingModel || BillingModel.DIRECT,
      remarks: params.remarks,
      contracts: {
        connect: { id: contract.id },
      },
      lineItems: {
        create: {
          contractId: contract.id,
          date: new Date(),
          description: `${contract.productType} Service Fee`,
          quantity: 1,
          unitPrice: calculation.serviceFee,
          serviceFee: calculation.serviceFee,
          vatAmount: calculation.vatAmount,
          withholdingTax: calculation.withholdingTax,
          amount: calculation.netAmount,
        },
      },
    },
    include: {
      lineItems: true,
      company: true,
    },
  });

  // Update company's next invoice number
  await prisma.company.update({
    where: { id: contract.billingEntityId },
    data: {
      nextInvoiceNo: {
        increment: 1,
      },
    },
  });

  return invoice;
}

// Approve invoice
export async function approveInvoice(invoiceId: string, userId: string) {
  return prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      status: InvoiceStatus.APPROVED,
      approvedById: userId,
      approvedAt: new Date(),
    },
  });
}

// Auto-approve invoice (system automated, no user ID)
export async function autoApproveInvoice(invoiceId: string) {
  return prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      status: InvoiceStatus.APPROVED,
      approvedAt: new Date(),
      // No approvedById since it's system-automated
    },
  });
}

// Reject invoice
export async function rejectInvoice(
  invoiceId: string,
  userId: string,
  reason: string,
  rescheduleDate?: Date
) {
  return prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      status: InvoiceStatus.REJECTED,
      rejectedById: userId,
      rejectedAt: new Date(),
      rejectionReason: reason,
      rescheduleDate,
    },
  });
}

// Bulk approve invoices
export async function bulkApproveInvoices(invoiceIds: string[], userId: string) {
  return prisma.invoice.updateMany({
    where: {
      id: { in: invoiceIds },
      status: InvoiceStatus.PENDING,
    },
    data: {
      status: InvoiceStatus.APPROVED,
      approvedById: userId,
      approvedAt: new Date(),
    },
  });
}

// Get invoice stats
export async function getInvoiceStats() {
  const [pending, approved, rejected, sent] = await Promise.all([
    prisma.invoice.aggregate({
      where: { status: InvoiceStatus.PENDING },
      _count: true,
      _sum: { netAmount: true },
    }),
    prisma.invoice.aggregate({
      where: { status: InvoiceStatus.APPROVED },
      _count: true,
      _sum: { netAmount: true },
    }),
    prisma.invoice.count({
      where: { status: InvoiceStatus.REJECTED },
    }),
    prisma.invoice.count({
      where: { status: InvoiceStatus.SENT },
    }),
  ]);

  return {
    pending: pending._count,
    approved: approved._count,
    rejected,
    sent,
    totalPendingAmount: Number(pending._sum.netAmount || 0),
    totalApprovedAmount: Number(approved._sum.netAmount || 0),
  };
}

// Get pending invoices with filters
export async function getPendingInvoices(filters?: {
  billingEntity?: string;
  partner?: string;
  productType?: string;
}) {
  return prisma.invoice.findMany({
    where: {
      status: InvoiceStatus.PENDING,
      ...(filters?.billingEntity && {
        company: { code: filters.billingEntity },
      }),
      ...(filters?.partner && {
        billingModel: filters.partner as BillingModel,
      }),
    },
    include: {
      company: true,
      lineItems: true,
      contracts: true,
    },
    orderBy: {
      dueDate: 'asc',
    },
  });
}
