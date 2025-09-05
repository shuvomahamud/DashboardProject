import { NextRequest, NextResponse } from 'next/server';
import { withTableAuthAppRouter } from '@/lib/auth/withTableAuthAppRouter';
import prisma from '@/lib/prisma';
import { upsertJobEmbedding, getJobEmbedding } from '@/lib/ai/embedJob';

interface CandidateMatch {
  resumeId: number;
  score: number;
  candidateName?: string;
  email?: string;
  fileName?: string;
  createdAt?: Date;
}

interface CandidatesResponse {
  jobId: number;
  k: number;
  minScore: number;
  results: CandidateMatch[];
  job?: {
    title: string;
    companyName?: string;
  };
}

async function GET(req: NextRequest) {
  try {
    // Extract job ID from URL pathname
    const pathname = req.nextUrl.pathname;
    const jobIdStr = pathname.split('/')[3]; // /api/jobs/[id]/candidates
    const jobId = parseInt(jobIdStr);
    
    if (isNaN(jobId)) {
      return NextResponse.json({ error: 'Invalid job ID' }, { status: 400 });
    }

    // Parse query parameters
    const url = new URL(req.url);
    const k = parseInt(url.searchParams.get('k') || process.env.SEMANTIC_TOP_K || '20');
    const minScore = parseFloat(url.searchParams.get('minScore') || '0');

    if (k <= 0 || k > 500) {
      return NextResponse.json({ error: 'k must be between 1 and 500' }, { status: 400 });
    }

    if (minScore < 0 || minScore > 1) {
      return NextResponse.json({ error: 'minScore must be between 0 and 1' }, { status: 400 });
    }

    // Verify job exists and get basic info
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        title: true,
        company: {
          select: {
            name: true
          }
        }
      }
    });

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Ensure job has an embedding (compute on demand)
    const embedResult = await upsertJobEmbedding(jobId);
    if (!embedResult.ok) {
      return NextResponse.json({ 
        error: 'Failed to create job embedding', 
        details: embedResult.reason 
      }, { status: 500 });
    }

    // Get the job embedding
    const jobEmbedding = await getJobEmbedding(jobId);
    if (!jobEmbedding) {
      return NextResponse.json({ 
        error: 'Job embedding not available' 
      }, { status: 500 });
    }

    // Find top-K similar resumes using cosine similarity
    const results = await prisma.$queryRaw<{
      resume_id: number;
      score: number;
      candidateName: string | null;
      email: string | null;
      fileName: string;
      createdAt: Date;
    }[]>`
      SELECT 
        r.id as resume_id,
        (1 - (re.embedding <=> ${JSON.stringify(jobEmbedding)}::vector)) as score,
        r."candidateName",
        r."email",
        r."fileName",
        r."createdAt"
      FROM resume_embeddings re
      JOIN "Resume" r ON r.id = re.resume_id
      WHERE (1 - (re.embedding <=> ${JSON.stringify(jobEmbedding)}::vector)) >= ${minScore}
      ORDER BY re.embedding <=> ${JSON.stringify(jobEmbedding)}::vector
      LIMIT ${k}
    `;

    // Format response
    const candidates: CandidateMatch[] = results.map(row => ({
      resumeId: row.resume_id,
      score: Number(row.score),
      candidateName: row.candidateName || undefined,
      email: row.email || undefined,
      fileName: row.fileName,
      createdAt: row.createdAt
    }));

    const response: CandidatesResponse = {
      jobId,
      k,
      minScore,
      results: candidates,
      job: {
        title: job.title,
        companyName: job.company?.name
      }
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('Error in job candidates API:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

// Apply table-based authentication for 'jobs' table
const protectedGET = withTableAuthAppRouter('jobs', GET);
export { protectedGET as GET };