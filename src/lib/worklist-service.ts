import prisma from '@/lib/prisma';
import {
  OPEN_INVOICE_STATUSES,
  dateToDay,
  itemAmounts,
  onDayWhere,
  summarizeClient,
  buildSuggestions,
  contractNameIndex,
  normalizeName,
  type ClientSummary,
  type OpenInvoiceInput,
  type SuggestInvoiceInput,
  type WorklistStatusKey,
} from '@/lib/worklist';

const invoiceSelect = {
  id: true,
  billingNo: true,
  customerName: true,
  dueDate: true,
  netAmount: true,
  balanceDue: true,
  amountPaidTotal: true,
  lastFollowUpAt: true,
  lastFollowUpLevel: true,
  contracts: { select: { id: true, companyName: true } },
  promises: { where: { status: 'OPEN' as const }, select: { promisedDate: true, promisedAmount: true } },
  pdcChecks: {
    where: { status: { in: ['WAREHOUSED' as const, 'DEPOSITED' as const] } },
    select: { checkDate: true, amount: true },
  },
};

type InvoiceRow = {
  id: string;
  billingNo: string | null;
  customerName: string;
  dueDate: Date;
  netAmount: unknown;
  balanceDue: unknown;
  amountPaidTotal: unknown;
  lastFollowUpAt: Date | null;
  lastFollowUpLevel: number;
  contracts: { id: string; companyName: string }[];
  promises: { promisedDate: Date; promisedAmount: unknown }[];
  pdcChecks: { checkDate: Date; amount: unknown }[];
};

const num = (v: unknown) => (v == null ? null : Number(v));

function toInput(r: InvoiceRow): SuggestInvoiceInput {
  return {
    id: r.id,
    billingNo: r.billingNo,
    customerName: r.customerName,
    dueDate: r.dueDate,
    netAmount: Number(r.netAmount),
    balanceDue: num(r.balanceDue),
    amountPaidTotal: Number(r.amountPaidTotal ?? 0),
    lastFollowUpAt: r.lastFollowUpAt,
    lastFollowUpLevel: r.lastFollowUpLevel,
    contractIds: r.contracts.map((c) => c.id),
    contracts: r.contracts,
    openPromises: r.promises.map((p) => ({ promisedDate: p.promisedDate, promisedAmount: num(p.promisedAmount) })),
    pendingPdcs: r.pdcChecks.map((c) => ({ checkDate: c.checkDate, amount: Number(c.amount) })),
  };
}

/** Case-insensitive exact match on any of these company names. */
const nameMatch = (field: 'companyName' | 'customerName', names: string[]) =>
  names.map((n) => ({ [field]: { equals: n, mode: 'insensitive' as const } }));

/**
 * Open invoices for these clients, summarised per listed contract. A client is
 * every contract under the same company name, plus invoices in that name that
 * were never linked to any contract.
 */
export async function clientSummaries(
  contracts: { id: string; companyName: string }[],
  today: string
): Promise<Map<string, ClientSummary>> {
  const out = new Map<string, ClientSummary>();
  if (contracts.length === 0) return out;
  const names = [...new Set(contracts.map((c) => c.companyName.trim()))];
  const keys = new Set(names.map(normalizeName));

  const siblings = await prisma.contract.findMany({
    where: { OR: nameMatch('companyName', names) },
    select: { id: true },
  });
  const rows = (await prisma.invoice.findMany({
    where: {
      status: { in: [...OPEN_INVOICE_STATUSES] },
      OR: [
        { contracts: { some: { id: { in: [...new Set([...contracts.map((c) => c.id), ...siblings.map((c) => c.id)])] } } } },
        { contracts: { none: {} }, OR: nameMatch('customerName', names) },
      ],
    },
    select: invoiceSelect,
  })) as unknown as InvoiceRow[];

  const grouped = new Map<string, OpenInvoiceInput[]>();
  for (const r of rows) {
    const input = toInput(r);
    const owners = input.contracts.length
      ? new Set(input.contracts.map((c) => normalizeName(c.companyName)))
      : new Set([normalizeName(input.customerName)]);
    for (const k of owners) {
      if (!keys.has(k)) continue;
      const list = grouped.get(k) ?? [];
      list.push(input);
      grouped.set(k, list);
    }
  }
  const byKey = new Map<string, ClientSummary>();
  for (const k of keys) byKey.set(k, summarizeClient(grouped.get(k) ?? [], today));
  for (const c of contracts) out.set(c.id, byKey.get(normalizeName(c.companyName))!);
  return out;
}

/** Everything the Worklist page shows for one day. */
export async function getWorklistDay(day: string, today: string) {
  // Batched into one pooled round-trip (prod runs connection_limit=1).
  const [items, users] = await prisma.$transaction([
    prisma.worklistItem.findMany({
      where: onDayWhere(day),
      orderBy: [{ createdAt: 'asc' }],
      include: {
        contract: { select: { id: true, companyName: true, customerNumber: true, status: true } },
        owner: { select: { id: true, name: true, email: true } },
        notes: {
          orderBy: { createdAt: 'asc' },
          include: { author: { select: { id: true, name: true, email: true } } },
        },
      },
    }),
    prisma.user.findMany({
      select: { id: true, name: true, email: true },
      orderBy: [{ name: 'asc' }, { email: 'asc' }],
    }),
  ]);

  const clients = new Map<string, { id: string; companyName: string }>();
  for (const i of items) if (i.contract) clients.set(i.contract.id, i.contract);
  const summaries = await clientSummaries([...clients.values()], today);

  return {
    users: users.map((u) => ({ id: u.id, name: u.name || u.email })),
    items: items.map((i) => {
      const client = i.contractId ? summaries.get(i.contractId) ?? null : null;
      const targetAmount = num(i.targetAmount);
      const uninvoicedAmount = Number(i.uninvoicedAmount);
      return {
        id: i.id,
        startDate: dateToDay(i.startDate),
        doneDate: i.doneDate ? dateToDay(i.doneDate) : null,
        status: i.status as WorklistStatusKey,
        title: i.title,
        createdById: i.createdById,
        contract: i.contract,
        owner: { id: i.owner.id, name: i.owner.name || i.owner.email },
        targetAmount,
        uninvoicedAmount,
        amounts: itemAmounts({ targetAmount, uninvoicedAmount }, client?.openBalance ?? null),
        client,
        notes: i.notes.map((n) => ({
          id: n.id,
          kind: n.kind,
          body: n.body,
          createdAt: n.createdAt.toISOString(),
          author: n.author.name || n.author.email,
        })),
      };
    }),
  };
}

export type WorklistDay = Awaited<ReturnType<typeof getWorklistDay>>;
export type WorklistItemView = WorklistDay['items'][number];

/** Clients to suggest for a day, leaving out those already on it. */
export async function getSuggestions(day: string, today: string) {
  const [rows, onList, contracts] = await prisma.$transaction([
    prisma.invoice.findMany({
      where: { status: { in: [...OPEN_INVOICE_STATUSES] } },
      select: invoiceSelect,
    }),
    prisma.worklistItem.findMany({
      where: { ...onDayWhere(day), contractId: { not: null } },
      select: { contract: { select: { companyName: true } } },
    }),
    // ACTIVE first, so an active contract represents a client with several.
    prisma.contract.findMany({
      select: { id: true, companyName: true, status: true },
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
    }),
  ]);
  const exclude = new Set(onList.map((i) => normalizeName(i.contract?.companyName ?? '')));
  const ordered = [...contracts.filter((c) => c.status === 'ACTIVE'), ...contracts.filter((c) => c.status !== 'ACTIVE')];
  return buildSuggestions(
    (rows as unknown as InvoiceRow[]).map(toInput),
    today,
    exclude,
    contractNameIndex(ordered)
  );
}

/** Whether a client (any contract under this company name) is already on the day. */
export async function clientOnDay(companyName: string, day: string) {
  return prisma.worklistItem.findFirst({
    where: { ...onDayWhere(day), contract: { companyName: { equals: companyName.trim(), mode: 'insensitive' } } },
    select: { id: true },
  });
}

/**
 * Client search for the add box: one row per company name, since a client's
 * contracts are worked together. ACTIVE contracts represent the name.
 */
export async function searchClients(q: string) {
  const term = q.trim();
  const rows = await prisma.contract.findMany({
    where: {
      OR: [
        { companyName: { contains: term, mode: 'insensitive' } },
        { customerNumber: { contains: term, mode: 'insensitive' } },
      ],
    },
    select: {
      id: true,
      companyName: true,
      customerNumber: true,
      status: true,
      billingEntity: { select: { code: true } },
    },
    orderBy: [{ companyName: 'asc' }],
    take: 60,
  });
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = normalizeName(r.companyName);
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  return [...groups.values()].slice(0, 15).map((g) => {
    const lead = g.find((r) => r.status === 'ACTIVE') ?? g[0];
    return {
      id: lead.id,
      companyName: lead.companyName,
      customerNumber: lead.customerNumber,
      status: lead.status,
      entity: [...new Set(g.map((r) => r.billingEntity?.code).filter(Boolean))].join(', ') || null,
      contractCount: g.length,
    };
  });
}
