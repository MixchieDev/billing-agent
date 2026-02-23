import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const connect = mutation({
  args: { contractId: v.id("contracts"), invoiceId: v.id("invoices") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("contractInvoices")
      .withIndex("by_contractId_invoiceId", q => q.eq("contractId", args.contractId).eq("invoiceId", args.invoiceId))
      .unique();
    if (existing) return existing._id;
    return ctx.db.insert("contractInvoices", { contractId: args.contractId, invoiceId: args.invoiceId });
  },
});

export const disconnect = mutation({
  args: { contractId: v.id("contracts"), invoiceId: v.id("invoices") },
  handler: async (ctx, args) => {
    const link = await ctx.db.query("contractInvoices")
      .withIndex("by_contractId_invoiceId", q => q.eq("contractId", args.contractId).eq("invoiceId", args.invoiceId))
      .unique();
    if (link) await ctx.db.delete(link._id);
  },
});

export const listByContractId = query({
  args: { contractId: v.id("contracts") },
  handler: async (ctx, args) => {
    const links = await ctx.db.query("contractInvoices").withIndex("by_contractId", q => q.eq("contractId", args.contractId)).collect();
    return Promise.all(links.map(async (l) => {
      const invoice = await ctx.db.get(l.invoiceId);
      return { ...l, invoice };
    }));
  },
});

export const listByInvoiceId = query({
  args: { invoiceId: v.id("invoices") },
  handler: async (ctx, args) => {
    const links = await ctx.db.query("contractInvoices").withIndex("by_invoiceId", q => q.eq("invoiceId", args.invoiceId)).collect();
    return Promise.all(links.map(async (l) => {
      const contract = await ctx.db.get(l.contractId);
      return { ...l, contract };
    }));
  },
});
