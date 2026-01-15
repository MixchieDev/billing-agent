import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import bcrypt from 'bcryptjs';

// POST /api/users/[id]/change-password
export async function POST(
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
    const { currentPassword, newPassword } = body;

    // Check permissions
    const isOwnAccount = session.user.id === id;
    const isAdmin = session.user.role === 'ADMIN';

    if (!isOwnAccount && !isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Validate new password
    if (!newPassword || newPassword.length < 8) {
      return NextResponse.json(
        { error: 'New password must be at least 8 characters' },
        { status: 400 }
      );
    }

    // Get user with current password
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, password: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // If changing own password, verify current password
    if (isOwnAccount && !isAdmin) {
      if (!currentPassword) {
        return NextResponse.json(
          { error: 'Current password is required' },
          { status: 400 }
        );
      }

      if (!user.password) {
        return NextResponse.json(
          { error: 'User does not have a password set' },
          { status: 400 }
        );
      }

      const isValid = await bcrypt.compare(currentPassword, user.password);
      if (!isValid) {
        return NextResponse.json(
          { error: 'Current password is incorrect' },
          { status: 400 }
        );
      }
    }

    // If admin changing own password, also require current password
    if (isOwnAccount && isAdmin) {
      if (!currentPassword) {
        return NextResponse.json(
          { error: 'Current password is required to change your own password' },
          { status: 400 }
        );
      }

      if (user.password) {
        const isValid = await bcrypt.compare(currentPassword, user.password);
        if (!isValid) {
          return NextResponse.json(
            { error: 'Current password is incorrect' },
            { status: 400 }
          );
        }
      }
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update password
    await prisma.user.update({
      where: { id },
      data: { password: hashedPassword },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: isOwnAccount ? 'PASSWORD_CHANGED' : 'PASSWORD_RESET',
        entityType: 'User',
        entityId: id,
        details: {
          email: user.email,
          changedBy: session.user.email,
        },
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error changing password:', error);
    return NextResponse.json(
      { error: 'Failed to change password' },
      { status: 500 }
    );
  }
}
