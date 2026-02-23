import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const getById = query({
  args: { id: v.id("partners") },
  handler: async (ctx, args) => ctx.db.get(args.id),
});

export const getByCode = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    return ctx.db.query("partners").withIndex("by_code", q => q.eq("code", args.code)).unique();
  },
});

export const list = query({ args: {}, handler: async (ctx) => ctx.db.query("partners").collect() });

export const listByCompanyId = query({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    return ctx.db.query("partners").withIndex("by_companyId", q => q.eq("companyId", args.companyId)).collect();
  },
});

export const getWithEmailTemplate = query({
  args: { id: v.id("partners") },
  handler: async (ctx, args) => {
    const partner = await ctx.db.get(args.id);
    if (!partner) return null;
    const emailTemplate = partner.emailTemplateId ? await ctx.db.get(partner.emailTemplateId) : null;
    return { ...partner, emailTemplate };
  },
});

export const listWithRelations = query({
  args: {},
  handler: async (ctx) => {
    const partners = await ctx.db.query("partners").collect();
    return Promise.all(partners.map(async (p) => {
      const company = await ctx.db.get(p.companyId);
      const emailTemplate = p.emailTemplateId ? await ctx.db.get(p.emailTemplateId) : null;
      return {
        ...p,
        id: p._id,
        company,
        emailTemplate: emailTemplate ? { _id: emailTemplate._id, id: emailTemplate._id, name: emailTemplate.name, isDefault: emailTemplate.isDefault } : null,
      };
    }));
  },
});

export const getByIdWithCompany = query({
  args: { id: v.id("partners") },
  handler: async (ctx, args) => {
    const partner = await ctx.db.get(args.id);
    if (!partner) return null;
    const company = await ctx.db.get(partner.companyId);
    return { ...partner, company };
  },
});

export const updateWithRelations = mutation({
  args: {
    id: v.id("partners"), name: v.optional(v.string()),
    invoiceTo: v.optional(v.string()), attention: v.optional(v.string()),
    address: v.optional(v.string()), email: v.optional(v.string()),
    emails: v.optional(v.string()), billingModel: v.optional(v.string()),
    companyId: v.optional(v.id("companies")),
    emailTemplateId: v.optional(v.union(v.id("emailTemplates"), v.null())),
  },
  handler: async (ctx, args) => {
    const { id, ...fields } = args;
    const updates: any = { updatedAt: Date.now() };
    for (const [key, value] of Object.entries(fields)) { if (value !== undefined) updates[key] = value; }
    await ctx.db.patch(id, updates);
    const partner = await ctx.db.get(id);
    if (!partner) return null;
    const company = await ctx.db.get(partner.companyId);
    const emailTemplate = partner.emailTemplateId ? await ctx.db.get(partner.emailTemplateId) : null;
    return {
      ...partner,
      company,
      emailTemplate: emailTemplate ? { _id: emailTemplate._id, id: emailTemplate._id, name: emailTemplate.name, isDefault: emailTemplate.isDefault } : null,
    };
  },
});

export const create = mutation({
  args: {
    code: v.string(), name: v.string(), invoiceTo: v.optional(v.string()),
    attention: v.optional(v.string()), address: v.optional(v.string()),
    email: v.optional(v.string()), billingModel: v.string(), companyId: v.id("companies"),
    emailTemplateId: v.optional(v.id("emailTemplates")), emails: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return ctx.db.insert("partners", { ...args, billingModel: args.billingModel as any, createdAt: now, updatedAt: now });
  },
});

export const update = mutation({
  args: {
    id: v.id("partners"), code: v.optional(v.string()), name: v.optional(v.string()),
    invoiceTo: v.optional(v.string()), attention: v.optional(v.string()),
    address: v.optional(v.string()), email: v.optional(v.string()),
    billingModel: v.optional(v.string()), emailTemplateId: v.optional(v.id("emailTemplates")),
    emails: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...fields } = args;
    const updates: any = { updatedAt: Date.now() };
    for (const [key, value] of Object.entries(fields)) { if (value !== undefined) updates[key] = value; }
    await ctx.db.patch(id, updates);
    return ctx.db.get(id);
  },
});

export const remove = mutation({
  args: { id: v.id("partners") },
  handler: async (ctx, args) => { await ctx.db.delete(args.id); },
});
