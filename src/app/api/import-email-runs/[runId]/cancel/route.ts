import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

/**
 * POST /api/import-email-runs/[runId]/cancel
 *
 * Cancel an import run:
 * - If enqueued: mark canceled immediately
 * - If running: mark canceled, processor will stop after current item
 */
export async function POST(
  _req: Request,
  { params }: { params: { runId: string } }
) {
  try {
    const { runId } = params;

    const run = await prisma.import_email_runs.findFirst({
      where: {
        id: runId,
        status: { in: ['enqueued', 'running'] }
      },
      select: {
        id: true,
        status: true,
        started_at: true,
        created_at: true
      }
    });

    if (!run) {
      return NextResponse.json(
        { error: 'Run not found or already finished' },
        { status: 404 }
      );
    }

    const finishedAt = new Date();
    const start = run.started_at ?? run.created_at;
    const durationMs = Math.max(0, finishedAt.getTime() - start.getTime());

    const updated = await prisma.import_email_runs.updateMany({
      where: {
        id: runId,
        status: { in: ['enqueued', 'running'] }
      },
      data: {
        status: 'canceled',
        finished_at: finishedAt,
        processing_duration_ms: durationMs
      }
    });

    if (updated.count === 0) {
      return NextResponse.json(
        { error: 'Run not found or already finished' },
        { status: 404 }
      );
    }

    // Also cancel any pending items
    await prisma.import_email_items.updateMany({
      where: {
        run_id: runId,
        status: { in: ['pending', 'processing'] }
      },
      data: {
        status: 'canceled'
      }
    });

    return NextResponse.json({
      status: 'canceled',
      message: 'Import run canceled successfully'
    });

  } catch (error: any) {
    console.error('Error canceling import run:', error);
    return NextResponse.json(
      { error: 'Failed to cancel import run' },
      { status: 500 }
    );
  }
}
