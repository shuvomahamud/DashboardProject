import { NextResponse } from 'next/server';
import prisma, { ensureConnection } from '@/lib/prisma';
import type { ImportRunSummary } from '@/types/importQueue';
import { getAiStatsForRuns, type AiStats, DEFAULT_AI_STATS } from '@/lib/imports/progress';

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

    const runIds = [
      ...inProgressRuns.map(run => run.id),
      ...enqueuedRuns.map(run => run.id),
      ...recentDoneRuns.map(run => run.id)
    ].filter(Boolean);

    const aiStatsByRun = await getAiStatsForRuns(runIds);

    // Format for UI
    const formatRun = (run: any, aiStats: Record<string, AiStats>) => {
      const rawDuration = run.processing_duration_ms;
      const durationMs =
        typeof rawDuration === 'number'
          ? rawDuration
          : (run.started_at && run.finished_at
              ? Math.max(0, run.finished_at.getTime() - run.started_at.getTime())
              : null);
      const aiStat = aiStats[run.id] ?? DEFAULT_AI_STATS;

      return {
        id: run.id,
        jobId: run.job_id,
        jobTitle: run.Job.title,
        status: run.status,
        progress: run.progress ? parseFloat(run.progress.toString()) : 0,
        processedMessages: run.processed_messages,
        totalMessages: run.total_messages,
        aiCompletedMessages: aiStat.completed,
        aiTotalMessages: aiStat.total,
        lastError: run.last_error,
        createdAt: run.created_at.toISOString(),
        startedAt: run.started_at?.toISOString(),
        finishedAt: run.finished_at?.toISOString(),
        timeTakenMs: durationMs,
        summary: (run.summary ?? null) as ImportRunSummary | null
      };
    };

    return NextResponse.json({
      inProgress: inProgressRuns[0] ? formatRun(inProgressRuns[0], aiStatsByRun) : null,
      enqueued: enqueuedRuns.map(run => formatRun(run, aiStatsByRun)),
      recentDone: recentDoneRuns.map(run => formatRun(run, aiStatsByRun))
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
