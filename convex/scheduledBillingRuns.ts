import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const listByScheduledBillingId = query({
  args: { scheduledBillingId: v.id("scheduledBillings") },
  handler: async (ctx, args) => {
    const runs = await ctx.db.query("scheduledBillingRuns").withIndex("by_scheduledBillingId", q => q.eq("scheduledBillingId", args.scheduledBillingId)).collect();
    return Promise.all(runs.map(async (r) => {
      const invoice = r.invoiceId ? await ctx.db.get(r.invoiceId) : null;
      return { ...r, invoice };
    }));
  },
});

export const list = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const results = await ctx.db.query("scheduledBillingRuns").withIndex("by_runDate").order("desc").collect();
    return results.slice(0, args.limit ?? 50);
  },
});

export const create = mutation({
  args: {
    scheduledBillingId: v.id("scheduledBillings"), invoiceId: v.optional(v.id("invoices")),
    runDate: v.number(), status: v.optional(v.string()), errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return ctx.db.insert("scheduledBillingRuns", {
      scheduledBillingId: args.scheduledBillingId, invoiceId: args.invoiceId,
      runDate: args.runDate, status: (args.status ?? "PENDING") as any,
      errorMessage: args.errorMessage, createdAt: Date.now(),
    });
  },
});
