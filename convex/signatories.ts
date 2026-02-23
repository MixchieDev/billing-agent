import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const listByCompanyId = query({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    return ctx.db.query("signatories").withIndex("by_companyId", q => q.eq("companyId", args.companyId)).collect();
  },
});

export const getDefaultsByCompanyId = query({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    const all = await ctx.db.query("signatories").withIndex("by_companyId", q => q.eq("companyId", args.companyId)).collect();
    return all.filter(s => s.isDefault);
  },
});

export const create = mutation({
  args: { companyId: v.id("companies"), role: v.string(), name: v.string(), isDefault: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const now = Date.now();
    return ctx.db.insert("signatories", { ...args, isDefault: args.isDefault ?? false, createdAt: now, updatedAt: now });
  },
});

export const update = mutation({
  args: { id: v.id("signatories"), role: v.optional(v.string()), name: v.optional(v.string()), isDefault: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const { id, ...fields } = args;
    const updates: any = { updatedAt: Date.now() };
    for (const [key, value] of Object.entries(fields)) { if (value !== undefined) updates[key] = value; }
    await ctx.db.patch(id, updates);
    return ctx.db.get(id);
  },
});

export const upsertByCompanyAndRole = mutation({
  args: { companyId: v.id("companies"), role: v.string(), name: v.string(), isDefault: v.boolean() },
  handler: async (ctx, args) => {
    const all = await ctx.db.query("signatories").withIndex("by_companyId", q => q.eq("companyId", args.companyId)).collect();
    const existing = all.find(s => s.role === args.role && s.isDefault === args.isDefault);
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { name: args.name, updatedAt: now });
      return existing._id;
    }
    return ctx.db.insert("signatories", { companyId: args.companyId, role: args.role, name: args.name, isDefault: args.isDefault, createdAt: now, updatedAt: now });
  },
});
