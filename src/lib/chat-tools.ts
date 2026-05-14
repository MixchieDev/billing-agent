import prisma from '@/lib/prisma';
import { format, startOfMonth, endOfMonth, addDays, subMonths } from 'date-fns';

// Tool result types
export interface ContractDueSoon {
  id: string;
  companyName: string;
  productType: string;
  monthlyFee: number;
  nextDueDate: Date | null;
  billingEntity: string;
}

export interface ContractDetails {
  id: string;
  companyName: string;
  productType: string;
  monthlyFee: number;
  nextDueDate: Date | null;
  status: string;
  autoSendEnabled: boolean;
  billingEntity: string;
  vatType: string;
  email: string | null;
  remarks: string | null;
}

export interface InvoiceStats {
  pending: number;
  approved: number;
  rejected: number;
  sent: number;
  paid: number;
  pendingAmount: number;
  approvedAmount: number;
  paidAmount: number;
}

export interface PendingInvoice {
  id: string;
  billingNo: string | null;
  customerName: string;
  netAmount: number;
  dueDate: Date;
  billingEntity: string;
  createdAt: Date;
}

export interface OverdueInvoice {
  id: string;
  billingNo: string | null;
  customerName: string;
  netAmount: number;
  dueDate: Date;
  daysPastDue: number;
  billingEntity: string;
}

export interface BillingTotals {
  entity: string;
  period: string;
  invoiceCount: number;
  totalServiceFee: number;
  totalVat: number;
  totalNet: number;
  paidCount: number;
  paidAmount: number;
}

export interface InvoiceDetails {
  id: string;
  invoiceNo: string | null;
  billingNo: string | null;
  customerName: string;
  attention: string | null;
  statementDate: Date;
  dueDate: Date;
  serviceFee: number;
  vatAmount: number;
  grossAmount: number;
  withholdingTax: number;
  netAmount: number;
  discountAmount: number | null;
  status: string;
  billingEntity: string;
  partnerName: string | null;
  paymentMethod: string | null;
  paymentReference: string | null;
  paidAt: Date | null;
  paidAmount: number | null;
  lineItems: { description: string; quantity: number; unitPrice: number; amount: number; endClientName: string | null }[];
  recentEmails: { toEmail: string; subject: string; status: string; sentAt: Date | null }[];
  recentFollowUps: { level: number; toEmail: string; subject: string; status: string; sentAt: Date }[];
}

export interface InvoiceSearchResult {
  id: string;
  invoiceNo: string | null;
  billingNo: string | null;
  customerName: string;
  statementDate: Date;
  dueDate: Date;
  netAmount: number;
  status: string;
  billingEntity: string;
  paymentMethod: string | null;
  paidAt: Date | null;
}

export interface InvoiceActivity {
  invoiceId: string;
  billingNo: string | null;
  customerName: string;
  auditLogs: { action: string; details: unknown; createdAt: Date; userName: string | null }[];
  emailLogs: { toEmail: string; subject: string; status: string; sentAt: Date | null; error: string | null }[];
  followUpLogs: { level: number; toEmail: string; subject: string; status: string; sentAt: Date; error: string | null }[];
}

export interface ClientSummary {
  customerName: string;
  totalInvoices: number;
  totalBilled: number;
  totalPaid: number;
  outstandingBalance: number;
  statusBreakdown: Record<string, number>;
  activeContracts: { productType: string; monthlyFee: number; status: string }[];
  paymentMethods: Record<string, number>;
}

export interface AgingReport {
  current: { count: number; amount: number };
  days1to30: { count: number; amount: number };
  days31to60: { count: number; amount: number };
  days61to90: { count: number; amount: number };
  days90plus: { count: number; amount: number };
  totalOutstanding: number;
  collectionRate: number;
  paymentMethodBreakdown: Record<string, { count: number; amount: number }>;
  billingEntity: string;
}

export interface RevenueTrend {
  month: string;
  invoiceCount: number;
  totalBilled: number;
  totalPaid: number;
  totalOutstanding: number;
  growthPercent: number | null;
}

// Get contracts due within specified days
export async function getContractsDueSoon(days: number = 7): Promise<ContractDueSoon[]> {
  const today = new Date();
  const futureDate = addDays(today, days);

  // Get all active contracts with upcoming due dates
  const contracts = await prisma.contract.findMany({
    where: {
      status: 'ACTIVE',
      nextDueDate: {
        gte: today,
        lte: futureDate,
      },
    },
    include: {
      billingEntity: true,
    },
    orderBy: { nextDueDate: 'asc' },
  });

  return contracts.map((contract) => ({
    id: contract.id,
    companyName: contract.companyName,
    productType: contract.productType,
    monthlyFee: Number(contract.monthlyFee),
    nextDueDate: contract.nextDueDate,
    billingEntity: contract.billingEntity?.code || 'YOWI',
  }));
}

// Get details for a specific contract by company name
export async function getContractDetails(companyName: string): Promise<ContractDetails | null> {
  const contract = await prisma.contract.findFirst({
    where: {
      companyName: {
        contains: companyName,
        mode: 'insensitive',
      },
    },
    include: {
      billingEntity: true,
    },
  });

  if (!contract) return null;

  return {
    id: contract.id,
    companyName: contract.companyName,
    productType: contract.productType,
    monthlyFee: Number(contract.monthlyFee),
    nextDueDate: contract.nextDueDate,
    status: contract.status,
    autoSendEnabled: contract.autoSendEnabled,
    billingEntity: contract.billingEntity?.code || 'YOWI',
    vatType: contract.vatType,
    email: contract.email,
    remarks: contract.remarks,
  };
}

// Get dashboard invoice statistics
export async function getInvoiceStats(): Promise<InvoiceStats> {
  const [pending, approved, rejected, sent, paid] = await Promise.all([
    prisma.invoice.findMany({ where: { status: 'PENDING' } }),
    prisma.invoice.findMany({ where: { status: 'APPROVED' } }),
    prisma.invoice.findMany({ where: { status: 'REJECTED' } }),
    prisma.invoice.findMany({ where: { status: 'SENT' } }),
    prisma.invoice.findMany({ where: { status: 'PAID' } }),
  ]);

  const pendingAmount = pending.reduce((sum, inv) => sum + Number(inv.netAmount), 0);
  const approvedAmount = approved.reduce((sum, inv) => sum + Number(inv.netAmount), 0);
  const paidAmount = paid.reduce((sum, inv) => sum + Number(inv.paidAmount || inv.netAmount), 0);

  return {
    pending: pending.length,
    approved: approved.length,
    rejected: rejected.length,
    sent: sent.length,
    paid: paid.length,
    pendingAmount,
    approvedAmount,
    paidAmount,
  };
}

// Get invoices pending approval
export async function getPendingInvoices(billingEntity?: string): Promise<PendingInvoice[]> {
  const invoices = await prisma.invoice.findMany({
    where: {
      status: 'PENDING',
      ...(billingEntity && { company: { code: billingEntity } }),
    },
    include: {
      company: true,
    },
    orderBy: { dueDate: 'asc' },
    take: 20,
  });

  return invoices.map((inv) => ({
    id: inv.id,
    billingNo: inv.billingNo,
    customerName: inv.customerName,
    netAmount: Number(inv.netAmount),
    dueDate: inv.dueDate,
    billingEntity: inv.company?.code || 'YOWI',
    createdAt: inv.createdAt,
  }));
}

// Get overdue invoices (SENT status past due date)
export async function getOverdueInvoices(): Promise<OverdueInvoice[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const invoices = await prisma.invoice.findMany({
    where: {
      status: 'SENT',
      dueDate: {
        lt: today,
      },
    },
    include: {
      company: true,
    },
    orderBy: { dueDate: 'asc' },
  });

  return invoices.map((inv) => {
    const dueDate = new Date(inv.dueDate);
    dueDate.setHours(0, 0, 0, 0);
    const daysPastDue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

    return {
      id: inv.id,
      billingNo: inv.billingNo,
      customerName: inv.customerName,
      netAmount: Number(inv.netAmount),
      dueDate: inv.dueDate,
      daysPastDue,
      billingEntity: inv.company?.code || 'YOWI',
    };
  });
}

// Search contracts by company name or product type
export async function searchContracts(query: string): Promise<ContractDetails[]> {
  // Try to match product type if the query looks like one
  const productTypes = ['ACCOUNTING', 'PAYROLL', 'COMPLIANCE', 'HR'];
  const matchedProductType = productTypes.find(pt =>
    pt.toLowerCase().includes(query.toLowerCase()) ||
    query.toLowerCase().includes(pt.toLowerCase())
  );

  const contracts = await prisma.contract.findMany({
    where: {
      OR: [
        { companyName: { contains: query, mode: 'insensitive' } },
        ...(matchedProductType ? [{ productType: matchedProductType as any }] : []),
      ],
    },
    include: {
      billingEntity: true,
    },
    take: 10,
  });

  return contracts.map((contract) => ({
    id: contract.id,
    companyName: contract.companyName,
    productType: contract.productType,
    monthlyFee: Number(contract.monthlyFee),
    nextDueDate: contract.nextDueDate,
    status: contract.status,
    autoSendEnabled: contract.autoSendEnabled,
    billingEntity: contract.billingEntity?.code || 'YOWI',
    vatType: contract.vatType,
    email: contract.email,
    remarks: contract.remarks,
  }));
}

// Get billing totals for entity and/or period
export async function getBillingTotals(
  entity?: string,
  month?: string // Format: YYYY-MM
): Promise<BillingTotals> {
  let dateFrom: Date | undefined;
  let dateTo: Date | undefined;

  if (month) {
    const [year, monthNum] = month.split('-').map(Number);
    dateFrom = startOfMonth(new Date(year, monthNum - 1));
    dateTo = endOfMonth(new Date(year, monthNum - 1));
  }

  const invoices = await prisma.invoice.findMany({
    where: {
      ...(entity && { company: { code: entity } }),
      ...(dateFrom && dateTo && {
        statementDate: {
          gte: dateFrom,
          lte: dateTo,
        },
      }),
    },
    include: {
      company: true,
    },
  });

  const totalServiceFee = invoices.reduce((sum, inv) => sum + Number(inv.serviceFee), 0);
  const totalVat = invoices.reduce((sum, inv) => sum + Number(inv.vatAmount), 0);
  const totalNet = invoices.reduce((sum, inv) => sum + Number(inv.netAmount), 0);

  const paidInvoices = invoices.filter((inv) => inv.status === 'PAID');
  const paidCount = paidInvoices.length;
  const paidAmount = paidInvoices.reduce((sum, inv) => sum + Number(inv.paidAmount || inv.netAmount), 0);

  return {
    entity: entity || 'ALL',
    period: month || 'ALL TIME',
    invoiceCount: invoices.length,
    totalServiceFee,
    totalVat,
    totalNet,
    paidCount,
    paidAmount,
  };
}

// Get full details for a specific invoice
export async function getInvoiceDetails(args: {
  billingNo?: string;
  invoiceNo?: string;
  invoiceId?: string;
}): Promise<InvoiceDetails | null> {
  const where: Record<string, unknown> = {};
  if (args.invoiceId) where.id = args.invoiceId;
  else if (args.invoiceNo) where.invoiceNo = args.invoiceNo;
  else if (args.billingNo) where.billingNo = args.billingNo;
  else return null;

  const invoice = await prisma.invoice.findFirst({
    where,
    include: {
      company: true,
      partner: true,
      lineItems: { orderBy: { sortOrder: 'asc' } },
      emailLogs: { orderBy: { createdAt: 'desc' }, take: 5 },
      followUpLogs: { orderBy: { sentAt: 'desc' }, take: 5 },
    },
  });

  if (!invoice) return null;

  return {
    id: invoice.id,
    invoiceNo: invoice.invoiceNo,
    billingNo: invoice.billingNo,
    customerName: invoice.customerName,
    attention: invoice.attention,
    statementDate: invoice.statementDate,
    dueDate: invoice.dueDate,
    serviceFee: Number(invoice.serviceFee),
    vatAmount: Number(invoice.vatAmount),
    grossAmount: Number(invoice.grossAmount),
    withholdingTax: Number(invoice.withholdingTax),
    netAmount: Number(invoice.netAmount),
    discountAmount: invoice.discountAmount ? Number(invoice.discountAmount) : null,
    status: invoice.status,
    billingEntity: invoice.company?.code || 'YOWI',
    partnerName: invoice.partner?.name || null,
    paymentMethod: invoice.paymentMethod,
    paymentReference: invoice.paymentReference,
    paidAt: invoice.paidAt,
    paidAmount: invoice.paidAmount ? Number(invoice.paidAmount) : null,
    lineItems: invoice.lineItems.map((li) => ({
      description: li.description,
      quantity: li.quantity,
      unitPrice: Number(li.unitPrice),
      amount: Number(li.amount),
      endClientName: li.endClientName,
    })),
    recentEmails: invoice.emailLogs.map((el) => ({
      toEmail: el.toEmail,
      subject: el.subject,
      status: el.status,
      sentAt: el.sentAt,
    })),
    recentFollowUps: invoice.followUpLogs.map((fl) => ({
      level: fl.level,
      toEmail: fl.toEmail,
      subject: fl.subject,
      status: fl.status,
      sentAt: fl.sentAt,
    })),
  };
}

// Search/filter invoices
export async function searchInvoices(args: {
  customerName?: string;
  status?: string;
  billingEntity?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
}): Promise<InvoiceSearchResult[]> {
  const where: Record<string, unknown> = {};

  if (args.customerName) {
    where.customerName = { contains: args.customerName, mode: 'insensitive' };
  }
  if (args.status) {
    where.status = args.status.toUpperCase();
  }
  if (args.billingEntity) {
    where.company = { code: args.billingEntity };
  }
  if (args.dateFrom || args.dateTo) {
    where.statementDate = {
      ...(args.dateFrom && { gte: new Date(args.dateFrom) }),
      ...(args.dateTo && { lte: new Date(args.dateTo) }),
    };
  }

  const invoices = await prisma.invoice.findMany({
    where,
    include: { company: true },
    orderBy: { statementDate: 'desc' },
    take: args.limit || 20,
  });

  return invoices.map((inv) => ({
    id: inv.id,
    invoiceNo: inv.invoiceNo,
    billingNo: inv.billingNo,
    customerName: inv.customerName,
    statementDate: inv.statementDate,
    dueDate: inv.dueDate,
    netAmount: Number(inv.netAmount),
    status: inv.status,
    billingEntity: inv.company?.code || 'YOWI',
    paymentMethod: inv.paymentMethod,
    paidAt: inv.paidAt,
  }));
}

// Get audit trail and communication history for an invoice
export async function getInvoiceActivity(args: {
  invoiceId?: string;
  billingNo?: string;
}): Promise<InvoiceActivity | null> {
  let invoiceId = args.invoiceId;

  if (!invoiceId && args.billingNo) {
    const invoice = await prisma.invoice.findFirst({
      where: { billingNo: args.billingNo },
      select: { id: true, billingNo: true, customerName: true },
    });
    if (!invoice) return null;
    invoiceId = invoice.id;
  }

  if (!invoiceId) return null;

  const [invoice, auditLogs, emailLogs, followUpLogs] = await Promise.all([
    prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { id: true, billingNo: true, customerName: true },
    }),
    prisma.auditLog.findMany({
      where: { entityId: invoiceId, entityType: 'Invoice' },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    prisma.emailLog.findMany({
      where: { invoiceId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    prisma.followUpLog.findMany({
      where: { invoiceId },
      orderBy: { sentAt: 'desc' },
      take: 10,
    }),
  ]);

  if (!invoice) return null;

  return {
    invoiceId: invoice.id,
    billingNo: invoice.billingNo,
    customerName: invoice.customerName,
    auditLogs: auditLogs.map((al) => ({
      action: al.action,
      details: al.details,
      createdAt: al.createdAt,
      userName: al.user?.name || null,
    })),
    emailLogs: emailLogs.map((el) => ({
      toEmail: el.toEmail,
      subject: el.subject,
      status: el.status,
      sentAt: el.sentAt,
      error: el.error,
    })),
    followUpLogs: followUpLogs.map((fl) => ({
      level: fl.level,
      toEmail: fl.toEmail,
      subject: fl.subject,
      status: fl.status,
      sentAt: fl.sentAt,
      error: fl.error,
    })),
  };
}

// Get comprehensive client summary
export async function getClientSummary(customerName: string): Promise<ClientSummary | null> {
  const invoices = await prisma.invoice.findMany({
    where: { customerName: { contains: customerName, mode: 'insensitive' } },
  });

  if (invoices.length === 0) return null;

  const contracts = await prisma.contract.findMany({
    where: { companyName: { contains: customerName, mode: 'insensitive' } },
  });

  const totalBilled = invoices.reduce((sum, inv) => sum + Number(inv.netAmount), 0);
  const totalPaid = invoices
    .filter((inv) => inv.status === 'PAID')
    .reduce((sum, inv) => sum + Number(inv.paidAmount || inv.netAmount), 0);
  const outstandingBalance = invoices
    .filter((inv) => inv.status === 'SENT')
    .reduce((sum, inv) => sum + Number(inv.netAmount), 0);

  const statusBreakdown: Record<string, number> = {};
  for (const inv of invoices) {
    statusBreakdown[inv.status] = (statusBreakdown[inv.status] || 0) + 1;
  }

  const paymentMethods: Record<string, number> = {};
  for (const inv of invoices) {
    if (inv.status === 'PAID' && inv.paymentMethod) {
      paymentMethods[inv.paymentMethod] = (paymentMethods[inv.paymentMethod] || 0) + 1;
    }
  }

  return {
    customerName: invoices[0].customerName,
    totalInvoices: invoices.length,
    totalBilled,
    totalPaid,
    outstandingBalance,
    statusBreakdown,
    activeContracts: contracts.map((c) => ({
      productType: c.productType,
      monthlyFee: Number(c.monthlyFee),
      status: c.status,
    })),
    paymentMethods,
  };
}

// Get accounts receivable aging report
export async function getAgingReport(billingEntity?: string): Promise<AgingReport> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const sentInvoices = await prisma.invoice.findMany({
    where: {
      status: 'SENT',
      ...(billingEntity && { company: { code: billingEntity } }),
    },
    include: { company: true },
  });

  const buckets = {
    current: { count: 0, amount: 0 },
    days1to30: { count: 0, amount: 0 },
    days31to60: { count: 0, amount: 0 },
    days61to90: { count: 0, amount: 0 },
    days90plus: { count: 0, amount: 0 },
  };

  for (const inv of sentInvoices) {
    const dueDate = new Date(inv.dueDate);
    dueDate.setHours(0, 0, 0, 0);
    const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
    const amount = Number(inv.netAmount);

    if (daysOverdue <= 0) {
      buckets.current.count++;
      buckets.current.amount += amount;
    } else if (daysOverdue <= 30) {
      buckets.days1to30.count++;
      buckets.days1to30.amount += amount;
    } else if (daysOverdue <= 60) {
      buckets.days31to60.count++;
      buckets.days31to60.amount += amount;
    } else if (daysOverdue <= 90) {
      buckets.days61to90.count++;
      buckets.days61to90.amount += amount;
    } else {
      buckets.days90plus.count++;
      buckets.days90plus.amount += amount;
    }
  }

  const totalOutstanding = sentInvoices.reduce((sum, inv) => sum + Number(inv.netAmount), 0);

  // Collection rate
  const [paidCount, sentCount] = await Promise.all([
    prisma.invoice.count({
      where: { status: 'PAID', ...(billingEntity && { company: { code: billingEntity } }) },
    }),
    prisma.invoice.count({
      where: { status: 'SENT', ...(billingEntity && { company: { code: billingEntity } }) },
    }),
  ]);
  const collectionRate = paidCount + sentCount > 0 ? paidCount / (paidCount + sentCount) : 0;

  // Payment method breakdown from paid invoices
  const paidInvoices = await prisma.invoice.findMany({
    where: {
      status: 'PAID',
      ...(billingEntity && { company: { code: billingEntity } }),
    },
    select: { paymentMethod: true, paidAmount: true, netAmount: true },
  });

  const paymentMethodBreakdown: Record<string, { count: number; amount: number }> = {};
  for (const inv of paidInvoices) {
    const method = inv.paymentMethod || 'Unknown';
    if (!paymentMethodBreakdown[method]) {
      paymentMethodBreakdown[method] = { count: 0, amount: 0 };
    }
    paymentMethodBreakdown[method].count++;
    paymentMethodBreakdown[method].amount += Number(inv.paidAmount || inv.netAmount);
  }

  return {
    ...buckets,
    totalOutstanding,
    collectionRate,
    paymentMethodBreakdown,
    billingEntity: billingEntity || 'ALL',
  };
}

// Get monthly revenue trends
export async function getRevenueTrends(months: number = 6, billingEntity?: string): Promise<RevenueTrend[]> {
  const now = new Date();
  const startDate = startOfMonth(subMonths(now, months - 1));

  const invoices = await prisma.invoice.findMany({
    where: {
      statementDate: { gte: startDate },
      status: { notIn: ['VOID', 'CANCELLED'] },
      ...(billingEntity && { company: { code: billingEntity } }),
    },
    select: {
      statementDate: true,
      netAmount: true,
      status: true,
      paidAmount: true,
    },
  });

  // Group by month
  const monthMap = new Map<string, { invoiceCount: number; totalBilled: number; totalPaid: number; totalOutstanding: number }>();

  // Initialize all months
  for (let i = 0; i < months; i++) {
    const monthDate = subMonths(now, months - 1 - i);
    const key = format(monthDate, 'yyyy-MM');
    monthMap.set(key, { invoiceCount: 0, totalBilled: 0, totalPaid: 0, totalOutstanding: 0 });
  }

  for (const inv of invoices) {
    const key = format(inv.statementDate, 'yyyy-MM');
    const bucket = monthMap.get(key);
    if (!bucket) continue;

    bucket.invoiceCount++;
    bucket.totalBilled += Number(inv.netAmount);
    if (inv.status === 'PAID') {
      bucket.totalPaid += Number(inv.paidAmount || inv.netAmount);
    }
    if (inv.status === 'SENT') {
      bucket.totalOutstanding += Number(inv.netAmount);
    }
  }

  const result: RevenueTrend[] = [];
  let prevBilled: number | null = null;

  for (const [month, data] of monthMap) {
    const growthPercent = prevBilled !== null && prevBilled > 0
      ? ((data.totalBilled - prevBilled) / prevBilled) * 100
      : null;

    result.push({
      month,
      ...data,
      growthPercent: growthPercent !== null ? Math.round(growthPercent * 100) / 100 : null,
    });

    prevBilled = data.totalBilled;
  }

  return result;
}

// Tool definitions for Claude API
export const chatToolDefinitions = [
  {
    name: 'get_contracts_due_soon',
    description: 'Get contracts with billing dates coming up within the specified number of days. Use this when users ask about upcoming billings, contracts due soon, or who needs to be billed this week.',
    input_schema: {
      type: 'object' as const,
      properties: {
        days: {
          type: 'number',
          description: 'Number of days to look ahead (default: 7)',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_contract_details',
    description: 'Get detailed information about a specific contract by company name. Use this when users ask about a specific client or contract.',
    input_schema: {
      type: 'object' as const,
      properties: {
        companyName: {
          type: 'string',
          description: 'Company name to search for (partial match supported)',
        },
      },
      required: ['companyName'],
    },
  },
  {
    name: 'get_invoice_stats',
    description: 'Get dashboard statistics including counts and totals for pending, approved, rejected, sent, and paid invoices. Use this when users ask about overall status, stats, or totals.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_pending_invoices',
    description: 'Get list of invoices that are pending approval. Use this when users ask about pending invoices or what needs approval.',
    input_schema: {
      type: 'object' as const,
      properties: {
        billingEntity: {
          type: 'string',
          description: 'Filter by billing entity code (YOWI or ABBA)',
          enum: ['YOWI', 'ABBA'],
        },
      },
      required: [],
    },
  },
  {
    name: 'get_overdue_invoices',
    description: 'Get list of invoices that are past their due date but not yet paid. Use this when users ask about overdue accounts or late payments.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'search_contracts',
    description: 'Search contracts by company name or product type. Use this when users want to find or look up contracts.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'Search query (matches company name or product type)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_billing_totals',
    description: 'Get billing totals and summary for a billing entity and/or time period. Use this when users ask about totals, revenue, or billing summaries.',
    input_schema: {
      type: 'object' as const,
      properties: {
        entity: {
          type: 'string',
          description: 'Billing entity code (YOWI or ABBA)',
          enum: ['YOWI', 'ABBA'],
        },
        month: {
          type: 'string',
          description: 'Month in YYYY-MM format (e.g., 2026-01)',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_invoice_details',
    description: 'Get full details for a specific invoice including line items, email logs, and follow-up logs. Use when users ask about a specific invoice by billing number, invoice number, or ID.',
    input_schema: {
      type: 'object' as const,
      properties: {
        billingNo: {
          type: 'string',
          description: 'Billing number (e.g., YOWI-2026-042)',
        },
        invoiceNo: {
          type: 'string',
          description: 'Invoice number',
        },
        invoiceId: {
          type: 'string',
          description: 'Invoice ID',
        },
      },
      required: [],
    },
  },
  {
    name: 'search_invoices',
    description: 'Search and filter invoices by customer name, status, billing entity, or date range. Use when users want to see invoice history for a client, filter invoices, or list invoices matching criteria.',
    input_schema: {
      type: 'object' as const,
      properties: {
        customerName: {
          type: 'string',
          description: 'Customer name to search for (partial match)',
        },
        status: {
          type: 'string',
          description: 'Invoice status filter',
          enum: ['PENDING', 'APPROVED', 'REJECTED', 'SENT', 'PAID', 'CANCELLED', 'VOID'],
        },
        billingEntity: {
          type: 'string',
          description: 'Billing entity code',
          enum: ['YOWI', 'ABBA'],
        },
        dateFrom: {
          type: 'string',
          description: 'Start date (YYYY-MM-DD)',
        },
        dateTo: {
          type: 'string',
          description: 'End date (YYYY-MM-DD)',
        },
        limit: {
          type: 'number',
          description: 'Max results to return (default 20)',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_invoice_activity',
    description: 'Get the audit trail and communication history for an invoice, including audit logs, email logs, and follow-up logs. Use when users ask about what happened to an invoice, its history, or communication trail.',
    input_schema: {
      type: 'object' as const,
      properties: {
        invoiceId: {
          type: 'string',
          description: 'Invoice ID',
        },
        billingNo: {
          type: 'string',
          description: 'Billing number (e.g., YOWI-2026-042)',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_client_summary',
    description: 'Get a comprehensive client overview including outstanding balance, total billed/paid, invoice counts by status, active contracts, and payment method breakdown. Use when users ask how much a client owes, their billing history, or want a client overview.',
    input_schema: {
      type: 'object' as const,
      properties: {
        customerName: {
          type: 'string',
          description: 'Customer name to look up (partial match)',
        },
      },
      required: ['customerName'],
    },
  },
  {
    name: 'get_aging_report',
    description: 'Get accounts receivable aging report with overdue buckets (current, 1-30, 31-60, 61-90, 90+ days), collection rate, and payment method breakdown. Use when users ask about aging, overdue analysis, collection rates, or payment method stats.',
    input_schema: {
      type: 'object' as const,
      properties: {
        billingEntity: {
          type: 'string',
          description: 'Filter by billing entity code',
          enum: ['YOWI', 'ABBA'],
        },
      },
      required: [],
    },
  },
  {
    name: 'get_revenue_trends',
    description: 'Get monthly revenue comparison over N months including invoice count, total billed, total paid, outstanding, and month-over-month growth percentage. Use when users ask about revenue trends, monthly comparisons, or growth.',
    input_schema: {
      type: 'object' as const,
      properties: {
        months: {
          type: 'number',
          description: 'Number of months to look back (default 6)',
        },
        billingEntity: {
          type: 'string',
          description: 'Filter by billing entity code',
          enum: ['YOWI', 'ABBA'],
        },
      },
      required: [],
    },
  },
];

// Execute a tool by name
export async function executeTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (toolName) {
    case 'get_contracts_due_soon':
      return getContractsDueSoon(args.days as number | undefined);
    case 'get_contract_details':
      return getContractDetails(args.companyName as string);
    case 'get_invoice_stats':
      return getInvoiceStats();
    case 'get_pending_invoices':
      return getPendingInvoices(args.billingEntity as string | undefined);
    case 'get_overdue_invoices':
      return getOverdueInvoices();
    case 'search_contracts':
      return searchContracts(args.query as string);
    case 'get_billing_totals':
      return getBillingTotals(
        args.entity as string | undefined,
        args.month as string | undefined
      );
    case 'get_invoice_details':
      return getInvoiceDetails({
        billingNo: args.billingNo as string | undefined,
        invoiceNo: args.invoiceNo as string | undefined,
        invoiceId: args.invoiceId as string | undefined,
      });
    case 'search_invoices':
      return searchInvoices({
        customerName: args.customerName as string | undefined,
        status: args.status as string | undefined,
        billingEntity: args.billingEntity as string | undefined,
        dateFrom: args.dateFrom as string | undefined,
        dateTo: args.dateTo as string | undefined,
        limit: args.limit as number | undefined,
      });
    case 'get_invoice_activity':
      return getInvoiceActivity({
        invoiceId: args.invoiceId as string | undefined,
        billingNo: args.billingNo as string | undefined,
      });
    case 'get_client_summary':
      return getClientSummary(args.customerName as string);
    case 'get_aging_report':
      return getAgingReport(args.billingEntity as string | undefined);
    case 'get_revenue_trends':
      return getRevenueTrends(
        args.months as number | undefined,
        args.billingEntity as string | undefined
      );
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}
