import { convexClient, api } from '@/lib/convex';
import { calculateBilling, generateBillingNo } from './utils';
import { BillingModel, InvoiceStatus, VatType, BillingFrequency } from '@/lib/enums';

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
  const clients = await convexClient.query(api.rcbcEndClients.list, {
    month: startOfMonth.getTime(),
    isActive: true,
  });

  if (clients.length === 0) {
    return null;
  }

  // Calculate totals
  let totalEmployees = 0;
  let totalServiceFee = 0;

  const clientDetails = clients.map((client: any) => {
    const rate = Number(client.ratePerEmployee);
    const amount = client.employeeCount * rate;
    totalEmployees += client.employeeCount;
    totalServiceFee += amount;

    return {
      id: client._id,
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
  return convexClient.query(api.rcbcEndClients.distinctMonths, {});
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
  const existingInvoices = await convexClient.query(api.invoices.list, { status: undefined });
  const existingInvoice = (existingInvoices as any[]).find((inv: any) =>
    inv.billingModel === BillingModel.RCBC_CONSOLIDATED &&
    inv.isConsolidated === true &&
    inv.periodStart && inv.periodStart >= summary.month.getTime() &&
    inv.periodEnd && inv.periodEnd <= new Date(summary.month.getFullYear(), summary.month.getMonth() + 1, 0).getTime() &&
    inv.status !== InvoiceStatus.CANCELLED &&
    inv.status !== InvoiceStatus.REJECTED &&
    inv.status !== InvoiceStatus.VOID
  );

  if (existingInvoice) {
    return {
      success: false,
      error: `An invoice already exists for ${summary.monthLabel}. Invoice #${existingInvoice.billingNo}`,
    };
  }

  // Get RCBC partner
  const rcbcPartner = await convexClient.query(api.partners.getByCode, { code: 'RCBC' });

  if (!rcbcPartner) {
    return {
      success: false,
      error: 'RCBC partner not found. Please create it first.',
    };
  }

  // Get company (YOWI by default for RCBC)
  const company = await convexClient.query(api.companies.getById, { id: rcbcPartner.companyId });

  if (!company) {
    return { success: false, error: 'Company not found for RCBC partner' };
  }

  // Generate billing number
  const billingNo = generateBillingNo(
    company.invoicePrefix || 'INV',
    company.nextInvoiceNo
  );

  // Period dates
  const periodStart = summary.month.getTime();
  const periodEnd = new Date(summary.month.getFullYear(), summary.month.getMonth() + 1, 0).getTime();

  // Create line items data
  const lineItems = summary.clients.map((client, index) => ({
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
  }));

  // Create invoice with line items
  const invoiceId = await convexClient.mutation(api.invoices.create, {
    data: {
      billingNo,
      companyId: company._id,
      partnerId: rcbcPartner._id,
      customerName: rcbcPartner.invoiceTo || 'RIZAL COMMERCIAL BANKING CORPORATION',
      attention: rcbcPartner.attention,
      customerAddress: rcbcPartner.address,
      customerEmail: rcbcPartner.email,
      statementDate: Date.now(),
      dueDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
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
      emailStatus: 'NOT_SENT',
      followUpEnabled: true,
      followUpCount: 0,
      lastFollowUpLevel: 0,
      lineItems,
    },
  });

  // Update company's next invoice number
  await convexClient.mutation(api.companies.incrementInvoiceNo, { id: company._id });

  // Audit log
  try {
    const userExists = await convexClient.query(api.users.getById, { id: userId as any });
    if (userExists) {
      await convexClient.mutation(api.auditLogs.create, {
        userId: userId as any,
        action: 'RCBC_INVOICE_GENERATED',
        entityType: 'Invoice',
        entityId: invoiceId as string,
        details: {
          month: monthStr,
          totalClients: summary.totalClients,
          netAmount: summary.netAmount,
        },
      });
    }
  } catch (auditError) {
    console.warn('Failed to create audit log:', auditError);
  }

  // Create notification
  await convexClient.mutation(api.notifications.create, {
    type: 'INVOICE_PENDING',
    title: 'RCBC Consolidated Invoice Created',
    message: `Invoice ${billingNo} for ${summary.monthLabel} is pending approval. Total: ${summary.netAmount.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })}`,
    link: `/dashboard/pending`,
    entityType: 'Invoice',
    entityId: invoiceId as string,
  });

  return {
    success: true,
    invoiceId: invoiceId as string,
  };
}
