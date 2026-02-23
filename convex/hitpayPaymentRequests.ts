import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const getByHitpayRequestId = query({
  args: { hitpayRequestId: v.string() },
  handler: async (ctx, args) => {
    return ctx.db.query("hitpayPaymentRequests").withIndex("by_hitpayRequestId", q => q.eq("hitpayRequestId", args.hitpayRequestId)).unique();
  },
});

export const getByInvoiceId = query({
  args: { invoiceId: v.id("invoices") },
  handler: async (ctx, args) => {
    return ctx.db.query("hitpayPaymentRequests").withIndex("by_invoiceId", q => q.eq("invoiceId", args.invoiceId)).collect();
  },
});

export const create = mutation({
  args: {
    invoiceId: v.id("invoices"), hitpayRequestId: v.string(), checkoutUrl: v.optional(v.string()),
    amount: v.number(), currency: v.optional(v.string()), status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return ctx.db.insert("hitpayPaymentRequests", {
      invoiceId: args.invoiceId, hitpayRequestId: args.hitpayRequestId,
      checkoutUrl: args.checkoutUrl, amount: args.amount,
      currency: args.currency ?? "PHP", status: (args.status ?? "PENDING") as any,
      createdAt: now, updatedAt: now,
    });
  },
});

export const update = mutation({
  args: { id: v.id("hitpayPaymentRequests"), data: v.any() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { ...args.data, updatedAt: Date.now() });
    return ctx.db.get(args.id);
  },
});
