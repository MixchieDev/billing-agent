import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const listByInvoiceId = query({
  args: { invoiceId: v.id("invoices") },
  handler: async (ctx, args) => {
    return ctx.db.query("emailLogs").withIndex("by_invoiceId", q => q.eq("invoiceId", args.invoiceId)).collect();
  },
});

export const create = mutation({
  args: { invoiceId: v.id("invoices"), toEmail: v.string(), subject: v.string(), status: v.string() },
  handler: async (ctx, args) => {
    return ctx.db.insert("emailLogs", { ...args, status: args.status as any, createdAt: Date.now() });
  },
});

export const update = mutation({
  args: { id: v.id("emailLogs"), data: v.any() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, args.data);
    return ctx.db.get(args.id);
  },
});

export const getFailedWithInvoices = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("emailLogs").collect();
    return all.filter(l => l.status === "FAILED");
  },
});
