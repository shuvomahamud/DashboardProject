import { NextRequest, NextResponse } from 'next/server';
import { withTableAuthAppRouter } from '@/lib/auth/withTableAuthAppRouter';
import prisma from '@/lib/prisma';
import { findNearDuplicateResumes, DuplicateMatch } from '@/lib/ai/embedResume';

interface DuplicatesResponse {
  resumeId: number;
  threshold: number;
  limit: number;
  results: DuplicateMatch[];
  resume?: {
    originalName: string;
    fileName: string;
  };
}

async function GET(req: NextRequest) {
  try {
    // Extract resume ID from URL pathname
    const pathname = req.nextUrl.pathname;
    const resumeIdStr = pathname.split('/')[3]; // /api/resumes/[id]/duplicates
    const resumeId = parseInt(resumeIdStr);
    
    if (isNaN(resumeId)) {
      return NextResponse.json({ error: 'Invalid resume ID' }, { status: 400 });
    }

    // Parse query parameters
    const url = new URL(req.url);
    const threshold = parseFloat(
      url.searchParams.get('threshold') || 
      process.env.SEMANTIC_DUP_THRESHOLD || 
      '0.92'
    );
    const limit = parseInt(url.searchParams.get('limit') || '50');

    if (threshold < 0 || threshold > 1) {
      return NextResponse.json({ 
        error: 'threshold must be between 0 and 1' 
      }, { status: 400 });
    }

    if (limit <= 0 || limit > 500) {
      return NextResponse.json({ 
        error: 'limit must be between 1 and 500' 
      }, { status: 400 });
    }

    // Verify resume exists and get basic info
    const resume = await prisma.resume.findUnique({
      where: { id: resumeId },
      select: {
        id: true,
        originalName: true,
        fileName: true
      }
    });

    if (!resume) {
      return NextResponse.json({ error: 'Resume not found' }, { status: 404 });
    }

    // Find near-duplicate resumes
    const duplicates = await findNearDuplicateResumes(resumeId, threshold, limit);

    const response: DuplicatesResponse = {
      resumeId,
      threshold,
      limit,
      results: duplicates,
      resume: {
        originalName: resume.originalName,
        fileName: resume.fileName
      }
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('Error in resume duplicates API:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

// Apply table-based authentication for 'resumes' table
const protectedGET = withTableAuthAppRouter('resumes', GET);
export { protectedGET as GET };