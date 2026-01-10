import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getSchedulerStatus } from '@/lib/scheduler';
import { ContractStatus } from '@/generated/prisma';

/**
 * GET /api/scheduled-billings
 * Returns scheduler status, job history, and upcoming billings
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const daysAhead = parseInt(searchParams.get('daysAhead') || '15');

    // Get scheduler status
    const schedulerStatus = getSchedulerStatus();

    // Get recent job runs (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const jobRuns = await prisma.jobRun.findMany({
      where: {
        createdAt: {
          gte: thirtyDaysAgo,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 50,
    });

    // Get upcoming billings (contracts due within daysAhead)
    const today = new Date();
    const futureDate = new Date();
    futureDate.setDate(today.getDate() + daysAhead);

    const upcomingContracts = await prisma.contract.findMany({
      where: {
        status: ContractStatus.ACTIVE,
        nextDueDate: {
          gte: today,
          lte: futureDate,
        },
        // Exclude contracts that have ended
        OR: [
          { contractEndDate: null },
          { contractEndDate: { gt: today } },
        ],
      },
      include: {
        billingEntity: {
          select: {
            code: true,
            name: true,
          },
        },
        partner: {
          select: {
            name: true,
            billingModel: true,
          },
        },
      },
      orderBy: {
        nextDueDate: 'asc',
      },
    });

    // Check which contracts already have invoices for the upcoming due date
    const upcomingWithInvoiceStatus = await Promise.all(
      upcomingContracts.map(async (contract) => {
        const existingInvoice = await prisma.invoice.findFirst({
          where: {
            contracts: {
              some: { id: contract.id },
            },
            dueDate: contract.nextDueDate!,
            status: {
              not: 'CANCELLED',
            },
          },
          select: {
            id: true,
            billingNo: true,
            status: true,
            billingFrequency: true,
          },
        });

        // Determine billing frequency from paymentPlan
        const paymentPlan = contract.paymentPlan?.toLowerCase() || '';
        let expectedFrequency = 'MONTHLY';
        if (paymentPlan.includes('annual') || paymentPlan.includes('yearly')) {
          expectedFrequency = 'ANNUALLY';
        } else if (paymentPlan.includes('quarter')) {
          expectedFrequency = 'QUARTERLY';
        }

        // Determine if it will be auto-sent or require approval
        // Auto-send only if: autoSendEnabled is true AND frequency is not ANNUALLY
        const willAutoSend = contract.autoSendEnabled && expectedFrequency !== 'ANNUALLY';

        return {
          id: contract.id,
          companyName: contract.companyName,
          productType: contract.productType,
          monthlyFee: Number(contract.monthlyFee),
          billingAmount: Number(contract.billingAmount || contract.monthlyFee),
          paymentPlan: contract.paymentPlan,
          expectedFrequency,
          autoSendEnabled: contract.autoSendEnabled,
          willAutoSend,
          nextDueDate: contract.nextDueDate,
          contractEndDate: contract.contractEndDate,
          email: contract.email,
          billingEntity: contract.billingEntity,
          partner: contract.partner,
          existingInvoice,
          hasInvoice: !!existingInvoice,
        };
      })
    );

    // Calculate statistics
    const stats = {
      totalUpcoming: upcomingWithInvoiceStatus.length,
      alreadyInvoiced: upcomingWithInvoiceStatus.filter((c) => c.hasInvoice).length,
      pendingGeneration: upcomingWithInvoiceStatus.filter((c) => !c.hasInvoice).length,
      willAutoSend: upcomingWithInvoiceStatus.filter((c) => !c.hasInvoice && c.willAutoSend).length,
      requiresApproval: upcomingWithInvoiceStatus.filter((c) => !c.hasInvoice && !c.willAutoSend).length,
    };

    // Get last successful run
    const lastSuccessfulRun = jobRuns.find((run) => run.status === 'COMPLETED');

    // Calculate next run time (approximate based on cron)
    const nextRunTime = calculateNextRun(schedulerStatus.config.cronExpression);

    return NextResponse.json({
      scheduler: {
        ...schedulerStatus,
        lastRun: lastSuccessfulRun?.startedAt || null,
        nextRun: nextRunTime,
      },
      stats,
      jobRuns: jobRuns.map((run) => ({
        id: run.id,
        jobName: run.jobName,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        status: run.status,
        itemsProcessed: run.itemsProcessed,
        errors: run.errors,
      })),
      upcomingBillings: upcomingWithInvoiceStatus,
    });
  } catch (error) {
    console.error('Error fetching scheduled billings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch scheduled billings' },
      { status: 500 }
    );
  }
}

/**
 * Calculate approximate next run time based on cron expression
 */
function calculateNextRun(cronExpression: string): Date | null {
  try {
    // Simple parsing for common patterns like "0 8 * * *" (daily at 8 AM)
    const parts = cronExpression.split(' ');
    if (parts.length !== 5) return null;

    const [minute, hour] = parts;
    const now = new Date();
    const nextRun = new Date();

    nextRun.setHours(parseInt(hour), parseInt(minute), 0, 0);

    // If the time has passed today, set for tomorrow
    if (nextRun <= now) {
      nextRun.setDate(nextRun.getDate() + 1);
    }

    return nextRun;
  } catch {
    return null;
  }
}
