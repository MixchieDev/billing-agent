import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const getByToken = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    return ctx.db.query("sessions")
      .withIndex("by_sessionToken", q => q.eq("sessionToken", args.sessionToken))
      .unique();
  },
});

export const create = mutation({
  args: { sessionToken: v.string(), userId: v.id("users"), expires: v.number() },
  handler: async (ctx, args) => {
    return ctx.db.insert("sessions", args);
  },
});

export const remove = mutation({
  args: { id: v.id("sessions") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
