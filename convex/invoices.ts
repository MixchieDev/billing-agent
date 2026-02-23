import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const getById = query({
  args: { id: v.id("invoices") },
  handler: async (ctx, args) => ctx.db.get(args.id),
});

export const getByIdFull = query({
  args: { id: v.id("invoices") },
  handler: async (ctx, args) => {
    const invoice = await ctx.db.get(args.id);
    if (!invoice) return null;
    const company = await ctx.db.get(invoice.companyId);
    const partner = invoice.partnerId ? await ctx.db.get(invoice.partnerId) : null;
    const lineItems = await ctx.db.query("invoiceLineItems").withIndex("by_invoiceId", q => q.eq("invoiceId", args.id)).collect();
    const attachments = await ctx.db.query("invoiceAttachments").withIndex("by_invoiceId", q => q.eq("invoiceId", args.id)).collect();
    const approvedBy = invoice.approvedById ? await ctx.db.get(invoice.approvedById) : null;
    const rejectedBy = invoice.rejectedById ? await ctx.db.get(invoice.rejectedById) : null;
    const contractLinks = await ctx.db.query("contractInvoices").withIndex("by_invoiceId", q => q.eq("invoiceId", args.id)).collect();
    const contracts = await Promise.all(contractLinks.map(async (l) => ctx.db.get(l.contractId)));
    const hydratedLineItems = await Promise.all(lineItems.map(async (li) => {
      const contract = li.contractId ? await ctx.db.get(li.contractId) : null;
      return { ...li, contract };
    }));
    return { ...invoice, company, partner, lineItems: hydratedLineItems, attachments, approvedBy, rejectedBy, contracts: contracts.filter(Boolean) };
  },
});

export const list = query({
  args: { status: v.optional(v.string()), companyId: v.optional(v.id("companies")), partnerId: v.optional(v.id("partners")), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    let results;
    if (args.status && args.companyId) {
      results = await ctx.db.query("invoices").withIndex("by_companyId_status", q => q.eq("companyId", args.companyId!).eq("status", args.status as any)).collect();
    } else if (args.status) {
      results = await ctx.db.query("invoices").withIndex("by_status", q => q.eq("status", args.status as any)).collect();
    } else if (args.companyId) {
      results = await ctx.db.query("invoices").withIndex("by_companyId", q => q.eq("companyId", args.companyId!)).collect();
    } else {
      results = await ctx.db.query("invoices").order("desc").collect();
    }
    if (args.partnerId) results = results.filter(inv => inv.partnerId === args.partnerId);
    if (args.limit) results = results.slice(0, args.limit);
    return Promise.all(results.map(async (inv) => {
      const company = await ctx.db.get(inv.companyId);
      return { ...inv, company };
    }));
  },
});

export const count = query({
  args: { status: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const results = args.status
      ? await ctx.db.query("invoices").withIndex("by_status", idx => idx.eq("status", args.status as any)).collect()
      : await ctx.db.query("invoices").collect();
    return results.length;
  },
});

export const statsByStatus = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("invoices").collect();
    const stats: Record<string, { count: number; sum: number }> = {};
    for (const inv of all) {
      if (!stats[inv.status]) stats[inv.status] = { count: 0, sum: 0 };
      stats[inv.status].count++;
      stats[inv.status].sum += inv.netAmount;
    }
    return stats;
  },
});

export const create = mutation({
  args: { data: v.any() },
  handler: async (ctx, args) => {
    const now = Date.now();
    const { lineItems, contractId, ...invoiceData } = args.data;
    const invoiceId = await ctx.db.insert("invoices", { ...invoiceData, createdAt: now, updatedAt: now });
    if (lineItems && Array.isArray(lineItems)) {
      for (const li of lineItems) {
        await ctx.db.insert("invoiceLineItems", { ...li, invoiceId, createdAt: now, updatedAt: now });
      }
    }
    if (contractId) {
      await ctx.db.insert("contractInvoices", { contractId, invoiceId });
    }
    return invoiceId;
  },
});

export const update = mutation({
  args: { id: v.id("invoices"), data: v.any() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { ...args.data, updatedAt: Date.now() });
    return ctx.db.get(args.id);
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("invoices"), status: v.string(),
    approvedById: v.optional(v.id("users")), rejectedById: v.optional(v.id("users")),
    rejectionReason: v.optional(v.string()), rescheduleDate: v.optional(v.number()),
    voidReason: v.optional(v.string()), voidedById: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const updates: any = { status: args.status, updatedAt: now };
    if (args.status === "APPROVED") { updates.approvedById = args.approvedById; updates.approvedAt = now; }
    else if (args.status === "REJECTED") { updates.rejectedById = args.rejectedById; updates.rejectedAt = now; if (args.rejectionReason) updates.rejectionReason = args.rejectionReason; if (args.rescheduleDate) updates.rescheduleDate = args.rescheduleDate; }
    else if (args.status === "VOID") { updates.voidedById = args.voidedById; updates.voidedAt = now; if (args.voidReason) updates.voidReason = args.voidReason; }
    await ctx.db.patch(args.id, updates);
    return ctx.db.get(args.id);
  },
});

export const bulkUpdateStatus = mutation({
  args: { ids: v.array(v.id("invoices")), status: v.string(), approvedById: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const now = Date.now();
    let updated = 0;
    for (const id of args.ids) {
      const inv = await ctx.db.get(id);
      if (inv && inv.status === "PENDING") {
        const updates: any = { status: args.status, updatedAt: now };
        if (args.status === "APPROVED" && args.approvedById) { updates.approvedById = args.approvedById; updates.approvedAt = now; }
        await ctx.db.patch(id, updates);
        updated++;
      }
    }
    return { count: updated };
  },
});

export const remove = mutation({
  args: { id: v.id("invoices") },
  handler: async (ctx, args) => {
    for (const li of await ctx.db.query("invoiceLineItems").withIndex("by_invoiceId", q => q.eq("invoiceId", args.id)).collect()) await ctx.db.delete(li._id);
    for (const att of await ctx.db.query("invoiceAttachments").withIndex("by_invoiceId", q => q.eq("invoiceId", args.id)).collect()) await ctx.db.delete(att._id);
    for (const link of await ctx.db.query("contractInvoices").withIndex("by_invoiceId", q => q.eq("invoiceId", args.id)).collect()) await ctx.db.delete(link._id);
    for (const log of await ctx.db.query("emailLogs").withIndex("by_invoiceId", q => q.eq("invoiceId", args.id)).collect()) await ctx.db.delete(log._id);
    await ctx.db.delete(args.id);
  },
});
