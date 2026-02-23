import { convexClient, api } from '@/lib/convex';
import { ScheduleStatus, BillingFrequency, VatType, IntervalUnit, InvoiceStatus } from '@/lib/enums';

// ==================== TYPES ====================

export interface CreateScheduledBillingInput {
  contractId: string;
  billingEntityId: string;
  billingAmount: number;
  vatType?: string;
  hasWithholding?: boolean;
  withholdingRate?: number;
  description?: string;
  frequency?: string;
  billingDayOfMonth: number;
  dueDayOfMonth?: number;
  startDate?: Date;
  endDate?: Date;
  autoApprove?: boolean;
  autoSendEnabled?: boolean;
  remarks?: string;
  customIntervalValue?: number;
  customIntervalUnit?: string;
  createdById?: string;
}

export interface UpdateScheduledBillingInput {
  billingAmount?: number;
  vatType?: string;
  hasWithholding?: boolean;
  withholdingRate?: number;
  description?: string;
  frequency?: string;
  billingDayOfMonth?: number;
  startDate?: Date;
  endDate?: Date | null;
  autoApprove?: boolean;
  autoSendEnabled?: boolean;
  status?: string;
  remarks?: string;
  customIntervalValue?: number;
  customIntervalUnit?: string;
}

export interface ScheduledBillingFilters {
  contractId?: string;
  billingEntityId?: string;
  status?: string;
  frequency?: string;
}

// ==================== CRUD OPERATIONS ====================

export async function createScheduledBilling(data: CreateScheduledBillingInput) {
  // Calculate next billing date
  const nextBillingDate = calculateNextBillingDate(
    data.billingDayOfMonth,
    (data.frequency || BillingFrequency.MONTHLY) as any,
    data.startDate || new Date(),
    false,
    data.customIntervalValue,
    data.customIntervalUnit as any
  );

  const id = await convexClient.mutation(api.scheduledBillings.create, {
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
      dueDayOfMonth: data.dueDayOfMonth || data.billingDayOfMonth,
      startDate: (data.startDate || new Date()).getTime(),
      endDate: data.endDate?.getTime(),
      nextBillingDate: nextBillingDate.getTime(),
      autoApprove: data.autoApprove ?? false,
      autoSendEnabled: data.autoSendEnabled ?? true,
      status: ScheduleStatus.PENDING,
      remarks: data.remarks,
      customIntervalValue: data.customIntervalValue,
      customIntervalUnit: data.customIntervalUnit,
      createdById: data.createdById,
    },
  });

  return convexClient.query(api.scheduledBillings.getById, { id });
}

export async function getScheduledBilling(id: string) {
  const sb = await convexClient.query(api.scheduledBillings.getById, { id: id as any });
  if (!sb) return null;

  // Get runs
  const runs = await convexClient.query(api.scheduledBillingRuns.listByScheduledBillingId, { scheduledBillingId: id as any });

  // Get related users
  const createdBy = sb.createdById ? await convexClient.query(api.users.getById, { id: sb.createdById as any }) : null;
  const approvedBy = sb.approvedById ? await convexClient.query(api.users.getById, { id: sb.approvedById as any }) : null;
  const rejectedBy = sb.rejectedById ? await convexClient.query(api.users.getById, { id: sb.rejectedById as any }) : null;

  return { ...sb, runs: runs.slice(0, 10), createdBy, approvedBy, rejectedBy };
}

export async function updateScheduledBilling(id: string, data: UpdateScheduledBillingInput) {
  // If billing day or frequency changed, recalculate next billing date
  let nextBillingDate: Date | undefined;
  if (data.billingDayOfMonth !== undefined || data.frequency !== undefined) {
    const current = await convexClient.query(api.scheduledBillings.getById, { id: id as any });

    if (current) {
      nextBillingDate = calculateNextBillingDate(
        data.billingDayOfMonth ?? current.billingDayOfMonth,
        (data.frequency ?? current.frequency) as any,
        new Date(current.startDate)
      );
    }
  }

  const updateData: any = { ...data };
  if (data.startDate) updateData.startDate = data.startDate.getTime();
  if (data.endDate) updateData.endDate = data.endDate.getTime();
  if (data.endDate === null) updateData.endDate = undefined;
  if (nextBillingDate) updateData.nextBillingDate = nextBillingDate.getTime();

  // Remove Date objects (already converted to timestamps)
  delete updateData.startDate;
  delete updateData.endDate;
  if (data.startDate) updateData.startDate = data.startDate.getTime();
  if (data.endDate !== undefined) updateData.endDate = data.endDate ? data.endDate.getTime() : undefined;

  await convexClient.mutation(api.scheduledBillings.update, { id: id as any, data: updateData });
  return convexClient.query(api.scheduledBillings.getById, { id: id as any });
}

export async function deleteScheduledBilling(id: string) {
  return convexClient.mutation(api.scheduledBillings.remove, { id: id as any });
}

export async function listScheduledBillings(filters?: ScheduledBillingFilters) {
  const result = await convexClient.query(api.scheduledBillings.list, {
    status: filters?.status,
    billingEntityId: filters?.billingEntityId as any,
  });

  let items = result.items;

  // Client-side filter for contractId and frequency
  if (filters?.contractId) items = items.filter((s: any) => s.contractId === filters.contractId);
  if (filters?.frequency) items = items.filter((s: any) => s.frequency === filters.frequency);

  return items;
}

// ==================== SCHEDULING OPERATIONS ====================

export async function getSchedulesDueToday() {
  const today = new Date();
  const dayOfMonth = today.getDate();
  const todayMs = today.getTime();

  const schedules = await convexClient.query(api.scheduledBillings.listDueToday, { dayOfMonth });

  // Filter: startDate <= today AND (endDate is null OR endDate > today)
  return schedules.filter((s: any) => {
    if (s.startDate > todayMs) return false;
    if (s.endDate && s.endDate <= todayMs) return false;
    return true;
  });
}

export async function pauseSchedule(id: string) {
  return convexClient.mutation(api.scheduledBillings.update, {
    id: id as any,
    data: { status: ScheduleStatus.PAUSED },
  });
}

export async function resumeSchedule(id: string) {
  const schedule = await convexClient.query(api.scheduledBillings.getById, { id: id as any });

  if (!schedule) {
    throw new Error('Schedule not found');
  }

  const nextBillingDate = calculateNextBillingDate(
    schedule.billingDayOfMonth,
    schedule.frequency as any,
    new Date(schedule.startDate)
  );

  return convexClient.mutation(api.scheduledBillings.update, {
    id: id as any,
    data: {
      status: ScheduleStatus.ACTIVE,
      nextBillingDate: nextBillingDate.getTime(),
    },
  });
}

export async function endSchedule(id: string) {
  return convexClient.mutation(api.scheduledBillings.update, {
    id: id as any,
    data: {
      status: ScheduleStatus.ENDED,
      endDate: Date.now(),
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
  return convexClient.mutation(api.scheduledBillingRuns.create, {
    scheduledBillingId: scheduledBillingId as any,
    invoiceId: invoiceId as any || undefined,
    status,
    errorMessage,
    runDate: Date.now(),
  });
}

export async function updateNextBillingDate(id: string) {
  const schedule = await convexClient.query(api.scheduledBillings.getById, { id: id as any });

  if (!schedule) {
    throw new Error('Schedule not found');
  }

  const nextBillingDate = calculateNextBillingDate(
    schedule.billingDayOfMonth,
    schedule.frequency as any,
    new Date(schedule.startDate),
    true // Skip to next period
  );

  return convexClient.mutation(api.scheduledBillings.update, {
    id: id as any,
    data: { nextBillingDate: nextBillingDate.getTime() },
  });
}

// ==================== HELPER FUNCTIONS ====================

export function calculateNextBillingDate(
  billingDayOfMonth: number,
  frequency: string,
  startDate: Date,
  skipCurrent: boolean = false,
  customIntervalValue?: number,
  customIntervalUnit?: string
): Date {
  const now = new Date();
  let nextDate = new Date(now.getFullYear(), now.getMonth(), billingDayOfMonth);

  // Handle months with fewer days
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
        if (customIntervalValue && customIntervalUnit) {
          if (customIntervalUnit === IntervalUnit.DAYS) {
            nextDate = new Date(now);
            nextDate.setDate(nextDate.getDate() + customIntervalValue);
          } else if (customIntervalUnit === IntervalUnit.MONTHS) {
            nextDate.setMonth(nextDate.getMonth() + customIntervalValue);
            const newLastDay = new Date(nextDate.getFullYear(), nextDate.getMonth() + 1, 0).getDate();
            if (billingDayOfMonth > newLastDay) {
              nextDate.setDate(newLastDay);
            } else {
              nextDate.setDate(billingDayOfMonth);
            }
          }
        } else {
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
  const schedule = await convexClient.query(api.scheduledBillings.getById, { id: scheduledBillingId as any });

  if (!schedule) return false;

  const now = new Date();
  let periodStart: number;
  let periodEnd: number;

  switch (schedule.frequency) {
    case BillingFrequency.MONTHLY:
      periodStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).getTime();
      break;
    case BillingFrequency.QUARTERLY:
      const quarter = Math.floor(now.getMonth() / 3);
      periodStart = new Date(now.getFullYear(), quarter * 3, 1).getTime();
      periodEnd = new Date(now.getFullYear(), quarter * 3 + 3, 0, 23, 59, 59).getTime();
      break;
    case BillingFrequency.ANNUALLY:
      periodStart = new Date(now.getFullYear(), 0, 1).getTime();
      periodEnd = new Date(now.getFullYear(), 11, 31, 23, 59, 59).getTime();
      break;
    case BillingFrequency.CUSTOM:
    default:
      periodStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).getTime();
      break;
  }

  // Get runs for this schedule
  const runs = await convexClient.query(api.scheduledBillingRuns.listByScheduledBillingId, {
    scheduledBillingId: scheduledBillingId as any,
  });

  const existingRun = runs.find((r: any) => {
    if (r.status !== 'SUCCESS') return false;
    if (r.runDate < periodStart || r.runDate > periodEnd) return false;
    return true;
  });

  // If run exists but invoice was voided or cancelled, allow regeneration
  if (existingRun?.invoice) {
    const invoiceStatus = existingRun.invoice.status;
    if (invoiceStatus === InvoiceStatus.CANCELLED || invoiceStatus === InvoiceStatus.VOID) {
      return false;
    }
  }

  return !!existingRun;
}

// Get stats for dashboard
export async function getScheduledBillingStats() {
  const [pending, active, paused, ended] = await Promise.all([
    convexClient.query(api.scheduledBillings.count, { status: ScheduleStatus.PENDING }),
    convexClient.query(api.scheduledBillings.count, { status: ScheduleStatus.ACTIVE }),
    convexClient.query(api.scheduledBillings.count, { status: ScheduleStatus.PAUSED }),
    convexClient.query(api.scheduledBillings.count, { status: ScheduleStatus.ENDED }),
  ]);

  // Get schedules due in next 7 days
  const today = Date.now();
  const nextWeek = today + 7 * 24 * 60 * 60 * 1000;

  const activeSchedules = await convexClient.query(api.scheduledBillings.list, { status: ScheduleStatus.ACTIVE });
  const dueThisWeek = activeSchedules.items.filter((s: any) =>
    s.nextBillingDate && s.nextBillingDate >= today && s.nextBillingDate <= nextWeek
  ).length;

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
  const schedule = await convexClient.query(api.scheduledBillings.getById, { id: id as any });

  if (!schedule) {
    throw new Error('Schedule not found');
  }

  if (schedule.status !== ScheduleStatus.PENDING) {
    throw new Error('Only pending schedules can be approved');
  }

  await convexClient.mutation(api.scheduledBillings.approve, {
    id: id as any,
    approvedById: approverId as any,
  });

  return convexClient.query(api.scheduledBillings.getById, { id: id as any });
}

export async function rejectSchedule(id: string, rejectorId: string, reason?: string) {
  const schedule = await convexClient.query(api.scheduledBillings.getById, { id: id as any });

  if (!schedule) {
    throw new Error('Schedule not found');
  }

  if (schedule.status !== ScheduleStatus.PENDING) {
    throw new Error('Only pending schedules can be rejected');
  }

  await convexClient.mutation(api.scheduledBillings.reject, {
    id: id as any,
    rejectedById: rejectorId as any,
    rejectionReason: reason,
  });

  return convexClient.query(api.scheduledBillings.getById, { id: id as any });
}

// Get run history with filtering
export async function getScheduledBillingRuns(options?: {
  scheduledBillingId?: string;
  daysBack?: number;
  limit?: number;
}) {
  if (options?.scheduledBillingId) {
    const runs = await convexClient.query(api.scheduledBillingRuns.listByScheduledBillingId, {
      scheduledBillingId: options.scheduledBillingId as any,
    });

    let filtered = runs;
    if (options?.daysBack && options.daysBack > 0) {
      const startDate = Date.now() - options.daysBack * 24 * 60 * 60 * 1000;
      filtered = filtered.filter((r: any) => r.runDate >= startDate);
    }

    return filtered.slice(0, options?.limit || 100);
  }

  const runs = await convexClient.query(api.scheduledBillingRuns.list, {
    limit: options?.limit || 100,
  });

  if (options?.daysBack && options.daysBack > 0) {
    const startDate = Date.now() - options.daysBack * 24 * 60 * 60 * 1000;
    return runs.filter((r: any) => r.runDate >= startDate);
  }

  return runs;
}
