import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const getById = query({
  args: { id: v.id("contracts") },
  handler: async (ctx, args) => {
    const contract = await ctx.db.get(args.id);
    if (!contract) return null;
    const partner = contract.partnerId ? await ctx.db.get(contract.partnerId) : null;
    const billingEntity = await ctx.db.get(contract.billingEntityId);
    return { ...contract, partner, billingEntity };
  },
});

export const list = query({
  args: { status: v.optional(v.string()), billingEntityId: v.optional(v.id("companies")), partnerId: v.optional(v.id("partners")) },
  handler: async (ctx, args) => {
    let results;
    if (args.status) {
      results = await ctx.db.query("contracts").withIndex("by_status", idx => idx.eq("status", args.status as any)).collect();
    } else {
      results = await ctx.db.query("contracts").collect();
    }
    if (args.billingEntityId) results = results.filter(c => c.billingEntityId === args.billingEntityId);
    if (args.partnerId) results = results.filter(c => c.partnerId === args.partnerId);
    return Promise.all(results.map(async (c) => {
      const partner = c.partnerId ? await ctx.db.get(c.partnerId) : null;
      const billingEntity = await ctx.db.get(c.billingEntityId);
      return { ...c, partner, billingEntity };
    }));
  },
});

export const count = query({
  args: { status: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const results = args.status
      ? await ctx.db.query("contracts").withIndex("by_status", idx => idx.eq("status", args.status as any)).collect()
      : await ctx.db.query("contracts").collect();
    return results.length;
  },
});

export const countByPartnerId = query({
  args: { partnerId: v.id("partners") },
  handler: async (ctx, args) => {
    const results = await ctx.db.query("contracts").filter(q => q.eq(q.field("partnerId"), args.partnerId)).collect();
    return results.length;
  },
});

export const create = mutation({
  args: { data: v.any() },
  handler: async (ctx, args) => {
    const now = Date.now();
    const d = args.data;
    return ctx.db.insert("contracts", {
      ...d, productType: d.productType ?? "ACCOUNTING", daysOverdue: d.daysOverdue ?? 0,
      status: d.status ?? "NOT_STARTED", vatType: d.vatType ?? "VAT", billingType: d.billingType ?? "RECURRING",
      autoSendEnabled: d.autoSendEnabled ?? true, autoApprove: d.autoApprove ?? false, monthlyFee: d.monthlyFee ?? 0,
      createdAt: now, updatedAt: now,
    });
  },
});

export const update = mutation({
  args: { id: v.id("contracts"), data: v.any() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { ...args.data, updatedAt: Date.now() });
    return ctx.db.get(args.id);
  },
});

export const updateNextDueDate = mutation({
  args: { id: v.id("contracts"), nextDueDate: v.number() },
  handler: async (ctx, args) => { await ctx.db.patch(args.id, { nextDueDate: args.nextDueDate, updatedAt: Date.now() }); },
});

export const remove = mutation({
  args: { id: v.id("contracts") },
  handler: async (ctx, args) => {
    const links = await ctx.db.query("contractInvoices").withIndex("by_contractId", q => q.eq("contractId", args.id)).collect();
    for (const link of links) await ctx.db.delete(link._id);
    await ctx.db.delete(args.id);
  },
});

export const bulkCreate = mutation({
  args: { contracts: v.array(v.any()) },
  handler: async (ctx, args) => {
    const ids = [];
    const now = Date.now();
    for (const c of args.contracts) {
      const id = await ctx.db.insert("contracts", {
        ...c, productType: c.productType ?? "ACCOUNTING", daysOverdue: c.daysOverdue ?? 0,
        status: c.status ?? "NOT_STARTED", vatType: c.vatType ?? "VAT", billingType: c.billingType ?? "RECURRING",
        autoSendEnabled: c.autoSendEnabled ?? true, autoApprove: c.autoApprove ?? false, monthlyFee: c.monthlyFee ?? 0,
        createdAt: now, updatedAt: now,
      });
      ids.push(id);
    }
    return ids;
  },
});

export const searchByName = query({
  args: { query: v.string() },
  handler: async (ctx, args) => {
    const all = await ctx.db.query("contracts").collect();
    const q = args.query.toLowerCase();
    const filtered = all.filter(c => c.companyName.toLowerCase().includes(q));
    return Promise.all(filtered.slice(0, 10).map(async (c) => {
      const billingEntity = await ctx.db.get(c.billingEntityId);
      return { ...c, billingEntity };
    }));
  },
});

export const listDueToday = query({
  args: { dayOfMonth: v.number() },
  handler: async (ctx, args) => {
    const contracts = await ctx.db.query("contracts").withIndex("by_status", q => q.eq("status", "ACTIVE")).collect();
    const filtered = contracts.filter(c => c.billingDayOfMonth === args.dayOfMonth);
    return Promise.all(filtered.map(async (c) => {
      const partner = c.partnerId ? await ctx.db.get(c.partnerId) : null;
      const billingEntity = await ctx.db.get(c.billingEntityId);
      return { ...c, partner, billingEntity };
    }));
  },
});
