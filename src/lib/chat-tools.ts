import prisma from '@/lib/prisma';
import { format, startOfMonth, endOfMonth, addDays } from 'date-fns';

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
    name: 'query_crm',
    description: 'Query the CRM (Nexus) system for leads, agreements, contacts, or companies. Use this when users ask about CRM data, sales pipeline, agreements, or client contact information.',
    input_schema: {
      type: 'object' as const,
      properties: {
        entity: {
          type: 'string',
          description: 'What to query',
          enum: ['leads', 'agreements', 'contacts', 'companies', 'products'],
        },
        searchTerm: {
          type: 'string',
          description: 'Search term to filter results (optional)',
        },
      },
      required: ['entity'],
    },
  },
  {
    name: 'query_smart_support',
    description: 'Query the Smart Support system for client issues and support tickets. Use this when users ask about support issues, tickets, or client problems.',
    input_schema: {
      type: 'object' as const,
      properties: {
        entity: {
          type: 'string',
          description: 'What to query',
          enum: ['issues', 'clients', 'products'],
        },
        searchTerm: {
          type: 'string',
          description: 'Search term to filter results (optional)',
        },
      },
      required: ['entity'],
    },
  },
];

// Cross-system query tools
async function queryCrmNexus(entity: string, searchTerm?: string): Promise<unknown> {
  const { getNexusBridgeHeaders, getNexusConvexUrl } = await import('./bridge-auth');
  const headers = getNexusBridgeHeaders();
  const url = getNexusConvexUrl('/bridge/query');

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ entity, searchTerm, organizationId: process.env.NEXUS_ORGANIZATION_ID || '' }),
  });

  if (!response.ok) return { error: `CRM returned ${response.status}` };
  return response.json();
}

async function querySmartSupport(entity: string, searchTerm?: string): Promise<unknown> {
  const ssUrl = process.env.SMART_SUPPORT_CONVEX_URL;
  const ssKey = process.env.SMART_SUPPORT_BRIDGE_API_KEY;
  if (!ssUrl || !ssKey) return { error: 'Smart Support not configured' };

  const response = await fetch(`${ssUrl}/bridge/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ssKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ entity, searchTerm }),
  });

  if (!response.ok) return { error: `Smart Support returned ${response.status}` };
  return response.json();
}

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
    case 'query_crm':
      return queryCrmNexus(args.entity as string, args.searchTerm as string | undefined);
    case 'query_smart_support':
      return querySmartSupport(args.entity as string, args.searchTerm as string | undefined);
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}
