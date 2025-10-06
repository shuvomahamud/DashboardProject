import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withTableAuthAppRouter } from '@/lib/auth/withTableAuthAppRouter';
import { parseAndPersistResume, findUnparsedResumes, getParsingStats } from '@/lib/ai/parseResume';
import { getBudgetStatus } from '@/lib/ai/openaiClient';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow up to 60s for batch parsing (up to 50 resumes)

const RequestSchema = z.object({
  limit: z.number().int().min(1).max(50).optional().default(10)
});

interface BatchResult {
  resumeId: number;
  success: boolean;
  candidateName?: string;
  error?: string;
  tokensUsed?: number;
}

async function handler(req: NextRequest): Promise<NextResponse> {
  if (req.method !== 'POST') {
    return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    // Validate request body
    const body = await req.json().catch(() => ({}));
    const { limit } = RequestSchema.parse(body);

    // Get current budget status
    const budgetStatus = getBudgetStatus();
    if (budgetStatus.remaining <= 0) {
      return NextResponse.json({
        error: 'Daily AI token budget exceeded',
        budget: budgetStatus
      }, { status: 429 });
    }

    console.log(`Starting batch parse for up to ${limit} resumes`);

    // Find unparsed resumes
    const unparsedResumes = await findUnparsedResumes(limit);
    
    if (unparsedResumes.length === 0) {
      return NextResponse.json({
        message: 'No unparsed resumes found',
        attempted: 0,
        succeeded: 0,
        failed: 0,
        results: [],
        stats: await getParsingStats(),
        budget: getBudgetStatus()
      });
    }

    console.log(`Found ${unparsedResumes.length} unparsed resumes to process`);

    const results: BatchResult[] = [];
    let succeeded = 0;
    let failed = 0;
    let totalTokensUsed = 0;

    // Process each resume
    for (const resume of unparsedResumes) {
      console.log(`Processing resume ${resume.id}: ${resume.originalName}`);
      
      try {
        // Check budget before each parse
        const currentBudget = getBudgetStatus();
        if (currentBudget.remaining <= 100) { // Reserve some tokens
          console.log('Approaching budget limit, stopping batch processing');
          results.push({
            resumeId: resume.id,
            success: false,
            error: 'Budget limit reached during batch processing'
          });
          failed++;
          break;
        }

        const result = await parseAndPersistResume(resume.id);
        
        if (result.ok) {
          results.push({
            resumeId: resume.id,
            success: true,
            candidateName: result.summary.candidateName || undefined,
            tokensUsed: result.summary.tokensUsed
          });
          succeeded++;
          
          if (result.summary.tokensUsed) {
            totalTokensUsed += result.summary.tokensUsed;
          }
        } else {
          results.push({
            resumeId: resume.id,
            success: false,
            error: result.error
          });
          failed++;
        }

        // Small delay between requests to avoid overwhelming the API
        if (unparsedResumes.length > 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }

      } catch (error) {
        console.error(`Error processing resume ${resume.id}:`, error);
        results.push({
          resumeId: resume.id,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        failed++;
      }
    }

    console.log(`Batch processing complete: ${succeeded} succeeded, ${failed} failed, ${totalTokensUsed} tokens used`);

    return NextResponse.json({
      message: `Batch processing complete: ${succeeded}/${unparsedResumes.length} succeeded`,
      attempted: unparsedResumes.length,
      succeeded,
      failed,
      totalTokensUsed,
      results,
      stats: await getParsingStats(),
      budget: getBudgetStatus()
    });

  } catch (error) {
    console.error('Batch parse API error:', error);
    
    // Handle Zod validation errors
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        error: 'Invalid request body',
        details: error.errors
      }, { status: 400 });
    }

    return NextResponse.json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

export const POST = withTableAuthAppRouter('resumes', handler);