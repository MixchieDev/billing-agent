import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const getByKey = query({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    return ctx.db.query("systemConfig").withIndex("by_key", q => q.eq("key", args.key)).unique();
  },
});

export const upsert = mutation({
  args: { key: v.string(), value: v.string() },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db.query("systemConfig").withIndex("by_key", q => q.eq("key", args.key)).unique();
    if (existing) {
      await ctx.db.patch(existing._id, { value: args.value, updatedAt: now });
      return existing._id;
    }
    return ctx.db.insert("systemConfig", { key: args.key, value: args.value, createdAt: now, updatedAt: now });
  },
});
