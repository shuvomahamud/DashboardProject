import { NextRequest, NextResponse } from 'next/server';
import { withTableAuthAppRouter } from '@/lib/auth/withTableAuthAppRouter';
import { getBoss } from '@/lib/queue/boss';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

async function _POST(req: NextRequest, ctx?: { params: { id: string } }) {
  const jobId = Number(ctx?.params?.id);

  if (!Number.isFinite(jobId)) {
    return NextResponse.json({ error: 'Invalid job id' }, { status: 400 });
  }

  try {
    // Check if job exists
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: { id: true, title: true }
    });

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Check for existing active or queued run for this job
    const existingRun = await prisma.import_email_runs.findFirst({
      where: {
        job_id: jobId,
        status: { in: ['enqueued', 'running'] }
      },
      select: {
        id: true,
        status: true,
        created_at: true,
        started_at: true
      }
    });

    // If already exists, return it (no-op)
    if (existingRun) {
      console.log(`Import already ${existingRun.status} for job ${jobId}, returning existing run ${existingRun.id}`);
      return NextResponse.json({
        runId: existingRun.id,
        status: existingRun.status,
        message: `Import already ${existingRun.status}`,
        existing: true
      });
    }

    // Create new enqueued run
    const newRun = await prisma.import_email_runs.create({
      data: {
        job_id: jobId,
        status: 'enqueued',
        created_at: new Date()
      }
    });

    console.log(`✅ Created import run ${newRun.id} for job ${jobId} (${job.title})`);

    // Publish to pg-boss queue
    const boss = await getBoss();
    await boss.send('import-emails', {
      runId: newRun.id,
      jobId,
      jobTitle: job.title
    }, {
      retryLimit: 0, // Don't retry failed jobs automatically
      retryBackoff: false,
      expireInHours: 24 // Expire if not processed within 24 hours
    });

    console.log(`✅ Published import run ${newRun.id} to pg-boss queue`);

    return NextResponse.json({
      runId: newRun.id,
      status: 'enqueued',
      message: 'Import queued successfully',
      existing: false
    });

  } catch (error: any) {
    console.error('Failed to enqueue import:', error);

    // More specific error messages
    if (error.message?.includes('does not exist')) {
      return NextResponse.json({
        error: 'Queue system not initialized. Please start the worker first: npm run worker:import'
      }, { status: 503 });
    }

    return NextResponse.json({
      error: `Failed to enqueue import: ${error.message}`
    }, { status: 500 });
  }
}

export const POST = withTableAuthAppRouter('jobs', _POST);
