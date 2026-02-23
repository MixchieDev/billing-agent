import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const getById = query({ args: { id: v.id("emailTemplates") }, handler: async (ctx, args) => ctx.db.get(args.id) });

export const getByName = query({
  args: { name: v.string() },
  handler: async (ctx, args) => ctx.db.query("emailTemplates").withIndex("by_name", q => q.eq("name", args.name)).unique(),
});

export const getDefault = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("emailTemplates").collect();
    return all.find(t => t.isDefault) ?? null;
  },
});

export const getFollowUpByLevel = query({
  args: { level: v.number() },
  handler: async (ctx, args) => {
    const all = await ctx.db.query("emailTemplates").collect();
    return all.find(t => t.templateType === "FOLLOW_UP" && t.followUpLevel === args.level) ?? null;
  },
});

export const list = query({ args: {}, handler: async (ctx) => ctx.db.query("emailTemplates").collect() });

export const create = mutation({
  args: {
    name: v.string(), subject: v.string(), greeting: v.string(), body: v.string(),
    closing: v.string(), isDefault: v.optional(v.boolean()), templateType: v.optional(v.string()),
    followUpLevel: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return ctx.db.insert("emailTemplates", { ...args, isDefault: args.isDefault ?? false, templateType: args.templateType ?? "BILLING", createdAt: now, updatedAt: now });
  },
});

export const update = mutation({
  args: { id: v.id("emailTemplates"), data: v.any() },
  handler: async (ctx, args) => { await ctx.db.patch(args.id, { ...args.data, updatedAt: Date.now() }); return ctx.db.get(args.id); },
});

export const remove = mutation({
  args: { id: v.id("emailTemplates") },
  handler: async (ctx, args) => { await ctx.db.delete(args.id); },
});

export const clearDefaults = mutation({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("emailTemplates").collect();
    for (const t of all) {
      if (t.isDefault) await ctx.db.patch(t._id, { isDefault: false, updatedAt: Date.now() });
    }
  },
});

export const getWithPartners = query({
  args: { id: v.id("emailTemplates") },
  handler: async (ctx, args) => {
    const template = await ctx.db.get(args.id);
    if (!template) return null;
    const allPartners = await ctx.db.query("partners").collect();
    const partners = allPartners.filter(p => p.emailTemplateId === args.id).map(p => ({ _id: p._id, id: p._id, code: p.code, name: p.name }));
    return { ...template, partners };
  },
});

export const listWithPartners = query({
  args: {},
  handler: async (ctx) => {
    const templates = await ctx.db.query("emailTemplates").collect();
    const allPartners = await ctx.db.query("partners").collect();
    return templates.map(t => ({
      ...t,
      partners: allPartners.filter(p => p.emailTemplateId === t._id).map(p => ({ _id: p._id, id: p._id, code: p.code, name: p.name })),
    }));
  },
});
