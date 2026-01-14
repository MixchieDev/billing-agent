import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

// GET - List all RCBC end-clients
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const monthStr = searchParams.get('month'); // Format: YYYY-MM

    // Build where clause
    const whereClause: any = {};

    if (monthStr) {
      // Parse YYYY-MM to Date range
      const [year, month] = monthStr.split('-').map(Number);
      const startOfMonth = new Date(year, month - 1, 1);
      const endOfMonth = new Date(year, month, 0, 23, 59, 59);

      whereClause.month = {
        gte: startOfMonth,
        lte: endOfMonth,
      };
    }

    const clients = await prisma.rcbcEndClient.findMany({
      where: whereClause,
      orderBy: [{ month: 'desc' }, { name: 'asc' }],
    });

    // Transform Decimal to number for JSON
    const transformedClients = clients.map(client => ({
      ...client,
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

    // Parse month from YYYY-MM format
    const monthDate = new Date(body.month + '-01');

    // Check if client already exists for this month
    const existingClient = await prisma.rcbcEndClient.findUnique({
      where: {
        name_month: {
          name: body.name,
          month: monthDate,
        },
      },
    });

    if (existingClient) {
      return NextResponse.json(
        { error: `Client "${body.name}" already exists for this month` },
        { status: 409 }
      );
    }

    const client = await prisma.rcbcEndClient.create({
      data: {
        name: body.name,
        employeeCount: parseInt(body.employeeCount),
        ratePerEmployee: parseFloat(body.ratePerEmployee),
        month: monthDate,
        isActive: body.isActive ?? true,
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'RCBC_CLIENT_CREATED',
        entityType: 'RcbcEndClient',
        entityId: client.id,
        details: {
          clientName: client.name,
          month: body.month,
        },
      },
    });

    return NextResponse.json({
      ...client,
      ratePerEmployee: Number(client.ratePerEmployee),
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

    // Parse YYYY-MM to Date range
    const [year, month] = monthStr.split('-').map(Number);
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59);

    // Count clients to be deleted
    const count = await prisma.rcbcEndClient.count({
      where: {
        month: {
          gte: startOfMonth,
          lte: endOfMonth,
        },
      },
    });

    if (count === 0) {
      return NextResponse.json(
        { error: 'No clients found for this month' },
        { status: 404 }
      );
    }

    // Delete all clients for this month
    const result = await prisma.rcbcEndClient.deleteMany({
      where: {
        month: {
          gte: startOfMonth,
          lte: endOfMonth,
        },
      },
    });

    // Audit log - only create if user exists
    try {
      const userExists = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { id: true },
      });

      if (userExists) {
        await prisma.auditLog.create({
          data: {
            userId: session.user.id,
            action: 'RCBC_CLIENTS_BULK_DELETED',
            entityType: 'RcbcEndClient',
            entityId: 'bulk',
            details: {
              month: monthStr,
              deletedCount: result.count,
            },
          },
        });
      }
    } catch (auditError) {
      console.warn('Failed to create audit log:', auditError);
    }

    return NextResponse.json({
      success: true,
      message: `Deleted ${result.count} RCBC client(s) for ${monthStr}`,
      deletedCount: result.count,
    });
  } catch (error) {
    console.error('Error bulk deleting RCBC clients:', error);
    return NextResponse.json(
      { error: 'Failed to delete RCBC clients' },
      { status: 500 }
    );
  }
}
