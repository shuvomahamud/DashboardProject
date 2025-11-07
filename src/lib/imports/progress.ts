import prisma from '@/lib/prisma';
import { buildImportRunSummary } from './runSummary';

const EMAIL_STAGE_WEIGHT = 0.1;
const AI_STAGE_WEIGHT = 0.9;

const TERMINAL_AI_STATUSES = new Set(['succeeded', 'parse_failed', 'scan_failed', 'ingest_failed', 'failed']);
const ACTIVE_AI_STATUSES = new Set(['pending', 'processing', 'retry']);

export interface ProgressInputs {
  totalMessages?: number | null;
  processedMessages?: number | null;
  totalAiJobs?: number | null;
  completedAiJobs?: number | null;
}

export interface AiStats {
  total: number;
  completed: number;
}

export const DEFAULT_AI_STATS: AiStats = { total: 0, completed: 0 };

export function calculateImportProgress({
  totalMessages,
  processedMessages,
  totalAiJobs,
  completedAiJobs
}: ProgressInputs): number {
  const totalEmails = typeof totalMessages === 'number' ? totalMessages : 0;
  const processed = Math.max(0, typeof processedMessages === 'number' ? processedMessages : 0);
  const aiTotal = Math.max(0, typeof totalAiJobs === 'number' ? totalAiJobs : 0);
  const aiCompleted = Math.max(0, typeof completedAiJobs === 'number' ? completedAiJobs : 0);

  const emailRatio =
    totalEmails > 0 ? Math.min(processed / totalEmails, 1) : processed > 0 ? 1 : 0;

  let aiRatio: number;
  if (aiTotal > 0) {
    aiRatio = Math.min(aiCompleted / aiTotal, 1);
  } else if (totalEmails > 0) {
    aiRatio = emailRatio;
  } else {
    aiRatio = processed > 0 || aiCompleted > 0 ? 1 : 0;
  }

  const progress = EMAIL_STAGE_WEIGHT * emailRatio + AI_STAGE_WEIGHT * aiRatio;
  return Math.max(0, Math.min(progress, 1));
}

export async function getAiStatsForRun(runId: string): Promise<AiStats> {
  if (!runId) {
    return DEFAULT_AI_STATS;
  }

  const [total, completed] = await Promise.all([
    prisma.resume_ai_jobs.count({
      where: { runId }
    }),
    prisma.resume_ai_jobs.count({
      where: {
        runId,
        status: { in: Array.from(TERMINAL_AI_STATUSES) }
      }
    })
  ]);

  return { total, completed };
}

export async function getAiStatsForRuns(runIds: string[]): Promise<Record<string, AiStats>> {
  if (!runIds || runIds.length === 0) {
    return {};
  }

  const uniqueIds = Array.from(new Set(runIds.filter(Boolean)));
  if (uniqueIds.length === 0) {
    return {};
  }

  const jobs = await prisma.resume_ai_jobs.findMany({
    where: { runId: { in: uniqueIds } },
    select: {
      runId: true,
      status: true
    }
  });

  const stats: Record<string, AiStats> = {};

  for (const job of jobs) {
    if (!job.runId) continue;
    if (!stats[job.runId]) {
      stats[job.runId] = { total: 0, completed: 0 };
    }
    stats[job.runId].total += 1;
    if (TERMINAL_AI_STATUSES.has(job.status)) {
      stats[job.runId].completed += 1;
    }
  }

  for (const id of uniqueIds) {
    if (!stats[id]) {
      stats[id] = { total: 0, completed: 0 };
    }
  }

  return stats;
}

export async function refreshRunProgressForAi(runId: string): Promise<number | null> {
  if (!runId) {
    return null;
  }

  const run = await prisma.import_email_runs.findUnique({
    where: { id: runId },
    select: {
      id: true,
      status: true,
      total_messages: true,
      processed_messages: true
    }
  });

  if (!run || run.status !== 'running') {
    return null;
  }

  const aiStats = await getAiStatsForRun(runId);
  const progress = calculateImportProgress({
    totalMessages: run.total_messages,
    processedMessages: run.processed_messages,
    totalAiJobs: aiStats.total,
    completedAiJobs: aiStats.completed
  });

  await prisma.import_email_runs.update({
    where: { id: runId },
    data: { progress }
  });

  await finalizeRunIfComplete(runId);

  return progress;
}

export async function finalizeRunIfComplete(runId: string): Promise<FinalizeRunResult> {
  if (!runId) {
    return { finalized: false };
  }

  const run = await prisma.import_email_runs.findUnique({
    where: { id: runId },
    select: {
      id: true,
      job_id: true,
      status: true,
      total_messages: true,
      processed_messages: true,
      started_at: true,
      created_at: true
    }
  });

  if (!run || run.status !== 'running') {
    return { finalized: false };
  }

  const [pendingItems, completedCount, failedCount, activeAiJobs] = await Promise.all([
    prisma.import_email_items.count({
      where: { run_id: runId, status: 'pending' }
    }),
    prisma.import_email_items.count({
      where: { run_id: runId, status: 'completed' }
    }),
    prisma.import_email_items.count({
      where: { run_id: runId, status: 'failed' }
    }),
    prisma.resume_ai_jobs.count({
      where: {
        runId,
        status: { in: Array.from(ACTIVE_AI_STATUSES) }
      }
    })
  ]);

  if (pendingItems > 0 || activeAiJobs > 0) {
    return {
      finalized: false,
      pendingAiJobs: activeAiJobs,
      pendingItems
    };
  }

  const finalStatus: 'succeeded' | 'failed' = completedCount > 0 ? 'succeeded' : 'failed';
  const finishedAt = new Date();
  const startedAt = run.started_at ?? run.created_at ?? finishedAt;
  const durationMs = Math.max(0, finishedAt.getTime() - new Date(startedAt).getTime());
  const summary = await buildImportRunSummary({
    runId,
    jobId: run.job_id,
    totalMessages: run.total_messages ?? null,
    processedMessages: completedCount,
    failedMessages: failedCount
  });

  await prisma.import_email_items.deleteMany({
    where: {
      run_id: runId,
      status: { in: ['completed', 'failed'] }
    }
  });

  const lastError =
    finalStatus === 'failed'
      ? `All ${failedCount} items failed. Check item errors for details.`
      : null;

  await prisma.import_email_runs.update({
    where: { id: runId },
    data: {
      status: finalStatus,
      finished_at: finishedAt,
      processing_duration_ms: durationMs,
      progress: 1.0,
      processed_messages: completedCount,
      last_error: lastError,
      summary
    }
  });

  return {
    finalized: true,
    status: finalStatus,
    completedCount,
    failedCount
  };
}

export { EMAIL_STAGE_WEIGHT, AI_STAGE_WEIGHT, TERMINAL_AI_STATUSES, ACTIVE_AI_STATUSES };
export interface FinalizeRunResult {
  finalized: boolean;
  status?: 'succeeded' | 'failed';
  completedCount?: number;
  failedCount?: number;
  pendingAiJobs?: number;
  pendingItems?: number;
}
