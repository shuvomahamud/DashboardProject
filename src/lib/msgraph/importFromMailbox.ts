import { createHash } from 'crypto';
import prisma from '@/lib/prisma';
import { searchMessages, listAttachments, getFileAttachmentBytes, isAttachmentEligible } from './outlook';
import { Message, Attachment } from './outlook';
import { extractText } from '@/lib/parse/text';
import { uploadResumeBytes } from '@/lib/supabase-server';

export interface ImportSummary {
  createdResumes: number;
  linkedApplications: number;
  skippedDuplicates: number;
  failed: number;
  emailsScanned: number;
}

export interface ImportOptions {
  jobId: number;
  mailbox: string;
  searchText: string;
  limit?: number;
}

// Create or find existing Resume with deduplication
async function createOrFindResume(
  jobId: number,
  message: Message,
  attachment: Attachment,
  fileBytes: Uint8Array,
  fileHash: string,
  uploadResult?: { path: string; bucket: string }
): Promise<{ resume: any; isNew: boolean }> {
  
  // Check for existing resume by fileHash + sourceMessageId
  const existing = await prisma.resume.findFirst({
    where: {
      fileHash,
      sourceMessageId: message.id
    }
  });

  if (existing) {
    return { resume: existing, isNew: false };
  }

  // Create safe filename
  const safeName = attachment.name
    .toLowerCase()
    .replace(/[^a-z0-9.-]/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 120);

  // Create new resume with proper storage paths
  const resume = await prisma.resume.create({
    data: {
      // File metadata
      fileName: safeName,
      originalName: attachment.name,
      fileSize: attachment.size,
      fileSizeBytes: attachment.size,
      mimeType: attachment.contentType,
      storageBucket: uploadResult?.bucket || 'resumes',
      storagePath: uploadResult?.path || null,
      fileStorageUrl: uploadResult?.path || null, // Legacy field
      fileHash,
      
      // Email source metadata
      sourceType: 'email',
      sourceMessageId: message.id,
      sourceSubject: message.subject || '',
      sourceFrom: message.from?.emailAddress?.address || '',
      
      // Initially empty parsing fields
      rawText: '',
      parsedText: null,
      skills: null,
      experience: null,
      education: null,
      contactInfo: null,
      parsedAt: null,
      
      // AI fields
      aiExtractJson: null,
      aiSummary: null,
    }
  });

  return { resume, isNew: true };
}

// Link Resume to JobApplication with deduplication
async function linkJobApplication(
  jobId: number,
  resumeId: number
): Promise<{ isNew: boolean }> {
  
  try {
    // Try to create the link (upsert behavior)
    await prisma.jobApplication.create({
      data: {
        jobId,
        resumeId,
        status: 'submitted',
        appliedDate: new Date(),
      }
    });
    return { isNew: true };
  } catch (error: any) {
    // If unique constraint violation, it already exists
    if (error.code === 'P2002') {
      return { isNew: false };
    }
    throw error;
  }
}

// Fast text extraction
async function extractTextFromResume(
  resume: any,
  fileBytes: Uint8Array
): Promise<{ success: boolean; error?: string }> {
  
  try {
    // Use the existing text extraction functionality
    const extractedText = await extractText(fileBytes, resume.fileName, resume.mimeType);
    
    // Handle special cases
    if (extractedText === 'UNSUPPORTED_DOC_LEGACY') {
      return { success: false, error: 'Legacy .doc format is not supported' };
    }

    // Trim text if too large (keep under 2MB for database storage)
    const maxLength = 2 * 1024 * 1024; // 2MB
    const finalText = extractedText.length > maxLength 
      ? extractedText.substring(0, maxLength) + '\n\n[Text truncated for storage]'
      : extractedText;

    // Update the resume with extracted text
    await prisma.resume.update({
      where: { id: resume.id },
      data: {
        rawText: finalText,
        parsedAt: new Date(),
      }
    });

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// Hash file content for deduplication
function hashFileContent(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

// Upload file to Supabase Storage
async function uploadToSupabase(
  fileBytes: Uint8Array,
  fileHash: string,
  fileName: string,
  jobId: number,
  mimeType?: string
): Promise<{ path: string; bucket: string }> {
  
  // Create safe filename
  const safeName = fileName
    .toLowerCase()
    .replace(/[^a-z0-9.-]/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 120);

  // Create storage path: jobs/{jobId}/{hash}-{filename}
  const storagePath = `jobs/${jobId}/${fileHash}-${safeName}`;
  const bucketName = process.env.SUPABASE_RESUMES_BUCKET || 'resumes';
  
  // Log upload attempt
  console.log(`Uploading to bucket=${bucketName}, path=${storagePath} (size=${fileBytes.length} bytes, type=${mimeType})`);
  
  try {
    // Check file size (enforce 10MB limit)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (fileBytes.length > maxSize) {
      throw new Error(`File too large: ${fileBytes.length} bytes (max ${maxSize})`);
    }

    // Perform upload
    const uploadResult = await uploadResumeBytes(storagePath, fileBytes, {
      contentType: mimeType,
      cacheControl: '3600',
      upsert: false // Don't overwrite existing files
    });

    console.log(`Upload successful: ${uploadResult.path}`);
    
    return {
      path: uploadResult.path,
      bucket: bucketName
    };
    
  } catch (error: any) {
    console.error(`Upload failed for ${storagePath}:`, error.message);
    throw error;
  }
}

// Main import function
export async function importFromMailbox(options: ImportOptions): Promise<ImportSummary> {
  const { jobId, mailbox, searchText, limit = 5000 } = options;
  
  const summary: ImportSummary = {
    createdResumes: 0,
    linkedApplications: 0,
    skippedDuplicates: 0,
    failed: 0,
    emailsScanned: 0,
  };

  try {
    // Get messages from Graph API
    const result = await searchMessages(searchText, limit, mailbox);
    summary.emailsScanned = result.messages.length;

    console.log(`Processing ${result.messages.length} messages for job ${jobId}`);

    // Process each message with modest concurrency
    const concurrentLimit = 3;
    for (let i = 0; i < result.messages.length; i += concurrentLimit) {
      const batch = result.messages.slice(i, i + concurrentLimit);
      
      await Promise.allSettled(
        batch.map(async (message) => {
          try {
            // Quick filter: skip if no attachments
            if (!message.hasAttachments) {
              return;
            }

            // Get attachments
            const attachmentsResult = await listAttachments(message.id, mailbox);
            const eligibleAttachments = attachmentsResult.attachments.filter(isAttachmentEligible);
            
            if (eligibleAttachments.length === 0) {
              return;
            }

            // Process first eligible attachment
            const attachment = eligibleAttachments[0];
            
            // Download attachment bytes
            const fileBytes = await getFileAttachmentBytes(message.id, attachment.id, mailbox);
            const fileHash = hashFileContent(fileBytes);

            // Check for duplicate (fileHash + messageId combination)
            const existingResume = await prisma.resume.findFirst({
              where: {
                fileHash,
                sourceMessageId: message.id
              }
            });

            if (existingResume) {
              summary.skippedDuplicates++;
              
              // Still try to link to job if not already linked
              const linkResult = await linkJobApplication(jobId, existingResume.id);
              if (linkResult.isNew) {
                summary.linkedApplications++;
              }
              return;
            }

            // Upload to Supabase Storage (attempt but don't fail the entire process if it fails)
            let uploadResult: { path: string; bucket: string } | undefined;
            let uploadFailed = false;
            try {
              uploadResult = await uploadToSupabase(
                fileBytes, 
                fileHash, 
                attachment.name, 
                jobId,
                attachment.contentType
              );
              console.log(`✓ Upload successful for ${attachment.name}`);
            } catch (uploadError: any) {
              console.error(`✗ Upload failed for ${attachment.name}:`, uploadError.message);
              uploadFailed = true;
              // Continue with database operations even if upload fails
            }

            // Create Resume record (with or without upload result)
            const { resume, isNew } = await createOrFindResume(
              jobId,
              message, 
              attachment, 
              fileBytes, 
              fileHash, 
              uploadResult
            );
            if (isNew) {
              summary.createdResumes++;
              console.log(`✓ Created Resume record for ${attachment.name} (ID: ${resume.id})`);
            } else {
              console.log(`✓ Found existing Resume record for ${attachment.name} (ID: ${resume.id})`);
            }

            // Link to Job
            const linkResult = await linkJobApplication(jobId, resume.id);
            if (linkResult.isNew) {
              summary.linkedApplications++;
              console.log(`✓ Created JobApplication link for Resume ${resume.id} -> Job ${jobId}`);
            } else {
              console.log(`✓ Found existing JobApplication link for Resume ${resume.id} -> Job ${jobId}`);
            }

            // Extract text
            const textResult = await extractTextFromResume(resume, fileBytes);
            if (textResult.success) {
              console.log(`✓ Text extraction successful for ${attachment.name}`);
            } else {
              console.warn(`✗ Text extraction failed for ${attachment.name}: ${textResult.error}`);
              // Don't increment failed count for text extraction failures, as Resume is still created
            }

            // Count failures appropriately
            if (uploadFailed) {
              summary.failed++;
            }

          } catch (error: any) {
            console.error(`Failed to process message ${message.id}:`, error.message);
            summary.failed++;
          }
        })
      );
    }

    // Final summary log
    console.log(`Import completed for job ${jobId}:`, {
      emailsScanned: summary.emailsScanned,
      createdResumes: summary.createdResumes,
      linkedApplications: summary.linkedApplications,
      skippedDuplicates: summary.skippedDuplicates,
      failed: summary.failed
    });

    return summary;
  } catch (error: any) {
    console.error('Import failed:', error.message);
    throw error;
  }
}