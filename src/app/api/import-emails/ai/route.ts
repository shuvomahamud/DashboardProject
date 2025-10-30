import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { tryGPTParsing } from '@/lib/pipeline/email-pipeline';
import { logMetric } from '@/lib/logging/metrics';
import { buildJobContext as buildJobContextFromData } from '@/lib/ai/jobContext';

export const runtime = 'nodejs';
export const maxDuration = 60;

const DEFAULT_CONCURRENCY = parseInt(process.env.GPT_WORKER_CONCURRENCY || '3', 10);
const DEFAULT_TIMEOUT_MS = parseInt(process.env.GPT_TIMEOUT_MS || '25000', 10);
const MAX_ATTEMPTS = parseInt(process.env.GPT_MAX_ATTEMPTS || '5', 10);
const BASE_BACKOFF_MS = parseInt(process.env.GPT_BASE_BACKOFF_MS || '15000', 10);
const MAX_BACKOFF_MS = parseInt(process.env.GPT_MAX_BACKOFF_MS || '300000', 10);
const SLICE_SOFT_LIMIT_MS = 50_000;
const MIN_REMAINING_MS_FOR_NEW_TASK = 25_000;
const PRISMA_MAX_RETRIES = 3;
const PRISMA_RETRY_BASE_DELAY_MS = 500;

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
  const queryTrigger = searchParams?.get('trigger');

  let overridePayload: Record<string, any> = {};
  const contentType = req.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    overridePayload = await req.json().catch(() => ({}));
  }

  const trigger = typeof overridePayload.trigger === 'string'
    ? overridePayload.trigger
    : (queryTrigger || 'manual');

  const concurrency = Math.max(1, DEFAULT_CONCURRENCY);
  const timeoutMs = 20_000;

  logMetric('gpt_worker_slice_start', {
    concurrency,
    timeoutMs,
    trigger
  });

  try {
    const timeLeftMs = () => SLICE_SOFT_LIMIT_MS - (Date.now() - start);
    const shouldStartAnother = () => timeLeftMs() > MIN_REMAINING_MS_FOR_NEW_TASK;

    if (!shouldStartAnother()) {
      logMetric('gpt_worker_insufficient_time', {
        reason: 'no_time_remaining',
        remainingMs: timeLeftMs(),
        timeoutMs,
        concurrency
      });
      return NextResponse.json({
        status: 'time_exhausted',
        reason: 'no_time_remaining',
        elapsed: Date.now() - start
      });
    }

    const runWithPrismaRetry = async <T>(stage: string, operation: () => Promise<T>): Promise<T> => {
      for (let attempt = 1; attempt <= PRISMA_MAX_RETRIES; attempt++) {
        try {
          return await operation();
        } catch (error: any) {
          const code = error?.code ?? 'unknown';
          logMetric('gpt_worker_prisma_failure', {
            stage,
            code,
            attempt,
            remainingMs: timeLeftMs()
          });

          if (code !== 'P1001' || attempt === PRISMA_MAX_RETRIES) {
            throw error;
          }

          const delayMs = PRISMA_RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
          logMetric('gpt_worker_prisma_retry', {
            stage,
            attempt,
            delayMs,
            remainingMs: timeLeftMs()
          });
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
      throw new Error('Prisma retry loop exhausted');
    };

    const claimNextJob = async (): Promise<ClaimedJob | null> => {

      while (true) {
        if (!shouldStartAnother()) {
          return null;
        }

        const candidate = await runWithPrismaRetry('claim.findFirst', () => prisma.resume_ai_jobs.findFirst({
          where: {
            status: { in: ['pending', 'retry'] },
            OR: [
              { nextRetryAt: null },
              { nextRetryAt: { lte: new Date() } }
            ]
          },
          orderBy: [
            { nextRetryAt: 'asc' },
            { createdAt: 'asc' }
          ],
          include: {
            job: {
              select: {
                title: true,
                description: true,
                requirements: true,
                aiSummary: true,
                aiJobProfileJson: true,
                mandatorySkillRequirements: true
              }
            }
          }
        }));

        if (!candidate) {
          return null;
        }

        const claimStartedAt = new Date();
        const claimResult = await runWithPrismaRetry('claim.lock', () => prisma.resume_ai_jobs.updateMany({
          where: {
            id: candidate.id,
            status: candidate.status
          },
          data: {
            status: 'processing',
            lastStartedAt: claimStartedAt,
            attempts: candidate.attempts + 1
          }
        }));

        if (claimResult.count === 0) {
          continue; // Contended, try another record
        }

        const attempts = candidate.attempts + 1;
        await runWithPrismaRetry('claim.mark_items', () => prisma.import_email_items.updateMany({
          where: { resume_id: candidate.resumeId },
          data: {
            gpt_status: 'in_progress',
            gpt_attempts: attempts,
            gpt_last_started_at: claimStartedAt
          }
        }));

        logMetric('gpt_worker_job_claimed', {
          jobId: candidate.id,
          resumeId: candidate.resumeId,
          attempts,
          timeoutMs,
          remainingMs: timeLeftMs()
        });

        return { job: candidate, attempts };
      }
    };

    const results = {
      succeeded: 0,
      failed: 0,
      retried: 0
    };

    const processClaimedJob = async ({ job, attempts }: ClaimedJob) => {
      const jobRecord = job.job;
      const jobContext = buildJobContextFromData({
        title: jobRecord?.title ?? 'Unknown Role',
        description: jobRecord?.description ?? '',
        aiJobProfileJson: jobRecord?.aiJobProfileJson ?? null,
        fallbackSummary: jobRecord?.aiSummary ?? jobRecord?.requirements ?? '',
        mandatorySkillRequirements: jobRecord?.mandatorySkillRequirements ?? null
      });
      const resumeId = job.resumeId;
      const runId = job.runId || 'worker';

      const success = await tryGPTParsing(resumeId, jobContext, timeoutMs, runId);
      const finishedAt = new Date();

      if (success) {
        await runWithPrismaRetry('job.mark_success', () => prisma.resume_ai_jobs.update({
          where: { id: job.id },
          data: {
            status: 'succeeded',
            lastFinishedAt: finishedAt,
            lastError: null,
            nextRetryAt: null,
            attempts
          }
        }));

        await runWithPrismaRetry('items.mark_success', () => prisma.import_email_items.updateMany({
          where: { resume_id: resumeId },
          data: {
            gpt_status: 'succeeded',
            gpt_last_finished_at: finishedAt,
            gpt_last_error: null,
            gpt_next_retry_at: null
          }
        }));

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

      await runWithPrismaRetry('job.mark_failure', () => prisma.resume_ai_jobs.update({
        where: { id: job.id },
        data: {
          status,
          lastFinishedAt: finishedAt,
          lastError: 'GPT parsing failed',
          nextRetryAt,
          attempts
        }
      }));

      await runWithPrismaRetry('items.mark_failure', () => prisma.import_email_items.updateMany({
        where: { resume_id: resumeId },
        data: {
          gpt_status: shouldFail ? 'failed' : 'queued',
          gpt_attempts: attempts,
          gpt_last_error: 'GPT parsing failed',
          gpt_next_retry_at: nextRetryAt
        }
      }));

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
    };

    const active: Promise<void>[] = [];
    let totalClaimed = 0;

    const launchJob = (claimed: ClaimedJob) => {
      totalClaimed += 1;
      const task = processClaimedJob(claimed).finally(() => {
        const index = active.indexOf(task);
        if (index >= 0) {
          active.splice(index, 1);
        }
      });
      active.push(task);
    };

    const fillPool = async () => {
      while (active.length < concurrency && shouldStartAnother()) {
        const claimed = await claimNextJob();
        if (!claimed) {
          break;
        }
        launchJob(claimed);
      }
    };

    await fillPool();

    if (active.length === 0) {
      const remaining = timeLeftMs();
      if (remaining <= MIN_REMAINING_MS_FOR_NEW_TASK) {
        logMetric('gpt_worker_insufficient_time', {
          reason: 'no_time_remaining',
          remainingMs: remaining,
          timeoutMs,
          concurrency
        });
        return NextResponse.json({
          status: 'time_exhausted',
          reason: 'no_time_remaining',
          elapsed: Date.now() - start
        });
      }

      logMetric('gpt_worker_no_candidates', { elapsedMs: Date.now() - start });
      return NextResponse.json({
        status: 'no_work',
        elapsed: Date.now() - start
      });
    }

    while (active.length > 0) {
      await Promise.race(active);
      await fillPool();
    }

    const elapsed = Date.now() - start;
    logMetric('gpt_worker_slice_end', { ...results, elapsedMs: elapsed, trigger });

    return NextResponse.json({
      status: 'ok',
      elapsed,
      concurrency,
      trigger,
      processed: totalClaimed,
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


