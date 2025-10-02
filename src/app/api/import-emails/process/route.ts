import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createEmailProvider } from '@/lib/providers/msgraph-provider';
import { processEmailItem } from '@/lib/pipeline/email-pipeline';

/**
 * POST /api/import-emails/process
 *
 * Processor: Processes the currently running import to completion.
 *
 * Two phases:
 * - Phase A: Enumerate emails from provider → create items (if total_messages = 0)
 * - Phase B: Process ALL items sequentially (concurrency=1)
 *
 * No artificial time limits - processes all pending items in one go.
 * With maxDuration=60s and GPT timeout=8s per item, can handle ~7 items per run.
 * For larger imports, will complete in one cycle instead of multiple cron cycles.
 */
export const runtime = 'nodejs';
export const maxDuration = 60; // Vercel max function duration

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

    // Phase B: Process ALL pending items (no time budget limits)
    console.log(`⚙️  [RUN:${run.id}] Phase B: Starting item processing (no time limits)`);

    // Sequential processing (concurrency=1) to minimize database connections
    const concurrency = parseInt(process.env.ITEM_CONCURRENCY || '1', 10);
    console.log(`⚙️  [RUN:${run.id}] Phase B: Concurrency set to ${concurrency}`);

    let processedCount = 0;
    let batchNumber = 0;

    // Process ALL pending items until none remain
    while (true) {
      batchNumber++;
      console.log(`🔄 [RUN:${run.id}] Phase B: Batch ${batchNumber} - Querying for pending items`);

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

        await processEmailItem(item, {
          provider,
          jobId: run.job_id,
          runId: run.id
        });

        console.log(`✅ [RUN:${run.id}] Phase B: Item ${item.id} processed`);
        processedCount++;
      }

      console.log(`🔄 [RUN:${run.id}] Phase B: Batch ${batchNumber} complete - ${processedCount} items processed so far`);

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
