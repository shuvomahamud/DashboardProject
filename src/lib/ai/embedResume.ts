import { createHash } from 'crypto';
import prisma from '@/lib/prisma';
import { embedText, normalizeForEmbedding } from './embeddings';

export interface EmbedResumeResult {
  ok: boolean;
  reason?: string;
  resumeId?: number;
  updated?: boolean;
}

export interface ResumeEmbeddingRow {
  id: number;
  resume_id: number;
  content_hash: string;
  embedding: number[];
  chunk_text: string | null;
  metadata: any;
  created_at: Date;
  updated_at: Date;
}

export interface DuplicateMatch {
  resumeId: number;
  score: number;
  candidateName?: string;
  fileName?: string;
}

function computeContentHash(text: string): string {
  const normalized = normalizeForEmbedding(text);
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

export async function upsertResumeEmbedding(resumeId: number): Promise<EmbedResumeResult> {
  try {
    // Load resume with raw text
    const resume = await prisma.resume.findUnique({
      where: { id: resumeId },
      select: {
        id: true,
        rawText: true,
        parsedText: true,
        candidateName: true,
        fileName: true
      }
    });

    if (!resume) {
      return { ok: false, reason: 'resume_not_found' };
    }

    // Use rawText first, fall back to parsedText
    const textToEmbed = resume.rawText || resume.parsedText || '';
    
    if (!textToEmbed.trim()) {
      return { ok: false, reason: 'no_text' };
    }

    const contentHash = computeContentHash(textToEmbed);
    
    // Check if embedding already exists with same content hash
    const existingEmbedding = await prisma.$queryRaw<ResumeEmbeddingRow[]>`
      SELECT id, resume_id, content_hash, created_at, updated_at
      FROM resume_embeddings 
      WHERE resume_id = ${resumeId} AND content_hash = ${contentHash}
    `;

    if (existingEmbedding.length > 0) {
      return { 
        ok: true, 
        reason: 'already_embedded',
        resumeId,
        updated: false
      };
    }

    // Generate embedding
    const embedding = await embedText(textToEmbed);
    const embeddingString = JSON.stringify(embedding);

    // Store metadata about the embedding
    const metadata = {
      model: process.env.AI_MODEL_EMBED || 'text-embedding-3-large',
      textLength: textToEmbed.length,
      candidateName: resume.candidateName,
      fileName: resume.fileName,
      embeddedAt: new Date().toISOString()
    };

    // Upsert the embedding
    await prisma.$executeRaw`
      INSERT INTO resume_embeddings (resume_id, content_hash, embedding, chunk_text, metadata, created_at, updated_at)
      VALUES (${resumeId}, ${contentHash}, ${embeddingString}::vector, ${textToEmbed.substring(0, 1000)}, ${JSON.stringify(metadata)}::jsonb, NOW(), NOW())
      ON CONFLICT (resume_id, content_hash) 
      DO UPDATE SET 
        embedding = EXCLUDED.embedding,
        chunk_text = EXCLUDED.chunk_text,
        metadata = EXCLUDED.metadata,
        updated_at = NOW()
    `;

    return { 
      ok: true, 
      resumeId,
      updated: true
    };

  } catch (error) {
    console.error(`Error embedding resume ${resumeId}:`, error);
    return { 
      ok: false, 
      reason: 'embedding_error',
      resumeId
    };
  }
}

export async function findNearDuplicateResumes(
  resumeId: number, 
  threshold: number = parseFloat(process.env.SEMANTIC_DUP_THRESHOLD || '0.92'),
  limit: number = 50
): Promise<DuplicateMatch[]> {
  try {
    // First ensure the source resume has an embedding
    const embedResult = await upsertResumeEmbedding(resumeId);
    if (!embedResult.ok) {
      throw new Error(`Could not embed source resume: ${embedResult.reason}`);
    }

    // Get the source embedding
    const sourceEmbedding = await prisma.$queryRaw<{embedding: any}[]>`
      SELECT embedding 
      FROM resume_embeddings 
      WHERE resume_id = ${resumeId}
      ORDER BY updated_at DESC 
      LIMIT 1
    `;

    if (sourceEmbedding.length === 0) {
      throw new Error('Source resume embedding not found after upsert');
    }

    const embedding = sourceEmbedding[0].embedding;

    // Find similar resumes using cosine similarity
    // Note: pgvector uses <-> for L2 distance, <=> for cosine distance
    // 1 - (a <=> b) gives cosine similarity (0 = different, 1 = identical)
    const results = await prisma.$queryRaw<{
      resume_id: number;
      score: number;
      candidateName: string | null;
      fileName: string;
    }[]>`
      SELECT 
        r.id as resume_id,
        (1 - (re.embedding <=> ${JSON.stringify(embedding)}::vector)) as score,
        r."candidateName",
        r."fileName"
      FROM resume_embeddings re
      JOIN "Resume" r ON r.id = re.resume_id
      WHERE r.id <> ${resumeId}
      ORDER BY re.embedding <=> ${JSON.stringify(embedding)}::vector
      LIMIT ${limit}
    `;

    // Filter by threshold and format results
    return results
      .filter(row => row.score >= threshold)
      .map(row => ({
        resumeId: row.resume_id,
        score: Number(row.score),
        candidateName: row.candidateName || undefined,
        fileName: row.fileName
      }));

  } catch (error) {
    console.error(`Error finding duplicates for resume ${resumeId}:`, error);
    return [];
  }
}

export async function getResumeEmbedding(resumeId: number): Promise<number[] | null> {
  try {
    const result = await prisma.$queryRaw<{embedding: any}[]>`
      SELECT embedding 
      FROM resume_embeddings 
      WHERE resume_id = ${resumeId}
      ORDER BY updated_at DESC 
      LIMIT 1
    `;

    if (result.length === 0) {
      return null;
    }

    return result[0].embedding;
  } catch (error) {
    console.error(`Error getting embedding for resume ${resumeId}:`, error);
    return null;
  }
}

export async function findResumesWithoutEmbeddings(limit: number = 50): Promise<number[]> {
  try {
    const results = await prisma.$queryRaw<{id: number}[]>`
      SELECT r.id 
      FROM "Resume" r
      LEFT JOIN resume_embeddings re ON r.id = re.resume_id
      WHERE re.resume_id IS NULL 
        AND (r."rawText" IS NOT NULL AND r."rawText" <> '' 
             OR r."parsedText" IS NOT NULL AND r."parsedText" <> '')
      ORDER BY r."createdAt" DESC
      LIMIT ${limit}
    `;

    return results.map(r => r.id);
  } catch (error) {
    console.error('Error finding resumes without embeddings:', error);
    return [];
  }
}

export async function findResumesWithStaleEmbeddings(limit: number = 50): Promise<number[]> {
  try {
    // Find resumes where the content hash doesn't match current content
    const results = await prisma.$queryRaw<{id: number}[]>`
      SELECT DISTINCT r.id
      FROM "Resume" r
      JOIN resume_embeddings re ON r.id = re.resume_id
      WHERE (r."rawText" IS NOT NULL AND r."rawText" <> '' 
             OR r."parsedText" IS NOT NULL AND r."parsedText" <> '')
      AND NOT EXISTS (
        SELECT 1 
        FROM resume_embeddings re2 
        WHERE re2.resume_id = r.id 
        AND re2.content_hash = encode(sha256(
          (COALESCE(r."rawText", r."parsedText", ''))::bytea
        ), 'hex')
      )
      ORDER BY r."updatedAt" DESC
      LIMIT ${limit}
    `;

    return results.map(r => r.id);
  } catch (error) {
    console.error('Error finding resumes with stale embeddings:', error);
    return [];
  }
}