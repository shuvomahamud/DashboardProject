import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

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
    console.log('🔄 Dispatcher invoked');

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

    // Kick off processor (in production, use waitUntil)
    // For now, just return success - you'll call /process manually in dev
    if (typeof req.waitUntil === 'function') {
      const processUrl = new URL('/api/import-emails/process', req.url);
      req.waitUntil(
        fetch(processUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ runId: enqueued.id })
        }).catch(err => {
          console.error('Failed to kick off processor:', err);
        })
      );
    }

    return NextResponse.json({
      status: 'dispatched',
      runId: enqueued.id,
      message: 'Run promoted to running. Call /api/import-emails/process to start processing.'
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
