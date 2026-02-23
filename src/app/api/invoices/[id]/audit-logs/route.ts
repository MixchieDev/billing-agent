import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { convexClient, api } from '@/lib/convex';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Get pagination params
    const searchParams = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20')));

    // Verify invoice exists
    const invoice = await convexClient.query(api.invoices.getById, {
      id: id as any,
    });

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // Get audit logs for this invoice
    const allLogs = await convexClient.query(api.auditLogs.listByEntityId, {
      entityId: id,
      entityType: 'Invoice',
    });

    const total = allLogs.length;
    const skip = (page - 1) * limit;
    const paginatedLogs = allLogs.slice(skip, skip + limit);

    return NextResponse.json({
      logs: paginatedLogs.map((log: any) => ({
        id: log._id,
        action: log.action,
        details: log.details,
        createdAt: log.createdAt ? new Date(log.createdAt).toISOString() : null,
        user: log.userId
          ? {
              name: log.userName || null,
              email: log.userEmail || null,
            }
          : null,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch audit logs' },
      { status: 500 }
    );
  }
}
