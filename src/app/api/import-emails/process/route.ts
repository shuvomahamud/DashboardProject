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

    console.log(`📦 Processing run ${run.id} for job ${run.job_id} (${run.Job.title})`);
    console.log(`📧 Search params - mailbox: ${run.mailbox}, text: "${run.search_text}", max: ${run.max_emails}`);

    // Check if canceled
    if (run.status === 'canceled') {
      console.log('🚫 Run canceled, stopping');
      return NextResponse.json({ status: 'canceled' });
    }

    // Validate required fields
    if (!run.mailbox || !run.search_text) {
      console.error('❌ Missing mailbox or search_text in run');
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
      console.log('📋 Phase A: Enumerating emails');

      const messages = await provider.listMessages({
        jobTitle: run.search_text,
        limit: run.max_emails || 5000
      });

      console.log(`📧 Found ${messages.length} messages`);

      // Create items for each message
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

      if (items.length > 0) {
        await prisma.import_email_items.createMany({
          data: items,
          skipDuplicates: true
        });
      }

      // Update run with total
      await prisma.import_email_runs.update({
        where: { id: run.id },
        data: { total_messages: messages.length }
      });

      console.log(`✅ Created ${items.length} items`);

      // If no messages, mark as completed
      if (messages.length === 0) {
        await prisma.import_email_runs.update({
          where: { id: run.id },
          data: {
            status: 'succeeded',
            finished_at: new Date(),
            progress: 1.0
          }
        });

        console.log('✅ No messages to process, marking as succeeded');
        return NextResponse.json({ status: 'succeeded', runId: run.id });
      }
    }

    // Phase B: Process items with time-boxed slicing
    console.log('⚙️  Phase B: Processing items');

    const concurrency = parseInt(process.env.ITEM_CONCURRENCY || '2', 10);
    let processedCount = 0;

    while (budget.shouldContinue()) {
      // Get next batch of pending items
      const pendingItems = await prisma.import_email_items.findMany({
        where: {
          run_id: run.id,
          status: 'pending'
        },
        orderBy: { id: 'asc' },
        take: concurrency * 2 // Fetch 2x concurrency for smoother batching
      });

      if (pendingItems.length === 0) {
        console.log('✅ No more pending items');
        break;
      }

      console.log(`🔄 Processing batch of ${Math.min(pendingItems.length, concurrency)} items`);

      // Process items with bounded concurrency
      const batch = pendingItems.slice(0, concurrency);
      await mapWithConcurrency(batch, concurrency, async (item) => {
        if (!budget.shouldContinue()) {
          console.log(`⏱️  Time budget exhausted, stopping`);
          return;
        }

        await processEmailItem(item, {
          provider,
          jobId: run.job_id,
          runId: run.id
        });

        processedCount++;
      });

      // Update progress
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

      console.log(`📊 Progress: ${totalProcessed}/${run.total_messages} (${(progress * 100).toFixed(1)}%)`);

      // Check if time budget exhausted
      if (!budget.shouldContinue()) {
        console.log(`⏱️  Time budget exhausted (${budget.elapsed()}ms), stopping slice`);
        break;
      }
    }

    // Check if all items completed
    const remainingItems = await prisma.import_email_items.count({
      where: {
        run_id: run.id,
        status: 'pending'
      }
    });

    if (remainingItems === 0) {
      // All done - mark as succeeded
      await prisma.import_email_runs.update({
        where: { id: run.id },
        data: {
          status: 'succeeded',
          finished_at: new Date(),
          progress: 1.0
        }
      });

      console.log('✅ Import completed successfully');
      return NextResponse.json({
        status: 'succeeded',
        runId: run.id,
        processedItems: processedCount
      });
    }

    // More work remains - poke dispatcher
    console.log(`🔄 ${remainingItems} items remaining, re-queuing processor`);

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
      remainingItems,
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
