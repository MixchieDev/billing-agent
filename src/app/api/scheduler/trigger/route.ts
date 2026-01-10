import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { triggerBillingJob, getSchedulerStatus } from '@/lib/scheduler';

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

    const status = getSchedulerStatus();
    return NextResponse.json(status);
  } catch (error) {
    console.error('Error getting scheduler status:', error);
    return NextResponse.json(
      { error: 'Failed to get scheduler status' },
      { status: 500 }
    );
  }
}
