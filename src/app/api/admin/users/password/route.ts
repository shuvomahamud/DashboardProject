import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withTableAuthAppRouter } from '@/lib/auth/withTableAuthAppRouter';
import bcrypt from 'bcryptjs';

export const dynamic = 'force-dynamic';

// PATCH /api/admin/users/password - Reset user password
export const PATCH = withTableAuthAppRouter('*', async (request: NextRequest) => {
  try {
    const { userId, newPassword } = await request.json();

    if (!userId || !newPassword) {
      return NextResponse.json({ error: 'User ID and new password are required' }, { status: 400 });
    }

    if (newPassword.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters long' }, { status: 400 });
    }

    // Check if user exists
    const existingUser = await prisma.aspNetUsers.findUnique({
      where: { Id: userId }
    });

    if (!existingUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update user password
    await prisma.aspNetUsers.update({
      where: { Id: userId },
      data: {
        PasswordHash: hashedPassword,
        SecurityStamp: crypto.randomUUID(), // Update security stamp for security
        ConcurrencyStamp: crypto.randomUUID()
      }
    });

    return NextResponse.json({ 
      message: 'Password updated successfully',
      userId: userId 
    });
  } catch (error) {
    console.error('Error updating password:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});