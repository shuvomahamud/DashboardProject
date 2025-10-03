import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createEmailProvider } from '@/lib/providers/msgraph-provider';
import { processEmailItem, tryGPTParsing } from '@/lib/pipeline/email-pipeline';

/**
 * POST /api/import-emails/process
 *
 * Processor: Processes the currently running import with smart time budgeting.
 *
 * Three phases:
 * - Phase A: Enumerate emails from provider → create items (if total_messages = 0)
 * - Phase B: Process items with soft 50s time limit (10s safety buffer)
 * - Phase C: Retry failed GPT calls if time permits
 *
 * Time budget strategy:
 * - Soft limit: 50s (allows safe processing of ~7-8 items)
 * - Hard limit: 60s (Vercel maxDuration & gateway timeout)
 * - GPT timeout: 8s first attempt, 10s retry
 * - Target: 90-95% GPT success rate with retry queue
 */
export const runtime = 'nodejs';
export const maxDuration = 60; // Vercel max function duration

// Time budget constants
const SOFT_TIME_LIMIT_MS = 50000; // 50s - stop processing new items
const HARD_TIME_LIMIT_MS = 60000; // 60s - absolute limit (gateway timeout)
const GPT_TIMEOUT_FIRST_MS = 12000; // 8s - first attempt
const GPT_TIMEOUT_RETRY_MS = 15000; // 10s - retry attempt
const MIN_TIME_FOR_RETRY_MS = 18000; // 12s - minimum time needed for retry (10s + 2s overhead)

interface GPTRetryItem {
  itemId: bigint;
  resumeId: number;
  jobContext: {
    jobTitle: string;
    jobDescriptionShort: string;
  };
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();

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
      console.log(`📋 [RUN:${run.id}] Phase A: Starting email enumeration`);
      console.log(`📋 [RUN:${run.id}] Phase A: Calling provider.listMessages with search="${run.search_text}", limit=${run.max_emails || 5000}`);

      const messages = await provider.listMessages({
        jobTitle: run.search_text,
        limit: run.max_emails || 5000
      });

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

    // Phase B: Process pending items with soft time limit
    console.log(`⚙️  [RUN:${run.id}] Phase B: Starting item processing (soft limit: ${SOFT_TIME_LIMIT_MS}ms)`);

    // Sequential processing (concurrency=1) to minimize database connections
    const concurrency = parseInt(process.env.ITEM_CONCURRENCY || '1', 10);
    console.log(`⚙️  [RUN:${run.id}] Phase B: Concurrency set to ${concurrency}`);

    let processedCount = 0;
    let batchNumber = 0;
    const gptRetryQueue: GPTRetryItem[] = [];

    // Get job context once for GPT parsing
    const job = await prisma.job.findUnique({
      where: { id: run.job_id },
      select: { title: true, description: true }
    });

    const jobContext = job ? {
      jobTitle: job.title,
      jobDescriptionShort: job.description.length > 500
        ? job.description.substring(0, 500) + '...'
        : job.description
    } : null;

    // Process items until soft time limit or no items remain
    while (true) {
      batchNumber++;
      const elapsed = Date.now() - startTime;

      // Check soft time limit BEFORE starting new item
      if (elapsed > SOFT_TIME_LIMIT_MS) {
        console.log(`⏱️  [RUN:${run.id}] Phase B: Soft time limit reached (${elapsed}ms), stopping to avoid timeout`);
        break;
      }

      console.log(`🔄 [RUN:${run.id}] Phase B: Batch ${batchNumber} - Querying for pending items (elapsed: ${elapsed}ms)`);

      // Get next batch of pending items
      const pendingItems = await prisma.import_email_items.findMany({
        where: {
          run_id: run.id,
          status: 'pending'
        },
        orderBy: { id: 'asc' },
        take: concurrency * 2 // Fetch 2x concurrency for smoother batching
      });

      console.log(`🔄 [RUN:${run.id}] Phase B: Batch ${batchNumber} - Found ${pendingItems.length} pending items`);

      if (pendingItems.length === 0) {
        console.log(`✅ [RUN:${run.id}] Phase B: No more pending items - processing complete`);
        break;
      }

      const batchSize = Math.min(pendingItems.length, concurrency);
      console.log(`🔄 [RUN:${run.id}] Phase B: Batch ${batchNumber} - Processing ${batchSize} items`);

      // Process items sequentially (or with bounded concurrency)
      const batch = pendingItems.slice(0, concurrency);

      for (const item of batch) {
        console.log(`📧 [RUN:${run.id}] Phase B: Processing item ${item.id} (external_message_id: ${item.external_message_id.substring(0, 20)}...)`);

        const result = await processEmailItem(item, {
          provider,
          jobId: run.job_id,
          runId: run.id
        });

        console.log(`✅ [RUN:${run.id}] Phase B: Item ${item.id} processed`);
        processedCount++;

        // Track GPT failures for retry
        if (result.success && !result.gptSuccess && result.resumeId && jobContext) {
          console.log(`📋 [RUN:${run.id}] Adding resume ${result.resumeId} to GPT retry queue`);
          gptRetryQueue.push({
            itemId: item.id,
            resumeId: result.resumeId,
            jobContext
          });
        }
      }

      console.log(`🔄 [RUN:${run.id}] Phase B: Batch ${batchNumber} complete - ${processedCount} items processed, ${gptRetryQueue.length} in retry queue`);

      // Update progress after each batch
      console.log(`📊 [RUN:${run.id}] Phase B: Updating progress...`);

      try {
        const totalProcessed = await prisma.import_email_items.count({
          where: {
            run_id: run.id,
            status: { in: ['completed', 'failed'] }
          }
        });

        const progress = run.total_messages > 0
          ? totalProcessed / run.total_messages
          : 0;

        await prisma.import_email_runs.update({
          where: { id: run.id },
          data: {
            processed_messages: totalProcessed,
            progress
          }
        });

        const elapsed = Date.now() - startTime;
        console.log(`📊 [RUN:${run.id}] Phase B: Progress updated - ${totalProcessed}/${run.total_messages} (${(progress * 100).toFixed(1)}%) [${(elapsed / 1000).toFixed(1)}s elapsed]`);
      } catch (progressError: any) {
        console.warn(`⚠️  [RUN:${run.id}] Failed to update progress (non-fatal):`, progressError.message);
        // Continue processing - progress update failure is not critical
      }
    }

    // Phase C: Retry failed GPT calls if we have time
    console.log(`🔄 [RUN:${run.id}] Phase C: GPT retry phase - ${gptRetryQueue.length} items in queue`);

    let retriedCount = 0;
    let retrySuccessCount = 0;

    if (gptRetryQueue.length > 0) {
      for (const retryItem of gptRetryQueue) {
        const elapsed = Date.now() - startTime;
        const remaining = HARD_TIME_LIMIT_MS - elapsed;

        // Check if we have enough time for retry
        if (remaining < MIN_TIME_FOR_RETRY_MS) {
          console.log(`⏱️  [RUN:${run.id}] Phase C: Not enough time for retry (${remaining}ms left), leaving ${gptRetryQueue.length - retriedCount} items for batch API`);
          break;
        }

        console.log(`🔄 [RUN:${run.id}] Phase C: Retrying GPT for resume ${retryItem.resumeId} (${remaining}ms remaining)`);
        retriedCount++;

        const success = await tryGPTParsing(
          retryItem.resumeId,
          retryItem.jobContext,
          GPT_TIMEOUT_RETRY_MS,
          run.id
        );

        if (success) {
          retrySuccessCount++;
          console.log(`✅ [RUN:${run.id}] Phase C: GPT retry successful for resume ${retryItem.resumeId}`);
        } else {
          console.log(`⚠️  [RUN:${run.id}] Phase C: GPT retry failed for resume ${retryItem.resumeId} - leaving for batch API`);
        }
      }

      const finalElapsed = Date.now() - startTime;
      console.log(`✅ [RUN:${run.id}] Phase C: Complete - ${retrySuccessCount}/${retriedCount} retries successful (${finalElapsed}ms total elapsed)`);
      console.log(`📊 [RUN:${run.id}] Phase C: GPT success rate: ${retrySuccessCount + processedCount - gptRetryQueue.length}/${processedCount} (${((retrySuccessCount + processedCount - gptRetryQueue.length) / processedCount * 100).toFixed(1)}%)`);
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

    if (pendingCount === 0) {
      // All items processed - determine final status
      const finalStatus = completedCount > 0 ? 'succeeded' : 'failed';
      const lastError = finalStatus === 'failed'
        ? `All ${failedCount} items failed. Check item errors for details.`
        : null;

      console.log(`✅ [RUN:${run.id}] Import finished: ${finalStatus} (completed: ${completedCount}, failed: ${failedCount})`);

      // Clean up processed items to keep table lean
      console.log(`🧹 [RUN:${run.id}] Cleaning up ${completedCount + failedCount} processed items`);
      await prisma.import_email_items.deleteMany({
        where: {
          run_id: run.id,
          status: { in: ['completed', 'failed'] }
        }
      });

      // Mark run as complete
      await prisma.import_email_runs.update({
        where: { id: run.id },
        data: {
          status: finalStatus,
          finished_at: new Date(),
          progress: 1.0,
          processed_messages: completedCount,
          last_error: lastError
        }
      });

      console.log(`✅ [RUN:${run.id}] Cleanup complete - run marked as ${finalStatus}`);

      // Clean up old completed runs (keep only last 10 per job)
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
        console.log(`🧹 [RUN:${run.id}] Cleaning up ${oldRuns.length} old runs for job ${run.job_id}`);
        await prisma.import_email_runs.deleteMany({
          where: {
            id: { in: oldRuns.map(r => r.id) }
          }
        });
      }

      const elapsed = Date.now() - startTime;
      console.log(`✅ [RUN:${run.id}] Import completed in ${(elapsed / 1000).toFixed(1)}s`);

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

    return NextResponse.json(
      {
        status: 'error',
        error: error.message
      },
      { status: 500 }
    );
  }
}
