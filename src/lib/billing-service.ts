import { convexClient, api } from '@/lib/convex';
import { calculateBilling, getBillingEntity, generateBillingNo } from './utils';
import { BillingModel, InvoiceStatus, ContractStatus, VatType, BillingFrequency } from '@/lib/enums';

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
  autoApprove?: boolean;  // If true, create invoice as APPROVED
}

// Result of invoice generation
export interface InvoiceGenerationResult {
  invoiceId: string;
  contractId: string;
  customerName: string;
  billingNo: string;
  status: string;
  autoApproved: boolean;
  autoSendEnabled: boolean;
}

// Get contracts due today based on billingDayOfMonth
export async function getContractsDueToday() {
  const today = new Date();
  const dayOfMonth = today.getDate();

  const contracts = await convexClient.query(api.contracts.listDueToday, { dayOfMonth });

  // Filter out contracts that have ended
  return contracts.filter((c: any) => {
    if (!c.contractEndDate) return true;
    return c.contractEndDate > Date.now();
  });
}

// Get contracts due within specified days (kept for backward compatibility)
export async function getContractsDueWithin(days: number) {
  const today = Date.now();
  const futureDate = today + days * 24 * 60 * 60 * 1000;

  const contracts = await convexClient.query(api.contracts.list, { status: ContractStatus.ACTIVE });

  return contracts.filter((c: any) => {
    if (!c.nextDueDate) return false;
    if (c.nextDueDate < today || c.nextDueDate > futureDate) return false;
    if (c.contractEndDate && c.contractEndDate <= today) return false;
    return true;
  });
}

// Helper to check if invoice exists for current billing period
async function checkExistingInvoiceForMonth(contractId: string): Promise<boolean> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).getTime();

  // Get invoices linked to this contract via contractInvoices
  const links = await convexClient.query(api.contractInvoices.listByContractId, { contractId: contractId as any });

  for (const link of links) {
    if (!link.invoice) continue;
    const inv = link.invoice;
    if (inv.statementDate >= startOfMonth && inv.statementDate <= endOfMonth &&
        inv.status !== InvoiceStatus.CANCELLED && inv.status !== InvoiceStatus.VOID) {
      return true;
    }
  }

  return false;
}

// Helper to calculate and update nextDueDate
async function updateNextDueDate(contractId: string, billingDayOfMonth: number) {
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  // Handle months with fewer days (e.g., billing day 31 in February)
  const lastDayOfNextMonth = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate();
  const actualDay = Math.min(billingDayOfMonth, lastDayOfNextMonth);

  const nextDueDate = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), actualDay).getTime();

  await convexClient.mutation(api.contracts.updateNextDueDate, {
    id: contractId as any,
    nextDueDate,
  });
}

// Generate invoices directly for contracts due today (no draft stage)
export async function generateInvoices(): Promise<InvoiceGenerationResult[]> {
  const contracts = await getContractsDueToday();
  const results: InvoiceGenerationResult[] = [];

  for (const contract of contracts) {
    // Check if invoice already exists for this month
    const hasExisting = await checkExistingInvoiceForMonth(contract._id);
    if (hasExisting) continue;

    const billingAmount = Number(contract.billingAmount || contract.monthlyFee);
    const hasWithholding = Number(contract.withholdingTax || 0) > 0;

    // Create invoice with status based on autoApprove
    const invoice = await createInvoiceFromContract({
      contractId: contract._id,
      billingAmount,
      hasWithholding,
      autoApprove: contract.autoApprove,
    });

    results.push({
      invoiceId: invoice._id,
      contractId: contract._id,
      customerName: contract.companyName,
      billingNo: invoice.billingNo || invoice._id,
      status: invoice.status,
      autoApproved: contract.autoApprove,
      autoSendEnabled: contract.autoSendEnabled,
    });

    // Update contract's nextDueDate to next month
    if (contract.billingDayOfMonth) {
      await updateNextDueDate(contract._id, contract.billingDayOfMonth);
    }
  }

  return results;
}

// Create invoice from contract
// If autoApprove is true, invoice is created with APPROVED status
export async function createInvoiceFromContract(params: CreateInvoiceParams) {
  const contract = await convexClient.query(api.contracts.getById, { id: params.contractId as any });

  if (!contract) {
    throw new Error('Contract not found');
  }

  const isVatClient = contract.vatType === VatType.VAT;
  const calculation = calculateBilling(
    params.billingAmount,
    params.isVatInclusive ?? false,
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
  const billingEntity = contract.billingEntity;
  const billingNo = generateBillingNo(
    billingEntity?.invoicePrefix || 'INV',
    billingEntity?.nextInvoiceNo || 1
  );

  // Determine billing frequency from contract's paymentPlan
  const billingFrequency = mapPaymentPlanToFrequency(contract.paymentPlan);

  const now = Date.now();

  // Create the invoice with line items
  const invoiceId = await convexClient.mutation(api.invoices.create, {
    data: {
      billingNo,
      companyId: contract.billingEntityId,
      partnerId: contract.partnerId,
      customerName,
      attention,
      customerAddress,
      customerEmail,
      customerTin: contract.tin,
      statementDate: now,
      dueDate: contract.nextDueDate || now,
      periodStart: params.periodStart?.getTime(),
      periodEnd: params.periodEnd?.getTime(),
      serviceFee: calculation.serviceFee,
      vatAmount: calculation.vatAmount,
      grossAmount: calculation.grossAmount,
      withholdingTax: calculation.withholdingTax,
      netAmount: calculation.netAmount,
      vatType: contract.vatType,
      hasWithholding: params.hasWithholding ?? false,
      withholdingCode: params.hasWithholding ? 'WC160' : undefined,
      billingFrequency,
      monthlyFee: Number(contract.monthlyFee),
      status: params.autoApprove ? InvoiceStatus.APPROVED : InvoiceStatus.PENDING,
      approvedAt: params.autoApprove ? now : undefined,
      billingModel: contract.partner?.billingModel || BillingModel.DIRECT,
      remarks: params.remarks,
      isConsolidated: false,
      emailStatus: 'NOT_SENT',
      followUpEnabled: true,
      followUpCount: 0,
      lastFollowUpLevel: 0,
      lineItems: [{
        contractId: contract._id,
        date: now,
        description: contract.productType.charAt(0) + contract.productType.slice(1).toLowerCase(),
        quantity: 1,
        unitPrice: calculation.serviceFee,
        serviceFee: calculation.serviceFee,
        vatAmount: calculation.vatAmount,
        withholdingTax: calculation.withholdingTax,
        amount: calculation.netAmount,
        sortOrder: 0,
      }],
      contractId: contract._id,
    },
  });

  // Update company's next invoice number
  await convexClient.mutation(api.companies.incrementInvoiceNo, { id: contract.billingEntityId });

  const invoice = await convexClient.query(api.invoices.getById, { id: invoiceId });
  return invoice;
}

// Approve invoice
export async function approveInvoice(invoiceId: string, userId: string) {
  return convexClient.mutation(api.invoices.updateStatus, {
    id: invoiceId as any,
    status: InvoiceStatus.APPROVED,
    approvedById: userId as any,
  });
}

// Auto-approve invoice (system automated, no user ID)
export async function autoApproveInvoice(invoiceId: string) {
  return convexClient.mutation(api.invoices.update, {
    id: invoiceId as any,
    data: {
      status: InvoiceStatus.APPROVED,
      approvedAt: Date.now(),
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
  return convexClient.mutation(api.invoices.updateStatus, {
    id: invoiceId as any,
    status: InvoiceStatus.REJECTED,
    rejectedById: userId as any,
    rejectionReason: reason,
    rescheduleDate: rescheduleDate?.getTime(),
  });
}

// Bulk approve invoices
export async function bulkApproveInvoices(invoiceIds: string[], userId: string) {
  return convexClient.mutation(api.invoices.bulkUpdateStatus, {
    ids: invoiceIds as any[],
    status: InvoiceStatus.APPROVED,
    approvedById: userId as any,
  });
}

// Get invoice stats - optimized single query
export async function getInvoiceStats() {
  const stats = await convexClient.query(api.invoices.statsByStatus, {});

  return {
    pending: stats[InvoiceStatus.PENDING]?.count || 0,
    approved: stats[InvoiceStatus.APPROVED]?.count || 0,
    rejected: stats[InvoiceStatus.REJECTED]?.count || 0,
    sent: stats[InvoiceStatus.SENT]?.count || 0,
    totalPendingAmount: stats[InvoiceStatus.PENDING]?.sum || 0,
    totalApprovedAmount: stats[InvoiceStatus.APPROVED]?.sum || 0,
  };
}

// Get pending invoices with filters
export async function getPendingInvoices(filters?: {
  billingEntity?: string;
  partner?: string;
  productType?: string;
}) {
  let companyId: any = undefined;
  if (filters?.billingEntity) {
    const company = await convexClient.query(api.companies.getByCode, { code: filters.billingEntity });
    if (company) companyId = company._id;
  }

  const invoices = await convexClient.query(api.invoices.list, {
    status: InvoiceStatus.PENDING,
    companyId,
  });

  if (filters?.partner) {
    return invoices.filter((inv: any) => inv.billingModel === filters.partner);
  }

  return invoices;
}
