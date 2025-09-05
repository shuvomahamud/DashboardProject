import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { withTableAuthAppRouter } from '@/lib/auth/withTableAuthAppRouter';
import { listFolderChildren, downloadFile } from '@/lib/msgraph/onedrive';
import { isSupported, sha256, objectPath, safeFilename } from '@/lib/files/resumeFiles';
import { extractText } from '@/lib/parse/text';
import { uploadResume } from '@/lib/storage/resumeStorage';

const prisma = new PrismaClient();

const RequestSchema = z.object({
  folderId: z.string(),
  jobId: z.number().optional(),
});

interface ImportSummary {
  created: number;
  duplicates: number;
  failed: number;
  errors: string[];
}

interface ImportLogEntry {
  fileName: string;
  fileId: string;
  result: 'success' | 'duplicate' | 'failed';
  error?: string;
  resumeId?: number;
}

async function handler(req: NextRequest): Promise<NextResponse> {
  if (req.method !== 'POST') {
    return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    // Validate request body
    const body = await req.json();
    const { folderId, jobId } = RequestSchema.parse(body);

    const summary: ImportSummary = {
      created: 0,
      duplicates: 0,
      failed: 0,
      errors: []
    };

    const logEntries: ImportLogEntry[] = [];

    // Verify job exists if jobId is provided
    if (jobId) {
      const job = await prisma.job.findUnique({
        where: { id: jobId },
      });

      if (!job) {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 });
      }
    }

    // List folder contents with pagination
    let nextLink: string | undefined;
    let totalProcessed = 0;

    do {
      try {
        const { items, next } = await listFolderChildren(folderId, nextLink);
        nextLink = next;

        for (const item of items) {
          // Skip folders, only process files
          if (item.folder) {
            continue;
          }

          // Check if file is supported
          if (!isSupported(item.name, item.file?.mimeType)) {
            continue;
          }

          totalProcessed++;
          console.log(`Processing file ${totalProcessed}: ${item.name}`);

          try {
            // Check for existing resume with same source path
            const existingByPath = await prisma.resume.findFirst({
              where: {
                sourcePath: item.id,
              },
            });

            if (existingByPath) {
              summary.duplicates++;
              logEntries.push({
                fileName: item.name,
                fileId: item.id,
                result: 'duplicate',
              });
              continue;
            }

            // Download file
            const bytes = await downloadFile(item.id);
            
            // Compute hash
            const fileHash = await sha256(bytes);
            
            // Check for existing resume with same hash
            const existingByHash = await prisma.resume.findFirst({
              where: { fileHash },
            });

            if (existingByHash) {
              summary.duplicates++;
              logEntries.push({
                fileName: item.name,
                fileId: item.id,
                result: 'duplicate',
              });
              continue;
            }

            // Generate storage path
            const storagePath = objectPath({
              jobId,
              hash: fileHash,
              name: item.name,
              source: 'cloud'
            });

            // Upload to Supabase
            await uploadResume(bytes, storagePath);

            // Extract text
            let rawText: string;
            try {
              rawText = await extractText(bytes, item.name, item.file?.mimeType);
            } catch (textError) {
              console.warn(`Text extraction failed for ${item.name}:`, textError);
              rawText = '';
            }

            // Create Resume record
            const resume = await prisma.resume.create({
              data: {
                fileName: safeFilename(item.name),
                originalName: item.name,
                fileSize: item.size || bytes.length,
                mimeType: item.file?.mimeType || 'application/octet-stream',
                storagePath,
                sourceType: 'cloud_import',
                sourcePath: item.id, // OneDrive item ID
                fileHash,
                fileSizeBytes: bytes.length,
                fileStorageUrl: storagePath,
                rawText,
                parsedText: rawText, // For backward compatibility
              },
            });

            // Create JobApplication if jobId is provided
            if (jobId) {
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
              }
            }

            summary.created++;
            logEntries.push({
              fileName: item.name,
              fileId: item.id,
              result: 'success',
              resumeId: resume.id,
            });

            // Trigger AI parsing (fire-and-forget, non-blocking)
            if (process.env.AI_FEATURES === 'on') {
              // Get job title if jobId is provided
              let jobTitle: string | undefined;
              if (jobId) {
                try {
                  const jobDetails = await prisma.job.findUnique({
                    where: { id: jobId },
                    select: { title: true }
                  });
                  jobTitle = jobDetails?.title;
                } catch (jobError) {
                  console.warn(`Could not fetch job title for hints: ${jobError}`);
                }
              }

              fetch(`${req.nextUrl.origin}/api/resumes/${resume.id}/parse`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  hints: jobTitle ? { jobTitle } : undefined
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

          } catch (fileError) {
            console.error(`Failed to process file ${item.name}:`, fileError);
            summary.failed++;
            summary.errors.push(`File ${item.name}: ${fileError instanceof Error ? fileError.message : 'Unknown error'}`);
            
            logEntries.push({
              fileName: item.name,
              fileId: item.id,
              result: 'failed',
              error: fileError instanceof Error ? fileError.message : 'Unknown error',
            });
          }
        }

        // Add small delay between pages to avoid rate limiting
        if (nextLink) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }

      } catch (listError) {
        console.error('Folder listing error:', listError);
        summary.errors.push(`Folder listing error: ${listError instanceof Error ? listError.message : 'Unknown error'}`);
        break;
      }
    } while (nextLink && totalProcessed < 1000); // Safety limit

    return NextResponse.json({
      success: true,
      folderId,
      jobId,
      summary,
      totalFiles: totalProcessed,
      logEntries,
    });

  } catch (error) {
    console.error('OneDrive import error:', error);
    return NextResponse.json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}

export const POST = withTableAuthAppRouter('resumes', handler);