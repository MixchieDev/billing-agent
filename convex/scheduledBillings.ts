import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const getById = query({
  args: { id: v.id("scheduledBillings") },
  handler: async (ctx, args) => {
    const sb = await ctx.db.get(args.id);
    if (!sb) return null;
    const contract = await ctx.db.get(sb.contractId);
    const billingEntity = await ctx.db.get(sb.billingEntityId);
    return { ...sb, contract, billingEntity };
  },
});

export const list = query({
  args: { status: v.optional(v.string()), billingEntityId: v.optional(v.id("companies")), limit: v.optional(v.number()), offset: v.optional(v.number()) },
  handler: async (ctx, args) => {
    let results;
    if (args.status) {
      results = await ctx.db.query("scheduledBillings").withIndex("by_status_nextBillingDate", q => q.eq("status", args.status as any)).collect();
    } else {
      results = await ctx.db.query("scheduledBillings").collect();
    }
    if (args.billingEntityId) results = results.filter(s => s.billingEntityId === args.billingEntityId);
    const total = results.length;
    const offset = args.offset ?? 0;
    const limit = args.limit ?? 50;
    const paged = results.slice(offset, offset + limit);
    const hydrated = await Promise.all(paged.map(async (sb) => {
      const contract = await ctx.db.get(sb.contractId);
      const billingEntity = await ctx.db.get(sb.billingEntityId);
      return { ...sb, contract, billingEntity };
    }));
    return { items: hydrated, total };
  },
});

export const listDueToday = query({
  args: { dayOfMonth: v.number() },
  handler: async (ctx, args) => {
    const results = await ctx.db.query("scheduledBillings").withIndex("by_billingDayOfMonth", q => q.eq("billingDayOfMonth", args.dayOfMonth)).collect();
    return results.filter(s => s.status === "ACTIVE");
  },
});

export const count = query({
  args: { status: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (args.status) {
      return (await ctx.db.query("scheduledBillings").withIndex("by_status_nextBillingDate", q => q.eq("status", args.status as any)).collect()).length;
    }
    return (await ctx.db.query("scheduledBillings").collect()).length;
  },
});

export const create = mutation({
  args: { data: v.any() },
  handler: async (ctx, args) => {
    const now = Date.now();
    return ctx.db.insert("scheduledBillings", {
      ...args.data,
      autoApprove: args.data.autoApprove ?? false,
      autoSendEnabled: args.data.autoSendEnabled ?? true,
      hasWithholding: args.data.hasWithholding ?? false,
      status: args.data.status ?? "PENDING",
      createdAt: now, updatedAt: now,
    });
  },
});

export const update = mutation({
  args: { id: v.id("scheduledBillings"), data: v.any() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { ...args.data, updatedAt: Date.now() });
    return ctx.db.get(args.id);
  },
});

export const remove = mutation({
  args: { id: v.id("scheduledBillings") },
  handler: async (ctx, args) => {
    const runs = await ctx.db.query("scheduledBillingRuns").withIndex("by_scheduledBillingId", q => q.eq("scheduledBillingId", args.id)).collect();
    for (const run of runs) await ctx.db.delete(run._id);
    await ctx.db.delete(args.id);
  },
});

export const approve = mutation({
  args: { id: v.id("scheduledBillings"), approvedById: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.id, { status: "ACTIVE", approvedAt: now, approvedById: args.approvedById, updatedAt: now });
    return ctx.db.get(args.id);
  },
});

export const reject = mutation({
  args: { id: v.id("scheduledBillings"), rejectedById: v.optional(v.id("users")), rejectionReason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.id, { status: "ENDED", rejectedAt: now, rejectedById: args.rejectedById, rejectionReason: args.rejectionReason, updatedAt: now });
    return ctx.db.get(args.id);
  },
});
