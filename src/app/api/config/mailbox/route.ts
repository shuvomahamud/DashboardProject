import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const mailbox = process.env.MS_MAILBOX_USER_ID || '';

    return NextResponse.json({
      mailbox
    });
  } catch (error) {
    console.error('Error getting mailbox config:', error);
    return NextResponse.json(
      { error: 'Failed to get mailbox configuration' },
      { status: 500 }
    );
  }
}