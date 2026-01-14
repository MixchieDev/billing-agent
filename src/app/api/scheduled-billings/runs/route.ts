import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getScheduledBillingRuns } from '@/lib/scheduled-billing-service';

/**
 * GET /api/scheduled-billings/runs
 * Get run history for scheduled billings
 *
 * Query params:
 * - scheduledBillingId: Filter by specific schedule
 * - daysBack: Number of days to look back (7, 30, 90, 0 for all)
 * - limit: Max number of records to return (default 100)
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const scheduledBillingId = searchParams.get('scheduledBillingId') || undefined;
    const daysBackParam = searchParams.get('daysBack');
    const limitParam = searchParams.get('limit');

    // Parse parameters
    const daysBack = daysBackParam ? parseInt(daysBackParam, 10) : undefined;
    const limit = limitParam ? parseInt(limitParam, 10) : 100;

    const runs = await getScheduledBillingRuns({
      scheduledBillingId,
      daysBack: daysBack === 0 ? undefined : daysBack,
      limit,
    });

    return NextResponse.json({
      runs,
      count: runs.length,
    });
  } catch (error) {
    console.error('Error fetching scheduled billing runs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch scheduled billing runs' },
      { status: 500 }
    );
  }
}
