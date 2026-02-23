import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const getByContractId = query({
  args: { contractId: v.id("contracts") },
  handler: async (ctx, args) => {
    return ctx.db.query("bridgeMappings").withIndex("by_contractId", q => q.eq("contractId", args.contractId)).unique();
  },
});

export const getByNexusAgreementId = query({
  args: { nexusAgreementId: v.string() },
  handler: async (ctx, args) => {
    return ctx.db.query("bridgeMappings").withIndex("by_nexusAgreementId", q => q.eq("nexusAgreementId", args.nexusAgreementId)).unique();
  },
});

export const create = mutation({
  args: {
    nexusAgreementId: v.string(), nexusOrganizationId: v.string(),
    contractId: v.id("contracts"), syncStatus: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return ctx.db.insert("bridgeMappings", {
      ...args, syncStatus: args.syncStatus ?? "success",
      createdAt: now, updatedAt: now,
    });
  },
});

export const update = mutation({
  args: { id: v.id("bridgeMappings"), data: v.any() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { ...args.data, updatedAt: Date.now() });
    return ctx.db.get(args.id);
  },
});
