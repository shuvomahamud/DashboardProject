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
      // Continue processing the running run
      console.log(`🔄 [RUN:${running.id}] Continuing existing running import`);

      // Await processor to prevent Vercel from freezing un-awaited work
      await processImport(req);

      return NextResponse.json({
        status: 'continuing',
        runId: running.id,
        message: 'Processor completed or stopped early in this slice.'
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

    // Trigger processor directly to avoid HTTP connection errors
    console.log(`🔄 [RUN:${enqueued.id}] Triggering processor directly`);

    // Await processor to prevent Vercel from freezing un-awaited work
    await processImport(req);

    return NextResponse.json({
      status: 'dispatched',
      runId: enqueued.id,
      message: 'Processor completed or stopped early in this slice.'
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
