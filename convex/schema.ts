import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// ============================================================
// Enum Validators
// (Prisma enums → Convex v.union of v.literal)
// ============================================================

export const userRole = v.union(
  v.literal("ADMIN"),
  v.literal("APPROVER"),
  v.literal("VIEWER")
);

export const billingModel = v.union(
  v.literal("DIRECT"),
  v.literal("GLOBE_INNOVE"),
  v.literal("RCBC_CONSOLIDATED")
);

export const productType = v.union(
  v.literal("ACCOUNTING"),
  v.literal("PAYROLL"),
  v.literal("COMPLIANCE"),
  v.literal("HR")
);

export const contractStatus = v.union(
  v.literal("ACTIVE"),
  v.literal("INACTIVE"),
  v.literal("STOPPED"),
  v.literal("NOT_STARTED")
);

export const vatType = v.union(
  v.literal("VAT"),
  v.literal("NON_VAT")
);

export const billingType = v.union(
  v.literal("RECURRING"),
  v.literal("ONE_TIME")
);

export const billingFrequency = v.union(
  v.literal("MONTHLY"),
  v.literal("QUARTERLY"),
  v.literal("ANNUALLY"),
  v.literal("CUSTOM")
);

export const intervalUnit = v.union(
  v.literal("DAYS"),
  v.literal("MONTHS")
);

export const invoiceStatus = v.union(
  v.literal("PENDING"),
  v.literal("APPROVED"),
  v.literal("REJECTED"),
  v.literal("SENT"),
  v.literal("PAID"),
  v.literal("CANCELLED"),
  v.literal("VOID")
);

export const emailStatus = v.union(
  v.literal("NOT_SENT"),
  v.literal("QUEUED"),
  v.literal("SENT"),
  v.literal("FAILED")
);

export const jobStatus = v.union(
  v.literal("IDLE"),
  v.literal("RUNNING"),
  v.literal("COMPLETED"),
  v.literal("FAILED")
);

export const notificationType = v.union(
  v.literal("INVOICE_PENDING"),
  v.literal("INVOICE_APPROVED"),
  v.literal("INVOICE_REJECTED"),
  v.literal("INVOICE_SENT"),
  v.literal("INVOICE_PAID"),
  v.literal("INVOICE_OVERDUE"),
  v.literal("INVOICE_FOLLOW_UP"),
  v.literal("SYSTEM"),
  v.literal("SCHEDULE_PENDING"),
  v.literal("SCHEDULE_APPROVED"),
  v.literal("SCHEDULE_REJECTED"),
  v.literal("INVOICE_VOID")
);

export const scheduleStatus = v.union(
  v.literal("ACTIVE"),
  v.literal("PAUSED"),
  v.literal("ENDED"),
  v.literal("PENDING")
);

export const runStatus = v.union(
  v.literal("PENDING"),
  v.literal("SUCCESS"),
  v.literal("FAILED"),
  v.literal("SKIPPED")
);

export const hitpayPaymentStatus = v.union(
  v.literal("PENDING"),
  v.literal("COMPLETED"),
  v.literal("FAILED")
);

// ============================================================
// Schema Definition
// ============================================================
// Notes:
// - Convex auto-generates `_id` (replaces Prisma `id`) and
//   `_creationTime` for every document.
// - `createdAt` / `updatedAt` are kept as explicit fields for
//   code compatibility. Set them in your mutations.
// - Prisma Decimal → v.number() (IEEE 754 float64).
//   For cent-precision finance math, consider storing as
//   integers (cents) in your mutation logic.
// - Prisma @unique → Convex index. Uniqueness must be enforced
//   in mutation logic (check-then-insert).
// - Prisma implicit many-to-many (Contract ↔ Invoice) is
//   modeled via the `contractInvoices` junction table.
// ============================================================

export default defineSchema({
  // --------------------------------------------------------
  // User  (Prisma: User)
  // --------------------------------------------------------
  users: defineTable({
    name: v.optional(v.string()),
    email: v.string(),
    emailVerified: v.optional(v.number()), // timestamp ms
    password: v.optional(v.string()),
    image: v.optional(v.string()),
    role: userRole, // default: "VIEWER"
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_email", ["email"]),

  // --------------------------------------------------------
  // Account  (Prisma: Account – NextAuth provider accounts)
  // --------------------------------------------------------
  accounts: defineTable({
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
  })
    .index("by_userId", ["userId"])
    .index("by_provider_providerAccountId", ["provider", "providerAccountId"]),

  // --------------------------------------------------------
  // Session  (Prisma: Session)
  // --------------------------------------------------------
  sessions: defineTable({
    sessionToken: v.string(),
    userId: v.id("users"),
    expires: v.number(), // timestamp ms
  })
    .index("by_sessionToken", ["sessionToken"])
    .index("by_userId", ["userId"]),

  // --------------------------------------------------------
  // VerificationToken  (Prisma: VerificationToken)
  // --------------------------------------------------------
  verificationTokens: defineTable({
    identifier: v.string(),
    token: v.string(),
    expires: v.number(), // timestamp ms
  })
    .index("by_token", ["token"])
    .index("by_identifier_token", ["identifier", "token"]),

  // --------------------------------------------------------
  // Company  (Prisma: Company)
  // --------------------------------------------------------
  companies: defineTable({
    code: v.string(),
    name: v.string(),
    address: v.optional(v.string()),
    contactNumber: v.optional(v.string()),
    tin: v.optional(v.string()),
    bankName: v.optional(v.string()),
    bankAccountName: v.optional(v.string()),
    bankAccountNo: v.optional(v.string()),
    formReference: v.optional(v.string()),
    logoPath: v.optional(v.string()),
    invoicePrefix: v.optional(v.string()),
    nextInvoiceNo: v.number(), // default: 1
    contractPrefix: v.optional(v.string()),
    nextContractNo: v.number(), // default: 1
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_code", ["code"]),

  // --------------------------------------------------------
  // Signatory  (Prisma: Signatory)
  // --------------------------------------------------------
  signatories: defineTable({
    companyId: v.id("companies"),
    role: v.string(),
    name: v.string(),
    isDefault: v.boolean(), // default: false
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_companyId", ["companyId"])
    .index("by_companyId_role_isDefault", ["companyId", "role", "isDefault"]),

  // --------------------------------------------------------
  // InvoiceTemplate  (Prisma: InvoiceTemplate)
  // --------------------------------------------------------
  invoiceTemplates: defineTable({
    companyId: v.id("companies"),
    primaryColor: v.string(),   // default: "#2563eb"
    secondaryColor: v.string(), // default: "#1e40af"
    footerBgColor: v.string(),  // default: "#dbeafe"
    logoPath: v.optional(v.string()),
    invoiceTitle: v.string(),   // default: "Invoice"
    footerText: v.string(),     // default: "Powered by: YAHSHUA"
    showDisclaimer: v.boolean(), // default: true
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_companyId", ["companyId"]),

  // --------------------------------------------------------
  // Partner  (Prisma: Partner)
  // --------------------------------------------------------
  partners: defineTable({
    code: v.string(),
    name: v.string(),
    invoiceTo: v.optional(v.string()),
    attention: v.optional(v.string()),
    address: v.optional(v.string()),
    email: v.optional(v.string()),
    billingModel: billingModel, // default: "DIRECT"
    companyId: v.id("companies"),
    emailTemplateId: v.optional(v.id("emailTemplates")),
    emails: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_code", ["code"])
    .index("by_companyId", ["companyId"])
    .index("by_billingModel", ["billingModel"]),

  // --------------------------------------------------------
  // EmailTemplate  (Prisma: EmailTemplate)
  // --------------------------------------------------------
  emailTemplates: defineTable({
    name: v.string(),
    subject: v.string(),
    greeting: v.string(),
    body: v.string(),
    closing: v.string(),
    isDefault: v.boolean(), // default: false
    templateType: v.string(), // "BILLING" | "FOLLOW_UP", default: "BILLING"
    followUpLevel: v.optional(v.number()), // 1, 2, or 3
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_name", ["name"]),

  // --------------------------------------------------------
  // Contract  (Prisma: Contract)
  // --------------------------------------------------------
  contracts: defineTable({
    customerId: v.optional(v.string()),
    companyName: v.string(),
    productType: productType,
    revenueModel: v.optional(v.string()),
    partnerId: v.optional(v.id("partners")),
    monthlyFee: v.number(), // Decimal(15,2)
    paymentPlan: v.optional(v.string()),
    contractStart: v.optional(v.number()),    // timestamp ms
    nextDueDate: v.optional(v.number()),      // timestamp ms
    lastPaymentDate: v.optional(v.number()),  // timestamp ms
    daysOverdue: v.number(), // default: 0
    status: contractStatus,  // default: "NOT_STARTED"
    contactPerson: v.optional(v.string()),
    email: v.optional(v.string()),
    tin: v.optional(v.string()),
    mobile: v.optional(v.string()),
    industry: v.optional(v.string()),
    amountDue: v.optional(v.number()),        // Decimal(15,2)
    vatType: vatType,        // default: "VAT"
    vatAmount: v.optional(v.number()),        // Decimal(15,2)
    totalWithVat: v.optional(v.number()),     // Decimal(15,2)
    withholdingTax: v.optional(v.number()),   // Decimal(15,2)
    netReceivable: v.optional(v.number()),    // Decimal(15,2)
    clientSince: v.optional(v.number()),      // timestamp ms
    lifetimeValue: v.optional(v.number()),    // Decimal(15,2)
    renewalRisk: v.optional(v.string()),
    remarks: v.optional(v.string()),
    billingAmount: v.optional(v.number()),    // Decimal(15,2)
    billingType: billingType, // default: "RECURRING"
    billingEntityId: v.id("companies"),
    employeeCount: v.optional(v.number()),
    ratePerEmployee: v.optional(v.number()),  // Decimal(10,2)
    autoSendEnabled: v.boolean(), // default: true
    contractEndDate: v.optional(v.number()),  // timestamp ms
    sheetRowIndex: v.optional(v.number()),
    autoApprove: v.boolean(), // default: false
    billingDayOfMonth: v.optional(v.number()),
    withholdingRate: v.optional(v.number()),  // Decimal(5,4)
    emails: v.optional(v.string()),
    address: v.optional(v.string()),
    customerNumber: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_billingEntityId", ["billingEntityId"])
    .index("by_partnerId", ["partnerId"])
    .index("by_nextDueDate", ["nextDueDate"])
    .index("by_createdAt", ["createdAt"])
    .index("by_status_nextDueDate", ["status", "nextDueDate"])
    .index("by_customerNumber", ["customerNumber"]),

  // --------------------------------------------------------
  // Invoice  (Prisma: Invoice)
  // --------------------------------------------------------
  invoices: defineTable({
    invoiceNo: v.optional(v.string()),
    billingNo: v.optional(v.string()),
    companyId: v.id("companies"),
    customerName: v.string(),
    attention: v.optional(v.string()),
    customerAddress: v.optional(v.string()),
    customerEmail: v.optional(v.string()),
    customerTin: v.optional(v.string()),
    statementDate: v.number(),   // timestamp ms
    dueDate: v.number(),         // timestamp ms
    periodStart: v.optional(v.number()),     // timestamp ms
    periodEnd: v.optional(v.number()),       // timestamp ms
    periodDescription: v.optional(v.string()),
    serviceFee: v.number(),      // Decimal(15,2)
    vatAmount: v.number(),       // Decimal(15,2), default: 0
    grossAmount: v.number(),     // Decimal(15,2)
    withholdingTax: v.number(),  // Decimal(15,2), default: 0
    netAmount: v.number(),       // Decimal(15,2)
    vatType: vatType,            // default: "VAT"
    hasWithholding: v.boolean(), // default: false
    withholdingCode: v.optional(v.string()),
    billingFrequency: billingFrequency, // default: "MONTHLY"
    monthlyFee: v.optional(v.number()), // Decimal(15,2)
    status: invoiceStatus,       // default: "PENDING"
    approvedById: v.optional(v.id("users")),
    approvedAt: v.optional(v.number()),      // timestamp ms
    rejectedById: v.optional(v.id("users")),
    rejectedAt: v.optional(v.number()),      // timestamp ms
    rejectionReason: v.optional(v.string()),
    rescheduleDate: v.optional(v.number()),  // timestamp ms
    pdfPath: v.optional(v.string()),
    csvPath: v.optional(v.string()),
    emailStatus: emailStatus,    // default: "NOT_SENT"
    emailSentAt: v.optional(v.number()),     // timestamp ms
    emailError: v.optional(v.string()),
    paidAt: v.optional(v.number()),          // timestamp ms
    paidAmount: v.optional(v.number()),      // Decimal(15,2)
    paymentMethod: v.optional(v.string()),
    paymentReference: v.optional(v.string()),
    billingModel: billingModel,  // default: "DIRECT"
    isConsolidated: v.boolean(), // default: false
    remarks: v.optional(v.string()),
    preparedBy: v.optional(v.string()),
    reviewedBy: v.optional(v.string()),
    partnerId: v.optional(v.id("partners")),
    withholdingRate: v.optional(v.number()), // Decimal(5,4)
    customerEmails: v.optional(v.string()),
    voidReason: v.optional(v.string()),
    voidedAt: v.optional(v.number()),        // timestamp ms
    voidedById: v.optional(v.id("users")),
    followUpEnabled: v.boolean(), // default: true
    followUpCount: v.number(),    // default: 0
    lastFollowUpAt: v.optional(v.number()), // timestamp ms
    lastFollowUpLevel: v.number(), // default: 0
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_invoiceNo", ["invoiceNo"])
    .index("by_status", ["status"])
    .index("by_companyId", ["companyId"])
    .index("by_partnerId", ["partnerId"])
    .index("by_createdAt", ["createdAt"])
    .index("by_status_createdAt", ["status", "createdAt"])
    .index("by_paidAt", ["paidAt"])
    .index("by_companyId_status", ["companyId", "status"])
    .index("by_dueDate", ["dueDate"])
    .index("by_emailStatus", ["emailStatus"])
    .index("by_followUpEnabled_status", ["followUpEnabled", "status"]),

  // --------------------------------------------------------
  // InvoiceLineItem  (Prisma: InvoiceLineItem)
  // --------------------------------------------------------
  invoiceLineItems: defineTable({
    invoiceId: v.id("invoices"),
    contractId: v.optional(v.id("contracts")),
    date: v.optional(v.number()),        // timestamp ms
    reference: v.optional(v.string()),
    description: v.string(),
    poNumber: v.optional(v.string()),
    quantity: v.number(),    // default: 1
    unitPrice: v.number(),   // Decimal(15,2)
    serviceFee: v.number(),  // Decimal(15,2)
    vatAmount: v.number(),   // Decimal(15,2), default: 0
    withholdingTax: v.number(), // Decimal(15,2), default: 0
    amount: v.number(),      // Decimal(15,2)
    endClientName: v.optional(v.string()),
    employeeCount: v.optional(v.number()),
    sortOrder: v.number(),   // default: 0
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_invoiceId", ["invoiceId"])
    .index("by_contractId", ["contractId"]),

  // --------------------------------------------------------
  // InvoiceAttachment  (Prisma: InvoiceAttachment)
  // --------------------------------------------------------
  invoiceAttachments: defineTable({
    invoiceId: v.id("invoices"),
    filename: v.string(),
    mimeType: v.string(),
    size: v.number(),
    storageId: v.id("_storage"), // Convex file storage (replaces Prisma Bytes)
    uploadedAt: v.number(), // timestamp ms
    uploadedBy: v.optional(v.string()),
  })
    .index("by_invoiceId", ["invoiceId"]),

  // --------------------------------------------------------
  // RcbcEndClient  (Prisma: RcbcEndClient)
  // --------------------------------------------------------
  rcbcEndClients: defineTable({
    name: v.string(),
    employeeCount: v.number(),
    month: v.number(),           // timestamp ms
    isActive: v.boolean(),       // default: true
    ratePerEmployee: v.number(), // Decimal(10,2), default: 0
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_name_month", ["name", "month"]),

  // --------------------------------------------------------
  // EmailLog  (Prisma: EmailLog)
  // --------------------------------------------------------
  emailLogs: defineTable({
    invoiceId: v.id("invoices"),
    toEmail: v.string(),
    subject: v.string(),
    status: emailStatus,
    sendGridId: v.optional(v.string()),
    error: v.optional(v.string()),
    sentAt: v.optional(v.number()), // timestamp ms
    createdAt: v.number(),
  })
    .index("by_invoiceId", ["invoiceId"]),

  // --------------------------------------------------------
  // FollowUpLog  (Prisma: FollowUpLog)
  // --------------------------------------------------------
  followUpLogs: defineTable({
    invoiceId: v.id("invoices"),
    level: v.number(), // 1, 2, or 3 (escalation level)
    sentAt: v.number(), // timestamp ms
    toEmail: v.string(),
    subject: v.string(),
    status: emailStatus, // default: "NOT_SENT"
    templateId: v.optional(v.id("emailTemplates")),
    messageId: v.optional(v.string()),
    error: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_invoiceId", ["invoiceId"])
    .index("by_sentAt", ["sentAt"])
    .index("by_invoiceId_level", ["invoiceId", "level"])
    .index("by_status", ["status"]),

  // --------------------------------------------------------
  // AuditLog  (Prisma: AuditLog)
  // --------------------------------------------------------
  auditLogs: defineTable({
    userId: v.optional(v.id("users")),
    action: v.string(),
    entityType: v.string(),
    entityId: v.string(),
    details: v.optional(v.any()), // JSON
    ipAddress: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_createdAt", ["createdAt"])
    .index("by_entityId_entityType", ["entityId", "entityType"])
    .index("by_entityType_createdAt", ["entityType", "createdAt"])
    .index("by_action", ["action"])
    .index("by_action_createdAt", ["action", "createdAt"]),

  // --------------------------------------------------------
  // SystemConfig  (Prisma: SystemConfig)
  // --------------------------------------------------------
  systemConfig: defineTable({
    key: v.string(),
    value: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_key", ["key"]),

  // --------------------------------------------------------
  // ScheduledJob  (Prisma: ScheduledJob)
  // --------------------------------------------------------
  scheduledJobs: defineTable({
    name: v.string(),
    cronExpr: v.string(),
    lastRun: v.optional(v.number()),  // timestamp ms
    nextRun: v.optional(v.number()),  // timestamp ms
    isEnabled: v.boolean(), // default: true
    status: jobStatus,      // default: "IDLE"
    lastError: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }),

  // --------------------------------------------------------
  // JobRun  (Prisma: JobRun)
  // --------------------------------------------------------
  jobRuns: defineTable({
    jobName: v.string(),
    startedAt: v.number(),           // timestamp ms
    completedAt: v.optional(v.number()), // timestamp ms
    status: jobStatus,
    itemsProcessed: v.number(), // default: 0
    errors: v.optional(v.any()), // JSON
    createdAt: v.number(),
  }),

  // --------------------------------------------------------
  // Settings  (Prisma: Settings)
  // --------------------------------------------------------
  settings: defineTable({
    key: v.string(),
    value: v.any(), // JSON
    description: v.optional(v.string()),
    category: v.string(), // default: "general"
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_key", ["key"]),

  // --------------------------------------------------------
  // Notification  (Prisma: Notification)
  // --------------------------------------------------------
  notifications: defineTable({
    userId: v.optional(v.id("users")),
    type: notificationType,
    title: v.string(),
    message: v.string(),
    link: v.optional(v.string()),
    entityType: v.optional(v.string()),
    entityId: v.optional(v.string()),
    isRead: v.boolean(), // default: false
    createdAt: v.number(),
  })
    .index("by_userId_isRead", ["userId", "isRead"])
    .index("by_createdAt", ["createdAt"]),

  // --------------------------------------------------------
  // ScheduledBilling  (Prisma: ScheduledBilling)
  // --------------------------------------------------------
  scheduledBillings: defineTable({
    contractId: v.id("contracts"),
    billingEntityId: v.id("companies"),
    billingAmount: v.number(),   // Decimal(15,2)
    vatType: vatType,            // default: "VAT"
    hasWithholding: v.boolean(), // default: false
    description: v.optional(v.string()),
    frequency: billingFrequency, // default: "MONTHLY"
    billingDayOfMonth: v.number(),
    startDate: v.number(),       // timestamp ms
    endDate: v.optional(v.number()),         // timestamp ms
    nextBillingDate: v.optional(v.number()), // timestamp ms
    autoApprove: v.boolean(),    // default: false
    autoSendEnabled: v.boolean(), // default: true
    status: scheduleStatus,      // default: "PENDING"
    remarks: v.optional(v.string()),
    withholdingRate: v.optional(v.number()), // Decimal(5,4)
    approvedAt: v.optional(v.number()),      // timestamp ms
    approvedById: v.optional(v.id("users")),
    createdById: v.optional(v.id("users")),
    customIntervalUnit: v.optional(intervalUnit),
    customIntervalValue: v.optional(v.number()),
    rejectedAt: v.optional(v.number()),      // timestamp ms
    rejectedById: v.optional(v.id("users")),
    rejectionReason: v.optional(v.string()),
    dueDayOfMonth: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_billingDayOfMonth", ["billingDayOfMonth"])
    .index("by_status_nextBillingDate", ["status", "nextBillingDate"])
    .index("by_contractId", ["contractId"])
    .index("by_billingEntityId", ["billingEntityId"]),

  // --------------------------------------------------------
  // ScheduledBillingRun  (Prisma: ScheduledBillingRun)
  // --------------------------------------------------------
  scheduledBillingRuns: defineTable({
    scheduledBillingId: v.id("scheduledBillings"),
    invoiceId: v.optional(v.id("invoices")),
    runDate: v.number(),     // timestamp ms
    status: runStatus,       // default: "PENDING"
    errorMessage: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_scheduledBillingId", ["scheduledBillingId"])
    .index("by_runDate", ["runDate"]),

  // --------------------------------------------------------
  // HitpayPaymentRequest  (Prisma: HitpayPaymentRequest)
  // --------------------------------------------------------
  hitpayPaymentRequests: defineTable({
    invoiceId: v.id("invoices"),
    hitpayRequestId: v.string(),
    checkoutUrl: v.optional(v.string()),
    amount: v.number(),      // Decimal(15,2)
    currency: v.string(),    // default: "PHP"
    status: hitpayPaymentStatus, // default: "PENDING"
    paidAt: v.optional(v.number()),          // timestamp ms
    paymentMethod: v.optional(v.string()),
    paymentReference: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_invoiceId", ["invoiceId"])
    .index("by_hitpayRequestId", ["hitpayRequestId"]),

  // --------------------------------------------------------
  // BridgeMapping  (Prisma: BridgeMapping)
  // --------------------------------------------------------
  bridgeMappings: defineTable({
    nexusAgreementId: v.string(),
    nexusOrganizationId: v.string(),
    contractId: v.id("contracts"),
    syncStatus: v.string(),  // default: "success"
    syncError: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_nexusAgreementId", ["nexusAgreementId"])
    .index("by_contractId", ["contractId"]),

  // --------------------------------------------------------
  // ContractInvoice  (Junction table for many-to-many)
  // Prisma: Contract.invoices ↔ Invoice.contracts
  //         via @relation("ContractToInvoice")
  // --------------------------------------------------------
  contractInvoices: defineTable({
    contractId: v.id("contracts"),
    invoiceId: v.id("invoices"),
  })
    .index("by_contractId", ["contractId"])
    .index("by_invoiceId", ["invoiceId"])
    .index("by_contractId_invoiceId", ["contractId", "invoiceId"]),
});
