import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

// Manual trigger for billing job
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admins can manually trigger
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Dynamic import to avoid node-cron issues in serverless
    const { triggerBillingJob } = await import('@/lib/scheduler');
    const result = await triggerBillingJob();

    return NextResponse.json({
      message: 'Billing job triggered successfully',
      ...result,
    });
  } catch (error) {
    console.error('Error triggering billing job:', error);
    return NextResponse.json(
      { error: 'Failed to trigger billing job' },
      { status: 500 }
    );
  }
}

// Get scheduler status
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Dynamic import to avoid node-cron issues in serverless
    try {
      const { getSchedulerStatus } = await import('@/lib/scheduler');
      const status = getSchedulerStatus();
      return NextResponse.json(status);
    } catch (e) {
      // Fallback for serverless
      return NextResponse.json({
        running: false,
        config: { cronExpression: '0 8 * * *', enabled: true, daysBeforeDue: 15, timezone: 'Asia/Manila' },
        lastRun: null,
        nextRun: null,
        note: 'Scheduler not available in serverless environment',
      });
    }
  } catch (error) {
    console.error('Error getting scheduler status:', error);
    return NextResponse.json(
      { error: 'Failed to get scheduler status' },
      { status: 500 }
    );
  }
}
