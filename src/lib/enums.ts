// ============================================================
// Plain TypeScript enums (replaces @/generated/prisma enum imports)
// ============================================================

export const UserRole = {
  ADMIN: 'ADMIN',
  APPROVER: 'APPROVER',
  VIEWER: 'VIEWER',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const BillingModel = {
  DIRECT: 'DIRECT',
  GLOBE_INNOVE: 'GLOBE_INNOVE',
  RCBC_CONSOLIDATED: 'RCBC_CONSOLIDATED',
} as const;
export type BillingModel = (typeof BillingModel)[keyof typeof BillingModel];

export const ProductType = {
  ACCOUNTING: 'ACCOUNTING',
  PAYROLL: 'PAYROLL',
  COMPLIANCE: 'COMPLIANCE',
  HR: 'HR',
} as const;
export type ProductType = (typeof ProductType)[keyof typeof ProductType];

export const ContractStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  STOPPED: 'STOPPED',
  NOT_STARTED: 'NOT_STARTED',
} as const;
export type ContractStatus = (typeof ContractStatus)[keyof typeof ContractStatus];

export const VatType = {
  VAT: 'VAT',
  NON_VAT: 'NON_VAT',
} as const;
export type VatType = (typeof VatType)[keyof typeof VatType];

export const BillingType = {
  RECURRING: 'RECURRING',
  ONE_TIME: 'ONE_TIME',
} as const;
export type BillingType = (typeof BillingType)[keyof typeof BillingType];

export const BillingFrequency = {
  MONTHLY: 'MONTHLY',
  QUARTERLY: 'QUARTERLY',
  ANNUALLY: 'ANNUALLY',
  CUSTOM: 'CUSTOM',
} as const;
export type BillingFrequency = (typeof BillingFrequency)[keyof typeof BillingFrequency];

export const IntervalUnit = {
  DAYS: 'DAYS',
  MONTHS: 'MONTHS',
} as const;
export type IntervalUnit = (typeof IntervalUnit)[keyof typeof IntervalUnit];

export const InvoiceStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  SENT: 'SENT',
  PAID: 'PAID',
  CANCELLED: 'CANCELLED',
  VOID: 'VOID',
} as const;
export type InvoiceStatus = (typeof InvoiceStatus)[keyof typeof InvoiceStatus];

export const EmailStatus = {
  NOT_SENT: 'NOT_SENT',
  QUEUED: 'QUEUED',
  SENT: 'SENT',
  FAILED: 'FAILED',
} as const;
export type EmailStatus = (typeof EmailStatus)[keyof typeof EmailStatus];

export const JobStatus = {
  IDLE: 'IDLE',
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const;
export type JobStatus = (typeof JobStatus)[keyof typeof JobStatus];

export const NotificationType = {
  INVOICE_PENDING: 'INVOICE_PENDING',
  INVOICE_APPROVED: 'INVOICE_APPROVED',
  INVOICE_REJECTED: 'INVOICE_REJECTED',
  INVOICE_SENT: 'INVOICE_SENT',
  INVOICE_PAID: 'INVOICE_PAID',
  INVOICE_OVERDUE: 'INVOICE_OVERDUE',
  INVOICE_FOLLOW_UP: 'INVOICE_FOLLOW_UP',
  SYSTEM: 'SYSTEM',
  SCHEDULE_PENDING: 'SCHEDULE_PENDING',
  SCHEDULE_APPROVED: 'SCHEDULE_APPROVED',
  SCHEDULE_REJECTED: 'SCHEDULE_REJECTED',
  INVOICE_VOID: 'INVOICE_VOID',
} as const;
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];

export const ScheduleStatus = {
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  ENDED: 'ENDED',
  PENDING: 'PENDING',
} as const;
export type ScheduleStatus = (typeof ScheduleStatus)[keyof typeof ScheduleStatus];

export const RunStatus = {
  PENDING: 'PENDING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
  SKIPPED: 'SKIPPED',
} as const;
export type RunStatus = (typeof RunStatus)[keyof typeof RunStatus];

export const HitpayPaymentStatus = {
  PENDING: 'PENDING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const;
export type HitpayPaymentStatus = (typeof HitpayPaymentStatus)[keyof typeof HitpayPaymentStatus];
