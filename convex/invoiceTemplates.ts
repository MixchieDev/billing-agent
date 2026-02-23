import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const getByCompanyId = query({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    return ctx.db.query("invoiceTemplates").withIndex("by_companyId", q => q.eq("companyId", args.companyId)).unique();
  },
});

export const upsert = mutation({
  args: {
    companyId: v.id("companies"), primaryColor: v.string(), secondaryColor: v.string(),
    footerBgColor: v.string(), logoPath: v.optional(v.string()), invoiceTitle: v.string(),
    footerText: v.string(), showDisclaimer: v.boolean(), notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("invoiceTemplates").withIndex("by_companyId", q => q.eq("companyId", args.companyId)).unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { ...args, updatedAt: now });
      return existing._id;
    }
    return ctx.db.insert("invoiceTemplates", { ...args, createdAt: now, updatedAt: now });
  },
});
