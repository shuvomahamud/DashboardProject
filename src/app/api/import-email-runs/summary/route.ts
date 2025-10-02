import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

/**
 * GET /api/import-email-runs/summary
 *
 * Returns queue status for UI:
 * - inProgress: max 1 running
 * - enqueued: FIFO queue
 * - recentDone: last 3 completed/failed/canceled
 */
export async function GET() {
  try {
    const [inProgressRuns, enqueuedRuns, recentDoneRuns] = await Promise.all([
      // Max 1 running (enforced by DB unique index)
      prisma.import_email_runs.findMany({
        where: { status: 'running' },
        include: {
          Job: {
            select: { id: true, title: true }
          }
        },
        orderBy: { started_at: 'desc' },
        take: 1
      }),

      // All enqueued (FIFO)
      prisma.import_email_runs.findMany({
        where: { status: 'enqueued' },
        include: {
          Job: {
            select: { id: true, title: true }
          }
        },
        orderBy: { created_at: 'asc' }
      }),

      // Last 3 done
      prisma.import_email_runs.findMany({
        where: {
          status: { in: ['succeeded', 'failed', 'canceled'] }
        },
        include: {
          Job: {
            select: { id: true, title: true }
          }
        },
        orderBy: { finished_at: 'desc' },
        take: 3
      })
    ]);

    // Format for UI
    const formatRun = (run: any) => ({
      id: run.id,
      jobId: run.job_id,
      jobTitle: run.Job.title,
      status: run.status,
      progress: parseFloat(run.progress.toString()),
      processedMessages: run.processed_messages,
      totalMessages: run.total_messages,
      lastError: run.last_error,
      createdAt: run.created_at.toISOString(),
      startedAt: run.started_at?.toISOString(),
      finishedAt: run.finished_at?.toISOString()
    });

    return NextResponse.json({
      inProgress: inProgressRuns[0] ? formatRun(inProgressRuns[0]) : null,
      enqueued: enqueuedRuns.map(formatRun),
      recentDone: recentDoneRuns.map(formatRun)
    });

  } catch (error: any) {
    // Silently fail - this is polled frequently by UI
    return NextResponse.json(
      { error: 'Failed to fetch import queue status' },
      { status: 500 }
    );
  }
}
