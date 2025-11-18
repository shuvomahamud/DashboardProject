/**
 * Email Processing Pipeline
 *
 * Steps: fetch -> save -> upload -> extract -> queue-gpt -> persist
 *
 * Inline GPT work has been removed; resumes are queued for the background worker.
 */

import { createHash } from 'crypto';
import prisma from '@/lib/prisma';
import { extractText } from '@/lib/parse/text';
import { uploadResumeBytes } from '@/lib/supabase-server';
import { parseAndScoreResume } from '@/lib/ai/resumeParsingService';
import type { JobContext } from '@/lib/ai/jobContext';
import type { EmailAttachment, EmailMessage, EmailProvider } from '@/lib/providers/email-provider';
import { logMetric } from '@/lib/logging/metrics';
import { parseDiceCandidateMetadata } from '@/lib/email/diceMetadataParser';

type PipelineLogContext = Record<string, unknown>;

const PIPELINE_LOG_PREFIX = '[email-pipeline]';

const pipelineInfo = (message: string, context?: PipelineLogContext) => {
  if (context) {
    console.info(`${PIPELINE_LOG_PREFIX} ${message}`, context);
  } else {
    console.info(`${PIPELINE_LOG_PREFIX} ${message}`);
  }
};

const pipelineWarn = (message: string, context?: PipelineLogContext) => {
  if (context) {
    console.warn(`${PIPELINE_LOG_PREFIX} ${message}`, context);
  } else {
    console.warn(`${PIPELINE_LOG_PREFIX} ${message}`);
  }
};

const pipelineError = (message: string, context?: PipelineLogContext) => {
  if (context) {
    console.error(`${PIPELINE_LOG_PREFIX} ${message}`, context);
  } else {
    console.error(`${PIPELINE_LOG_PREFIX} ${message}`);
  }
};

const STEP_SLOW_THRESHOLDS_MS = {
  fetch: 1500,
  download: 1500,
  upload: 2000,
  extract: 2500
} as const;
const MAX_ITEM_ATTEMPTS = parseInt(process.env.IMPORT_ITEM_MAX_ATTEMPTS || '5', 10);
const GPT_SKIP_STATUSES = new Set(['succeeded']);

export interface EmailItem {
  id: bigint;
  external_message_id: string; // Match Prisma snake_case
  status: string;
  step: string;
}

export interface PipelineContext {
  provider: EmailProvider;
  jobId: number;
  runId: string;
}

export interface PipelineResult {
  success: boolean;
  step: string;
  error?: string;
  resumeId?: number;
  gptStatus?: 'queued' | 'skipped' | 'succeeded';
}

/**
 * Process a single email item through the pipeline (without GPT parsing).
 */
export async function processEmailItem(
  item: EmailItem,
  context: PipelineContext
): Promise<PipelineResult> {
  const { provider, jobId, runId } = context;
  const { id: itemId, external_message_id: externalMessageId, step: currentStep } = item;

  logMetric('pipeline_start', { runId, itemId: itemId.toString(), step: currentStep });
  pipelineInfo('pipeline start', {
    runId,
    itemId: itemId.toString(),
    step: currentStep
  });

  let step = currentStep;
  let jobApplicationLinked = false;
  let resumeId: number | null = null;
  let gptStatus: 'queued' | 'skipped' | 'succeeded' = 'skipped';

  let fileBytes: Uint8Array | null = null;
  let fileHash: string | null = null;
  let attachmentMeta: { name: string; size: number; contentType: string } | null = null;
  let storagePath: string | null = null;
  let cachedMessage: { message: EmailMessage; attachments: EmailAttachment[] } | null = null;

  const fetchMessage = async () => {
    if (!cachedMessage) {
      cachedMessage = await provider.getMessage(externalMessageId);
    }
    return cachedMessage;
  };

  try {
    // Step 1: Fetch message metadata and confirm attachments exist
    if (step === 'none') {
      const fetchStart = Date.now();
      const { attachments } = await fetchMessage();
      const fetchDuration = Date.now() - fetchStart;
      logMetric('pipeline_fetch_complete', {
        runId,
        itemId: itemId.toString(),
        attachments: attachments.length,
        ms: fetchDuration
      });

      if (fetchDuration > STEP_SLOW_THRESHOLDS_MS.fetch) {
        pipelineInfo('slow step fetch_message', {
          runId,
          itemId: itemId.toString(),
          durationMs: fetchDuration,
          attachments: attachments.length
        });
      }

      if (attachments.length === 0) {
        await prisma.import_email_items.update({
          where: { id: itemId },
          data: { gpt_status: 'skipped', gpt_next_retry_at: null }
        });
        await updateItemStatus(itemId, 'completed', 'fetched');
        pipelineInfo('no eligible attachments', {
          runId,
          itemId: itemId.toString()
        });
        logMetric('pipeline_complete', {
          runId,
          itemId: itemId.toString(),
          resumeId: 'none',
          gptStatus: 'skipped'
        });
        return { success: true, step: 'fetched', gptStatus: 'skipped' };
      }

      step = 'fetched';
      await updateItemStep(itemId, step);
    }

    // Step 2: Download attachment bytes and hash for deduplication
    if (step === 'fetched') {
      const downloadStart = Date.now();
      const { attachments } = await fetchMessage();
      const attachment = attachments[0];

      fileBytes = await provider.getAttachmentBytes(externalMessageId, attachment.id);
      fileHash = hashFileContent(fileBytes);
      attachmentMeta = {
        name: attachment.name,
        size: attachment.size,
        contentType: attachment.contentType
      };

      const downloadDuration = Date.now() - downloadStart;
      logMetric('pipeline_bytes_downloaded', {
        runId,
        itemId: itemId.toString(),
        size: attachment.size,
        ms: downloadDuration
      });

      if (downloadDuration > STEP_SLOW_THRESHOLDS_MS.download) {
        pipelineInfo('slow step download_attachment', {
          runId,
          itemId: itemId.toString(),
          durationMs: downloadDuration,
          size: attachment.size
        });
      }

      const existing = await prisma.resume.findFirst({
        where: {
          fileHash,
          sourceMessageId: externalMessageId
        },
        select: { id: true }
      });

      if (existing) {
        await linkJobApplication(jobId, existing.id, externalMessageId);
        const existingJob = await prisma.resume_ai_jobs.findUnique({
          where: {
            resumeId_jobId: {
              resumeId: existing.id,
              jobId
            }
          },
          select: { status: true }
        });
        const alreadyAnalyzed = existingJob && GPT_SKIP_STATUSES.has(existingJob.status);

        if (alreadyAnalyzed) {
          await prisma.import_email_items.update({
            where: { id: itemId },
            data: {
              resume_id: existing.id,
              gpt_status: existingJob?.status ?? 'succeeded',
              gpt_next_retry_at: null,
              gpt_last_error: null
            }
          });
          pipelineInfo('duplicate resume already analyzed, skipping gpt', {
            runId,
            itemId: itemId.toString(),
            resumeId: existing.id
          });
          logMetric('pipeline_duplicate_linked', {
            runId,
            itemId: itemId.toString(),
            resumeId: existing.id,
            skipped: true
          });
          await updateItemStatus(itemId, 'completed', 'saved');
          return { success: true, step: 'saved', resumeId: existing.id, gptStatus: 'skipped' };
        }

        const queueResult = await enqueueResumeForAI(existing.id, jobId, runId, itemId);

        pipelineInfo('duplicate resume linked', {
          runId,
          itemId: itemId.toString(),
          resumeId: existing.id,
          queueResult
        });

        logMetric('pipeline_duplicate_linked', {
          runId,
          itemId: itemId.toString(),
          resumeId: existing.id,
          skipped: false
        });

        await updateItemStatus(itemId, 'completed', 'saved');
        return { success: true, step: 'saved', resumeId: existing.id, gptStatus: queueResult };
      }

      step = 'saved';
      await updateItemStep(itemId, step);
    }

    // Step 3: Upload resume bytes to storage
    if (step === 'saved') {
      if (!fileBytes || !fileHash || !attachmentMeta) {
        ({ fileBytes, fileHash, attachmentMeta } = await refetchAttachment(provider, externalMessageId));
      }

      const uploadStart = Date.now();
      const uploadResult = await uploadToSupabase(
        fileBytes!,
        fileHash!,
        attachmentMeta!.name,
        jobId,
        attachmentMeta!.contentType
      );
      storagePath = uploadResult.path;

      const uploadDuration = Date.now() - uploadStart;
      logMetric('pipeline_upload_complete', {
        runId,
        itemId: itemId.toString(),
        ms: uploadDuration
      });

      if (uploadDuration > STEP_SLOW_THRESHOLDS_MS.upload) {
        pipelineInfo('slow step upload_resume', {
          runId,
          itemId: itemId.toString(),
          durationMs: uploadDuration,
          size: attachmentMeta!.size
        });
      }

      step = 'uploaded';
      await updateItemStep(itemId, step);
    }

    // Step 4: Create resume record & extract text
    if (step === 'uploaded') {
      if (!fileBytes || !fileHash || !attachmentMeta) {
        ({ fileBytes, fileHash, attachmentMeta } = await refetchAttachment(provider, externalMessageId));
      }

      const { message, attachments } = await fetchMessage();
      const attachment = attachments[0];

      const safeName = attachment.name
        .toLowerCase()
        .replace(/[^a-z0-9.-]/g, '-')
        .replace(/-+/g, '-')
        .substring(0, 120);

      const diceMetadata = parseDiceCandidateMetadata({
        bodyText: message.bodyText,
        bodyHtml: message.bodyHtml,
        bodyPreview: message.bodyPreview,
        subject: message.subject
      });

      const resume = await prisma.resume.create({
        data: {
          fileName: safeName,
          originalName: attachment.name,
          fileSize: attachment.size,
          fileSizeBytes: attachment.size,
          mimeType: attachment.contentType,
          storagePath: storagePath || buildStoragePath(jobId, fileHash!, attachmentMeta!.name),
          fileStorageUrl: storagePath || buildStoragePath(jobId, fileHash!, attachmentMeta!.name),
          fileHash: fileHash!,
          sourceType: 'email',
          sourceMessageId: externalMessageId,
          sourceSubject: message.subject || '',
          sourceFrom: message.from?.address || '',
          rawText: '',
          parsedText: null,
          sourceCandidateEmail: diceMetadata.candidateEmail ?? null,
          sourceCandidatePhone: diceMetadata.candidatePhone ?? null,
          sourceCandidateLocation: diceMetadata.candidateLocation ?? null,
          sourceWorkAuthorization: diceMetadata.workAuthorization ?? null,
          sourceRecruiterName: diceMetadata.recruiterName ?? null,
          candidateCity: diceMetadata.candidateCity ?? null,
          candidateState: diceMetadata.candidateState ?? null,
          skills: null,
          experience: null,
          education: null,
          contactInfo: null,
          parsedAt: null,
          aiExtractJson: null,
          aiSummary: null
        }
      });

      resumeId = resume.id;

      await prisma.import_email_items.update({
        where: { id: itemId },
        data: { resume_id: resume.id }
      });

      try {
        const extractStart = Date.now();
        const extractedText = await extractText(fileBytes!, safeName, attachment.contentType);
        const extractDuration = Date.now() - extractStart;

        if (extractedText !== 'UNSUPPORTED_DOC_LEGACY') {
          const maxLength = 2 * 1024 * 1024;
          const finalText = extractedText.length > maxLength
            ? `${extractedText.substring(0, maxLength)}\n\n[Text truncated]`
            : extractedText;

          await prisma.resume.update({
            where: { id: resume.id },
            data: {
              rawText: finalText,
              parsedAt: new Date()
            }
          });

          logMetric('pipeline_extract_complete', {
            runId,
            itemId: itemId.toString(),
            resumeId: resume.id,
            ms: extractDuration,
            chars: finalText.length
          });

          if (extractDuration > STEP_SLOW_THRESHOLDS_MS.extract) {
            pipelineInfo('slow step extract_text', {
              runId,
              itemId: itemId.toString(),
              resumeId: resume.id,
              durationMs: extractDuration,
              chars: finalText.length
            });
          }
        } else {
          await prisma.resume.update({
            where: { id: resume.id },
            data: {
              rawText: '[UNSUPPORTED_DOC_LEGACY]',
              parsedAt: new Date()
            }
          });

          logMetric('pipeline_extract_legacy', {
            runId,
            itemId: itemId.toString(),
            resumeId: resume.id,
            ms: extractDuration
          });

          if (extractDuration > STEP_SLOW_THRESHOLDS_MS.extract) {
            pipelineInfo('slow step extract_legacy', {
              runId,
              itemId: itemId.toString(),
              resumeId: resume.id,
              durationMs: extractDuration
            });
          }
        }
      } catch (extractError: any) {
        const message = extractError.message ?? 'unknown';
        pipelineError('text extraction failed', {
          runId,
          itemId: itemId.toString(),
          error: message
        });
        logMetric('pipeline_extract_failed', {
          runId,
          itemId: itemId.toString(),
          resumeId,
          error: message
        });

        await prisma.resume.update({
          where: { id: resume.id },
          data: {
            rawText: `[TEXT_EXTRACTION_FAILED: ${message}]`,
            parsedAt: new Date()
          }
        });
      }

      step = 'parsed';
      await updateItemStep(itemId, step);
    }

    // Step 5: Queue GPT work & link application
    if (step === 'parsed') {
      if (!resumeId) {
        const resume = await prisma.resume.findFirst({
          where: { sourceMessageId: externalMessageId },
          select: { id: true }
        });
        resumeId = resume?.id ?? null;
      }

      if (resumeId) {
        const enqueueResult = await enqueueResumeForAI(resumeId, jobId, runId, itemId);
        gptStatus = enqueueResult;
        if (enqueueResult === 'queued') {
          logMetric('pipeline_gpt_enqueued', {
            runId,
            itemId: itemId.toString(),
            resumeId
          });
        }
      }

      if (resumeId && !jobApplicationLinked) {
        await linkJobApplication(jobId, resumeId, externalMessageId);
        jobApplicationLinked = true;
      }

      step = 'persisted';
      await updateItemStatus(itemId, 'completed', step);
    }

    logMetric('pipeline_complete', {
      runId,
      itemId: itemId.toString(),
      resumeId: resumeId ?? 'none',
      gptStatus
    });

    return {
      success: true,
      step,
      resumeId: resumeId ?? undefined,
      gptStatus
    };
  } catch (error: any) {
    const message = error.message?.substring(0, 500) || 'Unknown error';
    pipelineError('pipeline error', { runId, itemId: itemId.toString(), error: message });
    logMetric('pipeline_failed', { runId, itemId: itemId.toString(), error: message });

    const itemUpdateData: Record<string, unknown> = {
      status: 'failed',
      last_error: message,
      attempts: { increment: 1 },
      gpt_status: 'error',
      gpt_last_error: message
    };

    const isScannedPdf =
      message.includes('SCANNED_PDF_NO_TEXT_LAYER') || message.toLowerCase().includes('pdf has no text layer');

    if (isScannedPdf) {
      pipelineWarn('scanned pdf detected, marking item as terminal', {
        runId,
        itemId: itemId.toString()
      });
      itemUpdateData.attempts = { set: MAX_ITEM_ATTEMPTS };
      itemUpdateData.step = 'failed_extract';
      itemUpdateData.gpt_status = 'skipped';
      itemUpdateData.gpt_next_retry_at = null;
    }

    const jobStatus = isScannedPdf ? 'scan_failed' : 'ingest_failed';
    if (resumeId) {
      await prisma.resume_ai_jobs.updateMany({
        where: { resumeId },
        data: {
          status: jobStatus,
          lastFinishedAt: new Date(),
          lastError: message,
          nextRetryAt: null
        }
      });
    }

    await prisma.import_email_items.update({
      where: { id: itemId },
      data: itemUpdateData
    });

    return { success: false, step: currentStep, error: message };
  }
}

// Helper functions

function hashFileContent(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function refetchAttachment(provider: EmailProvider, externalMessageId: string) {
  const { attachments } = await provider.getMessage(externalMessageId);
  const attachment = attachments[0];
  const fileBytes = await provider.getAttachmentBytes(externalMessageId, attachment.id);
  const fileHash = hashFileContent(fileBytes);
  const attachmentMeta = {
    name: attachment.name,
    size: attachment.size,
    contentType: attachment.contentType
  };

  return { fileBytes, fileHash, attachmentMeta };
}

async function uploadToSupabase(
  fileBytes: Uint8Array,
  fileHash: string,
  fileName: string,
  jobId: number,
  mimeType?: string
): Promise<{ path: string; bucket: string }> {
  const safeName = fileName
    .toLowerCase()
    .replace(/[^a-z0-9.-]/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 120);

  const storagePath = `jobs/${jobId}/${fileHash}-${safeName}`;
  const bucketName = process.env.SUPABASE_RESUMES_BUCKET || 'resumes';

  const maxSize = 10 * 1024 * 1024;
  if (fileBytes.length > maxSize) {
    throw new Error(`File too large: ${fileBytes.length} bytes (max ${maxSize})`);
  }

  try {
    const uploadResult = await uploadResumeBytes(storagePath, fileBytes, {
      contentType: mimeType,
      cacheControl: '3600',
      upsert: true
    });

    return {
      path: uploadResult.path,
      bucket: bucketName
    };
  } catch (error: any) {
    if (error.message?.includes('409') || error.message?.includes('already exists')) {
      return {
        path: storagePath,
        bucket: bucketName
      };
    }
    throw error;
  }
}

function buildStoragePath(jobId: number, fileHash: string, fileName: string): string {
  const safeName = fileName
    .toLowerCase()
    .replace(/[^a-z0-9.-]/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 120);
  return `jobs/${jobId}/${fileHash}-${safeName}`;
}

async function linkJobApplication(
  jobId: number,
  resumeId: number,
  externalMessageId?: string
): Promise<void> {
  try {
    const data: any = {
      jobId,
      resumeId,
      status: 'new',
      appliedDate: new Date()
    };

    if (externalMessageId) {
      data.external_message_id = externalMessageId;
    }

    await prisma.jobApplication.create({ data });
  } catch (error: any) {
    if (error.code !== 'P2002') {
      throw error;
    }
  }
}

async function updateItemStep(itemId: bigint, step: string): Promise<void> {
  await prisma.import_email_items.update({
    where: { id: itemId },
    data: { step, updated_at: new Date() }
  });
}

async function updateItemStatus(itemId: bigint, status: string, step: string): Promise<void> {
  await prisma.import_email_items.update({
    where: { id: itemId },
    data: { status, step, updated_at: new Date() }
  });
}

async function enqueueResumeForAI(
  resumeId: number,
  jobId: number,
  runId: string,
  itemId: bigint
): Promise<'queued' | 'skipped'> {
  const now = new Date();
  const existingJob = await prisma.resume_ai_jobs.findUnique({
    where: {
      resumeId_jobId: {
        resumeId,
        jobId
      }
    },
    select: {
      id: true,
      status: true
    }
  });

  if (existingJob && GPT_SKIP_STATUSES.has(existingJob.status)) {
    await prisma.import_email_items.update({
      where: { id: itemId },
      data: {
        resume_id: resumeId,
        gpt_status: existingJob.status,
        gpt_next_retry_at: null,
        gpt_last_error: null
      }
    });
    return 'skipped';
  }

  const importItemUpdate = prisma.import_email_items.update({
    where: { id: itemId },
    data: {
      resume_id: resumeId,
      gpt_status: 'queued',
      gpt_attempts: 0,
      gpt_last_error: null,
      gpt_next_retry_at: now
    }
  });

  if (existingJob) {
    await prisma.$transaction([
      importItemUpdate,
      prisma.resume_ai_jobs.update({
        where: { id: existingJob.id },
        data: {
          status: 'pending',
          runId,
          lastError: null,
          nextRetryAt: now,
          updatedAt: new Date()
        }
      })
    ]);
  } else {
    await prisma.$transaction([
      importItemUpdate,
      prisma.resume_ai_jobs.create({
        data: {
          resumeId,
          jobId,
          runId,
          status: 'pending',
          nextRetryAt: now
        }
      })
    ]);
  }

  pipelineInfo('resume queued for ai worker', {
    runId,
    itemId: itemId.toString(),
    resumeId,
    jobId
  });

  return 'queued';
}

/**
 * Try GPT parsing with configurable timeout (used by the worker).
 */
export interface GPTParsingResult {
  success: boolean;
  error?: string;
  code?: 'timeout' | 'error';
}

export async function tryGPTParsing(
  resumeId: number,
  jobContext: JobContext,
  timeoutMs: number,
  runId: string
): Promise<GPTParsingResult> {
  const isRetryableError = (message: string | undefined | null) => {
    if (!message) return false;
    const lower = message.toLowerCase();
    return (
      lower.includes('request_was_aborted') ||
      lower.includes('request was aborted') ||
      lower.includes('operation was aborted') ||
      lower.includes('socket hang up') ||
      lower.includes('fetch failed')
    );
  };

  try {
    const result = await parseAndScoreResume(resumeId, jobContext, false, timeoutMs);
    if (result.success) {
      pipelineInfo('gpt parsing completed', {
        runId,
        resumeId,
        timeoutMs
      });
      logMetric('gpt_worker_success', { runId, resumeId, timeoutMs });
      return { success: true };
    }

    const message = result.error || 'Unknown parsing error';
    const isTimeout =
      message.toLowerCase().includes('timeout') || isRetryableError(message);
    const code: GPTParsingResult['code'] = isTimeout ? 'timeout' : 'error';
    pipelineWarn('gpt parsing failed', {
      runId,
      resumeId,
      error: message
    });
    logMetric('gpt_worker_failure', { runId, resumeId, error: message, code });
    return { success: false, error: message, code };
  } catch (error: any) {
    const message = error?.message || 'Unknown error';
    const isTimeout =
      message.toLowerCase().includes('timeout') || isRetryableError(message);
    pipelineWarn('gpt parsing failed', {
      runId,
      resumeId,
      error: message
    });
    const code: GPTParsingResult['code'] = isTimeout ? 'timeout' : 'error';
    logMetric('gpt_worker_failure', { runId, resumeId, error: message, code });
    return { success: false, error: message, code };
  }
}

