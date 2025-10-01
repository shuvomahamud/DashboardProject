import { NextRequest, NextResponse } from 'next/server';
import { withTableAuthAppRouter } from '@/lib/auth/withTableAuthAppRouter';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

async function _POST(req: NextRequest, ctx?: { params: { runId: string } }) {
  const runId = ctx?.params?.runId;

  if (!runId) {
    return NextResponse.json({ error: 'Invalid run id' }, { status: 400 });
  }

  try {
    // Get the run
    const run = await prisma.import_email_runs.findUnique({
      where: { id: runId },
      select: {
        id: true,
        status: true,
        job_id: true
      }
    });

    if (!run) {
      return NextResponse.json({ error: 'Import run not found' }, { status: 404 });
    }

    // Check if already finished
    if (['succeeded', 'failed', 'canceled'].includes(run.status)) {
      return NextResponse.json({
        message: `Import already ${run.status}`,
        status: run.status
      });
    }

    // Cancel it
    const updatedRun = await prisma.import_email_runs.update({
      where: { id: runId },
      data: {
        status: 'canceled',
        finished_at: new Date()
      },
      select: {
        id: true,
        status: true,
        job_id: true,
        created_at: true,
        finished_at: true
      }
    });

    console.log(`✅ Canceled import run ${runId} for job ${run.job_id}`);

    return NextResponse.json({
      message: 'Import canceled successfully',
      run: {
        id: updatedRun.id,
        status: updatedRun.status,
        jobId: updatedRun.job_id,
        createdAt: updatedRun.created_at,
        finishedAt: updatedRun.finished_at
      }
    });

  } catch (error: any) {
    console.error('Failed to cancel import:', error.message);
    return NextResponse.json({
      error: 'Failed to cancel import'
    }, { status: 500 });
  }
}

export const POST = withTableAuthAppRouter('jobs', _POST);
