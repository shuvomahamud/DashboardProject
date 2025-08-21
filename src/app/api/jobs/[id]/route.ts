import { NextRequest, NextResponse } from 'next/server';
import { withTableAuthAppRouter } from '@/lib/auth/withTableAuthAppRouter';
import prisma from '@/lib/prisma';

async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const jobId = parseInt(params.id);
    
    if (isNaN(jobId)) {
      return NextResponse.json({ error: 'Invalid job ID' }, { status: 400 });
    }

    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: {
        company: true,
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

async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const jobId = parseInt(params.id);
    
    if (isNaN(jobId)) {
      return NextResponse.json({ error: 'Invalid job ID' }, { status: 400 });
    }

    const body = await req.json();
    
    const job = await prisma.job.update({
      where: { id: jobId },
      data: {
        title: body.title,
        description: body.description,
        requirements: body.requirements,
        salaryMin: body.salaryMin ? parseFloat(body.salaryMin) : null,
        salaryMax: body.salaryMax ? parseFloat(body.salaryMax) : null,
        location: body.location,
        isRemote: body.isRemote,
        employmentType: body.employmentType,
        status: body.status,
        expiryDate: body.expiryDate ? new Date(body.expiryDate) : null,
        aiExtractJson: body.aiExtractJson,
        aiSummary: body.aiSummary
      },
      include: {
        company: {
          select: { id: true, name: true }
        }
      }
    });

    return NextResponse.json(job);

  } catch (error) {
    console.error('Error updating job:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const jobId = parseInt(params.id);
    
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
export { withTableAuthAppRouter('jobs', GET) as GET };
export { withTableAuthAppRouter('jobs', PUT) as PUT };
export { withTableAuthAppRouter('jobs', DELETE) as DELETE };