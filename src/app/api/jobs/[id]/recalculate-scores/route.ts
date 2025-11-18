"use server";

import { NextRequest, NextResponse } from 'next/server';
import { withTableAuthAppRouter } from '@/lib/auth/withTableAuthAppRouter';
import { getScoreRefreshRun, startScoreRefreshRun } from '@/lib/jobs/scoreRefreshService';

export const dynamic = 'force-dynamic';

const parseJobId = (req: NextRequest): number | null => {
  const url = new URL(req.url);
  const segments = url.pathname.split('/');
  const jobsIndex = segments.findIndex(segment => segment === 'jobs');
  if (jobsIndex === -1 || jobsIndex + 1 >= segments.length) {
    return null;
  }
  const idValue = parseInt(segments[jobsIndex + 1] || '', 10);
  return Number.isFinite(idValue) ? idValue : null;
};

async function GET(req: NextRequest) {
  const jobId = parseJobId(req);
  if (!jobId) {
    return NextResponse.json({ error: 'Invalid job id' }, { status: 400 });
  }

  const searchParams = new URL(req.url).searchParams;
  const runId = searchParams.get('runId');
  const run = await getScoreRefreshRun(jobId, runId);

  return NextResponse.json({ run });
}

async function POST(req: NextRequest) {
  const jobId = parseJobId(req);
  if (!jobId) {
    return NextResponse.json({ error: 'Invalid job id' }, { status: 400 });
  }

  try {
    const run = await startScoreRefreshRun(jobId);
    return NextResponse.json({ run });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to queue score refresh.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

const protectedGET = withTableAuthAppRouter('jobs', GET);
const protectedPOST = withTableAuthAppRouter('jobs', POST);

export { protectedGET as GET, protectedPOST as POST };
