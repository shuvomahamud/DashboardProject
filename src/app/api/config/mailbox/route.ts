import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'User not authenticated' },
        { status: 401 }
      );
    }

    return NextResponse.json({
      mailbox: session.user.email
    });
  } catch (error) {
    console.error('Error getting mailbox config:', error);
    return NextResponse.json(
      { error: 'Failed to get mailbox configuration' },
      { status: 500 }
    );
  }
}