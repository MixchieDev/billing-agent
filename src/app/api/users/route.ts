import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { convexClient, api } from '@/lib/convex';
import bcrypt from 'bcryptjs';
import { UserRole } from '@/lib/enums';

// GET /api/users - List all users (ADMIN only)
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only ADMIN can list users
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const users = await convexClient.query(api.users.list, {});

    // Map to expected shape (exclude password, map _id to id)
    const mapped = users.map((u: any) => ({
      id: u._id,
      name: u.name,
      email: u.email,
      role: u.role,
      createdAt: u.createdAt ? new Date(u.createdAt).toISOString() : null,
      updatedAt: u.updatedAt ? new Date(u.updatedAt).toISOString() : null,
    }));

    return NextResponse.json(mapped);
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json(
      { error: 'Failed to fetch users' },
      { status: 500 }
    );
  }
}

// POST /api/users - Create new user (ADMIN only)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only ADMIN can create users
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { name, email, password, role } = body;

    // Validate required fields
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Validate password length
    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    // Validate role
    const validRoles = ['ADMIN', 'APPROVER', 'VIEWER'];
    if (role && !validRoles.includes(role)) {
      return NextResponse.json(
        { error: 'Invalid role. Must be ADMIN, APPROVER, or VIEWER' },
        { status: 400 }
      );
    }

    // Check if email already exists
    const existingUser = await convexClient.query(api.users.getByEmail, { email });

    if (existingUser) {
      return NextResponse.json(
        { error: 'A user with this email already exists' },
        { status: 400 }
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user
    const userId = await convexClient.mutation(api.users.create, {
      name: name || undefined,
      email,
      password: hashedPassword,
      role: (role as UserRole) || UserRole.VIEWER,
    });

    // Get the created user
    const user = await convexClient.query(api.users.getById, { id: userId as any });

    // Audit log
    await convexClient.mutation(api.auditLogs.create, {
      userId: session.user.id as any,
      action: 'USER_CREATED',
      entityType: 'User',
      entityId: String(userId),
      details: {
        email,
        role: role || UserRole.VIEWER,
        createdBy: session.user.email,
      },
    });

    return NextResponse.json({
      id: userId,
      name: user?.name,
      email: user?.email,
      role: user?.role,
      createdAt: user?.createdAt ? new Date(user.createdAt).toISOString() : null,
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating user:', error);
    return NextResponse.json(
      { error: 'Failed to create user' },
      { status: 500 }
    );
  }
}
