import { NextRequest, NextResponse } from 'next/server';
import { withTableAuthAppRouter } from '@/lib/auth/withTableAuthAppRouter';
import prisma from '@/lib/prisma';
import { refreshJobProfile, parseJobProfile } from '@/lib/ai/jobProfileService';

async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const segments = url.pathname.split('/').filter(Boolean);
    const jobIdSegment = segments[segments.length - 2];
    const jobId = parseInt(jobIdSegment, 10);

    if (!jobIdSegment || Number.isNaN(jobId)) {
      return NextResponse.json({ error: 'Invalid job ID' }, { status: 400 });
    }

    const jobExists = await prisma.job.findUnique({
      where: { id: jobId },
      select: { id: true, aiJobProfileJson: true }
    });

    if (!jobExists) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const profile = await refreshJobProfile(jobId);

    if (!profile) {
      const currentProfile = parseJobProfile(jobExists.aiJobProfileJson);
      return NextResponse.json(
        {
          message: 'AI profile could not be regenerated. Ensure the job has sufficient details and AI access is configured.',
          aiJobProfile: currentProfile
        },
        { status: 502 }
      );
    }

    await prisma.job.update({
      where: { id: jobId },
      data: { aiSummary: profile.summary }
    });

    return NextResponse.json({
      message: 'AI job profile refreshed successfully.',
      aiJobProfile: profile,
      aiSummary: profile.summary
    });
  } catch (error) {
    console.error('Error refreshing AI job profile:', error);
    return NextResponse.json({ error: 'Failed to refresh AI job profile' }, { status: 500 });
  }
}

const protectedPOST = withTableAuthAppRouter('jobs', POST);
export { protectedPOST as POST };
