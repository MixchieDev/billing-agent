import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { convexClient, api } from '@/lib/convex';

// GET - Get single RCBC end-client
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

    const client = await convexClient.query(api.rcbcEndClients.getById, {
      id: id as any,
    });

    if (!client) {
      return NextResponse.json({ error: 'RCBC client not found' }, { status: 404 });
    }

    return NextResponse.json({
      ...client,
      id: client._id,
      ratePerEmployee: Number(client.ratePerEmployee),
    });
  } catch (error) {
    console.error('Error fetching RCBC client:', error);
    return NextResponse.json(
      { error: 'Failed to fetch RCBC client' },
      { status: 500 }
    );
  }
}

// PATCH - Update RCBC end-client
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admins can update RCBC clients
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();

    // Check if client exists
    const existingClient = await convexClient.query(api.rcbcEndClients.getById, {
      id: id as any,
    });

    if (!existingClient) {
      return NextResponse.json({ error: 'RCBC client not found' }, { status: 404 });
    }

    // Build update data
    const updateData: any = {};

    if (body.name !== undefined) updateData.name = body.name;
    if (body.employeeCount !== undefined) updateData.employeeCount = parseInt(body.employeeCount);
    if (body.ratePerEmployee !== undefined) updateData.ratePerEmployee = parseFloat(body.ratePerEmployee);
    if (body.isActive !== undefined) updateData.isActive = body.isActive;

    // Handle month update (needs to check uniqueness)
    if (body.month !== undefined) {
      const newMonthTimestamp = new Date(body.month + '-01').getTime();
      const newName = body.name !== undefined ? body.name : existingClient.name;

      // Check if new name+month combination already exists (excluding current record)
      const clientsForMonth = await convexClient.query(api.rcbcEndClients.list, {
        month: newMonthTimestamp,
      });
      const duplicate = clientsForMonth.find(
        (c: any) => c.name === newName && c._id !== id
      );

      if (duplicate) {
        return NextResponse.json(
          { error: `Client "${newName}" already exists for this month` },
          { status: 409 }
        );
      }

      updateData.month = newMonthTimestamp;
    }

    const client = await convexClient.mutation(api.rcbcEndClients.update, {
      id: id as any,
      data: updateData,
    });

    // Audit log
    await convexClient.mutation(api.auditLogs.create, {
      userId: session.user.id as any,
      action: 'RCBC_CLIENT_UPDATED',
      entityType: 'RcbcEndClient',
      entityId: id,
      details: {
        clientName: client?.name,
        changes: Object.keys(updateData),
      },
    });

    return NextResponse.json({
      ...client,
      id: client?._id,
      ratePerEmployee: Number(client?.ratePerEmployee),
    });
  } catch (error) {
    console.error('Error updating RCBC client:', error);
    return NextResponse.json(
      { error: 'Failed to update RCBC client' },
      { status: 500 }
    );
  }
}

// DELETE - Delete RCBC end-client
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admins can delete RCBC clients
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;

    // Check if client exists
    const existingClient = await convexClient.query(api.rcbcEndClients.getById, {
      id: id as any,
    });

    if (!existingClient) {
      return NextResponse.json({ error: 'RCBC client not found' }, { status: 404 });
    }

    await convexClient.mutation(api.rcbcEndClients.remove, {
      id: id as any,
    });

    // Audit log
    await convexClient.mutation(api.auditLogs.create, {
      userId: session.user.id as any,
      action: 'RCBC_CLIENT_DELETED',
      entityType: 'RcbcEndClient',
      entityId: id,
      details: {
        clientName: existingClient.name,
      },
    });

    return NextResponse.json({ success: true, message: 'RCBC client deleted successfully' });
  } catch (error) {
    console.error('Error deleting RCBC client:', error);
    return NextResponse.json(
      { error: 'Failed to delete RCBC client' },
      { status: 500 }
    );
  }
}
