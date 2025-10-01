import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import prisma from '@/lib/prisma';

/**
 * POST /api/import-emails
 *
 * Enqueue a new email import run for a job.
 *
 * Body: { jobId: number }
 *
 * Rules:
 * - Only one active-or-queued run per job (enforced by DB unique index)
 * - Creates run with status='enqueued'
 * - Kicks off dispatcher (via waitUntil in production)
 */
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userEmail = session?.user?.email || 'unknown';

    const body = await req.json();
    const { jobId, mailbox, searchText, maxEmails } = body;

    if (!jobId || typeof jobId !== 'number') {
      return NextResponse.json(
        { error: 'jobId (number) required' },
        { status: 400 }
      );
    }

    if (!mailbox || !searchText) {
      return NextResponse.json(
        { error: 'mailbox and searchText are required' },
        { status: 400 }
      );
    }

    console.log('📥 Enqueuing import for job:', jobId, 'mailbox:', mailbox, 'search:', searchText);

    // Check if job exists
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: { id: true, title: true }
    });

    if (!job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    // Check if already has active/queued run
    const existing = await prisma.import_email_runs.findFirst({
      where: {
        job_id: jobId,
        status: { in: ['enqueued', 'running'] }
      },
      select: { id: true, status: true }
    });

    if (existing) {
      return NextResponse.json(
        {
          error: 'Job already has an active or queued import',
          existingRunId: existing.id,
          existingStatus: existing.status
        },
        { status: 409 }
      );
    }

    // Create new run
    const run = await prisma.import_email_runs.create({
      data: {
        job_id: jobId,
        requested_by: userEmail,
        mailbox,
        search_text: searchText,
        max_emails: maxEmails || 5000,
        status: 'enqueued',
        progress: 0,
        processed_messages: 0,
        total_messages: 0,
        attempts: 0
      }
    });

    console.log('✅ Created run:', run.id);

    // Kick off dispatcher (in production, use waitUntil)
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
      status: 'enqueued',
      runId: run.id,
      jobId: job.id,
      jobTitle: job.title,
      message: 'Import queued successfully. Dispatcher will start processing soon.'
    });

  } catch (error: any) {
    console.error('❌ Enqueue error:', error);

    // Handle unique constraint violation (race condition)
    if (error.code === 'P2002') {
      return NextResponse.json(
        { error: 'Job already has an active or queued import (race condition)' },
        { status: 409 }
      );
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
