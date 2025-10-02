import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { TimeBudget, getSoftBudgetMs } from '@/lib/timebox';
import { mapWithConcurrency } from '@/lib/pool';
import { createEmailProvider } from '@/lib/providers/msgraph-provider';
import { processEmailItem } from '@/lib/pipeline/email-pipeline';

/**
 * POST /api/import-emails/process
 *
 * Processor: Processes the currently running import in time-boxed slices.
 *
 * Two phases:
 * - Phase A: Enumerate emails from provider → create items (if total_messages = 0)
 * - Phase B: Process items with bounded concurrency (concurrency=2)
 *
 * Time budget: 30s soft (stops with 5s buffer for cleanup)
 *
 * Kicks off dispatcher at the end (via waitUntil) if more work remains.
 */
export const runtime = 'nodejs';
export const maxDuration = 60; // Vercel max function duration

export async function POST(req: NextRequest) {
  const budget = new TimeBudget(getSoftBudgetMs());

  try {
    console.log('⚙️  Processor invoked');

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

      } catch (error: any) {
        console.error(`❌ [RUN:${run.id}] Phase A: Failed to insert items:`, error);
        throw error;
      }

      // Update run with total
      await prisma.import_email_runs.update({
        where: { id: run.id },
        data: { total_messages: messages.length }
      });

      console.log(`✅ [RUN:${run.id}] Phase A: Complete - ${messages.length} messages ready for processing`);
    }

    // Phase B: Process items with time-boxed slicing
    console.log(`⚙️  [RUN:${run.id}] Phase B: Starting item processing`);

    // Reduce concurrency to 1 to avoid connection pool exhaustion
    // Each item processing may use multiple connections (fetch, update, etc.)
    const concurrency = parseInt(process.env.ITEM_CONCURRENCY || '1', 10);
    console.log(`⚙️  [RUN:${run.id}] Phase B: Concurrency set to ${concurrency}`);

    let processedCount = 0;
    let batchNumber = 0;

    while (budget.shouldContinue()) {
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

      // Process items with bounded concurrency
      const batch = pendingItems.slice(0, concurrency);
      await mapWithConcurrency(batch, concurrency, async (item, index) => {
        if (!budget.shouldContinue()) {
          console.log(`⏱️  [RUN:${run.id}] Phase B: Time budget exhausted, stopping`);
          return;
        }

        console.log(`📧 [RUN:${run.id}] Phase B: Processing item ${item.id} (external_message_id: ${item.external_message_id.substring(0, 20)}...)`);

        await processEmailItem(item, {
          provider,
          jobId: run.job_id,
          runId: run.id
        });

        console.log(`✅ [RUN:${run.id}] Phase B: Item ${item.id} processed`);
        processedCount++;
      });

      console.log(`🔄 [RUN:${run.id}] Phase B: Batch ${batchNumber} complete - ${processedCount} items processed in this slice`);

      // Update progress
      console.log(`📊 [RUN:${run.id}] Phase B: Calculating progress...`);
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

      console.log(`📊 [RUN:${run.id}] Phase B: Progress updated - ${totalProcessed}/${run.total_messages} (${(progress * 100).toFixed(1)}%)`);

      // Check if time budget exhausted
      if (!budget.shouldContinue()) {
        console.log(`⏱️  [RUN:${run.id}] Phase B: Time budget exhausted (${budget.elapsed()}ms), stopping slice`);
        break;
      }
    }

    // Check if all items completed
    const [pendingCount, completedCount, failedCount] = await Promise.all([
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

    if (pendingCount === 0) {
      // All items processed - determine final status
      const finalStatus = completedCount > 0 ? 'succeeded' : 'failed';
      const lastError = finalStatus === 'failed'
        ? `All ${failedCount} items failed. Check item errors for details.`
        : null;

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

      console.log(`✅ [RUN:${run.id}] Import finished: ${finalStatus} (completed: ${completedCount}, failed: ${failedCount})`);
      return NextResponse.json({
        status: finalStatus,
        runId: run.id,
        processedItems: processedCount,
        completed: completedCount,
        failed: failedCount
      });
    }

    // More work remains - poke dispatcher
    console.log(`🔄 [RUN:${run.id}] ${pendingCount} items remaining, re-queuing processor`);

    if (typeof req.waitUntil === 'function') {
      const dispatchUrl = new URL('/api/import-emails/dispatch', req.url);
      req.waitUntil(
        fetch(dispatchUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        }).catch(err => {
          console.error('Failed to kick off dispatcher:', err);
        })
      );
    }

    return NextResponse.json({
      status: 'partial',
      runId: run.id,
      processedItems: processedCount,
      remainingItems: pendingCount,
      elapsed: budget.elapsed()
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
