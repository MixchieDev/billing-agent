import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const getByProvider = query({
  args: { provider: v.string(), providerAccountId: v.string() },
  handler: async (ctx, args) => {
    return ctx.db.query("accounts")
      .withIndex("by_provider_providerAccountId", q =>
        q.eq("provider", args.provider).eq("providerAccountId", args.providerAccountId)
      ).unique();
  },
});

export const create = mutation({
  args: {
    userId: v.id("users"),
    type: v.string(),
    provider: v.string(),
    providerAccountId: v.string(),
    refresh_token: v.optional(v.string()),
    access_token: v.optional(v.string()),
    expires_at: v.optional(v.number()),
    token_type: v.optional(v.string()),
    scope: v.optional(v.string()),
    id_token: v.optional(v.string()),
    session_state: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return ctx.db.insert("accounts", args);
  },
});

export const remove = mutation({
  args: { id: v.id("accounts") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
