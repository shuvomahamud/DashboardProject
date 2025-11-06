import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function DELETE(
  _req: Request,
  { params }: { params: { runId: string } }
) {
  try {
    const updated = await prisma.import_email_runs.updateMany({
      where: { id: params.runId },
      data: { summary: null }
    });

    if (updated.count === 0) {
      return NextResponse.json(
        { error: 'Run not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Failed to clear import summary:', error);
    return NextResponse.json(
      { error: 'Failed to clear summary' },
      { status: 500 }
    );
  }
}

