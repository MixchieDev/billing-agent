import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const listByInvoiceId = query({
  args: { invoiceId: v.id("invoices") },
  handler: async (ctx, args) => {
    return ctx.db.query("followUpLogs").withIndex("by_invoiceId", q => q.eq("invoiceId", args.invoiceId)).collect();
  },
});

export const create = mutation({
  args: {
    invoiceId: v.id("invoices"), level: v.number(), sentAt: v.number(),
    toEmail: v.string(), subject: v.string(), status: v.optional(v.string()),
    templateId: v.optional(v.id("emailTemplates")), messageId: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return ctx.db.insert("followUpLogs", {
      ...args, status: (args.status ?? "NOT_SENT") as any, createdAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: { id: v.id("followUpLogs"), data: v.any() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, args.data);
    return ctx.db.get(args.id);
  },
});
