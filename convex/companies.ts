import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const getByCode = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    return ctx.db.query("companies").withIndex("by_code", q => q.eq("code", args.code)).unique();
  },
});

export const getById = query({
  args: { id: v.id("companies") },
  handler: async (ctx, args) => {
    return ctx.db.get(args.id);
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    return ctx.db.query("companies").collect();
  },
});

export const getWithTemplate = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const company = await ctx.db.query("companies").withIndex("by_code", q => q.eq("code", args.code)).unique();
    if (!company) return null;
    const template = await ctx.db.query("invoiceTemplates").withIndex("by_companyId", q => q.eq("companyId", company._id)).unique();
    const signatories = await ctx.db.query("signatories").withIndex("by_companyId", q => q.eq("companyId", company._id)).collect();
    return { ...company, template, signatories };
  },
});

export const listMinimal = query({
  args: {},
  handler: async (ctx) => {
    const companies = await ctx.db.query("companies").collect();
    return companies.map(c => ({ _id: c._id, id: c._id, code: c.code, name: c.name })).sort((a, b) => a.code.localeCompare(b.code));
  },
});

export const listWithRelations = query({
  args: {},
  handler: async (ctx) => {
    const companies = await ctx.db.query("companies").collect();
    return Promise.all(companies.map(async (c) => {
      const signatories = await ctx.db.query("signatories").withIndex("by_companyId", q => q.eq("companyId", c._id)).collect();
      const contracts = await ctx.db.query("contracts").filter(q => q.eq(q.field("billingEntityId"), c._id)).collect();
      const invoices = await ctx.db.query("invoices").filter(q => q.eq(q.field("companyId"), c._id)).collect();
      return { ...c, id: c._id, signatories, _count: { contracts: contracts.length, invoices: invoices.length } };
    }));
  },
});

export const getByCodeWithSignatories = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const company = await ctx.db.query("companies").withIndex("by_code", q => q.eq("code", args.code)).unique();
    if (!company) return null;
    const signatories = await ctx.db.query("signatories").withIndex("by_companyId", q => q.eq("companyId", company._id)).collect();
    return { ...company, signatories };
  },
});

export const updateByCode = mutation({
  args: { code: v.string(), data: v.any() },
  handler: async (ctx, args) => {
    const company = await ctx.db.query("companies").withIndex("by_code", q => q.eq("code", args.code)).unique();
    if (!company) throw new Error("Company not found");
    await ctx.db.patch(company._id, { ...args.data, updatedAt: Date.now() });
    const updated = await ctx.db.get(company._id);
    const signatories = await ctx.db.query("signatories").withIndex("by_companyId", q => q.eq("companyId", company._id)).collect();
    return { ...updated, signatories };
  },
});

export const create = mutation({
  args: {
    code: v.string(), name: v.string(), address: v.optional(v.string()),
    contactNumber: v.optional(v.string()), tin: v.optional(v.string()),
    bankName: v.optional(v.string()), bankAccountName: v.optional(v.string()),
    bankAccountNo: v.optional(v.string()), formReference: v.optional(v.string()),
    logoPath: v.optional(v.string()), invoicePrefix: v.optional(v.string()),
    nextInvoiceNo: v.optional(v.number()), contractPrefix: v.optional(v.string()),
    nextContractNo: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return ctx.db.insert("companies", {
      ...args, nextInvoiceNo: args.nextInvoiceNo ?? 1, nextContractNo: args.nextContractNo ?? 1,
      createdAt: now, updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("companies"), code: v.optional(v.string()), name: v.optional(v.string()),
    address: v.optional(v.string()), contactNumber: v.optional(v.string()),
    tin: v.optional(v.string()), bankName: v.optional(v.string()),
    bankAccountName: v.optional(v.string()), bankAccountNo: v.optional(v.string()),
    formReference: v.optional(v.string()), logoPath: v.optional(v.string()),
    invoicePrefix: v.optional(v.string()), contractPrefix: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...fields } = args;
    const updates: any = { updatedAt: Date.now() };
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) updates[key] = value;
    }
    await ctx.db.patch(id, updates);
    return ctx.db.get(id);
  },
});

export const incrementInvoiceNo = mutation({
  args: { id: v.id("companies") },
  handler: async (ctx, args) => {
    const company = await ctx.db.get(args.id);
    if (!company) throw new Error("Company not found");
    await ctx.db.patch(args.id, { nextInvoiceNo: company.nextInvoiceNo + 1, updatedAt: Date.now() });
    return company.nextInvoiceNo;
  },
});

export const incrementContractNo = mutation({
  args: { id: v.id("companies") },
  handler: async (ctx, args) => {
    const company = await ctx.db.get(args.id);
    if (!company) throw new Error("Company not found");
    await ctx.db.patch(args.id, { nextContractNo: company.nextContractNo + 1, updatedAt: Date.now() });
    return company.nextContractNo;
  },
});
