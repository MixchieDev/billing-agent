import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const getByName = query({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const all = await ctx.db.query("scheduledJobs").collect();
    return all.find(j => j.name === args.name) ?? null;
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => ctx.db.query("scheduledJobs").collect(),
});

export const create = mutation({
  args: { name: v.string(), cronExpr: v.string(), isEnabled: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const now = Date.now();
    return ctx.db.insert("scheduledJobs", {
      name: args.name, cronExpr: args.cronExpr, isEnabled: args.isEnabled ?? true,
      status: "IDLE", createdAt: now, updatedAt: now,
    });
  },
});

export const update = mutation({
  args: { id: v.id("scheduledJobs"), data: v.any() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { ...args.data, updatedAt: Date.now() });
    return ctx.db.get(args.id);
  },
});
