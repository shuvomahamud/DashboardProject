import { NextRequest, NextResponse } from 'next/server';
import { withTableAuthAppRouter } from '@/lib/auth/withTableAuthAppRouter';
import {
  upsertJobEmbedding,
  findJobsWithoutEmbeddings,
  findJobsWithStaleEmbeddings
} from '@/lib/ai/embedJob';

export const dynamic = 'force-dynamic';

interface BatchEmbedResult {
  processed: number;
  succeeded: number;
  failed: number;
  errors: string[];
  details?: {
    jobId: number;
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

    let jobIds: number[] = [];
    
    // Find jobs that need embedding
    const missingEmbeddings = await findJobsWithoutEmbeddings(limit);
    jobIds.push(...missingEmbeddings);
    
    if (includeStale && jobIds.length < limit) {
      const staleEmbeddings = await findJobsWithStaleEmbeddings(limit - jobIds.length);
      jobIds.push(...staleEmbeddings);
    }

    if (jobIds.length === 0) {
      return NextResponse.json({
        processed: 0,
        succeeded: 0,
        failed: 0,
        errors: [],
        message: 'No jobs found that need embedding'
      } as BatchEmbedResult);
    }

    const result: BatchEmbedResult = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      errors: [],
      details: includeDetails ? [] : undefined
    };

    // Process each job
    for (const jobId of jobIds) {
      result.processed++;
      
      try {
        const embedResult = await upsertJobEmbedding(jobId);
        
        if (embedResult.ok) {
          result.succeeded++;
          if (includeDetails) {
            result.details!.push({
              jobId,
              success: true,
              reason: embedResult.reason
            });
          }
        } else {
          result.failed++;
          const errorMsg = `Job ${jobId}: ${embedResult.reason}`;
          result.errors.push(errorMsg);
          
          if (includeDetails) {
            result.details!.push({
              jobId,
              success: false,
              reason: embedResult.reason
            });
          }
        }
      } catch (error) {
        result.failed++;
        const errorMsg = `Job ${jobId}: ${error instanceof Error ? error.message : String(error)}`;
        result.errors.push(errorMsg);
        
        if (includeDetails) {
          result.details!.push({
            jobId,
            success: false,
            reason: 'exception'
          });
        }
      }
    }

    return NextResponse.json(result);

  } catch (error) {
    console.error('Error in batch job embedding:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

// Apply table-based authentication for 'jobs' table
const protectedPOST = withTableAuthAppRouter('jobs', POST);
export { protectedPOST as POST };