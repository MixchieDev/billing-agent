import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const getById = query({
  args: { id: v.id("users") },
  handler: async (ctx, args) => {
    return ctx.db.get(args.id);
  },
});

export const getByEmail = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    return ctx.db.query("users").withIndex("by_email", q => q.eq("email", args.email)).unique();
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    return ctx.db.query("users").order("desc").collect();
  },
});

export const create = mutation({
  args: {
    name: v.optional(v.string()),
    email: v.string(),
    password: v.optional(v.string()),
    role: v.string(),
    image: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return ctx.db.insert("users", {
      name: args.name,
      email: args.email,
      password: args.password,
      role: args.role as any,
      image: args.image,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("users"),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    role: v.optional(v.string()),
    image: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...fields } = args;
    const updates: any = { updatedAt: Date.now() };
    if (fields.name !== undefined) updates.name = fields.name;
    if (fields.email !== undefined) updates.email = fields.email;
    if (fields.role !== undefined) updates.role = fields.role;
    if (fields.image !== undefined) updates.image = fields.image;
    await ctx.db.patch(id, updates);
    return ctx.db.get(id);
  },
});

export const updatePassword = mutation({
  args: { id: v.id("users"), password: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { password: args.password, updatedAt: Date.now() });
  },
});

export const remove = mutation({
  args: { id: v.id("users") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
