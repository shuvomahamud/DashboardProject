import { createHash } from 'crypto';
import prisma from '@/lib/prisma';
import { embedText, normalizeForEmbedding } from './embeddings';

export interface EmbedJobResult {
  ok: boolean;
  reason?: string;
  jobId?: number;
  updated?: boolean;
}

export interface JobEmbeddingRow {
  id: number;
  job_id: number;
  content_hash: string;
  embedding: number[];
  chunk_text: string | null;
  metadata: any;
  created_at: Date;
  updated_at: Date;
}

function computeContentHash(text: string): string {
  const normalized = normalizeForEmbedding(text);
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

function buildJobProfileText(job: {
  title: string;
  description: string | null;
  company?: { name: string } | null;
  tags?: string | null;
  requirements?: string | null;
  location?: string | null;
  salaryRange?: string | null;
}): string {
  const parts: string[] = [];
  
  // Job title is most important
  if (job.title) {
    parts.push(`Job Title: ${job.title}`);
  }
  
  // Company context
  if (job.company?.name) {
    parts.push(`Company: ${job.company.name}`);
  }
  
  // Location context
  if (job.location) {
    parts.push(`Location: ${job.location}`);
  }
  
  // Job description
  if (job.description) {
    parts.push(`Description: ${job.description}`);
  }
  
  // Requirements
  if (job.requirements) {
    parts.push(`Requirements: ${job.requirements}`);
  }
  
  // Skills/tags
  if (job.tags) {
    parts.push(`Skills: ${job.tags}`);
  }
  
  // Salary context
  if (job.salaryRange) {
    parts.push(`Salary: ${job.salaryRange}`);
  }
  
  return parts.join('\n\n');
}

export async function upsertJobEmbedding(jobId: number): Promise<EmbedJobResult> {
  try {
    // Load job with related data
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        title: true,
        description: true,
        requirements: true,
        tags: true,
        location: true,
        salaryRange: true,
        company: {
          select: {
            name: true
          }
        }
      }
    });

    if (!job) {
      return { ok: false, reason: 'job_not_found' };
    }

    const profileText = buildJobProfileText(job);
    
    if (!profileText.trim()) {
      return { ok: false, reason: 'no_text' };
    }

    const contentHash = computeContentHash(profileText);
    
    // Check if embedding already exists with same content hash
    const existingEmbedding = await prisma.$queryRaw<JobEmbeddingRow[]>`
      SELECT id, job_id, content_hash, created_at, updated_at
      FROM job_embeddings 
      WHERE job_id = ${jobId} AND content_hash = ${contentHash}
    `;

    if (existingEmbedding.length > 0) {
      return { 
        ok: true, 
        reason: 'already_embedded',
        jobId,
        updated: false
      };
    }

    // Generate embedding
    const embedding = await embedText(profileText);
    const embeddingString = JSON.stringify(embedding);

    // Store metadata about the embedding
    const metadata = {
      model: process.env.AI_MODEL_EMBED || 'text-embedding-3-large',
      textLength: profileText.length,
      title: job.title,
      companyName: job.company?.name,
      embeddedAt: new Date().toISOString()
    };

    // Upsert the embedding
    await prisma.$executeRaw`
      INSERT INTO job_embeddings (job_id, content_hash, embedding, chunk_text, metadata, created_at, updated_at)
      VALUES (${jobId}, ${contentHash}, ${embeddingString}::vector, ${profileText.substring(0, 1000)}, ${JSON.stringify(metadata)}::jsonb, NOW(), NOW())
      ON CONFLICT (job_id, content_hash) 
      DO UPDATE SET 
        embedding = EXCLUDED.embedding,
        chunk_text = EXCLUDED.chunk_text,
        metadata = EXCLUDED.metadata,
        updated_at = NOW()
    `;

    return { 
      ok: true, 
      jobId,
      updated: true
    };

  } catch (error) {
    console.error(`Error embedding job ${jobId}:`, error);
    return { 
      ok: false, 
      reason: 'embedding_error',
      jobId
    };
  }
}

export async function getJobEmbedding(jobId: number): Promise<number[] | null> {
  try {
    const result = await prisma.$queryRaw<{embedding: any}[]>`
      SELECT embedding 
      FROM job_embeddings 
      WHERE job_id = ${jobId}
      ORDER BY updated_at DESC 
      LIMIT 1
    `;

    if (result.length === 0) {
      return null;
    }

    return result[0].embedding;
  } catch (error) {
    console.error(`Error getting embedding for job ${jobId}:`, error);
    return null;
  }
}

export async function findJobsWithoutEmbeddings(limit: number = 50): Promise<number[]> {
  try {
    const results = await prisma.$queryRaw<{id: number}[]>`
      SELECT j.id 
      FROM "Job" j
      LEFT JOIN job_embeddings je ON j.id = je.job_id
      WHERE je.job_id IS NULL 
        AND j.title IS NOT NULL AND j.title <> ''
      ORDER BY j."createdAt" DESC
      LIMIT ${limit}
    `;

    return results.map(j => j.id);
  } catch (error) {
    console.error('Error finding jobs without embeddings:', error);
    return [];
  }
}

export async function findJobsWithStaleEmbeddings(limit: number = 50): Promise<number[]> {
  try {
    // This is more complex for jobs since we need to compute the profile text hash
    // For now, we'll identify jobs that have been updated after their latest embedding
    const results = await prisma.$queryRaw<{id: number}[]>`
      SELECT DISTINCT j.id
      FROM "Job" j
      JOIN job_embeddings je ON j.id = je.job_id
      WHERE j."updatedAt" > je.updated_at
      ORDER BY j."updatedAt" DESC
      LIMIT ${limit}
    `;

    return results.map(j => j.id);
  } catch (error) {
    console.error('Error finding jobs with stale embeddings:', error);
    return [];
  }
}