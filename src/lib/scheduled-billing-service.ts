import prisma from './prisma';
import { ScheduleStatus, BillingFrequency, VatType, IntervalUnit, InvoiceStatus } from '@/generated/prisma';

// ==================== TYPES ====================

export interface CreateScheduledBillingInput {
  contractId: string;
  billingEntityId: string;
  billingAmount: number;
  vatType?: VatType;
  hasWithholding?: boolean;
  withholdingRate?: number;  // Rate as decimal (e.g., 0.02 = 2%)
  description?: string;
  frequency?: BillingFrequency;
  billingDayOfMonth: number;
  dueDayOfMonth?: number;    // Day of month invoice is due (defaults to billingDayOfMonth)
  startDate?: Date;
  endDate?: Date;
  autoApprove?: boolean;
  autoSendEnabled?: boolean;
  remarks?: string;
  // Custom frequency fields
  customIntervalValue?: number;
  customIntervalUnit?: IntervalUnit;
  // Creator tracking
  createdById?: string;
}

export interface UpdateScheduledBillingInput {
  billingAmount?: number;
  vatType?: VatType;
  hasWithholding?: boolean;
  withholdingRate?: number;  // Rate as decimal (e.g., 0.02 = 2%)
  description?: string;
  frequency?: BillingFrequency;
  billingDayOfMonth?: number;
  startDate?: Date;
  endDate?: Date | null;
  autoApprove?: boolean;
  autoSendEnabled?: boolean;
  status?: ScheduleStatus;
  remarks?: string;
  // Custom frequency fields
  customIntervalValue?: number;
  customIntervalUnit?: IntervalUnit;
}

export interface ScheduledBillingFilters {
  contractId?: string;
  billingEntityId?: string;
  status?: ScheduleStatus;
  frequency?: BillingFrequency;
}

// ==================== CRUD OPERATIONS ====================

export async function createScheduledBilling(data: CreateScheduledBillingInput) {
  // Calculate next billing date
  const nextBillingDate = calculateNextBillingDate(
    data.billingDayOfMonth,
    data.frequency || BillingFrequency.MONTHLY,
    data.startDate || new Date(),
    false,
    data.customIntervalValue,
    data.customIntervalUnit
  );

  return prisma.scheduledBilling.create({
    data: {
      contractId: data.contractId,
      billingEntityId: data.billingEntityId,
      billingAmount: data.billingAmount,
      vatType: data.vatType || VatType.VAT,
      hasWithholding: data.hasWithholding ?? false,
      withholdingRate: data.withholdingRate,
      description: data.description,
      frequency: data.frequency || BillingFrequency.MONTHLY,
      billingDayOfMonth: data.billingDayOfMonth,
      dueDayOfMonth: data.dueDayOfMonth || data.billingDayOfMonth,  // Default to billing day if not specified
      startDate: data.startDate || new Date(),
      endDate: data.endDate,
      nextBillingDate,
      autoApprove: data.autoApprove ?? false,
      autoSendEnabled: data.autoSendEnabled ?? true,
      status: ScheduleStatus.PENDING,  // New schedules start as PENDING
      remarks: data.remarks,
      // Custom frequency fields
      customIntervalValue: data.customIntervalValue,
      customIntervalUnit: data.customIntervalUnit,
      // Creator tracking
      createdById: data.createdById,
    },
    include: {
      contract: {
        select: {
          id: true,
          companyName: true,
          productType: true,
          email: true,
          contactPerson: true,
        },
      },
      billingEntity: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
      createdBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });
}

export async function getScheduledBilling(id: string) {
  return prisma.scheduledBilling.findUnique({
    where: { id },
    include: {
      contract: {
        select: {
          id: true,
          companyName: true,
          productType: true,
          email: true,
          contactPerson: true,
          tin: true,
          partnerId: true,
          partner: {
            select: {
              id: true,
              name: true,
              billingModel: true,
              invoiceTo: true,
              attention: true,
              address: true,
              email: true,
            },
          },
        },
      },
      billingEntity: {
        select: {
          id: true,
          code: true,
          name: true,
          invoicePrefix: true,
          nextInvoiceNo: true,
        },
      },
      runs: {
        orderBy: { runDate: 'desc' },
        take: 10,
        include: {
          invoice: {
            select: {
              id: true,
              billingNo: true,
              status: true,
              netAmount: true,
            },
          },
        },
      },
      createdBy: {
        select: { id: true, name: true, email: true },
      },
      approvedBy: {
        select: { id: true, name: true, email: true },
      },
      rejectedBy: {
        select: { id: true, name: true, email: true },
      },
    },
  });
}

export async function updateScheduledBilling(id: string, data: UpdateScheduledBillingInput) {
  // If billing day or frequency changed, recalculate next billing date
  let nextBillingDate: Date | undefined;
  if (data.billingDayOfMonth !== undefined || data.frequency !== undefined) {
    const current = await prisma.scheduledBilling.findUnique({
      where: { id },
      select: { billingDayOfMonth: true, frequency: true, startDate: true },
    });

    if (current) {
      nextBillingDate = calculateNextBillingDate(
        data.billingDayOfMonth ?? current.billingDayOfMonth,
        data.frequency ?? current.frequency,
        current.startDate
      );
    }
  }

  return prisma.scheduledBilling.update({
    where: { id },
    data: {
      ...data,
      ...(nextBillingDate && { nextBillingDate }),
    },
    include: {
      contract: {
        select: {
          id: true,
          companyName: true,
          productType: true,
        },
      },
      billingEntity: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
    },
  });
}

export async function deleteScheduledBilling(id: string) {
  // First delete all runs
  await prisma.scheduledBillingRun.deleteMany({
    where: { scheduledBillingId: id },
  });

  return prisma.scheduledBilling.delete({
    where: { id },
  });
}

export async function listScheduledBillings(filters?: ScheduledBillingFilters) {
  return prisma.scheduledBilling.findMany({
    where: {
      ...(filters?.contractId && { contractId: filters.contractId }),
      ...(filters?.billingEntityId && { billingEntityId: filters.billingEntityId }),
      ...(filters?.status && { status: filters.status }),
      ...(filters?.frequency && { frequency: filters.frequency }),
    },
    include: {
      contract: {
        select: {
          id: true,
          companyName: true,
          productType: true,
          email: true,
        },
      },
      billingEntity: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
      createdBy: {
        select: { id: true, name: true, email: true },
      },
      approvedBy: {
        select: { id: true, name: true, email: true },
      },
      _count: {
        select: { runs: true },
      },
    },
    orderBy: [
      { status: 'asc' },
      { nextBillingDate: 'asc' },
    ],
  });
}

// ==================== SCHEDULING OPERATIONS ====================

export async function getSchedulesDueToday() {
  const today = new Date();
  const dayOfMonth = today.getDate();

  // Get schedules where:
  // 1. Status is ACTIVE
  // 2. billingDayOfMonth matches today
  // 3. startDate <= today
  // 4. endDate is null OR endDate > today
  return prisma.scheduledBilling.findMany({
    where: {
      status: ScheduleStatus.ACTIVE,
      billingDayOfMonth: dayOfMonth,
      startDate: { lte: today },
      OR: [
        { endDate: null },
        { endDate: { gt: today } },
      ],
    },
    include: {
      contract: {
        include: {
          partner: true,
        },
      },
      billingEntity: true,
    },
  });
}

export async function pauseSchedule(id: string) {
  return prisma.scheduledBilling.update({
    where: { id },
    data: { status: ScheduleStatus.PAUSED },
  });
}

export async function resumeSchedule(id: string) {
  // Recalculate next billing date when resuming
  const schedule = await prisma.scheduledBilling.findUnique({
    where: { id },
    select: { billingDayOfMonth: true, frequency: true, startDate: true },
  });

  if (!schedule) {
    throw new Error('Schedule not found');
  }

  const nextBillingDate = calculateNextBillingDate(
    schedule.billingDayOfMonth,
    schedule.frequency,
    schedule.startDate
  );

  return prisma.scheduledBilling.update({
    where: { id },
    data: {
      status: ScheduleStatus.ACTIVE,
      nextBillingDate,
    },
  });
}

export async function endSchedule(id: string) {
  return prisma.scheduledBilling.update({
    where: { id },
    data: {
      status: ScheduleStatus.ENDED,
      endDate: new Date(),
    },
  });
}

// ==================== RUN TRACKING ====================

export async function createScheduledBillingRun(
  scheduledBillingId: string,
  invoiceId: string | null,
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED',
  errorMessage?: string
) {
  return prisma.scheduledBillingRun.create({
    data: {
      scheduledBillingId,
      invoiceId,
      status,
      errorMessage,
      runDate: new Date(),
    },
  });
}

export async function updateNextBillingDate(id: string) {
  const schedule = await prisma.scheduledBilling.findUnique({
    where: { id },
    select: { billingDayOfMonth: true, frequency: true, startDate: true },
  });

  if (!schedule) {
    throw new Error('Schedule not found');
  }

  const nextBillingDate = calculateNextBillingDate(
    schedule.billingDayOfMonth,
    schedule.frequency,
    schedule.startDate,
    true // Skip to next period
  );

  return prisma.scheduledBilling.update({
    where: { id },
    data: { nextBillingDate },
  });
}

// ==================== HELPER FUNCTIONS ====================

export function calculateNextBillingDate(
  billingDayOfMonth: number,
  frequency: BillingFrequency,
  startDate: Date,
  skipCurrent: boolean = false,
  customIntervalValue?: number,
  customIntervalUnit?: IntervalUnit
): Date {
  const now = new Date();
  let nextDate = new Date(now.getFullYear(), now.getMonth(), billingDayOfMonth);

  // Handle months with fewer days (e.g., billing day 31 in February)
  const lastDayOfMonth = new Date(nextDate.getFullYear(), nextDate.getMonth() + 1, 0).getDate();
  if (billingDayOfMonth > lastDayOfMonth) {
    nextDate.setDate(lastDayOfMonth);
  }

  // If the calculated date is before start date, use start date as reference
  if (nextDate < startDate) {
    nextDate = new Date(startDate.getFullYear(), startDate.getMonth(), billingDayOfMonth);
    const lastDay = new Date(nextDate.getFullYear(), nextDate.getMonth() + 1, 0).getDate();
    if (billingDayOfMonth > lastDay) {
      nextDate.setDate(lastDay);
    }
  }

  // If date has passed or we need to skip current, move to next period
  if (nextDate <= now || skipCurrent) {
    switch (frequency) {
      case BillingFrequency.MONTHLY:
        nextDate.setMonth(nextDate.getMonth() + 1);
        break;
      case BillingFrequency.QUARTERLY:
        nextDate.setMonth(nextDate.getMonth() + 3);
        break;
      case BillingFrequency.ANNUALLY:
        nextDate.setFullYear(nextDate.getFullYear() + 1);
        break;
      case BillingFrequency.CUSTOM:
        // Handle custom intervals
        if (customIntervalValue && customIntervalUnit) {
          if (customIntervalUnit === IntervalUnit.DAYS) {
            // For DAYS: Add interval days from current date
            nextDate = new Date(now);
            nextDate.setDate(nextDate.getDate() + customIntervalValue);
          } else if (customIntervalUnit === IntervalUnit.MONTHS) {
            // For MONTHS: Add interval months, keep billingDayOfMonth
            nextDate.setMonth(nextDate.getMonth() + customIntervalValue);
            // Re-adjust for month length
            const newLastDay = new Date(nextDate.getFullYear(), nextDate.getMonth() + 1, 0).getDate();
            if (billingDayOfMonth > newLastDay) {
              nextDate.setDate(newLastDay);
            } else {
              nextDate.setDate(billingDayOfMonth);
            }
          }
        } else {
          // Fallback to monthly if custom values not set
          nextDate.setMonth(nextDate.getMonth() + 1);
        }
        break;
    }

    // Re-adjust for month length after moving (for non-custom frequencies)
    if (frequency !== BillingFrequency.CUSTOM) {
      const newLastDay = new Date(nextDate.getFullYear(), nextDate.getMonth() + 1, 0).getDate();
      if (billingDayOfMonth > newLastDay) {
        nextDate.setDate(newLastDay);
      } else {
        nextDate.setDate(billingDayOfMonth);
      }
    }
  }

  return nextDate;
}

// Check if an invoice already exists for this schedule's current period
export async function checkExistingInvoiceForPeriod(
  scheduledBillingId: string
): Promise<boolean> {
  const schedule = await prisma.scheduledBilling.findUnique({
    where: { id: scheduledBillingId },
    select: { frequency: true },
  });

  if (!schedule) return false;

  const now = new Date();
  let periodStart: Date;
  let periodEnd: Date;

  switch (schedule.frequency) {
    case BillingFrequency.MONTHLY:
      periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      break;
    case BillingFrequency.QUARTERLY:
      const quarter = Math.floor(now.getMonth() / 3);
      periodStart = new Date(now.getFullYear(), quarter * 3, 1);
      periodEnd = new Date(now.getFullYear(), quarter * 3 + 3, 0, 23, 59, 59);
      break;
    case BillingFrequency.ANNUALLY:
      periodStart = new Date(now.getFullYear(), 0, 1);
      periodEnd = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
      break;
    case BillingFrequency.CUSTOM:
    default:
      // For custom intervals, use the current month as the period
      periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      break;
  }

  const existingRun = await prisma.scheduledBillingRun.findFirst({
    where: {
      scheduledBillingId,
      status: 'SUCCESS',
      runDate: {
        gte: periodStart,
        lte: periodEnd,
      },
    },
    include: {
      invoice: {
        select: { status: true },
      },
    },
  });

  // If run exists but invoice was voided or cancelled, allow regeneration
  if (existingRun?.invoice) {
    const invoiceStatus = existingRun.invoice.status;
    if (invoiceStatus === InvoiceStatus.CANCELLED || invoiceStatus === InvoiceStatus.VOID) {
      return false; // Allow new invoice to be generated
    }
  }

  return !!existingRun;
}

// Get stats for dashboard
export async function getScheduledBillingStats() {
  const [pending, active, paused, ended] = await Promise.all([
    prisma.scheduledBilling.count({ where: { status: ScheduleStatus.PENDING } }),
    prisma.scheduledBilling.count({ where: { status: ScheduleStatus.ACTIVE } }),
    prisma.scheduledBilling.count({ where: { status: ScheduleStatus.PAUSED } }),
    prisma.scheduledBilling.count({ where: { status: ScheduleStatus.ENDED } }),
  ]);

  // Get schedules due in next 7 days
  const today = new Date();
  const nextWeek = new Date();
  nextWeek.setDate(today.getDate() + 7);

  const dueThisWeek = await prisma.scheduledBilling.count({
    where: {
      status: ScheduleStatus.ACTIVE,
      nextBillingDate: {
        gte: today,
        lte: nextWeek,
      },
    },
  });

  return {
    pending,
    active,
    paused,
    ended,
    dueThisWeek,
    total: pending + active + paused + ended,
  };
}

// ==================== APPROVAL WORKFLOW ====================

export async function approveSchedule(id: string, approverId: string) {
  const schedule = await prisma.scheduledBilling.findUnique({
    where: { id },
    select: { status: true },
  });

  if (!schedule) {
    throw new Error('Schedule not found');
  }

  if (schedule.status !== ScheduleStatus.PENDING) {
    throw new Error('Only pending schedules can be approved');
  }

  return prisma.scheduledBilling.update({
    where: { id },
    data: {
      status: ScheduleStatus.ACTIVE,
      approvedById: approverId,
      approvedAt: new Date(),
    },
    include: {
      contract: {
        select: {
          id: true,
          companyName: true,
          productType: true,
        },
      },
      billingEntity: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
      approvedBy: {
        select: { id: true, name: true, email: true },
      },
    },
  });
}

export async function rejectSchedule(id: string, rejectorId: string, reason?: string) {
  const schedule = await prisma.scheduledBilling.findUnique({
    where: { id },
    select: { status: true },
  });

  if (!schedule) {
    throw new Error('Schedule not found');
  }

  if (schedule.status !== ScheduleStatus.PENDING) {
    throw new Error('Only pending schedules can be rejected');
  }

  return prisma.scheduledBilling.update({
    where: { id },
    data: {
      status: ScheduleStatus.ENDED,
      rejectedById: rejectorId,
      rejectedAt: new Date(),
      rejectionReason: reason,
    },
    include: {
      contract: {
        select: {
          id: true,
          companyName: true,
          productType: true,
        },
      },
      billingEntity: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
      rejectedBy: {
        select: { id: true, name: true, email: true },
      },
    },
  });
}

// Get run history with filtering
export async function getScheduledBillingRuns(options?: {
  scheduledBillingId?: string;
  daysBack?: number;
  limit?: number;
}) {
  const where: any = {};

  if (options?.scheduledBillingId) {
    where.scheduledBillingId = options.scheduledBillingId;
  }

  if (options?.daysBack && options.daysBack > 0) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - options.daysBack);
    where.runDate = { gte: startDate };
  }

  return prisma.scheduledBillingRun.findMany({
    where,
    include: {
      scheduledBilling: {
        include: {
          contract: {
            select: {
              id: true,
              companyName: true,
              productType: true,
            },
          },
          billingEntity: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
        },
      },
      invoice: {
        select: {
          id: true,
          billingNo: true,
          status: true,
          netAmount: true,
          customerName: true,
        },
      },
    },
    orderBy: { runDate: 'desc' },
    take: options?.limit || 100,
  });
}
