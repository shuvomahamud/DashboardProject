import { NextRequest, NextResponse } from 'next/server';
import { withTableAuthAppRouter } from '@/lib/auth/withTableAuthAppRouter';
import { 
  upsertResumeEmbedding, 
  findResumesWithoutEmbeddings, 
  findResumesWithStaleEmbeddings 
} from '@/lib/ai/embedResume';

interface BatchEmbedResult {
  processed: number;
  succeeded: number;
  failed: number;
  errors: string[];
  details?: {
    resumeId: number;
    success: boolean;
    reason?: string;
  }[];
}

async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const limit = Math.min(parseInt(body.limit || '50'), 100); // Cap at 100 for safety
    const includeStale = body.includeStale !== false; // Default true
    const includeDetails = body.includeDetails === true; // Default false

    let resumeIds: number[] = [];
    
    // Find resumes that need embedding
    const missingEmbeddings = await findResumesWithoutEmbeddings(limit);
    resumeIds.push(...missingEmbeddings);
    
    if (includeStale && resumeIds.length < limit) {
      const staleEmbeddings = await findResumesWithStaleEmbeddings(limit - resumeIds.length);
      resumeIds.push(...staleEmbeddings);
    }

    if (resumeIds.length === 0) {
      return NextResponse.json({
        processed: 0,
        succeeded: 0,
        failed: 0,
        errors: [],
        message: 'No resumes found that need embedding'
      } as BatchEmbedResult);
    }

    const result: BatchEmbedResult = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      errors: [],
      details: includeDetails ? [] : undefined
    };

    // Process each resume
    for (const resumeId of resumeIds) {
      result.processed++;
      
      try {
        const embedResult = await upsertResumeEmbedding(resumeId);
        
        if (embedResult.ok) {
          result.succeeded++;
          if (includeDetails) {
            result.details!.push({
              resumeId,
              success: true,
              reason: embedResult.reason
            });
          }
        } else {
          result.failed++;
          const errorMsg = `Resume ${resumeId}: ${embedResult.reason}`;
          result.errors.push(errorMsg);
          
          if (includeDetails) {
            result.details!.push({
              resumeId,
              success: false,
              reason: embedResult.reason
            });
          }
        }
      } catch (error) {
        result.failed++;
        const errorMsg = `Resume ${resumeId}: ${error instanceof Error ? error.message : String(error)}`;
        result.errors.push(errorMsg);
        
        if (includeDetails) {
          result.details!.push({
            resumeId,
            success: false,
            reason: 'exception'
          });
        }
      }
    }

    return NextResponse.json(result);

  } catch (error) {
    console.error('Error in batch resume embedding:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

// Apply table-based authentication for 'resumes' table
const protectedPOST = withTableAuthAppRouter('resumes', POST);
export { protectedPOST as POST };