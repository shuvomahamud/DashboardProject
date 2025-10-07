import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createEmailProvider } from '@/lib/providers/msgraph-provider';
import { processEmailItem } from '@/lib/pipeline/email-pipeline';
import { logMetric } from '@/lib/logging/metrics';

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
const SOFT_TIME_LIMIT_MS = HARD_TIME_LIMIT_MS - SOFT_EXIT_MARGIN_MS;

// Time helpers
const since = (t: number) => Date.now() - t;
const timeLeft = (start: number) => HARD_TIME_LIMIT_MS - since(start);

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  logMetric('processor_slice_start', { startedAt: new Date(startTime).toISOString() });

  try {
    console.log('⚙️  Processor invoked');

    // Test database connectivity with retry
    let dbReady = false;
    for (let i = 0; i < 3; i++) {
      try {
        await prisma.$queryRaw`SELECT 1`;
        dbReady = true;
        break;
      } catch (error: any) {
        console.log(`⚠️  Database connectivity check failed (attempt ${i + 1}/3)`);
        if (i < 2) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }

    if (!dbReady) {
      console.error('❌ Database not reachable after 3 attempts');
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
      console.log('❌ No running import found');
      return NextResponse.json({ status: 'no_work' });
    }

    console.log(`📦 [RUN:${run.id}] Processing run for job ${run.job_id} (${run.Job.title})`);
    logMetric('processor_run_active', { runId: run.id, jobId: run.job_id, totalMessages: run.total_messages ?? 0 });
    console.log(`📧 [RUN:${run.id}] Search params - mailbox: ${run.mailbox}, text: "${run.search_text}", max: ${run.max_emails}`);

    // Check if canceled
    if (run.status === 'canceled') {
      console.log(`🚫 [RUN:${run.id}] Run canceled, stopping`);
      return NextResponse.json({ status: 'canceled' });
    }

    // Validate required fields
    if (!run.mailbox || !run.search_text) {
      console.error(`❌ [RUN:${run.id}] Missing mailbox or search_text in run`);
      await prisma.import_email_runs.update({
        where: { id: run.id },
        data: {
          status: 'failed',
          finished_at: new Date(),
          last_error: 'Missing mailbox or search_text configuration'
        }
      });
      return NextResponse.json({ status: 'error', error: 'Missing configuration' });
    }

    const provider = createEmailProvider(run.mailbox);

    // Phase A: Enumerate emails (only if total_messages = 0)
    if (run.total_messages === 0) {
      // Guard: Skip enumeration if less than 10s remaining
      if (timeLeft(startTime) < 10_000) {
        console.log(`⏭️  [RUN:${run.id}] Skipping Phase A enumeration this slice to stay within budget`);
        logMetric('processor_phase_a_skipped', { runId: run.id, remainingMs: timeLeft(startTime) });
      } else {
        console.log(`📋 [RUN:${run.id}] Phase A: Starting email enumeration`);
        console.log(`📋 [RUN:${run.id}] Phase A: Calling provider.listMessages with search="${run.search_text}", limit=${run.max_emails || 5000}`);

        const phaseAStart = Date.now();
        const messages = await provider.listMessages({
          jobTitle: run.search_text,
          limit: run.max_emails || 5000
        });

        logMetric('processor_phase_a_messages', { runId: run.id, count: messages.length, ms: Date.now() - phaseAStart });
      console.log(`📧 [RUN:${run.id}] Phase A: Provider returned ${messages.length} messages`);

      if (messages.length === 0) {
        console.log(`⚠️  [RUN:${run.id}] Phase A: No messages found - marking run as succeeded`);
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

      // Create items for each message
      console.log(`📋 [RUN:${run.id}] Phase A: Creating ${messages.length} import items in database`);

      // Log first message details for debugging
      if (messages.length > 0) {
        console.log(`📋 [RUN:${run.id}] Phase A: Sample message - externalId: ${messages[0].externalId}, receivedAt: ${messages[0].receivedAt}`);
      }

      const items = messages.map(msg => ({
        run_id: run.id,
        job_id: run.job_id,
        external_message_id: msg.externalId,
        external_thread_id: msg.threadId,
        received_at: msg.receivedAt,
        status: 'pending',
        step: 'none',
        attempts: 0
      }));

      console.log(`📋 [RUN:${run.id}] Phase A: Mapped ${items.length} items, calling createMany...`);

      // Retry logic for database operations
      let retries = 3;
      let lastError: any = null;

      while (retries > 0) {
        try {
          const createResult = await prisma.import_email_items.createMany({
            data: items,
            skipDuplicates: true
          });

          console.log(`📋 [RUN:${run.id}] Phase A: createMany returned count: ${createResult.count}`);
          console.log(`📋 [RUN:${run.id}] Phase A: Inserted ${createResult.count} items (${items.length - createResult.count} duplicates skipped)`);

          // Verify items were actually inserted
          const verifyCount = await prisma.import_email_items.count({
            where: { run_id: run.id }
          });
          console.log(`📋 [RUN:${run.id}] Phase A: Verification - Found ${verifyCount} items in database for this run`);

          // Success - break out of retry loop
          break;

        } catch (error: any) {
          lastError = error;
          retries--;

          const isConnectionError = error.code === 'P1001' || error.message?.includes('Can\'t reach database');
          const isPoolError = error.message?.includes('Timed out fetching a new connection');

          if ((isConnectionError || isPoolError) && retries > 0) {
            const waitTime = (4 - retries) * 2000; // 2s, 4s, 6s
            console.log(`⚠️  [RUN:${run.id}] Phase A: Database error, retrying in ${waitTime}ms (${retries} retries left)`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
          } else {
            console.error(`❌ [RUN:${run.id}] Phase A: Failed to insert items after ${3 - retries} attempts:`, error);
            throw error;
          }
        }
      }

      if (retries === 0 && lastError) {
        throw lastError;
      }

      // Update run with total
      await prisma.import_email_runs.update({
        where: { id: run.id },
        data: { total_messages: messages.length }
      });

      console.log(`✅ [RUN:${run.id}] Phase A: Complete - ${messages.length} messages ready for processing`);
      }
    }

    // Phase B: Process pending items with soft time limit
    console.log(`??  [RUN:${run.id}] Phase B: Starting item processing (soft limit: ${SOFT_TIME_LIMIT_MS}ms)`);
    logMetric('processor_phase_b_start', { runId: run.id, softLimitMs: SOFT_TIME_LIMIT_MS });

    const concurrency = parseInt(process.env.ITEM_CONCURRENCY || '1', 10);
    console.log(`??  [RUN:${run.id}] Phase B: Concurrency set to ${concurrency}`);

    let processedCount = 0;
    let batchNumber = 0;
    let gracefulStop = false;

    while (!gracefulStop) {
      batchNumber++;
      const elapsed = Date.now() - startTime;
      const remaining = timeLeft(startTime);

      if (remaining <= SOFT_EXIT_MARGIN_MS) {
        console.log(`??  [RUN:${run.id}] Phase B: Remaining ${remaining}ms < buffer ${SOFT_EXIT_MARGIN_MS}ms - stopping`);
        logMetric('processor_phase_b_exit_buffer', { runId: run.id, remainingMs: remaining });
        break;
      }

      if (elapsed >= SOFT_TIME_LIMIT_MS) {
        console.log(`??  [RUN:${run.id}] Phase B: Soft time limit reached (${elapsed}ms)`);
        logMetric('processor_phase_b_exit_soft_limit', { runId: run.id, elapsedMs: elapsed });
        break;
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
        console.log(`? [RUN:${run.id}] Phase B: No more pending items - processing complete`);
        logMetric('processor_phase_b_empty', { runId: run.id, batches: batchNumber });
        break;
      }

      console.log(`?? [RUN:${run.id}] Phase B: Batch ${batchNumber} - Processing ${pendingItems.length} items`);

      for (const item of pendingItems) {
        if (timeLeft(startTime) <= ITEM_BUDGET_MS) {
          const remainingForItem = timeLeft(startTime);
          console.log(`??  [RUN:${run.id}] Phase B: Not enough time for another item (${remainingForItem}ms left)`);
          logMetric('processor_phase_b_exit_item_budget', { runId: run.id, remainingMs: remainingForItem });
          gracefulStop = true;
          break;
        }

        const itemStart = Date.now();
        console.log(`?? [RUN:${run.id}] Phase B: Processing item ${item.id} (external_message_id: ${item.external_message_id.substring(0, 20)}...)`);

        const result = await processEmailItem(item, {
          provider,
          jobId: run.job_id,
          runId: run.id
        });

        const itemDuration = Date.now() - itemStart;
        processedCount++;

        logMetric('processor_item_complete', {
          runId: run.id,
          itemId: item.id.toString(),
          success: result.success,
          durationMs: itemDuration,
          gptStatus: result.gptStatus || 'unknown'
        });

        if (!result.success) {
          console.warn(`??  [RUN:${run.id}] Phase B: Item ${item.id} failed: ${result.error}`);
        }
      }

      if (gracefulStop) {
        break;
      }

      if (timeLeft(startTime) > 4000) {
        try {
          const totalProcessed = await prisma.import_email_items.count({
            where: {
              run_id: run.id,
              status: { in: ['completed', 'failed'] }
            }
          });

          const progress = run.total_messages && run.total_messages > 0
            ? totalProcessed / run.total_messages
            : 0;

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
          console.warn(`??  [RUN:${run.id}] Failed to update progress (non-fatal):`, progressError.message);
          logMetric('processor_progress_failed', { runId: run.id, error: progressError.message });
        }
      } else {
        logMetric('processor_progress_skipped', { runId: run.id, remainingMs: timeLeft(startTime) });
      }
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
      console.error(`❌ [RUN:${run.id}] Failed to count items:`, countError.message);

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
      const finalStatus = completedCount > 0 ? 'succeeded' : 'failed';
      const lastError = finalStatus === 'failed'
        ? `All ${failedCount} items failed. Check item errors for details.`
        : null;

      console.log(`? [RUN:${run.id}] Import finished: ${finalStatus} (completed: ${completedCount}, failed: ${failedCount})`);
      logMetric('processor_run_summary', {
        runId: run.id,
        status: finalStatus,
        completedCount,
        failedCount,
        processedInSlice: processedCount
      });

      const runUpdateData = {
        status: finalStatus,
        finished_at: new Date(),
        progress: 1.0,
        processed_messages: completedCount,
        last_error: lastError
      } as const;

      if (timeLeft(startTime) <= 5000) {
        await prisma.import_email_runs.update({
          where: { id: run.id },
          data: runUpdateData
        });

        const elapsed = Date.now() - startTime;
        logMetric('processor_cleanup_deferred', {
          runId: run.id,
          reason: 'low_time_after_completion',
          remainingMs: timeLeft(startTime)
        });
        logMetric('processor_slice_end', {
          runId: run.id,
          outcome: finalStatus,
          elapsedMs: elapsed,
          cleaned: false
        });

        return NextResponse.json({
          status: finalStatus,
          runId: run.id,
          processedItems: processedCount,
          completed: completedCount,
          failed: failedCount,
          elapsed
        });
      }

      console.log(`?? [RUN:${run.id}] Cleaning up ${completedCount + failedCount} processed items`);
      await prisma.import_email_items.deleteMany({
        where: {
          run_id: run.id,
          status: { in: ['completed', 'failed'] }
        }
      });

      await prisma.import_email_runs.update({
        where: { id: run.id },
        data: runUpdateData
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
          console.log(`?? [RUN:${run.id}] Cleaning up ${oldRuns.length} old runs for job ${run.job_id}`);
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

      const elapsed = Date.now() - startTime;
      console.log(`? [RUN:${run.id}] Import completed in ${(elapsed / 1000).toFixed(1)}s`);
      logMetric('processor_slice_end', {
        runId: run.id,
        outcome: finalStatus,
        elapsedMs: elapsed,
        cleaned: true
      });

      return NextResponse.json({
        status: finalStatus,
        runId: run.id,
        processedItems: processedCount,
        completed: completedCount,
        failed: failedCount,
        elapsed
      });
    }

    // This should never happen since we process until no items remain
    // But keeping as fallback
    console.log(`⚠️  [RUN:${run.id}] Unexpected state: ${pendingCount} items still pending after completion`);

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
    console.error('❌ Processor error:', error);

    // Try to mark run as failed
    try {
      const run = await prisma.import_email_runs.findFirst({
        where: { status: 'running' }
      });

      if (run) {
        console.error(`❌ [RUN:${run.id}] Marking run as failed due to error`);
        await prisma.import_email_runs.update({
          where: { id: run.id },
          data: {
            status: 'failed',
            finished_at: new Date(),
            last_error: error.message
          }
        });
      }
    } catch (updateError) {
      console.error('Failed to update run status:', updateError);
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
