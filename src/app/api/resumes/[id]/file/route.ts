import { NextRequest, NextResponse } from 'next/server';
import { withTableAuthAppRouter } from '@/lib/auth/withTableAuthAppRouter';
import prisma from '@/lib/prisma';
import { createSignedUrl, getPublicUrl } from '@/lib/supabase-server';

async function GET(req: NextRequest) {
  try {
    // Extract id from URL pathname
    const pathname = req.nextUrl.pathname;
    const id = pathname.split('/')[3]; // /api/resumes/[id]/file
    const resumeId = parseInt(id);
    
    if (isNaN(resumeId)) {
      return NextResponse.json({ error: 'Invalid resume ID' }, { status: 400 });
    }

    // Fetch resume from database
    const resume = await prisma.resume.findUnique({
      where: { id: resumeId },
      select: {
        id: true,
        fileName: true,
        originalName: true,
        storagePath: true,
        fileStorageUrl: true,
        mimeType: true,
        fileSize: true,
        fileSizeBytes: true
      }
    });

    if (!resume) {
      return NextResponse.json({ error: 'Resume not found' }, { status: 404 });
    }

    // Use fileStorageUrl if available (Phase 2), otherwise fall back to storagePath (Phase 1)
    const pathToUse = resume.fileStorageUrl || resume.storagePath;
    
    if (!pathToUse) {
      return NextResponse.json({ error: 'Resume file not available' }, { status: 404 });
    }

    const bucketName = process.env.SUPABASE_RESUME_BUCKET || process.env.SUPABASE_RESUMES_BUCKET || 'resumes';
    const isPrivateBucket = process.env.SUPABASE_PUBLIC_URL_BASE ? false : true;

    let fileUrl: string;

    if (isPrivateBucket) {
      // Create signed URL for private bucket (60 seconds TTL)
      try {
        fileUrl = await createSignedUrl(bucketName, pathToUse, 60);
      } catch (error) {
        console.error('Error creating signed URL:', error);
        return NextResponse.json({ error: 'Failed to generate file access URL' }, { status: 500 });
      }
    } else {
      // Get public URL for public bucket
      fileUrl = getPublicUrl(bucketName, pathToUse);
    }

    return NextResponse.json({
      url: fileUrl,
      fileName: resume.originalName,
      mimeType: resume.mimeType,
      fileSize: resume.fileSizeBytes || resume.fileSize,
      expiresIn: isPrivateBucket ? 60 : null
    });

  } catch (error) {
    console.error('Error fetching resume file:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Apply table-based authentication for 'resumes' table
const protectedGET = withTableAuthAppRouter('resumes', GET);
export { protectedGET as GET };