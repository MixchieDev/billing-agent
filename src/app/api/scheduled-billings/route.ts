import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { convexClient, api } from '@/lib/convex';
import { ScheduleStatus } from '@/lib/enums';

/**
 * GET /api/scheduled-billings
 * Returns scheduler status, scheduled billings list, and stats
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') as ScheduleStatus | null;
    const billingEntityId = searchParams.get('billingEntityId');
    const contractId = searchParams.get('contractId');

    // Get scheduler status (dynamic import to avoid node-cron in serverless)
    let schedulerStatus: {
      running: boolean;
      config: { cronExpression: string; enabled: boolean; daysBeforeDue: number; timezone: string };
      lastRun: string | null;
      nextRun: string | null;
    } = {
      running: false,
      config: { cronExpression: '0 8 * * *', enabled: true, daysBeforeDue: 15, timezone: 'Asia/Manila' },
      lastRun: null,
      nextRun: null,
    };
    try {
      const { getSchedulerStatus } = await import('@/lib/scheduler');
      schedulerStatus = getSchedulerStatus();
    } catch (e) {
      // Fallback for serverless - scheduler doesn't run there anyway
    }

    // Get recent job runs (last 50)
    const jobRuns = await convexClient.query(api.jobRuns.list, { limit: 50 });

    // Get scheduled billings with filters
    const sbResult = await convexClient.query(api.scheduledBillings.list, {
      ...(status ? { status } : {}),
      ...(billingEntityId ? { billingEntityId: billingEntityId as any } : {}),
    });

    let scheduledBillings = sbResult.items || [];

    // Filter by contractId client-side if needed
    if (contractId) {
      scheduledBillings = scheduledBillings.filter((sb: any) => sb.contractId === contractId);
    }

    // Get stats
    const [totalActive, totalPaused, totalPending, totalEnded] = await Promise.all([
      convexClient.query(api.scheduledBillings.count, { status: 'ACTIVE' }),
      convexClient.query(api.scheduledBillings.count, { status: 'PAUSED' }),
      convexClient.query(api.scheduledBillings.count, { status: 'PENDING' }),
      convexClient.query(api.scheduledBillings.count, { status: 'ENDED' }),
    ]);

    const stats = {
      active: totalActive,
      paused: totalPaused,
      pending: totalPending,
      ended: totalEnded,
      total: totalActive + totalPaused + totalPending + totalEnded,
      dueThisWeek: 0,
    };

    // Get last successful run
    const lastSuccessfulRun = jobRuns.find((run: any) => run.status === 'COMPLETED');

    // Calculate next run time (approximate based on cron)
    const nextRunTime = calculateNextRun(schedulerStatus.config.cronExpression);

    // Transform scheduled billings for response
    const formattedBillings = scheduledBillings.map((sb: any) => ({
      id: sb._id,
      contractId: sb.contractId,
      companyName: sb.contract?.companyName,
      productType: sb.contract?.productType,
      email: sb.contract?.email,
      billingAmount: Number(sb.billingAmount),
      description: sb.description,
      frequency: sb.frequency,
      billingDayOfMonth: sb.billingDayOfMonth,
      dueDayOfMonth: sb.dueDayOfMonth,
      nextBillingDate: sb.nextBillingDate,
      startDate: sb.startDate,
      endDate: sb.endDate,
      autoApprove: sb.autoApprove,
      autoSendEnabled: sb.autoSendEnabled,
      status: sb.status,
      vatType: sb.vatType,
      hasWithholding: sb.hasWithholding,
      remarks: sb.remarks,
      billingEntity: sb.billingEntity,
      runCount: 0,
      createdAt: sb.createdAt,
      updatedAt: sb.updatedAt,
      // Custom frequency fields
      customIntervalValue: sb.customIntervalValue,
      customIntervalUnit: sb.customIntervalUnit,
      // Approval workflow fields
      createdBy: sb.createdBy,
      approvedBy: sb.approvedBy,
      approvedAt: sb.approvedAt,
    }));

    return NextResponse.json({
      scheduler: {
        ...schedulerStatus,
        lastRun: lastSuccessfulRun?.startedAt || null,
        nextRun: nextRunTime,
      },
      stats: {
        ...stats,
        // Legacy stats for backward compatibility
        totalUpcoming: stats.dueThisWeek,
        alreadyInvoiced: 0,
        pendingGeneration: stats.dueThisWeek,
        willAutoSend: 0,
        requiresApproval: stats.pending,
      },
      jobRuns: jobRuns.map((run: any) => ({
        id: run._id,
        jobName: run.jobName,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        status: run.status,
        itemsProcessed: run.itemsProcessed,
        errors: run.errors,
      })),
      scheduledBillings: formattedBillings,
      // Legacy: upcomingBillings maps to scheduledBillings
      upcomingBillings: formattedBillings,
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
 * POST /api/scheduled-billings
 * Create a new scheduled billing
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // Validate required fields
    if (!body.contractId) {
      return NextResponse.json({ error: 'contractId is required' }, { status: 400 });
    }
    if (!body.billingEntityId) {
      return NextResponse.json({ error: 'billingEntityId is required' }, { status: 400 });
    }
    if (!body.billingAmount || body.billingAmount <= 0) {
      return NextResponse.json({ error: 'billingAmount must be greater than 0' }, { status: 400 });
    }
    if (!body.billingDayOfMonth || body.billingDayOfMonth < 1 || body.billingDayOfMonth > 31) {
      return NextResponse.json({ error: 'billingDayOfMonth must be between 1 and 31' }, { status: 400 });
    }

    // Check if contract exists
    const contract = await convexClient.query(api.contracts.getById, {
      id: body.contractId as any,
    });

    if (!contract) {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
    }

    // Check if billing entity exists
    const billingEntity = await convexClient.query(api.companies.getById, {
      id: body.billingEntityId as any,
    });

    if (!billingEntity) {
      return NextResponse.json({ error: 'Billing entity not found' }, { status: 404 });
    }

    // Validate custom frequency fields
    if (body.frequency === 'CUSTOM') {
      if (!body.customIntervalValue || body.customIntervalValue < 1) {
        return NextResponse.json({ error: 'customIntervalValue must be at least 1 for custom frequency' }, { status: 400 });
      }
      if (!body.customIntervalUnit || !['DAYS', 'MONTHS'].includes(body.customIntervalUnit)) {
        return NextResponse.json({ error: 'customIntervalUnit must be DAYS or MONTHS for custom frequency' }, { status: 400 });
      }
    }

    const scheduledBillingId = await convexClient.mutation(api.scheduledBillings.create, {
      data: {
        contractId: body.contractId,
        billingEntityId: body.billingEntityId,
        billingAmount: body.billingAmount,
        vatType: body.vatType,
        hasWithholding: body.hasWithholding,
        withholdingRate: body.withholdingRate,
        description: body.description,
        frequency: body.frequency || 'MONTHLY',
        billingDayOfMonth: body.billingDayOfMonth,
        dueDayOfMonth: body.dueDayOfMonth,
        startDate: body.startDate ? new Date(body.startDate).getTime() : undefined,
        endDate: body.endDate ? new Date(body.endDate).getTime() : undefined,
        autoApprove: body.autoApprove,
        autoSendEnabled: body.autoSendEnabled,
        remarks: body.remarks,
        customIntervalValue: body.customIntervalValue,
        customIntervalUnit: body.customIntervalUnit,
        createdById: (session.user as { id: string }).id,
      },
    });

    const scheduledBilling = await convexClient.query(api.scheduledBillings.getById, {
      id: scheduledBillingId,
    });

    // Create audit log
    await convexClient.mutation(api.auditLogs.create, {
      userId: (session.user as { id: string }).id as any,
      action: 'SCHEDULED_BILLING_CREATED',
      entityType: 'ScheduledBilling',
      entityId: scheduledBillingId,
      details: {
        contractId: body.contractId,
        billingAmount: body.billingAmount,
        frequency: body.frequency || 'MONTHLY',
        billingDayOfMonth: body.billingDayOfMonth,
      },
    });

    return NextResponse.json(scheduledBilling, { status: 201 });
  } catch (error) {
    console.error('Error creating scheduled billing:', error);
    return NextResponse.json(
      { error: 'Failed to create scheduled billing' },
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
