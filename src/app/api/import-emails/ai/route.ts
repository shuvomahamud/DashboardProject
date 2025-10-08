import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { tryGPTParsing } from '@/lib/pipeline/email-pipeline';
import { logMetric } from '@/lib/logging/metrics';

export const runtime = 'nodejs';
export const maxDuration = 60;

const DEFAULT_CONCURRENCY = parseInt(process.env.GPT_WORKER_CONCURRENCY || '3', 10);
const DEFAULT_TIMEOUT_MS = parseInt(process.env.GPT_TIMEOUT_MS || '25000', 10);
const MAX_ATTEMPTS = parseInt(process.env.GPT_MAX_ATTEMPTS || '5', 10);
const BASE_BACKOFF_MS = parseInt(process.env.GPT_BASE_BACKOFF_MS || '15000', 10);
const MAX_BACKOFF_MS = parseInt(process.env.GPT_MAX_BACKOFF_MS || '300000', 10);
const SLICE_TOTAL_BUDGET_MS = 58_000;
const SAFETY_BUFFER_MS = 3_000;

type ResumeJob = Awaited<ReturnType<typeof prisma.resume_ai_jobs.findMany>>[number];

interface ClaimedJob {
  job: ResumeJob;
  attempts: number;
}

const computeBackoffMs = (attempts: number) => {
  const exponent = Math.max(attempts - 1, 0);
  const delay = BASE_BACKOFF_MS * Math.pow(2, exponent);
  return Math.min(MAX_BACKOFF_MS, delay);
};

export async function POST(req: NextRequest) {
  const start = Date.now();

  const searchParams = req.nextUrl?.searchParams;
  const queryConcurrency = searchParams?.get('concurrency');
  const queryMaxJobs = searchParams?.get('maxJobs');
  const queryTimeout = searchParams?.get('timeoutMs');
  const queryTrigger = searchParams?.get('trigger');

  let overridePayload: Record<string, any> = {};
  const contentType = req.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    overridePayload = await req.json().catch(() => ({}));
  }

  const trigger = typeof overridePayload.trigger === 'string'
    ? overridePayload.trigger
    : (queryTrigger || 'manual');

  const requestedConcurrency = Number(overridePayload.concurrency ?? queryConcurrency);
  const requestedMaxJobs = Number(overridePayload.maxJobs ?? queryMaxJobs);
  const requestedTimeout = Number(overridePayload.timeoutMs ?? queryTimeout);

  const baseConcurrency = Math.max(1, DEFAULT_CONCURRENCY);
  const concurrency = Math.max(1, isNaN(requestedConcurrency) ? baseConcurrency : requestedConcurrency);
  const maxJobsTarget = Math.max(1, isNaN(requestedMaxJobs) ? concurrency : requestedMaxJobs);
  const effectiveConcurrency = Math.min(concurrency, maxJobsTarget);

  const timeoutMs = Math.max(
    15_000,
    isNaN(requestedTimeout) ? DEFAULT_TIMEOUT_MS : requestedTimeout
  );

  logMetric('gpt_worker_slice_start', {
    concurrency: effectiveConcurrency,
    timeoutMs,
    trigger,
    maxJobs: maxJobsTarget
  });

  try {
    const now = new Date();
    const candidates = await prisma.resume_ai_jobs.findMany({
      where: {
        status: { in: ['pending', 'retry'] },
        OR: [
          { nextRetryAt: null },
          { nextRetryAt: { lte: now } }
        ]
      },
      orderBy: [
        { nextRetryAt: 'asc' },
        { createdAt: 'asc' }
      ],
      take: Math.max(effectiveConcurrency * 3, maxJobsTarget * 3),
      include: {
        job: {
          select: {
            title: true,
            description: true
          }
        }
      }
    });

    if (candidates.length === 0) {
      logMetric('gpt_worker_no_candidates', { elapsedMs: Date.now() - start });
      return NextResponse.json({
        status: 'no_work',
        elapsed: Date.now() - start
      });
    }

    logMetric('gpt_worker_candidates', {
      count: candidates.length,
      concurrency: effectiveConcurrency
    });

    const elapsedAfterCandidates = Date.now() - start;
    const remainingMs = SLICE_TOTAL_BUDGET_MS - elapsedAfterCandidates;
    if (remainingMs <= SAFETY_BUFFER_MS) {
      logMetric('gpt_worker_insufficient_time', {
        reason: 'no_time_remaining',
        remainingMs,
        timeoutMs,
        concurrency: effectiveConcurrency
      });
      return NextResponse.json({
        status: 'time_exhausted',
        reason: 'no_time_remaining',
        elapsed: elapsedAfterCandidates
      });
    }

    const timeBudget = remainingMs - SAFETY_BUFFER_MS;
    const maxBatchesByTime = Math.floor(timeBudget / timeoutMs);
    const maxJobsByTime = maxBatchesByTime * effectiveConcurrency;
    const claimLimit = Math.min(
      maxJobsTarget,
      candidates.length,
      Math.max(0, maxJobsByTime)
    );

    if (claimLimit <= 0) {
      logMetric('gpt_worker_insufficient_time', {
        reason: 'insufficient_for_single_batch',
        remainingMs,
        timeoutMs,
        concurrency: effectiveConcurrency
      });
      return NextResponse.json({
        status: 'time_exhausted',
        reason: 'insufficient_for_single_batch',
        elapsed: elapsedAfterCandidates
      });
    }

    logMetric('gpt_worker_time_budget', {
      remainingMs,
      timeoutMs,
      concurrency: effectiveConcurrency,
      claimLimit,
      maxJobsTarget
    });

    const claimed: ClaimedJob[] = [];
    for (const job of candidates) {
      const claimResult = await prisma.resume_ai_jobs.updateMany({
        where: {
          id: job.id,
          status: job.status
        },
        data: {
          status: 'processing',
          lastStartedAt: now,
          attempts: job.attempts + 1
        }
      });

      if (claimResult.count === 0) {
        continue;
      }

      const attempts = job.attempts + 1;
      await prisma.import_email_items.updateMany({
        where: { resume_id: job.resumeId },
        data: {
          gpt_status: 'in_progress',
          gpt_attempts: attempts,
          gpt_last_started_at: now
        }
      });

      logMetric('gpt_worker_job_claimed', {
        jobId: job.id,
        resumeId: job.resumeId,
        attempts,
        timeoutMs
      });

      claimed.push({ job, attempts });
      if (claimed.length >= claimLimit) {
        break;
      }
    }

    if (claimed.length === 0) {
      logMetric('gpt_worker_no_claimed', { elapsedMs: Date.now() - start });
      return NextResponse.json({
        status: 'contended',
        elapsed: Date.now() - start
      });
    }

    const results = {
      succeeded: 0,
      failed: 0,
      retried: 0
    };

    await runWithConcurrency(claimed, effectiveConcurrency, async ({ job, attempts }) => {
      const jobContext = buildJobContext(job);
      const resumeId = job.resumeId;
      const runId = job.runId || 'worker';

      const success = await tryGPTParsing(resumeId, jobContext, timeoutMs, runId);
      const finishedAt = new Date();

      if (success) {
        await prisma.resume_ai_jobs.update({
          where: { id: job.id },
          data: {
            status: 'succeeded',
            lastFinishedAt: finishedAt,
            lastError: null,
            nextRetryAt: null,
            attempts
          }
        });

        await prisma.import_email_items.updateMany({
          where: { resume_id: resumeId },
          data: {
            gpt_status: 'succeeded',
            gpt_last_finished_at: finishedAt,
            gpt_last_error: null,
            gpt_next_retry_at: null
          }
        });

        results.succeeded += 1;
        logMetric('gpt_worker_job_succeeded', {
          jobId: job.id,
          resumeId,
          attempts,
          elapsedMs: Date.now() - start,
          status: 'succeeded'
        });
        return;
      }

      const nextAttempts = attempts;
      const shouldFail = nextAttempts >= MAX_ATTEMPTS;
      const backoff = computeBackoffMs(nextAttempts);
      const nextRetryAt = shouldFail ? null : new Date(Date.now() + backoff);
      const status = shouldFail ? 'parse_failed' : 'retry';

      await prisma.resume_ai_jobs.update({
        where: { id: job.id },
        data: {
          status,
          lastFinishedAt: finishedAt,
          lastError: 'GPT parsing failed',
          nextRetryAt,
          attempts
        }
      });

      await prisma.import_email_items.updateMany({
        where: { resume_id: resumeId },
        data: {
          gpt_status: shouldFail ? 'failed' : 'queued',
          gpt_attempts: attempts,
          gpt_last_error: 'GPT parsing failed',
          gpt_next_retry_at: nextRetryAt
        }
      });

      if (shouldFail) {
        results.failed += 1;
        logMetric('gpt_worker_job_failed', {
          jobId: job.id,
          resumeId,
          attempts: nextAttempts,
          status
        });
      } else {
        results.retried += 1;
        logMetric('gpt_worker_job_retry', {
          jobId: job.id,
          resumeId,
          attempts: nextAttempts,
          backoffMs: backoff,
          nextRetryAt: nextRetryAt?.toISOString() ?? null,
          status
        });
      }
    });

    const elapsed = Date.now() - start;
    logMetric('gpt_worker_slice_end', { ...results, elapsedMs: elapsed, trigger });

    return NextResponse.json({
      status: 'ok',
      elapsed,
      concurrency: effectiveConcurrency,
      maxJobs: maxJobsTarget,
      trigger,
      processed: claimed.length,
      ...results
    });
  } catch (error: any) {
    logMetric('gpt_worker_error', { error: error?.message || 'unknown' });
    console.error('GPT worker error:', error);
    return NextResponse.json(
      {
        status: 'error',
        error: error?.message || 'unknown worker error'
      },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}

function buildJobContext(job: ResumeJob) {
  const title = job.job?.title ?? 'Unknown Role';
  const description = job.job?.description ?? '';
  const trimmedDescription = description.length > 500
    ? `${description.substring(0, 500)}...`
    : description;

  return {
    jobTitle: title,
    jobDescriptionShort: trimmedDescription
  };
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  handler: (item: T) => Promise<void>
) {
  const active: Promise<void>[] = [];

  for (const item of items) {
    const task = handler(item).finally(() => {
      const index = active.indexOf(task);
      if (index >= 0) {
        active.splice(index, 1);
      }
    });
    active.push(task);
    if (active.length >= concurrency) {
      await Promise.race(active);
    }
  }

  await Promise.all(active);
}

