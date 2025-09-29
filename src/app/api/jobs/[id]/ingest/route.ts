import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { withTableAuthAppRouter } from '@/lib/auth/withTableAuthAppRouter';
import { searchMessages, listAttachments, getFileAttachmentBytes } from '@/lib/msgraph/outlook';
import { isSupported, sha256, objectPath, safeFilename } from '@/lib/files/resumeFiles';
import { extractText } from '@/lib/parse/text';
import { uploadResume } from '@/lib/storage/resumeStorage';

export const dynamic = 'force-dynamic';

const prisma = new PrismaClient();

const RequestSchema = z.object({
  query: z.string().optional(),
});

interface IngestSummary {
  createdResumes: number;
  linkedApplications: number;
  skippedDuplicates: number;
  failed: number;
  errors: string[];
}

interface EmailIngestLogEntry {
  messageId: string;
  subject: string;
  from: string;
  result: 'success' | 'skipped-duplicate' | 'failed';
  error?: string;
  resumeId?: number;
}

async function handler(req: NextRequest): Promise<NextResponse> {
  if (req.method !== 'POST') {
    return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    // Parse job ID from URL
    const url = new URL(req.url);
    const jobId = parseInt(url.pathname.split('/')[3]);
    
    if (!jobId || isNaN(jobId)) {
      return NextResponse.json({ error: 'Invalid job ID' }, { status: 400 });
    }

    // Validate request body
    const body = await req.json().catch(() => ({}));
    const { query } = RequestSchema.parse(body);

    // Get job details
    const job = await prisma.job.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Determine AQS query
    let aqs: string;
    if (query) {
      aqs = query;
    } else if (job.applicationQuery) {
      aqs = job.applicationQuery;
    } else {
      aqs = `subject:"${job.title}" hasAttachments:yes`;
    }

    const summary: IngestSummary = {
      createdResumes: 0,
      linkedApplications: 0,
      skippedDuplicates: 0,
      failed: 0,
      errors: []
    };

    const logEntries: EmailIngestLogEntry[] = [];

    // Search messages with pagination
    let nextLink: string | undefined;
    let totalProcessed = 0;

    do {
      try {
        const { messages, next } = await searchMessages(aqs, 25, nextLink);
        nextLink = next;

        console.log(`Job ${jobId} email ingestion batch:`, {
          jobTitle: job.title,
          searchQuery: aqs,
          messagesInBatch: messages.length,
          totalProcessedSoFar: totalProcessed
        });

        for (const message of messages) {
          totalProcessed++;
          console.log(`Processing message ${totalProcessed}: ${message.subject}`);

          try {
            if (!message.hasAttachments) {
              continue;
            }

            // List attachments
            const { attachments } = await listAttachments(message.id);

            for (const attachment of attachments) {
              // Skip non-file attachments
              if (attachment['@odata.type'] !== '#microsoft.graph.fileAttachment') {
                continue;
              }

              // Check if file is supported
              if (!isSupported(attachment.name, attachment.contentType)) {
                continue;
              }

              try {
                // Check for existing resume with same source message ID and attachment name
                const existingResume = await prisma.resume.findFirst({
                  where: {
                    sourceMessageId: message.id,
                    fileName: attachment.name,
                  },
                });

                if (existingResume) {
                  summary.skippedDuplicates++;
                  logEntries.push({
                    messageId: message.id,
                    subject: message.subject,
                    from: message.from?.emailAddress?.address || 'unknown',
                    result: 'skipped-duplicate',
                  });
                  continue;
                }

                // Download attachment
                const bytes = await getFileAttachmentBytes(message.id, attachment.id);
                
                // Compute hash
                const fileHash = await sha256(bytes);
                
                // Check for existing resume with same hash
                const existingByHash = await prisma.resume.findFirst({
                  where: { fileHash },
                });

                if (existingByHash) {
                  summary.skippedDuplicates++;
                  logEntries.push({
                    messageId: message.id,
                    subject: message.subject,
                    from: message.from?.emailAddress?.address || 'unknown',
                    result: 'skipped-duplicate',
                  });
                  continue;
                }

                // Generate storage path
                const storagePath = objectPath({
                  jobId,
                  hash: fileHash,
                  name: attachment.name,
                  source: 'email'
                });

                // Upload to Supabase
                await uploadResume(bytes, storagePath);

                // Extract text
                let rawText: string;
                try {
                  rawText = await extractText(bytes, attachment.name, attachment.contentType);
                } catch (textError) {
                  console.warn(`Text extraction failed for ${attachment.name}:`, textError);
                  rawText = '';
                }

                // Create Resume record
                const resume = await prisma.resume.create({
                  data: {
                    fileName: safeFilename(attachment.name),
                    originalName: attachment.name,
                    fileSize: attachment.size,
                    mimeType: attachment.contentType,
                    storagePath,
                    sourceType: 'email',
                    sourceMessageId: message.id,
                    sourceSubject: message.subject,
                    sourceFrom: message.from?.emailAddress?.address || 'unknown',
                    fileHash,
                    fileSizeBytes: bytes.length,
                    fileStorageUrl: storagePath,
                    rawText,
                    parsedText: rawText, // For backward compatibility
                  },
                });

                // Create or update JobApplication
                const existingApplication = await prisma.jobApplication.findUnique({
                  where: {
                    jobId_resumeId: {
                      jobId,
                      resumeId: resume.id,
                    },
                  },
                });

                if (!existingApplication) {
                  await prisma.jobApplication.create({
                    data: {
                      jobId,
                      resumeId: resume.id,
                      status: 'new',
                    },
                  });
                  summary.linkedApplications++;
                }

                summary.createdResumes++;
                logEntries.push({
                  messageId: message.id,
                  subject: message.subject,
                  from: message.from?.emailAddress?.address || 'unknown',
                  result: 'success',
                  resumeId: resume.id,
                });

                // Trigger AI parsing (fire-and-forget, non-blocking)
                if (process.env.AI_FEATURES === 'on') {
                  fetch(`${req.nextUrl.origin}/api/resumes/${resume.id}/parse`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                      hints: { jobTitle: job.title }
                    })
                  }).catch(parseError => {
                    console.warn(`Non-blocking AI parse failed for resume ${resume.id}:`, parseError);
                  });
                }

                // Trigger embedding generation (fire-and-forget, non-blocking)
                if (process.env.OPENAI_API_KEY) {
                  import('@/lib/ai/embedResume').then(({ upsertResumeEmbedding }) => {
                    upsertResumeEmbedding(resume.id).catch(embedError => {
                      console.warn(`Non-blocking embedding failed for resume ${resume.id}:`, embedError);
                    });
                  }).catch(importError => {
                    console.warn(`Failed to import embedding module:`, importError);
                  });
                }

              } catch (attachmentError) {
                console.error(`Failed to process attachment ${attachment.name}:`, attachmentError);
                summary.failed++;
                summary.errors.push(`Attachment ${attachment.name}: ${attachmentError instanceof Error ? attachmentError.message : 'Unknown error'}`);
                
                logEntries.push({
                  messageId: message.id,
                  subject: message.subject,
                  from: message.from?.emailAddress?.address || 'unknown',
                  result: 'failed',
                  error: attachmentError instanceof Error ? attachmentError.message : 'Unknown error',
                });
              }
            }
          } catch (messageError) {
            console.error(`Failed to process message ${message.id}:`, messageError);
            summary.failed++;
            summary.errors.push(`Message ${message.id}: ${messageError instanceof Error ? messageError.message : 'Unknown error'}`);
          }
        }

        // Add small delay between pages to avoid rate limiting
        if (nextLink) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }

      } catch (searchError) {
        console.error('Search error:', searchError);
        summary.errors.push(`Search error: ${searchError instanceof Error ? searchError.message : 'Unknown error'}`);
        break;
      }
    } while (nextLink && totalProcessed < 1000); // Safety limit

    // Final summary log for Vercel visibility
    console.log(`Job ${jobId} email ingestion completed:`, {
      jobTitle: job.title,
      searchQuery: aqs,
      totalEmailsProcessed: totalProcessed,
      resumesCreated: summary.createdResumes,
      applicationsLinked: summary.linkedApplications,
      duplicatesSkipped: summary.skippedDuplicates,
      failures: summary.failed,
      success: true
    });

    return NextResponse.json({
      success: true,
      query: aqs,
      summary,
      totalMessages: totalProcessed,
      logEntries,
    });

  } catch (error) {
    console.error('Email ingestion error:', error);
    return NextResponse.json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}

export const POST = withTableAuthAppRouter('jobs', handler);