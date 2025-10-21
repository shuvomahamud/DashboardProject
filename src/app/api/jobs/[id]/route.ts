import { NextRequest, NextResponse } from 'next/server';
import { withTableAuthAppRouter } from '@/lib/auth/withTableAuthAppRouter';
import prisma from '@/lib/prisma';
import { refreshJobProfile } from '@/lib/ai/jobProfileService';

export const dynamic = 'force-dynamic';

async function GET(req: NextRequest) {
  try {
    // Extract params from URL path
    const url = new URL(req.url);
    const pathSegments = url.pathname.split('/');
    const jobId = parseInt(pathSegments[pathSegments.length - 1]);
    
    if (isNaN(jobId)) {
      return NextResponse.json({ error: 'Invalid job ID' }, { status: 400 });
    }

    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: {
        applications: {
          include: {
            resume: {
              select: {
                id: true,
                fileName: true,
                originalName: true,
                createdAt: true
              }
            }
          }
        }
      }
    });

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    return NextResponse.json(job);

  } catch (error) {
    console.error('Error fetching job:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function PUT(req: NextRequest) {
  try {
    // Extract params from URL path
    const url = new URL(req.url);
    const pathSegments = url.pathname.split('/');
    const jobId = parseInt(pathSegments[pathSegments.length - 1]);
    
    if (isNaN(jobId)) {
      return NextResponse.json({ error: 'Invalid job ID' }, { status: 400 });
    }

    const body = await req.json();
    
    // Validate salary values to fit database constraints (max 999.99 for Decimal(5,2))
    let salaryMin = null;
    let salaryMax = null;
    
    if (body.salaryMin) {
      const minVal = parseFloat(body.salaryMin);
      if (minVal > 999.99) {
        return NextResponse.json({ 
          error: 'Minimum salary cannot exceed 999.99. Please adjust the salary range or contact admin to update database constraints.' 
        }, { status: 400 });
      }
      salaryMin = minVal;
    }
    
    if (body.salaryMax) {
      const maxVal = parseFloat(body.salaryMax);
      if (maxVal > 999.99) {
        return NextResponse.json({ 
          error: 'Maximum salary cannot exceed 999.99. Please adjust the salary range or contact admin to update database constraints.' 
        }, { status: 400 });
      }
      salaryMax = maxVal;
    }
    
    const job = await prisma.job.update({
      where: { id: jobId },
      data: {
        title: body.title,
        description: body.description,
        requirements: body.requirements,
        salaryMin,
        salaryMax,
        location: body.location,
        isRemote: body.isRemote,
        employmentType: body.employmentType,
        status: body.status,
        expiryDate: body.expiryDate ? new Date(body.expiryDate) : null,
        companyName: body.companyName,
        aiExtractJson: body.aiExtractJson,
        aiSummary: body.aiSummary
      }
    });

    const profilePromise = refreshJobProfile(job.id).catch(profileError => {
      console.warn(`Job profile regeneration failed for job ${job.id}`, profileError);
    });
    if (typeof req.waitUntil === 'function') {
      req.waitUntil(profilePromise);
    } else {
      void profilePromise;
    }

    // Trigger job embedding update (fire-and-forget, non-blocking)
    if (process.env.OPENAI_API_KEY) {
      import('@/lib/ai/embedJob').then(({ upsertJobEmbedding }) => {
        upsertJobEmbedding(job.id).catch(embedError => {
          console.warn(`Non-blocking job embedding failed for job ${job.id}:`, embedError);
        });
      }).catch(importError => {
        console.warn(`Failed to import job embedding module:`, importError);
      });
    }

    return NextResponse.json(job);

  } catch (error) {
    console.error('Error updating job:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function DELETE(req: NextRequest) {
  try {
    // Extract params from URL path
    const url = new URL(req.url);
    const pathSegments = url.pathname.split('/');
    const jobId = parseInt(pathSegments[pathSegments.length - 1]);
    
    if (isNaN(jobId)) {
      return NextResponse.json({ error: 'Invalid job ID' }, { status: 400 });
    }

    await prisma.job.delete({
      where: { id: jobId }
    });

    return NextResponse.json({ message: 'Job deleted successfully' });

  } catch (error) {
    console.error('Error deleting job:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Apply table-based authentication for 'jobs' table
const protectedGET = withTableAuthAppRouter('jobs', GET);
const protectedPUT = withTableAuthAppRouter('jobs', PUT);
const protectedDELETE = withTableAuthAppRouter('jobs', DELETE);
export { protectedGET as GET, protectedPUT as PUT, protectedDELETE as DELETE };
