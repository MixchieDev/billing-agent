import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {
    entityType: v.optional(v.string()), action: v.optional(v.string()),
    limit: v.optional(v.number()), offset: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let results;
    if (args.entityType) {
      results = await ctx.db.query("auditLogs").withIndex("by_entityType_createdAt", q => q.eq("entityType", args.entityType!)).order("desc").collect();
    } else if (args.action) {
      results = await ctx.db.query("auditLogs").withIndex("by_action_createdAt", q => q.eq("action", args.action!)).order("desc").collect();
    } else {
      results = await ctx.db.query("auditLogs").withIndex("by_createdAt").order("desc").collect();
    }
    const offset = args.offset ?? 0;
    const limit = args.limit ?? 50;
    const paged = results.slice(offset, offset + limit);
    return { items: paged, total: results.length };
  },
});

export const listByEntityId = query({
  args: { entityId: v.string(), entityType: v.optional(v.string()) },
  handler: async (ctx, args) => {
    let results = await ctx.db.query("auditLogs").withIndex("by_entityId_entityType", q => q.eq("entityId", args.entityId)).order("desc").collect();
    if (args.entityType) results = results.filter(l => l.entityType === args.entityType);
    return results;
  },
});

export const create = mutation({
  args: {
    userId: v.optional(v.id("users")), action: v.string(), entityType: v.string(),
    entityId: v.string(), details: v.optional(v.any()), ipAddress: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return ctx.db.insert("auditLogs", { ...args, createdAt: Date.now() });
  },
});
