import prisma from '@/lib/prisma';
import type { ImportRunSummary } from '@/types/importQueue';

interface BuildSummaryParams {
  runId: string;
  jobId: number;
  totalMessages: number | null;
  processedMessages: number;
  failedMessages: number;
}

const MAX_LIST_ENTRIES = 20;

export async function buildImportRunSummary({
  runId,
  jobId,
  totalMessages,
  processedMessages,
  failedMessages
}: BuildSummaryParams): Promise<ImportRunSummary> {
  const [resumeJobs, failedItems] = await Promise.all([
    prisma.resume_ai_jobs.findMany({
      where: { runId },
      select: {
        id: true,
        resumeId: true,
        status: true,
        attempts: true,
        lastError: true
      },
      orderBy: { updatedAt: 'desc' }
    }),
    prisma.import_email_items.findMany({
      where: { run_id: runId, status: 'failed' },
      select: {
        external_message_id: true,
        last_error: true
      },
      orderBy: { updated_at: 'desc' },
      take: MAX_LIST_ENTRIES
    })
  ]);

  const failedResumes = [];
  const retryResumes = [];

  for (const job of resumeJobs) {
    const entry = {
      resumeId: job.resumeId,
      status: job.status,
      error: job.lastError ?? null,
      attempts: job.attempts
    };

    if (job.status === 'parse_failed' || job.status === 'failed') {
      failedResumes.push(entry);
    } else if (job.status === 'retry') {
      retryResumes.push(entry);
    }
  }

  const warnings: string[] = [];
  if (retryResumes.length > 0) {
    warnings.push(
      `${retryResumes.length} resume(s) still pending GPT retry`
    );
  }

  if (failedItems.length > 0) {
    warnings.push(`${failedItems.length} email(s) failed during import`);
  }

  return {
    totals: {
      totalMessages,
      processedMessages,
      failedMessages
    },
    resumeParsing: {
      total: resumeJobs.length,
      failed: failedResumes.length,
      retries: retryResumes.length,
      failedResumes: failedResumes.slice(0, MAX_LIST_ENTRIES),
      retryResumes: retryResumes.slice(0, MAX_LIST_ENTRIES)
    },
    itemFailures: failedItems.map(item => ({
      messageId: item.external_message_id,
      error: item.last_error ?? null
    })),
    warnings
  };
}

