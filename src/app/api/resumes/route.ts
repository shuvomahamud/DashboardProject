import { NextRequest, NextResponse } from 'next/server';
import { withTableAuthAppRouter } from '@/lib/auth/withTableAuthAppRouter';
import prisma from '@/lib/prisma';
import { embedText } from '@/lib/ai/embeddings';

export const dynamic = 'force-dynamic';

async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 100); // Cap at 100
    const search = searchParams.get('search') || searchParams.get('q') || '';
    const semantic = searchParams.get('semantic') === '1';
    const uploadedBy = searchParams.get('uploadedBy');

    const skip = (page - 1) * limit;

    // If semantic search is requested and we have a query
    if (semantic && search && process.env.OPENAI_API_KEY) {
      try {
        // Generate embedding for the search query
        const queryEmbedding = await embedText(search);
        const embeddingString = JSON.stringify(queryEmbedding);

        // Perform semantic search
        let semanticResults;
        if (uploadedBy) {
          semanticResults = await prisma.$queryRaw<{
            id: number;
            fileName: string;
            originalName: string;
            fileSize: number;
            mimeType: string;
            uploadedBy: string | null;
            skills: string | null;
            experience: string | null;
            education: string | null;
            createdAt: Date;
            updatedAt: Date;
            semanticScore: number;
          }[]>`
            SELECT 
              r.id,
              r."fileName",
              r."originalName", 
              r."fileSize",
              r."mimeType",
              r."uploadedBy",
              r.skills,
              r.experience,
              r.education,
              r."createdAt",
              r."updatedAt",
              (1 - (re.embedding <=> ${embeddingString}::vector)) as "semanticScore"
            FROM resume_embeddings re
            JOIN "Resume" r ON r.id = re.resume_id
            WHERE r."uploadedBy" = ${uploadedBy}
            ORDER BY re.embedding <=> ${embeddingString}::vector
            LIMIT ${limit}
            OFFSET ${skip}
          `;
        } else {
          semanticResults = await prisma.$queryRaw<{
            id: number;
            fileName: string;
            originalName: string;
            fileSize: number;
            mimeType: string;
            uploadedBy: string | null;
            skills: string | null;
            experience: string | null;
            education: string | null;
            createdAt: Date;
            updatedAt: Date;
            semanticScore: number;
          }[]>`
            SELECT 
              r.id,
              r."fileName",
              r."originalName", 
              r."fileSize",
              r."mimeType",
              r."uploadedBy",
              r.skills,
              r.experience,
              r.education,
              r."createdAt",
              r."updatedAt",
              (1 - (re.embedding <=> ${embeddingString}::vector)) as "semanticScore"
            FROM resume_embeddings re
            JOIN "Resume" r ON r.id = re.resume_id
            ORDER BY re.embedding <=> ${embeddingString}::vector
            LIMIT ${limit}
            OFFSET ${skip}
          `;
        }

        // Get application counts separately for semantic results
        const resumeIds = semanticResults.map(r => r.id);
        const applicationCounts = await prisma.jobApplication.groupBy({
          by: ['resumeId'],
          where: { resumeId: { in: resumeIds } },
          _count: { resumeId: true }
        });

        const countsMap = new Map(
          applicationCounts.map(ac => [ac.resumeId, ac._count.resumeId])
        );

        const resumesWithCounts = semanticResults.map(resume => ({
          ...resume,
          semanticScore: Number(resume.semanticScore),
          _count: {
            applications: countsMap.get(resume.id) || 0
          }
        }));

        // For semantic search, we can't easily get total count without running expensive query
        // So we'll estimate based on whether we got fewer results than requested
        const estimatedTotal = semanticResults.length < limit ? 
          skip + semanticResults.length : 
          skip + semanticResults.length + 1; // +1 to indicate "more available"

        return NextResponse.json({
          resumes: resumesWithCounts,
          semantic: true,
          query: search,
          pagination: {
            page,
            limit,
            total: estimatedTotal,
            pages: Math.ceil(estimatedTotal / limit)
          }
        });

      } catch (semanticError) {
        console.error('Semantic search failed, falling back to text search:', semanticError);
        // Fall through to regular search if semantic fails
      }
    }

    // Regular (non-semantic) search
    const where: any = {};

    if (search) {
      where.OR = [
        { originalName: { contains: search, mode: 'insensitive' } },
        { fileName: { contains: search, mode: 'insensitive' } },
        { skills: { contains: search, mode: 'insensitive' } },
        { experience: { contains: search, mode: 'insensitive' } },
        { parsedText: { contains: search, mode: 'insensitive' } },
        { rawText: { contains: search, mode: 'insensitive' } }
      ];
    }

    if (uploadedBy) {
      where.uploadedBy = uploadedBy;
    }

    const [resumes, total] = await Promise.all([
      prisma.resume.findMany({
        where,
        select: {
          id: true,
          fileName: true,
          originalName: true,
          fileSize: true,
          mimeType: true,
          uploadedBy: true,
          skills: true,
          experience: true,
          education: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: { applications: true }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.resume.count({ where })
    ]);

    return NextResponse.json({
      resumes,
      semantic: false,
      query: search || undefined,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Error fetching resumes:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    const resume = await prisma.resume.create({
      data: {
        fileName: body.fileName,
        originalName: body.originalName,
        fileSize: parseInt(body.fileSize),
        mimeType: body.mimeType,
        storagePath: body.storagePath,
        uploadedBy: body.uploadedBy,
        parsedText: body.parsedText,
        skills: body.skills,
        experience: body.experience,
        education: body.education,
        contactInfo: body.contactInfo,
        aiExtractJson: body.aiExtractJson,
        aiSummary: body.aiSummary
      }
    });

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

    return NextResponse.json(resume, { status: 201 });

  } catch (error) {
    console.error('Error creating resume:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Apply table-based authentication for 'resumes' table
const protectedGET = withTableAuthAppRouter('resumes', GET);
const protectedPOST = withTableAuthAppRouter('resumes', POST);
export { protectedGET as GET, protectedPOST as POST };