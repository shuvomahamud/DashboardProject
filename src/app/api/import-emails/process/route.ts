import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createEmailProvider } from '@/lib/providers/msgraph-provider';
import { processEmailItem } from '@/lib/pipeline/email-pipeline';
import { logMetric } from '@/lib/logging/metrics';
import { buildImportRunSummary } from '@/lib/imports/runSummary';
import type { ImportRunSummary } from '@/types/importQueue';
import { calculateImportProgress, getAiStatsForRun, finalizeRunIfComplete } from '@/lib/imports/progress';

/**
 * POST /api/import-emails/process
 *
 * Processor: Processes the currently running import with smart time budgeting.
 *
 * Phases:
 * - Phase A: Enumerate emails from provider -> create items (first slice only)
 * - Phase B: Process items (stop early to leave buffer for response)
 *
 * Time budget strategy:
 * - Hard limit: 58s (stay under 60s Vercel gateway timeout)
 * - Soft limit: 50s (leave ~8s buffer for wrap-up)
 * - Target: hand off GPT work to worker, keep slices lean
 *
 * Environment variables:
 * - NODE_OPTIONS=--dns-result-order=ipv4first (recommended for stability)
 */
export const runtime = 'nodejs';
export const maxDuration = 60; // Vercel max function duration
export const preferredRegion = 'iad1'; // US East (close to Supabase)

// Time budget constants tuned for 20s/25s/28s GPT timings (increased from 12s/15s/18s)
const HARD_TIME_LIMIT_MS = 58000;    // stay under 60s gateway timeout
const SOFT_EXIT_MARGIN_MS = 8000;    // leave 8s for wrap-up
const ITEM_BUDGET_MS = 8000;         // conservative budget per item
const ITEM_SLOW_THRESHOLD_MS = 4000;
const SOFT_TIME_LIMIT_MS = HARD_TIME_LIMIT_MS - SOFT_EXIT_MARGIN_MS;
const DEFAULT_WORKER_CONCURRENCY = parseInt(process.env.GPT_WORKER_CONCURRENCY || '3', 10);
const DEFAULT_GRAPH_SEARCH_LIMIT = parseInt(process.env.MS_GRAPH_SEARCH_LIMIT || '2000', 10);
const DEEP_SCAN_CHUNK_LIMIT = parseInt(process.env.DEEP_SCAN_CHUNK_LIMIT || '750', 10);

// Time helpers
const since = (t: number) => Date.now() - t;
const timeLeft = (start: number) => HARD_TIME_LIMIT_MS - since(start);

type LogContext = Record<string, unknown>;

const LOG_PREFIX = '[import-processor]';

const logInfo = (message: string, context?: LogContext) => {
  if (context) {
    console.info(`${LOG_PREFIX} ${message}`, context);
  } else {
    console.info(`${LOG_PREFIX} ${message}`);
  }
};

const logWarn = (message: string, context?: LogContext) => {
  if (context) {
    console.warn(`${LOG_PREFIX} ${message}`, context);
  } else {
    console.warn(`${LOG_PREFIX} ${message}`);
  }
};

const logError = (message: string, context?: LogContext) => {
  if (context) {
    console.error(`${LOG_PREFIX} ${message}`, context);
  } else {
    console.error(`${LOG_PREFIX} ${message}`);
  }
};

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  logMetric('processor_slice_start', { startedAt: new Date(startTime).toISOString() });
  const requestOrigin = req.nextUrl?.origin || null;

  try {
    logInfo('slice start', { requestOrigin });

    // Test database connectivity with retry
    let dbReady = false;
    for (let i = 0; i < 3; i++) {
      try {
        await prisma.$queryRaw`SELECT 1`;
        dbReady = true;
        break;
      } catch (error: any) {
        logWarn('database connectivity check failed', { attempt: i + 1, error: error?.message });
        if (i < 2) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }

    if (!dbReady) {
      logError('database not reachable after retries');
      return NextResponse.json({
        status: 'error',
        error: 'Database connection failed'
      }, { status: 503 });
    }

    // Get running run
    const run = await prisma.import_email_runs.findFirst({
      where: { status: 'running' },
      include: {
        Job: {
          select: { id: true, title: true }
        }
      }
    });

    if (!run) {
      logInfo('no running import found');
      return NextResponse.json({ status: 'no_work' });
    }

    const runMeta = (run.meta && typeof run.meta === 'object' && !Array.isArray(run.meta))
      ? { ...run.meta as Record<string, any> }
      : {};
    const lookbackOverride = typeof runMeta.lookbackDays === 'number' ? runMeta.lookbackDays : undefined;
    const trimmedSearchText = run.search_text?.trim() ?? '';

    logInfo('run loaded', {
      runId: run.id,
      jobId: run.job_id,
      jobTitle: run.Job.title,
      totalMessages: run.total_messages ?? 0,
      mailbox: run.mailbox,
      search: run.search_text
    });
    logMetric('processor_run_active', { runId: run.id, jobId: run.job_id, totalMessages: run.total_messages ?? 0 });

    const runStartDate = run.started_at ?? run.created_at;
    const computeDurationMs = (finishedAt: Date = new Date()) => {
      const start = runStartDate instanceof Date ? runStartDate : new Date(runStartDate);
      return Math.max(0, finishedAt.getTime() - start.getTime());
    };

    // Check if canceled
    if (run.status === 'canceled') {
      logInfo('run canceled detected', { runId: run.id });
      return NextResponse.json({ status: 'canceled' });
    }

    // Validate required fields
    if (!run.mailbox || !run.search_text) {
      logError('missing mailbox or search_text', { runId: run.id });
      const finishedAt = new Date();
      await prisma.import_email_runs.update({
        where: { id: run.id },
        data: {
          status: 'failed',
          finished_at: finishedAt,
          processing_duration_ms: computeDurationMs(finishedAt),
          last_error: 'Missing mailbox or search_text configuration'
        }
      });
      return NextResponse.json({ status: 'error', error: 'Missing configuration' });
    }

    const provider = createEmailProvider(run.mailbox);
    const provider = createEmailProvider(run.mailbox);
    const graphEnumerated = runMeta.graphEnumerated === true;
    const deepScanCompleted = runMeta.deepScanCompleted === true;
    const deepScanBefore = typeof runMeta.deepScanBefore === 'string' ? runMeta.deepScanBefore : null;

    const enumeratePhase = async (
      phaseLabel: 'graph' | 'deep',
      mode: 'graph-search' | 'deep-scan',
      limit?: number,
      beforeDate?: string | null
    ) => {
      const phaseStart = Date.now();
      logInfo(`${phaseLabel}_enumerate_start`, {
        runId: run.id,
        mode,
        limit: typeof limit === 'number' ? limit : 'unbounded',
        beforeDate,
        lookbackDays: lookbackOverride
      });
      const listResult = await provider.listMessages({
        jobTitle: run.search_text ?? '',
        limit,
        mode,
        lookbackDays: lookbackOverride,
        beforeDate: beforeDate ?? undefined
      });
      const messages = listResult.messages;
      const durationMs = Date.now() - phaseStart;
      logMetric('processor_phase_a_messages', {
        runId: run.id,
        phase: phaseLabel,
        mode,
        count: messages.length,
        ms: durationMs
      });
      logInfo(`${phaseLabel}_enumerate_complete`, {
        runId: run.id,
        fetched: messages.length,
        durationMs,
        mode,
        totalCount: listResult.totalCount ?? null
      });

      if (messages.length === 0) {
        return { fetched: 0, inserted: 0, oldestDateIso: null };
      }

      let oldestDateIso: string | null = null;
      const items = messages.map(msg => {
        const receivedIso = msg.receivedAt.toISOString();
        if (!oldestDateIso || receivedIso < oldestDateIso) {
          oldestDateIso = receivedIso;
        }
        return {
          run_id: run.id,
          job_id: run.job_id,
          external_message_id: msg.externalId,
          external_thread_id: msg.threadId,
          received_at: msg.receivedAt,
          status: 'pending',
          step: 'none',
          attempts: 0
        };
      });

      logInfo(`${phaseLabel}_persist_start`, { runId: run.id, items: items.length, mode });

      let retries = 3;
      let lastError: any = null;
      let insertedCount = 0;

      while (retries > 0) {
        const attemptStart = Date.now();
        try {
          const createResult = await prisma.import_email_items.createMany({
            data: items,
            skipDuplicates: true
          });
          insertedCount = createResult.count;
          logInfo(`${phaseLabel}_persist_success`, {
            runId: run.id,
            inserted: createResult.count,
            duplicatesSkipped: items.length - createResult.count,
            durationMs: Date.now() - attemptStart
          });
          break;
        } catch (error: any) {
          lastError = error;
          retries--;

          const isConnectionError = error.code === 'P1001' || error.message?.includes("Can't reach database");
          const isPoolError = error.message?.includes('Timed out fetching a new connection');

          if ((isConnectionError || isPoolError) && retries > 0) {
            const waitTime = (4 - retries) * 2000;
            logWarn(`${phaseLabel}_persist_retry`, {
              runId: run.id,
              waitMs: waitTime,
              retriesRemaining: retries,
              error: error?.message
            });
            await new Promise(resolve => setTimeout(resolve, waitTime));
          } else {
            logError(`${phaseLabel}_persist_failed`, {
              runId: run.id,
              attempts: 3 - retries,
              error: error?.message
            });
            throw error;
          }
        }
      }

      if (retries === 0 && lastError) {
        throw lastError;
      }

      return { fetched: messages.length, inserted: insertedCount, oldestDateIso };
    };

    if (!graphEnumerated || !deepScanCompleted) {
      if (!graphEnumerated) {
        const remainingBeforeGraph = timeLeft(startTime);
        if (remainingBeforeGraph > 10_000) {
          await enumeratePhase('graph', 'graph-search', DEFAULT_GRAPH_SEARCH_LIMIT, null);
          runMeta.graphEnumerated = true;
          await prisma.import_email_runs.update({
            where: { id: run.id },
            data: { meta: runMeta }
          });
        } else {
          logInfo('graph_enumeration_skipped_low_budget', { runId: run.id, remainingMs: remainingBeforeGraph });
        }
      }

      if (runMeta.graphEnumerated === true && !deepScanCompleted) {
        const remainingBeforeDeep = timeLeft(startTime);
        if (remainingBeforeDeep > 10_000) {
          const { fetched, oldestDateIso } = await enumeratePhase(
            'deep',
            'deep-scan',
            DEEP_SCAN_CHUNK_LIMIT,
            deepScanBefore
          );
          if (fetched === 0 && !deepScanBefore) {
            runMeta.deepScanCompleted = true;
            delete runMeta.deepScanBefore;
          } else if (fetched < DEEP_SCAN_CHUNK_LIMIT) {
            runMeta.deepScanCompleted = true;
            delete runMeta.deepScanBefore;
          } else if (oldestDateIso) {
            runMeta.deepScanBefore = oldestDateIso;
          }
          await prisma.import_email_runs.update({
            where: { id: run.id },
            data: { meta: runMeta }
          });
        } else {
          logInfo('deep_enumeration_skipped_low_budget', { runId: run.id, remainingMs: remainingBeforeDeep });
        }
      }

      const totalItems = await prisma.import_email_items.count({
        where: { run_id: run.id }
      });

      await prisma.import_email_runs.update({
        where: { id: run.id },
        data: {
          meta: runMeta,
          total_messages: totalItems
        }
      });

      logInfo('enumeration_state', {
        runId: run.id,
        totalItems,
        graphEnumerated: runMeta.graphEnumerated === true,
        deepScanCompleted: runMeta.deepScanCompleted === true,
        deepScanBefore: runMeta.deepScanBefore ?? null
      });

      if (totalItems === 0 && runMeta.deepScanCompleted === true) {
        logInfo('no messages found after enumeration', { runId: run.id });
        await prisma.import_email_runs.update({
          where: { id: run.id },
          data: {
            status: 'succeeded',
            finished_at: new Date(),
            progress: 1.0,
            total_messages: 0
          }
        });
        return NextResponse.json({ status: 'succeeded', runId: run.id });
      }
    }

      const pendingItems = await prisma.import_email_items.findMany({
        where: {
          run_id: run.id,
          status: 'pending'
        },
        orderBy: { id: 'asc' },
        take: concurrency
      });

      if (pendingItems.length === 0) {
        logInfo('phase_b no pending items', { runId: run.id, batches: batchesProcessed });
        logMetric('processor_phase_b_empty', { runId: run.id, batches: batchesProcessed });
        break;
      }

      batchesProcessed++;
      logInfo('phase_b batch start', {
        runId: run.id,
        batch: batchNumber,
        count: pendingItems.length,
        remainingMs: remaining,
        gapSinceLastBatchMs: gapSinceLastBatch
      });

      let batchProcessed = 0;
      let batchSlowItems = 0;
      let batchFailedItems = 0;

      for (const item of pendingItems) {
        const remainingForItem = timeLeft(startTime);
        if (remainingForItem <= ITEM_BUDGET_MS) {
          logInfo('phase_b stop item budget', { runId: run.id, remainingMs: remainingForItem });
          logMetric('processor_phase_b_exit_item_budget', { runId: run.id, remainingMs: remainingForItem });
          gracefulStop = true;
          break;
        }

        const itemStart = Date.now();
        const result = await processEmailItem(item, {
          provider,
          jobId: run.job_id,
          runId: run.id
        });

        const itemDuration = Date.now() - itemStart;
        processedCount++;
        batchProcessed++;

        logMetric('processor_item_complete', {
          runId: run.id,
          itemId: item.id.toString(),
          success: result.success,
          durationMs: itemDuration,
          gptStatus: result.gptStatus || 'unknown'
        });

        if (itemDuration > ITEM_SLOW_THRESHOLD_MS) {
          slowItemCount++;
          batchSlowItems++;
          logInfo('phase_b item slow', {
            runId: run.id,
            itemId: item.id.toString(),
            durationMs: itemDuration,
            success: result.success
          });
        }

        if (result.gptStatus === 'queued') {
          gptQueuedThisSlice++;
        }

        if (!result.success) {
          failedItemsInSlice++;
          batchFailedItems++;
          logWarn('phase_b item failed', {
            runId: run.id,
            itemId: item.id.toString(),
            error: result.error
          });
        }
      }

      if (gracefulStop) {
        break;
      }

      if (timeLeft(startTime) > 4000) {
        try {
          const [totalProcessed, aiStats] = await Promise.all([
            prisma.import_email_items.count({
              where: {
                run_id: run.id,
                status: { in: ['completed', 'failed'] }
              }
            }),
            getAiStatsForRun(run.id)
          ]);

          const progress = calculateImportProgress({
            totalMessages: run.total_messages,
            processedMessages: totalProcessed,
            totalAiJobs: aiStats.total,
            completedAiJobs: aiStats.completed
          });

          await prisma.import_email_runs.update({
            where: { id: run.id },
            data: {
              processed_messages: totalProcessed,
              progress
            }
          });

          logMetric('processor_progress_update', {
            runId: run.id,
            processed: totalProcessed,
            total: run.total_messages ?? 0,
            progress: Number.isFinite(progress) ? progress.toFixed(4) : '0'
          });
        } catch (progressError: any) {
          logWarn('phase_b progress update failed', { runId: run.id, error: progressError.message });
          logMetric('processor_progress_failed', { runId: run.id, error: progressError.message });
        }
      } else {
        logMetric('processor_progress_skipped', { runId: run.id, remainingMs: timeLeft(startTime) });
      }

      const batchEnd = Date.now();
      previousBatchEnd = batchEnd;
      logInfo('phase_b batch complete', {
        runId: run.id,
        batch: batchNumber,
        durationMs: batchEnd - batchStart,
        processedInBatch: batchProcessed,
        slowItemsInBatch: batchSlowItems,
        failedItemsInBatch: batchFailedItems,
        remainingMs: timeLeft(startTime)
      });
    }

    logInfo('phase_b slice summary', {
      runId: run.id,
      processedInSlice: processedCount,
      batches: batchesProcessed,
      slowItems: slowItemCount,
      failedItems: failedItemsInSlice,
      gptQueued: gptQueuedThisSlice
    });

    const remainingAfterPhaseB = timeLeft(startTime);
    if (gptQueuedThisSlice > 0 && remainingAfterPhaseB > SOFT_EXIT_MARGIN_MS + 3000) {
      await triggerAIWorker(requestOrigin, {
        runId: run.id,
        queued: gptQueuedThisSlice,
        remainingMs: remainingAfterPhaseB
      });
    }

// Check if all items completed (with retry for connection issues)
    let pendingCount = 0;
    let completedCount = 0;
    let failedCount = 0;

    try {
      [pendingCount, completedCount, failedCount] = await Promise.all([
        prisma.import_email_items.count({
          where: { run_id: run.id, status: 'pending' }
        }),
        prisma.import_email_items.count({
          where: { run_id: run.id, status: 'completed' }
        }),
        prisma.import_email_items.count({
          where: { run_id: run.id, status: 'failed' }
        })
      ]);
    } catch (countError: any) {
      logError('failed to count items', { runId: run.id, error: countError.message });

      const elapsed = Date.now() - startTime;
      // Return error status
      return NextResponse.json({
        status: 'error',
        runId: run.id,
        error: 'Database connection lost during progress check',
        elapsed
      }, { status: 500 });
    }

    const remainingAfterCounts = timeLeft(startTime);
    if (remainingAfterCounts <= SOFT_EXIT_MARGIN_MS) {
      const elapsed = Date.now() - startTime;
      logMetric('processor_slice_deferral', {
        runId: run.id,
        remainingMs: remainingAfterCounts,
        pendingCount,
        processedInSlice: processedCount
      });

      logMetric('processor_slice_end', {
        runId: run.id,
        outcome: 'slice_continue',
        elapsedMs: elapsed,
        pendingCount,
        processedInSlice: processedCount
      });

      return NextResponse.json({
        status: 'slice_continue',
        runId: run.id,
        pending: pendingCount,
        processedItems: processedCount,
        elapsed
      });
    }

    if (pendingCount === 0) {
      const finalizeResult = await finalizeRunIfComplete(run.id);
      const elapsed = Date.now() - startTime;

      if (finalizeResult.finalized) {
        logInfo(`? [RUN:${run.id}] Import finished: ${finalizeResult.status} (completed: ${finalizeResult.completedCount ?? 0}, failed: ${finalizeResult.failedCount ?? 0})`);
        logMetric('processor_run_summary', {
          runId: run.id,
          status: finalizeResult.status ?? 'unknown',
          completedCount: finalizeResult.completedCount ?? 0,
          failedCount: finalizeResult.failedCount ?? 0,
          processedInSlice: processedCount
        });

        if (timeLeft(startTime) > 4000) {
          const oldRuns = await prisma.import_email_runs.findMany({
            where: {
              job_id: run.job_id,
              status: { in: ['succeeded', 'failed', 'canceled'] }
            },
            orderBy: { finished_at: 'desc' },
            skip: 10,
            select: { id: true }
          });

          if (oldRuns.length > 0) {
            logInfo('cleanup old runs', {
              runId: run.id,
              jobId: run.job_id,
              removed: oldRuns.length
            });
            await prisma.import_email_runs.deleteMany({
              where: {
                id: { in: oldRuns.map(r => r.id) }
              }
            });
          }
        } else {
          logMetric('processor_old_runs_skipped', {
            runId: run.id,
            remainingMs: timeLeft(startTime)
          });
        }

        logMetric('processor_slice_end', {
          runId: run.id,
          outcome: finalizeResult.status ?? 'unknown',
          elapsedMs: elapsed,
          cleaned: true
        });

        return NextResponse.json({
          status: finalizeResult.status ?? 'unknown',
          runId: run.id,
          processedItems: processedCount,
          completed: finalizeResult.completedCount ?? 0,
          failed: finalizeResult.failedCount ?? 0,
          elapsed
        });
      }

      logInfo('email stage complete, awaiting AI parsing', {
        runId: run.id,
        pendingAiJobs: finalizeResult.pendingAiJobs ?? 0
      });
      logMetric('processor_waiting_ai', {
        runId: run.id,
        pendingAiJobs: finalizeResult.pendingAiJobs ?? 0,
        pendingItems: finalizeResult.pendingItems ?? 0
      });
      logMetric('processor_slice_end', {
        runId: run.id,
        outcome: 'waiting_ai',
        elapsedMs: elapsed,
        cleaned: false
      });

      return NextResponse.json({
        status: 'waiting_ai',
        runId: run.id,
        pendingAiJobs: finalizeResult.pendingAiJobs ?? 0,
        elapsed
      });
    }

    // This should never happen since we process until no items remain
    // But keeping as fallback
    logInfo('unexpected pending items after completion', { runId: run.id, pendingCount });

    const elapsed = Date.now() - startTime;
    logMetric('processor_slice_end', {
      runId: run.id,
      outcome: 'partial',
      elapsedMs: elapsed,
      remainingItems: pendingCount,
      processedInSlice: processedCount
    });
    return NextResponse.json({
      status: 'partial',
      runId: run.id,
      processedItems: processedCount,
      remainingItems: pendingCount,
      elapsed,
      message: 'Unexpected partial state - should have processed all items'
    });

  } catch (error: any) {
    logError('processor error', { message: error?.message, stack: error?.stack });

    // Try to mark run as failed
    try {
      const run = await prisma.import_email_runs.findFirst({
        where: { status: 'running' },
        select: {
          id: true,
          job_id: true,
          total_messages: true,
          processed_messages: true,
          started_at: true,
          created_at: true
        }
      });

      if (run) {
        logError('marking run as failed after processor error', { runId: run.id, error: error?.message });
        const runStart = run.started_at ?? run.created_at ?? new Date();
        const finishedAt = new Date();
        const durationMs = Math.max(0, finishedAt.getTime() - new Date(runStart).getTime());
        let summary: ImportRunSummary | null = null;
        try {
          summary = await buildImportRunSummary({
            runId: run.id,
            jobId: run.job_id,
            totalMessages: run.total_messages ?? null,
            processedMessages: run.processed_messages ?? 0,
            failedMessages: 0
          });
        } catch (summaryError: any) {
          logWarn('failed to build summary after processor error', {
            runId: run.id,
            error: summaryError?.message
          });
        }
        await prisma.import_email_runs.update({
          where: { id: run.id },
          data: {
            status: 'failed',
            finished_at: finishedAt,
            processing_duration_ms: durationMs,
            last_error: error.message,
            summary
          }
        });
      }
    } catch (updateError) {
      logError('failed to update run status after processor error', { error: updateError instanceof Error ? updateError.message : String(updateError) });
    }

    logMetric('processor_slice_end', {
      runId: 'unknown',
      outcome: 'error',
      error: error.message
    });

    return NextResponse.json(
      {
        status: 'error',
        error: error.message
      },
      { status: 500 }
    );
  }
}

interface TriggerAIWorkerOptions {
  runId: string;
  queued: number;
  remainingMs: number;
}

async function triggerAIWorker(origin: string | null, options: TriggerAIWorkerOptions): Promise<void> {
  const { runId, queued, remainingMs } = options;

  if (!origin) {
    logMetric('processor_ai_worker_trigger_skipped', { runId, reason: 'no_origin', queued });
    return;
  }

  if (queued <= 0) {
    return;
  }

  const defaultAuto = DEFAULT_WORKER_CONCURRENCY.toString();
  const autoConcurrency = Math.max(3, Number(process.env.GPT_WORKER_AUTORUN_CONCURRENCY || defaultAuto));
  const autoMaxJobsEnv = Number(process.env.GPT_WORKER_AUTORUN_MAX_JOBS || autoConcurrency);
  const autoTimeoutEnv = Number(process.env.GPT_WORKER_AUTORUN_TIMEOUT_MS || '15000');

  const maxJobs = Math.max(1, Math.min(queued, isNaN(autoMaxJobsEnv) ? autoConcurrency : autoMaxJobsEnv));
  const concurrency = Math.min(autoConcurrency, maxJobs);
  const safeRemaining = Math.max(0, remainingMs - SOFT_EXIT_MARGIN_MS);
  const timeoutMs = Math.max(3000, Math.min(isNaN(autoTimeoutEnv) ? 15000 : autoTimeoutEnv, safeRemaining));

  if (timeoutMs <= 1000) {
    logMetric('processor_ai_worker_trigger_skipped', { runId, reason: 'insufficient_time', queued, remainingMs });
    return;
  }

  const body = {
    trigger: 'processor',
    concurrency,
    maxJobs,
    timeoutMs
  };

  try {
    const response = await fetch(new URL('/api/import-emails/ai', origin), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    logMetric('processor_ai_worker_trigger', {
      runId,
      queued,
      concurrency,
      maxJobs,
      timeoutMs,
      status: response.status
    });
  } catch (error: any) {
    logMetric('processor_ai_worker_trigger_failed', {
      runId,
      queued,
      error: error?.message || 'unknown error'
    });
  }
}
