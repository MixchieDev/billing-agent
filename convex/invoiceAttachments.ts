import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const listByInvoiceId = query({
  args: { invoiceId: v.id("invoices") },
  handler: async (ctx, args) => {
    return ctx.db.query("invoiceAttachments").withIndex("by_invoiceId", q => q.eq("invoiceId", args.invoiceId)).collect();
  },
});

export const getById = query({
  args: { id: v.id("invoiceAttachments") },
  handler: async (ctx, args) => {
    const attachment = await ctx.db.get(args.id);
    if (!attachment) return null;
    const url = await ctx.storage.getUrl(attachment.storageId);
    return { ...attachment, url };
  },
});

export const create = mutation({
  args: {
    invoiceId: v.id("invoices"), filename: v.string(), mimeType: v.string(),
    size: v.number(), storageId: v.id("_storage"), uploadedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return ctx.db.insert("invoiceAttachments", { ...args, uploadedAt: Date.now() });
  },
});

export const remove = mutation({
  args: { id: v.id("invoiceAttachments") },
  handler: async (ctx, args) => {
    const attachment = await ctx.db.get(args.id);
    if (attachment) {
      await ctx.storage.delete(attachment.storageId);
      await ctx.db.delete(args.id);
    }
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return ctx.storage.generateUploadUrl();
  },
});
