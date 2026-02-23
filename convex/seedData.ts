import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const seedDatabase = internalMutation({
  args: { hashedPassword: v.string() },
  handler: async (ctx, args) => {
    console.log("Seeding database...");

    const now = Date.now();

    // ==================== COMPANIES ====================

    const existingYowi = await ctx.db
      .query("companies")
      .withIndex("by_code", (q) => q.eq("code", "YOWI"))
      .unique();

    const yowiId =
      existingYowi?._id ??
      (await ctx.db.insert("companies", {
        code: "YOWI",
        name: "YAHSHUA OUTSOURCING WORLDWIDE, INC.",
        address:
          "Unit #12 2F E-Max Building, Xavier Estates, Masterson Avenue, Upper Balulang, Cagayan De Oro City Misamis Oriental 9000",
        contactNumber: "0917-650-4003",
        bankName: "RCBC",
        bankAccountName: "YAHSHUA OUTSOURCING WORLDWIDE, INC.",
        bankAccountNo: "7-590-53889-5",
        formReference: "YOWI-FRM-03-012",
        invoicePrefix: "S",
        nextInvoiceNo: 1,
        nextContractNo: 1,
        logoPath: "/assets/yowi-logo.png",
        createdAt: now,
        updatedAt: now,
      }));
    console.log("YOWI company:", yowiId);

    const existingAbba = await ctx.db
      .query("companies")
      .withIndex("by_code", (q) => q.eq("code", "ABBA"))
      .unique();

    const abbaId =
      existingAbba?._id ??
      (await ctx.db.insert("companies", {
        code: "ABBA",
        name: "THE ABBA INITIATIVE, OPC",
        address:
          "Unit #12 2F E-Max Building Xavier Estates Masterson Avenue, Upper Balulang, Cagayan De Oro City Misamis Oriental 9000",
        contactNumber: "0917-106-5249",
        bankName: "RCBC",
        bankAccountName: "THE ABBA INITIATIVE, OPC",
        bankAccountNo: "7-590-59122-2",
        formReference: "YOWI-FRM-03-012",
        invoicePrefix: "S",
        nextInvoiceNo: 1,
        nextContractNo: 1,
        logoPath: "/assets/abba-logo.png",
        createdAt: now,
        updatedAt: now,
      }));
    console.log("ABBA company:", abbaId);

    // ==================== INVOICE TEMPLATES ====================

    const existingYowiTemplate = await ctx.db
      .query("invoiceTemplates")
      .withIndex("by_companyId", (q) => q.eq("companyId", yowiId))
      .unique();

    if (!existingYowiTemplate) {
      await ctx.db.insert("invoiceTemplates", {
        companyId: yowiId,
        primaryColor: "#2563eb",
        secondaryColor: "#1e40af",
        footerBgColor: "#dbeafe",
        logoPath: "/assets/yowi-logo.png",
        invoiceTitle: "Invoice",
        footerText: "Powered by: YAHSHUA",
        showDisclaimer: true,
        createdAt: now,
        updatedAt: now,
      });
      console.log("Created YOWI invoice template");
    }

    const existingAbbaTemplate = await ctx.db
      .query("invoiceTemplates")
      .withIndex("by_companyId", (q) => q.eq("companyId", abbaId))
      .unique();

    if (!existingAbbaTemplate) {
      await ctx.db.insert("invoiceTemplates", {
        companyId: abbaId,
        primaryColor: "#059669",
        secondaryColor: "#047857",
        footerBgColor: "#d1fae5",
        logoPath: "/assets/abba-logo.png",
        invoiceTitle: "Invoice",
        footerText: "Powered by: THE ABBA INITIATIVE",
        showDisclaimer: true,
        createdAt: now,
        updatedAt: now,
      });
      console.log("Created ABBA invoice template");
    }

    // ==================== SIGNATORIES ====================

    const yowiSignatories = await ctx.db
      .query("signatories")
      .withIndex("by_companyId", (q) => q.eq("companyId", yowiId))
      .collect();

    if (yowiSignatories.length === 0) {
      await ctx.db.insert("signatories", {
        companyId: yowiId,
        role: "prepared_by",
        name: "VANESSA L. DONOSO",
        isDefault: true,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("signatories", {
        companyId: yowiId,
        role: "reviewed_by",
        name: "RUTH MICHELLE C. BAYRON",
        isDefault: true,
        createdAt: now,
        updatedAt: now,
      });
      console.log("Created YOWI signatories");
    }

    const abbaSignatories = await ctx.db
      .query("signatories")
      .withIndex("by_companyId", (q) => q.eq("companyId", abbaId))
      .collect();

    if (abbaSignatories.length === 0) {
      await ctx.db.insert("signatories", {
        companyId: abbaId,
        role: "prepared_by",
        name: "VANESSA L. DONOSO",
        isDefault: true,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("signatories", {
        companyId: abbaId,
        role: "reviewed_by",
        name: "RUTH MICHELLE C. BAYRON",
        isDefault: true,
        createdAt: now,
        updatedAt: now,
      });
      console.log("Created ABBA signatories");
    }

    // ==================== PARTNERS ====================

    const existingGlobe = await ctx.db
      .query("partners")
      .withIndex("by_code", (q) => q.eq("code", "Globe"))
      .unique();

    if (!existingGlobe) {
      await ctx.db.insert("partners", {
        code: "Globe",
        name: "Globe/Innove",
        invoiceTo: "INNOVE COMMUNICATIONS INC.",
        attention: "Dominic Ray Del Rosario",
        address:
          "9F The Globe Tower-Cebu Samar Loop Cor Panay Rd., Cebu Business Park Cebu City 6000",
        billingModel: "GLOBE_INNOVE",
        companyId: yowiId,
        createdAt: now,
        updatedAt: now,
      });
      console.log("Created Globe partner");
    }

    const existingRcbc = await ctx.db
      .query("partners")
      .withIndex("by_code", (q) => q.eq("code", "RCBC"))
      .unique();

    if (!existingRcbc) {
      await ctx.db.insert("partners", {
        code: "RCBC",
        name: "RCBC",
        invoiceTo: "RIZAL COMMERCIAL BANKING CORPORATION",
        attention: "Ms. Lisa F. Cabance",
        address:
          "12/F Yuchengco Tower 1 RCBC Plaza 6819 Ayala Avenue, Makati City 0727",
        email: "billing@rcbc.com",
        billingModel: "RCBC_CONSOLIDATED",
        companyId: yowiId,
        createdAt: now,
        updatedAt: now,
      });
      console.log("Created RCBC partner");
    }

    const existingDirectYowi = await ctx.db
      .query("partners")
      .withIndex("by_code", (q) => q.eq("code", "Direct-YOWI"))
      .unique();

    if (!existingDirectYowi) {
      await ctx.db.insert("partners", {
        code: "Direct-YOWI",
        name: "Direct (YOWI)",
        billingModel: "DIRECT",
        companyId: yowiId,
        createdAt: now,
        updatedAt: now,
      });
      console.log("Created Direct-YOWI partner");
    }

    const existingDirectAbba = await ctx.db
      .query("partners")
      .withIndex("by_code", (q) => q.eq("code", "Direct-ABBA"))
      .unique();

    if (!existingDirectAbba) {
      await ctx.db.insert("partners", {
        code: "Direct-ABBA",
        name: "Direct (ABBA)",
        billingModel: "DIRECT",
        companyId: abbaId,
        createdAt: now,
        updatedAt: now,
      });
      console.log("Created Direct-ABBA partner");
    }

    // ==================== ADMIN USER ====================

    const existingAdmin = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", "admin@yahshua-abba.com"))
      .unique();

    if (!existingAdmin) {
      await ctx.db.insert("users", {
        email: "admin@yahshua-abba.com",
        name: "System Admin",
        password: args.hashedPassword,
        role: "ADMIN",
        createdAt: now,
        updatedAt: now,
      });
      console.log("Created admin user");
    }

    // ==================== SCHEDULED JOB ====================

    const existingJob = await ctx.db.query("scheduledJobs").collect();
    const hasDailyBilling = existingJob.some(
      (j) => j.name === "Daily Billing Check"
    );

    if (!hasDailyBilling) {
      await ctx.db.insert("scheduledJobs", {
        name: "Daily Billing Check",
        cronExpr: "0 8 * * *",
        isEnabled: true,
        status: "IDLE",
        createdAt: now,
        updatedAt: now,
      });
      console.log("Created scheduled job record");
    }

    // ==================== DEFAULT EMAIL TEMPLATE ====================

    const existingTemplate = await ctx.db
      .query("emailTemplates")
      .withIndex("by_name", (q) => q.eq("name", "Default Template"))
      .unique();

    if (!existingTemplate) {
      await ctx.db.insert("emailTemplates", {
        name: "Default Template",
        subject: "Billing Statement - {{billingNo}}",
        greeting: "A blessed day, Beloved Client!",
        body: `Please find attached the billing statement for {{customerName}}.

Invoice Number: {{billingNo}}
Billing Period: {{periodStart}} to {{periodEnd}}
Total Amount Due: {{totalAmount}}
Due Date: {{dueDate}}

Kindly confirm receipt of this billing by replying to this email.

For your 2307, you may send the proof of payment to this same email.`,
        closing: `Thank you and God bless!

Best regards,
{{companyName}} Billing Team`,
        isDefault: true,
        templateType: "BILLING",
        createdAt: now,
        updatedAt: now,
      });
      console.log("Created default email template");
    }

    console.log("Database seeding completed!");
  },
});
