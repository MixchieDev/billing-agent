import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: { month: v.optional(v.number()), isActive: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    let results = await ctx.db.query("rcbcEndClients").collect();
    if (args.month !== undefined) results = results.filter(c => c.month === args.month);
    if (args.isActive !== undefined) results = results.filter(c => c.isActive === args.isActive);
    return results;
  },
});

export const getById = query({
  args: { id: v.id("rcbcEndClients") },
  handler: async (ctx, args) => ctx.db.get(args.id),
});

export const create = mutation({
  args: { name: v.string(), employeeCount: v.number(), month: v.number(), ratePerEmployee: v.optional(v.number()), isActive: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const now = Date.now();
    return ctx.db.insert("rcbcEndClients", {
      name: args.name, employeeCount: args.employeeCount, month: args.month,
      ratePerEmployee: args.ratePerEmployee ?? 0, isActive: args.isActive ?? true,
      createdAt: now, updatedAt: now,
    });
  },
});

export const update = mutation({
  args: { id: v.id("rcbcEndClients"), data: v.any() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { ...args.data, updatedAt: Date.now() });
    return ctx.db.get(args.id);
  },
});

export const remove = mutation({
  args: { id: v.id("rcbcEndClients") },
  handler: async (ctx, args) => { await ctx.db.delete(args.id); },
});

export const bulkCreate = mutation({
  args: { clients: v.array(v.any()) },
  handler: async (ctx, args) => {
    const now = Date.now();
    const ids = [];
    for (const c of args.clients) {
      const id = await ctx.db.insert("rcbcEndClients", {
        name: c.name, employeeCount: c.employeeCount, month: c.month,
        ratePerEmployee: c.ratePerEmployee ?? 0, isActive: c.isActive ?? true,
        createdAt: now, updatedAt: now,
      });
      ids.push(id);
    }
    return ids;
  },
});

export const distinctMonths = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("rcbcEndClients").collect();
    const months = Array.from(new Set(all.map(c => c.month)));
    months.sort((a, b) => b - a);
    return months;
  },
});
