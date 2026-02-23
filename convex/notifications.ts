import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const listByUserId = query({
  args: { userId: v.id("users"), unreadOnly: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    if (args.unreadOnly) {
      return ctx.db.query("notifications").withIndex("by_userId_isRead", q => q.eq("userId", args.userId).eq("isRead", false)).order("desc").collect();
    }
    const all = await ctx.db.query("notifications").withIndex("by_userId_isRead", q => q.eq("userId", args.userId)).order("desc").collect();
    return all;
  },
});

export const listRecent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const results = await ctx.db.query("notifications").withIndex("by_createdAt").order("desc").collect();
    return results.slice(0, args.limit ?? 20);
  },
});

export const create = mutation({
  args: {
    userId: v.optional(v.id("users")), type: v.string(), title: v.string(),
    message: v.string(), link: v.optional(v.string()),
    entityType: v.optional(v.string()), entityId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return ctx.db.insert("notifications", { ...args, type: args.type as any, isRead: false, createdAt: Date.now() });
  },
});

export const markRead = mutation({
  args: { id: v.id("notifications") },
  handler: async (ctx, args) => { await ctx.db.patch(args.id, { isRead: true }); },
});

export const markAllRead = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const unread = await ctx.db.query("notifications").withIndex("by_userId_isRead", q => q.eq("userId", args.userId).eq("isRead", false)).collect();
    // Also mark broadcast (userId=undefined) notifications
    const broadcastUnread = await ctx.db.query("notifications").filter(q => q.and(q.eq(q.field("userId"), undefined), q.eq(q.field("isRead"), false))).collect();
    for (const n of [...unread, ...broadcastUnread]) await ctx.db.patch(n._id, { isRead: true });
    return { count: unread.length + broadcastUnread.length };
  },
});

export const markManyRead = mutation({
  args: { ids: v.array(v.id("notifications")) },
  handler: async (ctx, args) => {
    for (const id of args.ids) await ctx.db.patch(id, { isRead: true });
  },
});

export const listForUser = query({
  args: { userId: v.id("users"), unreadOnly: v.optional(v.boolean()), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    // Get user-specific notifications
    const userNotifs = await ctx.db.query("notifications").withIndex("by_userId_isRead", q => q.eq("userId", args.userId)).order("desc").collect();
    // Get broadcast (no userId) notifications
    const allNotifs = await ctx.db.query("notifications").withIndex("by_createdAt").order("desc").collect();
    const broadcastNotifs = allNotifs.filter(n => !n.userId);
    let combined = [...userNotifs, ...broadcastNotifs].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    if (args.unreadOnly) combined = combined.filter(n => !n.isRead);
    const limit = args.limit ?? 20;
    return combined.slice(0, limit);
  },
});

export const countUnreadForUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const userUnread = await ctx.db.query("notifications").withIndex("by_userId_isRead", q => q.eq("userId", args.userId).eq("isRead", false)).collect();
    const allNotifs = await ctx.db.query("notifications").filter(q => q.and(q.eq(q.field("userId"), undefined), q.eq(q.field("isRead"), false))).collect();
    return userUnread.length + allNotifs.length;
  },
});
