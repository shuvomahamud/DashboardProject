import { NextRequest, NextResponse } from 'next/server';
import { withTableAuthAppRouter } from '@/lib/auth/withTableAuthAppRouter';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

async function _GET(req: NextRequest) {
  try {
    // Check if the table exists by trying a simple query
    const inProgress = await prisma.import_email_runs.findFirst({
      where: {
        status: 'running'
      },
      orderBy: {
        started_at: 'desc'
      },
      include: {
        Job: {
          select: {
            id: true,
            title: true
          }
        }
      }
    });

    // Get all enqueued imports (FIFO order)
    const enqueued = await prisma.import_email_runs.findMany({
      where: {
        status: 'enqueued'
      },
      orderBy: {
        created_at: 'asc' // FIFO
      },
      include: {
        Job: {
          select: {
            id: true,
            title: true
          }
        }
      }
    });

    // Get last 3 finished imports
    const recentDone = await prisma.import_email_runs.findMany({
      where: {
        status: { in: ['succeeded', 'failed', 'canceled'] }
      },
      orderBy: [
        { finished_at: 'desc' },
        { created_at: 'desc' }
      ],
      take: 3,
      include: {
        Job: {
          select: {
            id: true,
            title: true
          }
        }
      }
    });

    return NextResponse.json({
      inProgress: inProgress ? {
        id: inProgress.id,
        jobId: inProgress.job_id,
        jobTitle: inProgress.Job.title,
        status: inProgress.status,
        progress: Number(inProgress.progress),
        processedMessages: inProgress.processed_messages,
        totalMessages: inProgress.total_messages,
        startedAt: inProgress.started_at?.toISOString(),
        createdAt: inProgress.created_at.toISOString()
      } : null,
      enqueued: enqueued.map(run => ({
        id: run.id,
        jobId: run.job_id,
        jobTitle: run.Job.title,
        status: run.status,
        createdAt: run.created_at.toISOString()
      })),
      recentDone: recentDone.map(run => ({
        id: run.id,
        jobId: run.job_id,
        jobTitle: run.Job.title,
        status: run.status,
        progress: Number(run.progress),
        processedMessages: run.processed_messages,
        totalMessages: run.total_messages,
        lastError: run.last_error,
        createdAt: run.created_at.toISOString(),
        startedAt: run.started_at?.toISOString(),
        finishedAt: run.finished_at?.toISOString()
      }))
    });

  } catch (error: any) {
    console.error('Failed to get import summary:', error.message);

    // Return empty data structure instead of error
    return NextResponse.json({
      inProgress: null,
      enqueued: [],
      recentDone: [],
      error: null // No error shown to user
    });
  }
}

export const GET = withTableAuthAppRouter('jobs', _GET);
