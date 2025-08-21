import { NextRequest, NextResponse } from 'next/server';
import { withTableAuthAppRouter } from '@/lib/auth/withTableAuthAppRouter';
import prisma from '@/lib/prisma';

async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const search = searchParams.get('search') || '';
    const uploadedBy = searchParams.get('uploadedBy');

    const skip = (page - 1) * limit;

    const where: any = {};

    if (search) {
      where.OR = [
        { originalName: { contains: search, mode: 'insensitive' } },
        { fileName: { contains: search, mode: 'insensitive' } },
        { skills: { contains: search, mode: 'insensitive' } },
        { experience: { contains: search, mode: 'insensitive' } }
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

    return NextResponse.json(resume, { status: 201 });

  } catch (error) {
    console.error('Error creating resume:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Apply table-based authentication for 'resumes' table
export { withTableAuthAppRouter('resumes', GET) as GET };
export { withTableAuthAppRouter('resumes', POST) as POST };