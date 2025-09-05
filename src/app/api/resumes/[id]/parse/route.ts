import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withTableAuthAppRouter } from '@/lib/auth/withTableAuthAppRouter';
import { parseAndPersistResume } from '@/lib/ai/parseResume';
import { getBudgetStatus } from '@/lib/ai/openaiClient';

const RequestSchema = z.object({
  hints: z.object({
    jobTitle: z.string().optional()
  }).optional()
}).optional();

async function handler(req: NextRequest): Promise<NextResponse> {
  if (req.method !== 'POST') {
    return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    // Parse resume ID from URL
    const url = new URL(req.url);
    const resumeId = parseInt(url.pathname.split('/')[3]);
    
    if (!resumeId || isNaN(resumeId)) {
      return NextResponse.json({ error: 'Invalid resume ID' }, { status: 400 });
    }

    // Validate request body
    const body = await req.json().catch(() => ({}));
    const validatedBody = RequestSchema.parse(body);

    // Check if AI features are enabled
    if (process.env.AI_FEATURES !== 'on') {
      return NextResponse.json({ 
        error: 'AI features are currently disabled' 
      }, { status: 503 });
    }

    // Get current budget status
    const budgetStatus = getBudgetStatus();
    if (budgetStatus.remaining <= 0) {
      return NextResponse.json({
        error: 'Daily AI token budget exceeded',
        budget: budgetStatus
      }, { status: 429 });
    }

    console.log(`Starting AI parse for resume ${resumeId}`);

    // Parse and persist the resume
    const result = await parseAndPersistResume(resumeId, validatedBody);

    if (!result.ok) {
      const statusCode = 
        result.type === 'not_found' ? 404 :
        result.type === 'no_text' ? 400 :
        result.type === 'ai_error' ? 503 :
        result.type === 'validation' ? 422 :
        500; // database error

      return NextResponse.json({
        error: result.error,
        type: result.type
      }, { status: statusCode });
    }

    // Return success with summary
    return NextResponse.json({
      success: true,
      resumeId: result.summary.resumeId,
      summary: result.summary,
      budget: getBudgetStatus()
    });

  } catch (error) {
    console.error('Resume parse API error:', error);
    
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