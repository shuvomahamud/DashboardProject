import { NextRequest, NextResponse } from 'next/server';
import { withTableAuthAppRouter } from '@/lib/auth/withTableAuthAppRouter';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

async function _GET(req: NextRequest) {
  try {
    // Get the single running import (max 1 by DB constraint)
    const inProgress = await prisma.importEmailRun.findFirst({
      where: {
        status: 'running'
      },
      orderBy: {
        startedAt: 'desc'
      },
      include: {
        job: {
          select: {
            id: true,
            title: true
          }
        }
      }
    });

    // Get all enqueued imports (FIFO order)
    const enqueued = await prisma.importEmailRun.findMany({
      where: {
        status: 'enqueued'
      },
      orderBy: {
        createdAt: 'asc' // FIFO
      },
      include: {
        job: {
          select: {
            id: true,
            title: true
          }
        }
      }
    });

    // Get last 3 finished imports
    const recentDone = await prisma.importEmailRun.findMany({
      where: {
        status: { in: ['succeeded', 'failed', 'canceled'] }
      },
      orderBy: [
        { finishedAt: 'desc' },
        { createdAt: 'desc' }
      ],
      take: 3,
      include: {
        job: {
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
        jobId: inProgress.jobId,
        jobTitle: inProgress.job.title,
        status: inProgress.status,
        progress: Number(inProgress.progress),
        processedMessages: inProgress.processedMessages,
        totalMessages: inProgress.totalMessages,
        startedAt: inProgress.startedAt?.toISOString(),
        createdAt: inProgress.createdAt.toISOString()
      } : null,
      enqueued: enqueued.map(run => ({
        id: run.id,
        jobId: run.jobId,
        jobTitle: run.job.title,
        status: run.status,
        createdAt: run.createdAt.toISOString()
      })),
      recentDone: recentDone.map(run => ({
        id: run.id,
        jobId: run.jobId,
        jobTitle: run.job.title,
        status: run.status,
        progress: Number(run.progress),
        processedMessages: run.processedMessages,
        totalMessages: run.totalMessages,
        lastError: run.lastError,
        createdAt: run.createdAt.toISOString(),
        startedAt: run.startedAt?.toISOString(),
        finishedAt: run.finishedAt?.toISOString()
      }))
    });

  } catch (error: any) {
    console.error('Failed to get import summary:', error.message);
    return NextResponse.json({
      error: 'Failed to get import summary'
    }, { status: 500 });
  }
}

export const GET = withTableAuthAppRouter('jobs', _GET);
