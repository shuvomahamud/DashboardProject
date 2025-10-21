import { NextRequest, NextResponse } from 'next/server';
import { withTableAuthAppRouter } from '@/lib/auth/withTableAuthAppRouter';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const resumeId = parseInt(params.id);
    
    if (isNaN(resumeId)) {
      return NextResponse.json({ error: 'Invalid resume ID' }, { status: 400 });
    }

    const resume = await prisma.resume.findUnique({
      where: { id: resumeId },
      include: {
        applications: {
          include: {
            job: {
              select: {
                id: true,
                title: true,
                company: {
                  select: {
                    id: true,
                    name: true
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!resume) {
      return NextResponse.json({ error: 'Resume not found' }, { status: 404 });
    }

    return NextResponse.json(resume);

  } catch (error) {
    console.error('Error fetching resume:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const resumeId = parseInt(params.id);
    
    if (isNaN(resumeId)) {
      return NextResponse.json({ error: 'Invalid resume ID' }, { status: 400 });
    }

    const body = await req.json();

    const updateData: any = {};
    const scalarFields = [
      'fileName',
      'originalName',
      'parsedText',
      'skills',
      'experience',
      'education',
      'contactInfo',
      'aiExtractJson',
      'aiSummary',
      'candidateName',
      'email',
      'phone',
      'companies',
      'sourceFrom'
    ];

    scalarFields.forEach(field => {
      if (Object.prototype.hasOwnProperty.call(body, field)) {
        updateData[field] = body[field];
      }
    });

    if (Object.prototype.hasOwnProperty.call(body, 'employmentHistoryJson')) {
      const value = body.employmentHistoryJson;
      if (value === null || value === '') {
        updateData.employmentHistoryJson = null;
      } else if (typeof value === 'string') {
        try {
          JSON.parse(value);
        } catch {
          return NextResponse.json(
            { error: 'employmentHistoryJson must be valid JSON' },
            { status: 400 }
          );
        }
        updateData.employmentHistoryJson = value;
      } else {
        return NextResponse.json(
          { error: 'employmentHistoryJson must be a JSON string or null' },
          { status: 400 }
        );
      }
    }

    if (Object.prototype.hasOwnProperty.call(body, 'totalExperienceY')) {
      const val = body.totalExperienceY;
      updateData.totalExperienceY =
        val === null || val === '' ? null : Number(val);
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No valid fields provided' }, { status: 400 });
    }

    const resume = await prisma.resume.update({
      where: { id: resumeId },
      data: updateData
    });

    return NextResponse.json(resume);

  } catch (error) {
    console.error('Error updating resume:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const resumeId = parseInt(params.id);
    
    if (isNaN(resumeId)) {
      return NextResponse.json({ error: 'Invalid resume ID' }, { status: 400 });
    }

    await prisma.resume.delete({
      where: { id: resumeId }
    });

    return NextResponse.json({ message: 'Resume deleted successfully' });

  } catch (error) {
    console.error('Error deleting resume:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Apply table-based authentication for 'resumes' table
export const GET_AUTHENTICATED = withTableAuthAppRouter('resumes', GET);
export const PUT_AUTHENTICATED = withTableAuthAppRouter('resumes', PUT);
export const DELETE_AUTHENTICATED = withTableAuthAppRouter('resumes', DELETE);

export { GET_AUTHENTICATED as GET, PUT_AUTHENTICATED as PUT, DELETE_AUTHENTICATED as DELETE };
