import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const listByInvoiceId = query({
  args: { invoiceId: v.id("invoices") },
  handler: async (ctx, args) => {
    return ctx.db.query("invoiceLineItems").withIndex("by_invoiceId", q => q.eq("invoiceId", args.invoiceId)).collect();
  },
});

export const create = mutation({
  args: { data: v.any() },
  handler: async (ctx, args) => {
    const now = Date.now();
    return ctx.db.insert("invoiceLineItems", { ...args.data, createdAt: now, updatedAt: now });
  },
});

export const createMany = mutation({
  args: { items: v.array(v.any()) },
  handler: async (ctx, args) => {
    const now = Date.now();
    const ids = [];
    for (const item of args.items) {
      const id = await ctx.db.insert("invoiceLineItems", { ...item, createdAt: now, updatedAt: now });
      ids.push(id);
    }
    return ids;
  },
});

export const update = mutation({
  args: { id: v.id("invoiceLineItems"), data: v.any() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { ...args.data, updatedAt: Date.now() });
    return ctx.db.get(args.id);
  },
});

export const remove = mutation({
  args: { id: v.id("invoiceLineItems") },
  handler: async (ctx, args) => { await ctx.db.delete(args.id); },
});
