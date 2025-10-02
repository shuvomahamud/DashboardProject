import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { POST as processImport } from '../process/route';

/**
 * POST /api/import-emails/dispatch
 *
 * Dispatcher: Promotes oldest enqueued run to running and kicks off processing.
 *
 * This is called by:
 * - Vercel Cron (every minute in production)
 * - Manual trigger (for local development)
 * - After enqueue (via waitUntil)
 * - After processor slice completes (via waitUntil)
 *
 * Idempotent: Multiple calls are safe - only one will promote due to DB constraints.
 */
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    // Check if any run is already running
    const running = await prisma.import_email_runs.findFirst({
      where: { status: 'running' },
      select: { id: true }
    });

    if (running) {
      // Silently return - no need to log every cron check
      return NextResponse.json({
        status: 'already_running',
        runId: running.id
      });
    }

    // Get oldest enqueued run (FIFO)
    const enqueued = await prisma.import_email_runs.findFirst({
      where: { status: 'enqueued' },
      orderBy: { created_at: 'asc' },
      select: { id: true, job_id: true }
    });

    if (!enqueued) {
      // Silently return - no work to do
      return NextResponse.json({
        status: 'no_work'
      });
    }

    console.log(`🚀 [RUN:${enqueued.id}] Promoting run to running`);

    // Promote to running (global unique index prevents race conditions)
    try {
      await prisma.import_email_runs.update({
        where: {
          id: enqueued.id,
          status: 'enqueued' // Double-check still enqueued
        },
        data: {
          status: 'running',
          started_at: new Date(),
          attempts: { increment: 1 }
        }
      });
    } catch (error: any) {
      // Race condition - another dispatcher won
      console.log(`⚠️  [RUN:${enqueued.id}] Race condition: another dispatcher won`);
      return NextResponse.json({
        status: 'race_lost'
      });
    }

    console.log(`✅ [RUN:${enqueued.id}] Promoted to running`);

    // Kick off processor directly instead of via HTTP
    // This avoids network issues with preview deployment URLs
    console.log(`🔄 [RUN:${enqueued.id}] Triggering processor`);

    // Always await the processor to ensure it runs to completion
    // The processor has its own time budget and will return when done or time's up
    try {
      await processImport(req);
      console.log(`✅ [RUN:${enqueued.id}] Processor completed`);
    } catch (err) {
      console.error(`❌ [RUN:${enqueued.id}] Processor error:`, err);
      // Don't throw - run is already marked as running, cron will retry
    }

    return NextResponse.json({
      status: 'dispatched',
      runId: enqueued.id,
      message: 'Run promoted to running. Processor completed.'
    });

  } catch (error: any) {
    console.error('❌ Dispatcher error:', error);
    return NextResponse.json(
      {
        status: 'error',
        error: error.message
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/import-emails/dispatch
 *
 * For manual testing - just calls POST
 */
export async function GET(req: NextRequest) {
  return POST(req);
}
