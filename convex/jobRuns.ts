import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const create = mutation({
  args: { jobName: v.string(), status: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const now = Date.now();
    return ctx.db.insert("jobRuns", {
      jobName: args.jobName, startedAt: now, status: (args.status ?? "RUNNING") as any,
      itemsProcessed: 0, createdAt: now,
    });
  },
});

export const update = mutation({
  args: { id: v.id("jobRuns"), data: v.any() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, args.data);
    return ctx.db.get(args.id);
  },
});

export const list = query({
  args: { jobName: v.optional(v.string()), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    let results = await ctx.db.query("jobRuns").collect();
    if (args.jobName) results = results.filter(r => r.jobName === args.jobName);
    results.sort((a, b) => b.createdAt - a.createdAt);
    return results.slice(0, args.limit ?? 20);
  },
});
