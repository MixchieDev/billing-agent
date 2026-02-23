import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { convexClient, api } from '@/lib/convex';

// GET - List all RCBC end-clients
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const monthStr = searchParams.get('month'); // Format: YYYY-MM

    // Build query args
    const queryArgs: { month?: number } = {};

    if (monthStr) {
      // Parse YYYY-MM to timestamp (first day of month)
      const [year, month] = monthStr.split('-').map(Number);
      const startOfMonth = new Date(year, month - 1, 1);
      queryArgs.month = startOfMonth.getTime();
    }

    const clients = await convexClient.query(api.rcbcEndClients.list, queryArgs);

    // Transform for JSON response
    const transformedClients = clients.map((client: any) => ({
      ...client,
      id: client._id,
      ratePerEmployee: Number(client.ratePerEmployee),
    }));

    return NextResponse.json(transformedClients);
  } catch (error) {
    console.error('Error fetching RCBC clients:', error);
    return NextResponse.json(
      { error: 'Failed to fetch RCBC clients' },
      { status: 500 }
    );
  }
}

// POST - Create new RCBC end-client
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admins can create RCBC clients
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();

    // Validate required fields
    if (!body.name || !body.employeeCount || !body.ratePerEmployee || !body.month) {
      return NextResponse.json(
        { error: 'Missing required fields: name, employeeCount, ratePerEmployee, month' },
        { status: 400 }
      );
    }

    // Parse month from YYYY-MM format to timestamp
    const monthDate = new Date(body.month + '-01');
    const monthTimestamp = monthDate.getTime();

    // Check if client already exists for this month
    const existingClients = await convexClient.query(api.rcbcEndClients.list, {
      month: monthTimestamp,
    });
    const existingClient = existingClients.find((c: any) => c.name === body.name);

    if (existingClient) {
      return NextResponse.json(
        { error: `Client "${body.name}" already exists for this month` },
        { status: 409 }
      );
    }

    const clientId = await convexClient.mutation(api.rcbcEndClients.create, {
      name: body.name,
      employeeCount: parseInt(body.employeeCount),
      ratePerEmployee: parseFloat(body.ratePerEmployee),
      month: monthTimestamp,
      isActive: body.isActive ?? true,
    });

    const client = await convexClient.query(api.rcbcEndClients.getById, { id: clientId });

    // Audit log
    await convexClient.mutation(api.auditLogs.create, {
      userId: session.user.id as any,
      action: 'RCBC_CLIENT_CREATED',
      entityType: 'RcbcEndClient',
      entityId: clientId,
      details: {
        clientName: body.name,
        month: body.month,
      },
    });

    return NextResponse.json({
      ...client,
      id: client?._id,
      ratePerEmployee: Number(client?.ratePerEmployee),
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating RCBC client:', error);
    return NextResponse.json(
      { error: 'Failed to create RCBC client' },
      { status: 500 }
    );
  }
}

// DELETE - Bulk delete RCBC clients for a month
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admins can delete RCBC clients
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const monthStr = searchParams.get('month'); // Format: YYYY-MM

    if (!monthStr) {
      return NextResponse.json(
        { error: 'Month parameter is required (format: YYYY-MM)' },
        { status: 400 }
      );
    }

    // Parse YYYY-MM to timestamp
    const [year, month] = monthStr.split('-').map(Number);
    const startOfMonth = new Date(year, month - 1, 1);
    const monthTimestamp = startOfMonth.getTime();

    // Get clients for this month
    const clients = await convexClient.query(api.rcbcEndClients.list, {
      month: monthTimestamp,
    });

    if (clients.length === 0) {
      return NextResponse.json(
        { error: 'No clients found for this month' },
        { status: 404 }
      );
    }

    // Delete all clients for this month
    let deletedCount = 0;
    for (const client of clients) {
      await convexClient.mutation(api.rcbcEndClients.remove, {
        id: client._id,
      });
      deletedCount++;
    }

    // Audit log
    try {
      await convexClient.mutation(api.auditLogs.create, {
        userId: session.user.id as any,
        action: 'RCBC_CLIENTS_BULK_DELETED',
        entityType: 'RcbcEndClient',
        entityId: 'bulk',
        details: {
          month: monthStr,
          deletedCount,
        },
      });
    } catch (auditError) {
      console.warn('Failed to create audit log:', auditError);
    }

    return NextResponse.json({
      success: true,
      message: `Deleted ${deletedCount} RCBC client(s) for ${monthStr}`,
      deletedCount,
    });
  } catch (error) {
    console.error('Error bulk deleting RCBC clients:', error);
    return NextResponse.json(
      { error: 'Failed to delete RCBC clients' },
      { status: 500 }
    );
  }
}
