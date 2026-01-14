import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getRcbcMonthSummary, getRcbcAvailableMonths } from '@/lib/rcbc-billing';

// GET - Get RCBC summary for a month or list of available months
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month');

    if (month) {
      // Get summary for specific month
      const summary = await getRcbcMonthSummary(month);

      if (!summary) {
        return NextResponse.json(
          { error: `No RCBC clients found for ${month}` },
          { status: 404 }
        );
      }

      return NextResponse.json(summary);
    } else {
      // Get list of available months
      const months = await getRcbcAvailableMonths();
      return NextResponse.json({ months });
    }
  } catch (error) {
    console.error('Error fetching RCBC summary:', error);
    return NextResponse.json(
      { error: 'Failed to fetch RCBC summary' },
      { status: 500 }
    );
  }
}
