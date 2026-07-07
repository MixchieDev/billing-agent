/**
 * Server-side data fetchers for use in Server Components.
 *
 * These return data shaped to match what the corresponding /api endpoints
 * return, so client components that already process the API response can
 * accept this as a `fallbackData` / `initialData` prop without rework.
 *
 * IMPORTANT: convert Prisma Decimal/Date into JSON-safe primitives before
 * crossing the server→client boundary; React's serializer is strict.
 */

import prisma from './prisma';
import { InvoiceStatus } from '@/generated/prisma';

const DEFAULT_PAGE_SIZE = 50;

/**
 * Shape returned by /api/invoices — matches the existing API exactly so
 * client transforms (`Number(inv.serviceFee)`, `new Date(inv.dueDate)`,
 * etc.) work identically.
 */
export interface InvoiceListResponse {
  invoices: Array<Record<string, unknown>>;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface FetchInvoicesOptions {
  status?: InvoiceStatus;
  paidFrom?: string;
  paidTo?: string;
  page?: number;
  limit?: number;
}

export async function fetchInvoicesForServer(
  opts: FetchInvoicesOptions = {}
): Promise<InvoiceListResponse> {
  const page = opts.page ?? 1;
  const limit = opts.limit ?? DEFAULT_PAGE_SIZE;
  const skip = (page - 1) * limit;

  const paidAtFilter: { gte?: Date; lte?: Date } = {};
  if (opts.paidFrom) paidAtFilter.gte = new Date(opts.paidFrom);
  if (opts.paidTo) {
    const endDate = new Date(opts.paidTo);
    endDate.setHours(23, 59, 59, 999);
    paidAtFilter.lte = endDate;
  }

  const where = {
    ...(opts.status && { status: opts.status }),
    ...(Object.keys(paidAtFilter).length > 0 && { paidAt: paidAtFilter }),
  };

  // Batched via prisma.$transaction([...]): both queries run over a single
  // pooled connection in one round-trip — safe at connection_limit=1 and
  // faster than two sequential awaits.
  const [invoices, total] = await prisma.$transaction([
    prisma.invoice.findMany({
      where,
      select: {
        id: true,
        billingNo: true,
        customerName: true,
        customerEmail: true,
        customerEmails: true,
        serviceFee: true,
        vatAmount: true,
        netAmount: true,
        dueDate: true,
        createdAt: true,
        billingModel: true,
        productType: true,
        status: true,
        paidAt: true,
        paidAmount: true,
        paymentMethod: true,
        paymentReference: true,
        followUpEnabled: true,
        followUpCount: true,
        lastFollowUpLevel: true,
        company: { select: { code: true } },
        lineItems: { select: { description: true }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.invoice.count({ where }),
  ]);

  // Serialize Decimal/Date so the server→client boundary is JSON-safe.
  const serialized = invoices.map((inv) => ({
    ...inv,
    serviceFee: inv.serviceFee.toString(),
    vatAmount: inv.vatAmount.toString(),
    netAmount: inv.netAmount.toString(),
    paidAmount: inv.paidAmount ? inv.paidAmount.toString() : null,
    dueDate: inv.dueDate.toISOString(),
    createdAt: inv.createdAt.toISOString(),
    paidAt: inv.paidAt ? inv.paidAt.toISOString() : null,
  }));

  return {
    invoices: serialized,
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

/**
 * Shape returned by /api/stats — matches existing API.
 */
export interface InvoiceStats {
  pending: number;
  approved: number;
  rejected: number;
  sent: number;
  totalPendingAmount: number;
  totalApprovedAmount: number;
}

export async function fetchInvoiceStatsForServer(): Promise<InvoiceStats> {
  const statsByStatus = await prisma.invoice.groupBy({
    by: ['status'],
    _count: true,
    _sum: { netAmount: true },
  });

  const statsMap = new Map(
    statsByStatus.map((s) => [
      s.status,
      { count: s._count, sum: Number(s._sum.netAmount || 0) },
    ])
  );

  return {
    pending: statsMap.get(InvoiceStatus.PENDING)?.count || 0,
    approved: statsMap.get(InvoiceStatus.APPROVED)?.count || 0,
    rejected: statsMap.get(InvoiceStatus.REJECTED)?.count || 0,
    sent: statsMap.get(InvoiceStatus.SENT)?.count || 0,
    totalPendingAmount: statsMap.get(InvoiceStatus.PENDING)?.sum || 0,
    totalApprovedAmount: statsMap.get(InvoiceStatus.APPROVED)?.sum || 0,
  };
}

/**
 * Shape returned by /api/partners — matches existing API.
 */
export async function fetchPartnersForServer() {
  const partners = await prisma.partner.findMany({
    include: {
      company: true,
      emailTemplate: {
        select: { id: true, name: true, isDefault: true },
      },
    },
    orderBy: { code: 'asc' },
  });

  // Partners have no Decimal fields; Date fields serialize to ISO automatically
  // when passed through React Server Components, but stringify explicitly to
  // be safe with the createdAt/updatedAt columns.
  return partners.map((p) => ({
    ...p,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    company: {
      ...p.company,
      createdAt: p.company.createdAt.toISOString(),
      updatedAt: p.company.updatedAt.toISOString(),
    },
  }));
}

export async function fetchCompaniesForServer() {
  const companies = await prisma.company.findMany({
    orderBy: { code: 'asc' },
  });
  return companies.map((c) => ({
    ...c,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }));
}

export async function fetchEmailTemplatesForServer() {
  const templates = await prisma.emailTemplate.findMany({
    orderBy: { name: 'asc' },
  });
  return templates.map((t) => ({
    ...t,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  }));
}
