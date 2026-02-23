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

    // Only admins can view system-wide audit logs
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;

    // Pagination
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20')));
    const offset = (page - 1) * limit;

    // Filters
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const action = searchParams.get('action');
    const entityType = searchParams.get('entityType');
    const userId = searchParams.get('userId');
    const search = searchParams.get('search');

    // Query audit logs
    const result = await convexClient.query(api.auditLogs.list, {
      ...(entityType ? { entityType } : {}),
      ...(action ? { action } : {}),
      limit: 1000, // Get more to filter client-side
      offset: 0,
    });

    let logs = result.items || [];

    // Apply date filters client-side
    if (dateFrom) {
      const fromMs = new Date(dateFrom).getTime();
      logs = logs.filter((log: any) => log.createdAt >= fromMs);
    }
    if (dateTo) {
      const endDate = new Date(dateTo);
      endDate.setDate(endDate.getDate() + 1);
      const toMs = endDate.getTime();
      logs = logs.filter((log: any) => log.createdAt <= toMs);
    }

    // Apply userId filter
    if (userId) {
      logs = logs.filter((log: any) => log.userId === userId);
    }

    // Apply search filter (search in entityId)
    if (search) {
      const term = search.toLowerCase();
      logs = logs.filter((log: any) =>
        log.entityId?.toLowerCase().includes(term)
      );
    }

    const total = logs.length;

    // Paginate
    const paged = logs.slice(offset, offset + limit);

    // Get user info for each log
    const logsWithUsers = await Promise.all(
      paged.map(async (log: any) => {
        let user = null;
        if (log.userId) {
          try {
            const userData = await convexClient.query(api.users.getById, {
              id: log.userId,
            });
            if (userData) {
              user = { name: userData.name, email: userData.email };
            }
          } catch {
            // User might not exist
          }
        }
        return {
          id: log._id,
          action: log.action,
          entityType: log.entityType,
          entityId: log.entityId,
          details: log.details,
          ipAddress: log.ipAddress,
          createdAt: log.createdAt ? new Date(log.createdAt).toISOString() : null,
          user,
        };
      })
    );

    return NextResponse.json({
      logs: logsWithUsers,
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
