import * as cron from 'node-cron';
import prisma from './prisma';
import { generateDraftInvoices, createInvoiceFromContract, autoApproveInvoice } from './billing-service';
import { JobStatus, BillingFrequency } from '@/generated/prisma';
import { autoSendInvoice } from './auto-send';
import { notifyAnnualRenewalPending, notifyInvoicePending } from './notifications';

interface SchedulerConfig {
  cronExpression: string;
  timezone: string;
  daysBeforeDue: number;
  enabled: boolean;
}

const defaultConfig: SchedulerConfig = {
  cronExpression: '0 8 * * *', // 8:00 AM daily
  timezone: 'Asia/Manila',
  daysBeforeDue: 15,
  enabled: true,
};

let scheduledTask: ReturnType<typeof cron.schedule> | null = null;

// Main billing job
async function runBillingJob() {
  const jobRun = await prisma.jobRun.create({
    data: {
      jobName: 'daily-billing-check',
      status: JobStatus.RUNNING,
    },
  });

  try {
    console.log('[Scheduler] Starting daily billing check...');

    // Generate draft invoices for contracts due within 15 days
    const drafts = await generateDraftInvoices(defaultConfig.daysBeforeDue);

    console.log(`[Scheduler] Found ${drafts.length} contracts due soon`);

    let processed = 0;
    const errors: any[] = [];

    let autoSent = 0;
    let pendingApproval = 0;

    for (const draft of drafts) {
      try {
        // Create the invoice
        const invoice = await createInvoiceFromContract({
          contractId: draft.contractId,
          billingAmount: draft.serviceFee + draft.vatAmount,
          hasWithholding: draft.hasWithholding,
        });
        processed++;

        // Get the billing frequency (default to MONTHLY if not set)
        const billingFrequency = invoice.billingFrequency || BillingFrequency.MONTHLY;

        // Check if auto-send is disabled for this contract
        if (!draft.autoSendEnabled) {
          console.log(`[Scheduler] Auto-send disabled for contract, invoice ${invoice.billingNo} requires manual approval`);

          await notifyInvoicePending({
            id: invoice.id,
            billingNo: invoice.billingNo,
            customerName: invoice.customerName,
          });

          pendingApproval++;
          continue; // Skip auto-send logic
        }

        // Handle based on billing frequency
        if (billingFrequency === BillingFrequency.MONTHLY || billingFrequency === BillingFrequency.QUARTERLY) {
          // MONTHLY/QUARTERLY: Auto-approve and auto-send
          console.log(`[Scheduler] Auto-processing ${billingFrequency} invoice ${invoice.billingNo}`);

          try {
            // Auto-approve
            await autoApproveInvoice(invoice.id);

            // Auto-send
            const sendResult = await autoSendInvoice(invoice.id);

            if (sendResult.success) {
              autoSent++;
              console.log(`[Scheduler] Auto-sent invoice ${invoice.billingNo} to ${sendResult.sentTo}`);
            } else {
              console.error(`[Scheduler] Failed to auto-send ${invoice.billingNo}: ${sendResult.error}`);
              errors.push({
                invoiceId: invoice.id,
                billingNo: invoice.billingNo,
                error: `Auto-send failed: ${sendResult.error}`,
              });
            }
          } catch (sendError) {
            console.error(`[Scheduler] Error auto-sending invoice ${invoice.billingNo}:`, sendError);
            errors.push({
              invoiceId: invoice.id,
              billingNo: invoice.billingNo,
              error: sendError instanceof Error ? sendError.message : 'Unknown send error',
            });
          }
        } else {
          // ANNUALLY: Keep as pending, create renewal notification
          console.log(`[Scheduler] Annual invoice ${invoice.billingNo} requires manual approval`);

          await notifyAnnualRenewalPending({
            id: invoice.id,
            billingNo: invoice.billingNo,
            customerName: invoice.customerName,
          });

          pendingApproval++;
        }
      } catch (error) {
        console.error(`[Scheduler] Error processing contract ${draft.contractId}:`, error);
        errors.push({
          contractId: draft.contractId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    console.log(`[Scheduler] Summary: ${autoSent} auto-sent, ${pendingApproval} pending approval`);

    // Update job run
    await prisma.jobRun.update({
      where: { id: jobRun.id },
      data: {
        status: JobStatus.COMPLETED,
        completedAt: new Date(),
        itemsProcessed: processed,
        errors: errors.length > 0 ? { errors, autoSent, pendingApproval } : undefined,
      },
    });

    console.log(`[Scheduler] Completed. Processed: ${processed}, Auto-sent: ${autoSent}, Pending: ${pendingApproval}, Errors: ${errors.length}`);

    return { processed, autoSent, pendingApproval, errors };
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

    throw error;
  }
}

// Start the scheduler
export function startScheduler(config?: Partial<SchedulerConfig>) {
  const mergedConfig = { ...defaultConfig, ...config };

  if (!mergedConfig.enabled) {
    console.log('[Scheduler] Scheduler is disabled');
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

  console.log('[Scheduler] Started successfully');
}

// Stop the scheduler
export function stopScheduler() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    console.log('[Scheduler] Stopped');
  }
}

// Manual trigger for testing
export async function triggerBillingJob() {
  return runBillingJob();
}

// Get scheduler status
export function getSchedulerStatus() {
  return {
    running: scheduledTask !== null,
    config: defaultConfig,
  };
}
