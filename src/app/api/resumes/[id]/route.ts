import { NextRequest, NextResponse } from 'next/server';
import { withTableAuthAppRouter } from '@/lib/auth/withTableAuthAppRouter';
import prisma from '@/lib/prisma';

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
    
    const resume = await prisma.resume.update({
      where: { id: resumeId },
      data: {
        fileName: body.fileName,
        originalName: body.originalName,
        parsedText: body.parsedText,
        skills: body.skills,
        experience: body.experience,
        education: body.education,
        contactInfo: body.contactInfo,
        aiExtractJson: body.aiExtractJson,
        aiSummary: body.aiSummary
      }
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
export { withTableAuthAppRouter('resumes', GET) as GET };
export { withTableAuthAppRouter('resumes', PUT) as PUT };
export { withTableAuthAppRouter('resumes', DELETE) as DELETE };