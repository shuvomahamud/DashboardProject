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
    const timestamp = new Date().toISOString();
    console.log(`🔄 [${timestamp}] Vercel Cron: Dispatcher invoked`);
    console.log('🕐 This log confirms the cron job is running on Vercel');

    // Check if any run is already running
    const running = await prisma.import_email_runs.findFirst({
      where: { status: 'running' },
      select: { id: true }
    });

    if (running) {
      console.log('⏸️  Already running:', running.id);
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
      console.log('✅ No work to do');
      return NextResponse.json({
        status: 'no_work'
      });
    }

    console.log('🚀 Promoting run to running:', enqueued.id);

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
      console.log('⚠️  Race condition: another dispatcher won');
      return NextResponse.json({
        status: 'race_lost'
      });
    }

    console.log('✅ Promoted to running:', enqueued.id);

    // Kick off processor directly instead of via HTTP
    // This avoids network issues with preview deployment URLs
    console.log('🔄 Triggering processor directly');

    const processPromise = processImport(req).then(res => {
      console.log('✅ Processor completed');
      return res;
    }).catch(err => {
      console.error('❌ Processor error:', err);
      // Don't throw - let the cron retry on next cycle
    });

    // Use waitUntil if available (Vercel), otherwise fire-and-forget
    if (typeof req.waitUntil === 'function') {
      console.log('🔄 Using waitUntil for processor');
      req.waitUntil(processPromise);
    } else {
      console.log('🔄 Fire-and-forget processor');
      // Fire and forget - don't await
      processPromise;
    }

    return NextResponse.json({
      status: 'dispatched',
      runId: enqueued.id,
      message: 'Run promoted to running. Processor triggered.'
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
