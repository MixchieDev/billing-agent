import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { convexClient, api } from '@/lib/convex';
import { UserRole } from '@/lib/enums';

// GET /api/users/[id] - Get user details
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

    // Users can view their own profile, ADMIN can view anyone
    if (session.user.id !== id && session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const user = await convexClient.query(api.users.getById, { id: id as any });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt ? new Date(user.createdAt).toISOString() : null,
      updatedAt: user.updatedAt ? new Date(user.updatedAt).toISOString() : null,
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    return NextResponse.json(
      { error: 'Failed to fetch user' },
      { status: 500 }
    );
  }
}

// PUT /api/users/[id] - Update user
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { name, role } = body;

    // Check if user exists
    const existingUser = await convexClient.query(api.users.getById, { id: id as any });

    if (!existingUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Only ADMIN can change roles
    // Users can only update their own name
    if (session.user.role !== 'ADMIN') {
      if (session.user.id !== id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      // Non-admin can only update their own name
      if (role) {
        return NextResponse.json(
          { error: 'Only admins can change user roles' },
          { status: 403 }
        );
      }
    }

    // Validate role if provided
    if (role) {
      const validRoles = ['ADMIN', 'APPROVER', 'VIEWER'];
      if (!validRoles.includes(role)) {
        return NextResponse.json(
          { error: 'Invalid role. Must be ADMIN, APPROVER, or VIEWER' },
          { status: 400 }
        );
      }
    }

    // Update user
    const updateArgs: any = { id: id as any };
    if (name !== undefined) updateArgs.name = name;
    if (role) updateArgs.role = role as UserRole;

    const user = await convexClient.mutation(api.users.update, updateArgs);

    // Audit log
    await convexClient.mutation(api.auditLogs.create, {
      userId: session.user.id as any,
      action: 'USER_UPDATED',
      entityType: 'User',
      entityId: String(user?._id),
      details: {
        email: user?.email,
        changes: { name, role },
        updatedBy: session.user.email,
      },
    });

    return NextResponse.json({
      id: user?._id,
      name: user?.name,
      email: user?.email,
      role: user?.role,
      createdAt: user?.createdAt ? new Date(user.createdAt).toISOString() : null,
      updatedAt: user?.updatedAt ? new Date(user.updatedAt).toISOString() : null,
    });
  } catch (error) {
    console.error('Error updating user:', error);
    return NextResponse.json(
      { error: 'Failed to update user' },
      { status: 500 }
    );
  }
}

// DELETE /api/users/[id] - Delete user (ADMIN only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only ADMIN can delete users
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;

    // Prevent self-deletion
    if (session.user.id === id) {
      return NextResponse.json(
        { error: 'You cannot delete your own account' },
        { status: 400 }
      );
    }

    // Check if user exists
    const existingUser = await convexClient.query(api.users.getById, { id: id as any });

    if (!existingUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Delete user
    await convexClient.mutation(api.users.remove, { id: id as any });

    // Audit log
    await convexClient.mutation(api.auditLogs.create, {
      userId: session.user.id as any,
      action: 'USER_DELETED',
      entityType: 'User',
      entityId: id,
      details: {
        email: existingUser.email,
        deletedBy: session.user.email,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting user:', error);
    return NextResponse.json(
      { error: 'Failed to delete user' },
      { status: 500 }
    );
  }
}
