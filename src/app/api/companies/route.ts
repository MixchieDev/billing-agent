import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { convexClient, api } from '@/lib/convex';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const minimal = searchParams.get('minimal') === 'true';

    if (minimal) {
      // Lightweight query for dropdowns
      const companies = await convexClient.query(api.companies.listMinimal, {});
      return NextResponse.json(companies);
    }

    // Full query with relations
    const companies = await convexClient.query(api.companies.listWithRelations, {});

    return NextResponse.json(companies);
  } catch (error) {
    console.error('Error fetching companies:', error);
    return NextResponse.json(
      { error: 'Failed to fetch companies' },
      { status: 500 }
    );
  }
}
