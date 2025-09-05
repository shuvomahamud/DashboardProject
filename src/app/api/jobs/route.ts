import { NextRequest, NextResponse } from 'next/server';
import { withTableAuthAppRouter } from '@/lib/auth/withTableAuthAppRouter';
import prisma from '@/lib/prisma';

async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || '';
    const companyId = searchParams.get('companyId');

    const skip = (page - 1) * limit;

    const where: any = {};

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { location: { contains: search, mode: 'insensitive' } }
      ];
    }

    if (status) {
      where.status = status;
    }

    if (companyId) {
      where.companyId = parseInt(companyId);
    }

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where,
        include: {
          company: {
            select: { id: true, name: true }
          },
          _count: {
            select: { applications: true }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.job.count({ where })
    ]);

    return NextResponse.json({
      jobs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Error fetching jobs:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    const job = await prisma.job.create({
      data: {
        title: body.title,
        description: body.description,
        requirements: body.requirements,
        salaryMin: body.salaryMin ? parseFloat(body.salaryMin) : null,
        salaryMax: body.salaryMax ? parseFloat(body.salaryMax) : null,
        location: body.location,
        isRemote: body.isRemote || false,
        employmentType: body.employmentType,
        status: body.status || 'active',
        expiryDate: body.expiryDate ? new Date(body.expiryDate) : null,
        companyId: parseInt(body.companyId),
        aiExtractJson: body.aiExtractJson,
        aiSummary: body.aiSummary
      },
      include: {
        company: {
          select: { id: true, name: true }
        }
      }
    });

    // Trigger job embedding generation (fire-and-forget, non-blocking)
    if (process.env.OPENAI_API_KEY) {
      import('@/lib/ai/embedJob').then(({ upsertJobEmbedding }) => {
        upsertJobEmbedding(job.id).catch(embedError => {
          console.warn(`Non-blocking job embedding failed for job ${job.id}:`, embedError);
        });
      }).catch(importError => {
        console.warn(`Failed to import job embedding module:`, importError);
      });
    }

    return NextResponse.json(job, { status: 201 });

  } catch (error) {
    console.error('Error creating job:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Apply table-based authentication for 'jobs' table
export { withTableAuthAppRouter('jobs', GET) as GET };
export { withTableAuthAppRouter('jobs', POST) as POST };