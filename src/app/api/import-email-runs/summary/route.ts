import { NextResponse } from 'next/server';
import prisma, { ensureConnection } from '@/lib/prisma';

/**
 * GET /api/import-email-runs/summary
 *
 * Returns queue status for UI:
 * - inProgress: max 1 running
 * - enqueued: FIFO queue
 * - recentDone: last 3 completed/failed/canceled
 */

// Force dynamic rendering - this endpoint needs database access
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Throttle logging to once every 5 minutes
let lastLogTime = 0;
const LOG_INTERVAL = 5 * 60 * 1000; // 5 minutes

export async function GET() {
  try {
    // Ensure database connection is healthy with retry
    const isConnected = await ensureConnection(2);
    if (!isConnected) {
      return NextResponse.json(
        {
          error: 'Database connection unavailable',
          inProgress: null,
          enqueued: [],
          recentDone: []
        },
        { status: 503 }
      );
    }

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
    const formatRun = (run: any) => {
      const rawDuration = run.processing_duration_ms;
      const durationMs =
        typeof rawDuration === 'number'
          ? rawDuration
          : (run.started_at && run.finished_at
              ? Math.max(0, run.finished_at.getTime() - run.started_at.getTime())
              : null);

      return {
        id: run.id,
        jobId: run.job_id,
        jobTitle: run.Job.title,
        status: run.status,
        progress: run.progress ? parseFloat(run.progress.toString()) : 0,
        processedMessages: run.processed_messages,
        totalMessages: run.total_messages,
        lastError: run.last_error,
        createdAt: run.created_at.toISOString(),
        startedAt: run.started_at?.toISOString(),
        finishedAt: run.finished_at?.toISOString(),
        timeTakenMs: durationMs
      };
    };

    return NextResponse.json({
      inProgress: inProgressRuns[0] ? formatRun(inProgressRuns[0]) : null,
      enqueued: enqueuedRuns.map(formatRun),
      recentDone: recentDoneRuns.map(formatRun)
    });

  } catch (error: any) {
    // Throttle error logging - only log once every 5 minutes
    const now = Date.now();
    if (now - lastLogTime >= LOG_INTERVAL) {
      console.error('Error fetching import summary:', error);
      lastLogTime = now;
    }

    // Return empty state instead of error to prevent UI breaking
    return NextResponse.json(
      {
        error: 'Database temporarily unavailable',
        inProgress: null,
        enqueued: [],
        recentDone: []
      },
      { status: 200 } // Return 200 with empty state so UI doesn't break
    );
  }
}
