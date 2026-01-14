import * as cron from 'node-cron';
import prisma from './prisma';
import { JobStatus, InvoiceStatus } from '@/generated/prisma';
import { autoSendInvoice } from './auto-send';
import { notifyInvoicePending } from './notifications';
import {
  getSchedulesDueToday,
  createScheduledBillingRun,
  updateNextBillingDate,
  checkExistingInvoiceForPeriod,
} from './scheduled-billing-service';
import { generateFromScheduledBilling } from './invoice-generator';
import { getSchedulerSettings } from './settings';

interface SchedulerConfig {
  cronExpression: string;
  timezone: string;
  enabled: boolean;
  daysBeforeDue: number;
}

const defaultConfig: SchedulerConfig = {
  cronExpression: '0 8 * * *', // 8:00 AM daily
  timezone: 'Asia/Manila',
  enabled: true, // Always enabled - individual schedules control themselves
  daysBeforeDue: 0,
};

let scheduledTask: ReturnType<typeof cron.schedule> | null = null;
let currentConfig: SchedulerConfig = { ...defaultConfig };
let lastRun: Date | null = null;
let nextRun: Date | null = null;

/**
 * Main billing job - uses ScheduledBilling model
 * 1. Get scheduled billings where billingDayOfMonth = today
 * 2. For each schedule, generate invoice
 * 3. For APPROVED invoices with autoSendEnabled: auto-send
 * 4. For PENDING invoices: notify for approval
 */
async function runBillingJob() {
  const jobRun = await prisma.jobRun.create({
    data: {
      jobName: 'daily-billing-check',
      status: JobStatus.RUNNING,
    },
  });

  try {
    console.log('[Scheduler] Starting daily billing check...');

    // Get scheduled billings due today
    const schedules = await getSchedulesDueToday();
    console.log(`[Scheduler] Found ${schedules.length} scheduled billings due today`);

    let processed = 0;
    let autoSent = 0;
    let pendingApproval = 0;
    let skipped = 0;
    const errors: any[] = [];

    // Process each scheduled billing
    for (const schedule of schedules) {
      try {
        // Check if invoice already exists for this period
        const hasExisting = await checkExistingInvoiceForPeriod(schedule.id);
        if (hasExisting) {
          console.log(`[Scheduler] Skipping ${schedule.contract.companyName} - invoice already exists for this period`);
          skipped++;
          continue;
        }

        // Generate invoice
        const result = await generateFromScheduledBilling(schedule.id);
        processed++;

        console.log(`[Scheduler] Created invoice ${result.invoice.billingNo} for ${schedule.contract.companyName}`);

        if (result.invoice.status === InvoiceStatus.APPROVED) {
          // Auto-approved invoice - try to send if autoSendEnabled
          if (schedule.autoSendEnabled) {
            try {
              const sendResult = await autoSendInvoice(result.invoice.id);

              if (sendResult.success) {
                autoSent++;
                console.log(`[Scheduler] Auto-sent invoice ${result.invoice.billingNo} to ${sendResult.sentTo}`);
              } else {
                console.error(`[Scheduler] Failed to auto-send ${result.invoice.billingNo}: ${sendResult.error}`);
                errors.push({
                  scheduleId: schedule.id,
                  invoiceId: result.invoice.id,
                  billingNo: result.invoice.billingNo,
                  error: `Auto-send failed: ${sendResult.error}`,
                });
              }
            } catch (sendError) {
              console.error(`[Scheduler] Error sending invoice ${result.invoice.billingNo}:`, sendError);
              errors.push({
                scheduleId: schedule.id,
                invoiceId: result.invoice.id,
                billingNo: result.invoice.billingNo,
                error: `Auto-send error: ${sendError instanceof Error ? sendError.message : 'Unknown'}`,
              });
            }
          } else {
            console.log(`[Scheduler] Invoice ${result.invoice.billingNo} approved but auto-send disabled`);
          }
        } else {
          // PENDING invoice - notify for manual approval
          pendingApproval++;

          await notifyInvoicePending({
            id: result.invoice.id,
            billingNo: result.invoice.billingNo,
            customerName: result.invoice.customerName,
          });

          console.log(`[Scheduler] Invoice ${result.invoice.billingNo} pending approval`);
        }
      } catch (error) {
        console.error(`[Scheduler] Error processing schedule for ${schedule.contract.companyName}:`, error);

        // Record failed run
        await createScheduledBillingRun(
          schedule.id,
          null,
          'FAILED',
          error instanceof Error ? error.message : 'Unknown error'
        );

        errors.push({
          scheduleId: schedule.id,
          companyName: schedule.contract.companyName,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // Update job run
    await prisma.jobRun.update({
      where: { id: jobRun.id },
      data: {
        status: JobStatus.COMPLETED,
        completedAt: new Date(),
        itemsProcessed: processed,
        errors: { errors, autoSent, pendingApproval, skipped },
      },
    });

    console.log(`[Scheduler] Completed. Processed: ${processed}, Auto-sent: ${autoSent}, Pending: ${pendingApproval}, Skipped: ${skipped}, Errors: ${errors.length}`);

    // Track last run time
    lastRun = new Date();
    updateNextRunTime();

    return { processed, autoSent, pendingApproval, skipped, errors };
  } catch (error) {
    console.error('[Scheduler] Job failed:', error);

    await prisma.jobRun.update({
      where: { id: jobRun.id },
      data: {
        status: JobStatus.FAILED,
        completedAt: new Date(),
        errors: [{ error: error instanceof Error ? error.message : 'Unknown error' }],
      },
    });

    // Still track last run even on failure
    lastRun = new Date();
    updateNextRunTime();

    throw error;
  }
}

/**
 * Calculate next run time based on cron expression
 */
function updateNextRunTime() {
  if (!scheduledTask || !currentConfig.enabled) {
    nextRun = null;
    return;
  }

  try {
    // Parse cron and calculate next occurrence
    const cronParts = currentConfig.cronExpression.split(' ');
    const now = new Date();

    // Simple calculation for common patterns (minute hour * * *)
    if (cronParts.length >= 2) {
      const minute = parseInt(cronParts[0]) || 0;
      const hour = parseInt(cronParts[1]) || 8;

      const next = new Date(now);
      next.setHours(hour, minute, 0, 0);

      // If time has passed today, schedule for tomorrow
      if (next <= now) {
        next.setDate(next.getDate() + 1);
      }

      nextRun = next;
    }
  } catch {
    nextRun = null;
  }
}

/**
 * Start the scheduler with given config
 */
export function startScheduler(config?: Partial<SchedulerConfig>) {
  const mergedConfig = { ...defaultConfig, ...config };
  currentConfig = mergedConfig;

  if (!mergedConfig.enabled) {
    console.log('[Scheduler] Scheduler is disabled');
    if (scheduledTask) {
      scheduledTask.stop();
      scheduledTask = null;
    }
    nextRun = null;
    return;
  }

  if (scheduledTask) {
    console.log('[Scheduler] Stopping existing scheduler');
    scheduledTask.stop();
  }

  console.log(`[Scheduler] Starting with cron: ${mergedConfig.cronExpression}`);

  scheduledTask = cron.schedule(
    mergedConfig.cronExpression,
    async () => {
      try {
        await runBillingJob();
      } catch (error) {
        console.error('[Scheduler] Unhandled error in job:', error);
      }
    },
    {
      timezone: mergedConfig.timezone,
    }
  );

  updateNextRunTime();
  console.log('[Scheduler] Started successfully');
}

/**
 * Stop the scheduler
 */
export function stopScheduler() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    console.log('[Scheduler] Stopped');
  }
  currentConfig = { ...defaultConfig, enabled: false };
  nextRun = null;
}

/**
 * Initialize scheduler from database settings
 * Call this on app startup
 */
export async function initializeScheduler() {
  try {
    console.log('[Scheduler] Initializing from database settings...');
    const settings = await getSchedulerSettings();

    startScheduler({
      enabled: true, // Always enabled - individual schedules control themselves
      cronExpression: settings.cronExpression,
      daysBeforeDue: settings.daysBeforeDue,
    });

    console.log('[Scheduler] Initialized and running');
  } catch (error) {
    console.error('[Scheduler] Failed to initialize:', error);
  }
}

/**
 * Reload scheduler settings from database
 * Call this after settings are updated
 */
export async function reloadScheduler() {
  console.log('[Scheduler] Reloading settings...');
  await initializeScheduler();
}

/**
 * Manual trigger for testing
 */
export async function triggerBillingJob() {
  return runBillingJob();
}

/**
 * Get scheduler status (reads current state, not DB)
 */
export function getSchedulerStatus() {
  return {
    running: scheduledTask !== null && currentConfig.enabled,
    config: currentConfig,
    lastRun: lastRun?.toISOString() || null,
    nextRun: nextRun?.toISOString() || null,
  };
}

/**
 * Get scheduler status with fresh DB settings
 */
export async function getSchedulerStatusAsync() {
  const settings = await getSchedulerSettings();

  return {
    running: scheduledTask !== null,
    config: {
      ...currentConfig,
      enabled: true, // Always enabled
      cronExpression: settings.cronExpression,
      daysBeforeDue: settings.daysBeforeDue,
    },
    lastRun: lastRun?.toISOString() || null,
    nextRun: nextRun?.toISOString() || null,
  };
}
