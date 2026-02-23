import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const getByKey = query({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    return ctx.db.query("settings").withIndex("by_key", q => q.eq("key", args.key)).unique();
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => ctx.db.query("settings").collect(),
});

export const upsert = mutation({
  args: { key: v.string(), value: v.any(), description: v.optional(v.string()), category: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db.query("settings").withIndex("by_key", q => q.eq("key", args.key)).unique();
    if (existing) {
      await ctx.db.patch(existing._id, { value: args.value, updatedAt: now, ...(args.description !== undefined && { description: args.description }), ...(args.category !== undefined && { category: args.category }) });
      return existing._id;
    }
    return ctx.db.insert("settings", { key: args.key, value: args.value, description: args.description, category: args.category ?? "general", createdAt: now, updatedAt: now });
  },
});
