/**
 * Email Processing Pipeline
 *
 * Steps: fetch → save → parse → gpt → persist
 */

import { createHash } from 'crypto';
import prisma from '@/lib/prisma';
import { extractText } from '@/lib/parse/text';
import { uploadResumeBytes } from '@/lib/supabase-server';
import { parseAndScoreResume } from '@/lib/ai/resumeParsingService';
import type { EmailProvider } from '@/lib/providers/email-provider';

export interface EmailItem {
  id: bigint;
  external_message_id: string;  // Match Prisma snake_case
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
  step: string; // Last completed step
  error?: string;
  gptSuccess?: boolean; // Whether GPT parsing succeeded
  resumeId?: number; // Resume ID for retry queue
}

/**
 * Process a single email item through the pipeline
 */
export async function processEmailItem(
  item: EmailItem,
  context: PipelineContext
): Promise<PipelineResult> {
  const { provider, jobId, runId } = context;
  const { id: itemId, external_message_id: externalMessageId, step: currentStep } = item;

  try {
    console.log(`🔧 [RUN:${runId}] [ITEM:${itemId}] Starting pipeline at step: ${currentStep}`);
    let step = currentStep;

    // Step 1: Fetch message and attachments
    if (step === 'none') {
      console.log(`🔧 [RUN:${runId}] [ITEM:${itemId}] Step 1: Fetching message and attachments`);
      const { message, attachments } = await provider.getMessage(externalMessageId);

      console.log(`🔧 [RUN:${runId}] [ITEM:${itemId}] Step 1: Found ${attachments.length} eligible attachments`);

      if (attachments.length === 0) {
        console.log(`⚠️  [RUN:${runId}] [ITEM:${itemId}] Step 1: No eligible attachments - marking as completed`);
        await updateItemStatus(itemId, 'completed', 'fetched');
        return { success: true, step: 'fetched' };
      }

      step = 'fetched';
      await updateItemStep(itemId, step);
      console.log(`✅ [RUN:${runId}] [ITEM:${itemId}] Step 1: Complete - moved to step: ${step}`);
    }

    // Step 2: Download and save file bytes
    let fileBytes: Uint8Array;
    let fileHash: string;
    let attachmentMeta: { name: string; size: number; contentType: string };

    if (step === 'fetched') {
      console.log(`🔧 [RUN:${runId}] [ITEM:${itemId}] Step 2: Downloading attachment bytes`);
      const { attachments } = await provider.getMessage(externalMessageId);
      const attachment = attachments[0]; // Process first eligible attachment

      console.log(`🔧 [RUN:${runId}] [ITEM:${itemId}] Step 2: Processing attachment "${attachment.name}" (${attachment.size} bytes)`);

      fileBytes = await provider.getAttachmentBytes(externalMessageId, attachment.id);
      fileHash = hashFileContent(fileBytes);
      attachmentMeta = {
        name: attachment.name,
        size: attachment.size,
        contentType: attachment.contentType
      };

      console.log(`🔧 [RUN:${runId}] [ITEM:${itemId}] Step 2: File hash: ${fileHash.substring(0, 16)}...`);

      // Check if resume already exists (deduplication)
      const existing = await prisma.resume.findFirst({
        where: {
          fileHash,
          sourceMessageId: externalMessageId
        }
      });

      if (existing) {
        console.log(`⚠️  [RUN:${runId}] [ITEM:${itemId}] Step 2: Duplicate detected - linking to existing resume ${existing.id}`);
        await linkJobApplication(jobId, existing.id, externalMessageId);
        await updateItemStatus(itemId, 'completed', 'saved');
        return { success: true, step: 'saved' };
      }

      step = 'saved';
      await updateItemStep(itemId, step);
      console.log(`✅ [RUN:${runId}] [ITEM:${itemId}] Step 2: Complete - moved to step: ${step}`);
    }

    // Step 3: Upload to storage
    if (step === 'saved') {
      console.log(`🔧 [RUN:${runId}] [ITEM:${itemId}] Step 3: Uploading to Supabase storage`);

      // Re-fetch if not in memory
      if (!fileBytes!) {
        console.log(`🔧 [RUN:${runId}] [ITEM:${itemId}] Step 3: Re-fetching attachment (not in memory)`);
        const { attachments } = await provider.getMessage(externalMessageId);
        const attachment = attachments[0];
        fileBytes = await provider.getAttachmentBytes(externalMessageId, attachment.id);
        fileHash = hashFileContent(fileBytes);
        attachmentMeta = {
          name: attachment.name,
          size: attachment.size,
          contentType: attachment.contentType
        };
      }

      // Upload to Supabase
      const uploadResult = await uploadToSupabase(
        fileBytes,
        fileHash!,
        attachmentMeta!.name,
        jobId,
        attachmentMeta!.contentType
      );

      console.log(`✅ [RUN:${runId}] [ITEM:${itemId}] Step 3: Uploaded to ${uploadResult.path}`);

      step = 'uploaded';
      await updateItemStep(itemId, step);
      console.log(`✅ [RUN:${runId}] [ITEM:${itemId}] Step 3: Complete - moved to step: ${step}`);
    }

    // Step 4: Parse text
    let resumeId: number;

    if (step === 'uploaded') {
      // Re-fetch if needed
      if (!fileBytes!) {
        const { attachments } = await provider.getMessage(externalMessageId);
        const attachment = attachments[0];
        fileBytes = await provider.getAttachmentBytes(externalMessageId, attachment.id);
        fileHash = hashFileContent(fileBytes);
        attachmentMeta = {
          name: attachment.name,
          size: attachment.size,
          contentType: attachment.contentType
        };
      }

      // Get message details
      const { message, attachments } = await provider.getMessage(externalMessageId);
      const attachment = attachments[0];

      // Create resume record
      const uploadResult = await uploadToSupabase(
        fileBytes,
        fileHash!,
        attachmentMeta!.name,
        jobId,
        attachmentMeta!.contentType
      );

      const safeName = attachment.name
        .toLowerCase()
        .replace(/[^a-z0-9.-]/g, '-')
        .replace(/-+/g, '-')
        .substring(0, 120);

      const resume = await prisma.resume.create({
        data: {
          fileName: safeName,
          originalName: attachment.name,
          fileSize: attachment.size,
          fileSizeBytes: attachment.size,
          mimeType: attachment.contentType,
          storagePath: uploadResult.path,
          fileStorageUrl: uploadResult.path,
          fileHash: fileHash!,
          sourceType: 'email',
          sourceMessageId: externalMessageId,
          sourceSubject: message.subject || '',
          sourceFrom: message.from?.address || '',
          rawText: '',
          parsedText: null,
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

      // Extract text
      try {
        const extractedText = await extractText(fileBytes, safeName, attachment.contentType);

        if (extractedText !== 'UNSUPPORTED_DOC_LEGACY') {
          const maxLength = 2 * 1024 * 1024; // 2MB
          const finalText = extractedText.length > maxLength
            ? extractedText.substring(0, maxLength) + '\n\n[Text truncated]'
            : extractedText;

          await prisma.resume.update({
            where: { id: resume.id },
            data: {
              rawText: finalText,
              parsedAt: new Date()
            }
          });
        } else {
          // Legacy .doc format not supported
          await prisma.resume.update({
            where: { id: resume.id },
            data: {
              rawText: '[UNSUPPORTED_DOC_LEGACY]',
              parsedAt: new Date()
            }
          });
        }
      } catch (extractError: any) {
        // Log error but don't fail the entire import
        console.error(`⚠️  [RUN:${runId}] [ITEM:${itemId}] Text extraction failed:`, extractError.message);

        // Mark resume with extraction error
        await prisma.resume.update({
          where: { id: resume.id },
          data: {
            rawText: `[TEXT_EXTRACTION_FAILED: ${extractError.message}]`,
            parsedAt: new Date()
          }
        });
      }

      step = 'parsed';
      await updateItemStep(itemId, step);
    }

    // Step 5: AI processing (optional)
    let gptSuccess = false;

    if (step === 'parsed' && process.env.PARSE_ON_IMPORT === 'true') {
      // Get resume ID if not in memory
      if (!resumeId!) {
        const resume = await prisma.resume.findFirst({
          where: {
            sourceMessageId: externalMessageId
          },
          select: { id: true }
        });
        resumeId = resume!.id;
      }

      // Get job context
      const job = await prisma.job.findUnique({
        where: { id: jobId },
        select: { title: true, description: true }
      });

      if (job) {
        const jobContext = {
          jobTitle: job.title,
          jobDescriptionShort: job.description.length > 500
            ? job.description.substring(0, 500) + '...'
            : job.description
        };

        try {
          // Parse with 20s timeout (enforced via AbortSignal in parseAndScoreResume)
          const result = await parseAndScoreResume(resumeId, jobContext, false, 20000);

          if (result.success) {
            console.log(`✅ [RUN:${runId}] [ITEM:${itemId}] GPT parsing completed`);
            gptSuccess = true;
          } else {
            console.warn(`⚠️  [RUN:${runId}] [ITEM:${itemId}] GPT parsing failed (will retry): ${result.error}`);
            gptSuccess = false;
          }
        } catch (error: any) {
          // Log but don't fail - parsing can be retried later
          console.warn(`⚠️  [RUN:${runId}] [ITEM:${itemId}] GPT parsing failed (will retry):`, error.message);
          gptSuccess = false;
        }
      }

      step = 'gpt';
      await updateItemStep(itemId, step);
    }

    // Step 6: Link to job application (final step)
    if (step === 'parsed' || step === 'gpt') {
      // Get resume ID if not in memory
      if (!resumeId!) {
        const resume = await prisma.resume.findFirst({
          where: {
            sourceMessageId: externalMessageId
          },
          select: { id: true }
        });
        resumeId = resume!.id;
      }

      await linkJobApplication(jobId, resumeId, externalMessageId);

      step = 'persisted';
      await updateItemStatus(itemId, 'completed', step);
    }

    return {
      success: true,
      step,
      gptSuccess,
      resumeId
    };

  } catch (error: any) {
    console.error(`❌ [RUN:${runId}] [ITEM:${itemId}] Pipeline error:`, error);

    // Truncate error message to 500 characters to avoid database issues
    const errorMessage = error.message?.substring(0, 500) || 'Unknown error';

    // Update item with error
    await prisma.import_email_items.update({
      where: { id: itemId },
      data: {
        status: 'failed',
        last_error: errorMessage,
        attempts: { increment: 1 }
      }
    });

    return { success: false, step: currentStep, error: errorMessage };
  }
}

// Helper functions

/**
 * Try GPT parsing with configurable timeout
 * Returns true if successful, false if timeout/error
 */
export async function tryGPTParsing(
  resumeId: number,
  jobContext: { jobTitle: string; jobDescriptionShort: string },
  timeoutMs: number,
  runId: string
): Promise<boolean> {
  try {
    // Pass timeout to parseAndScoreResume, which enforces it at the OpenAI SDK level
    await parseAndScoreResume(resumeId, jobContext, false, timeoutMs);

    console.log(`✅ [RUN:${runId}] GPT parsing completed for resume ${resumeId} (${timeoutMs}ms timeout)`);
    return true;
  } catch (error: any) {
    console.warn(`⚠️  [RUN:${runId}] GPT parsing failed for resume ${resumeId}: ${error.message}`);
    return false;
  }
}

function hashFileContent(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
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

  const maxSize = 10 * 1024 * 1024; // 10MB
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
    // Treat 409 conflicts as success
    if (error.message?.includes('409') || error.message?.includes('already exists')) {
      return {
        path: storagePath,
        bucket: bucketName
      };
    }
    throw error;
  }
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
      status: 'submitted',
      appliedDate: new Date()
    };

    if (externalMessageId) {
      data.external_message_id = externalMessageId;
    }

    await prisma.jobApplication.create({ data });
  } catch (error: any) {
    // Ignore unique constraint violations (already linked)
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
