import { NextRequest, NextResponse } from 'next/server';
import { withTableAuthAppRouter } from '@/lib/auth/withTableAuthAppRouter';
import { generateJobProfilePreview } from '@/lib/ai/jobProfileService';

const handler = async (req: NextRequest) => {
  if (req.method !== 'POST') {
    return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const body = await req.json();

    const hasDescription =
      typeof body?.description === 'string' && body.description.trim().length > 0;
    const hasRequirements =
      typeof body?.requirements === 'string' && body.requirements.trim().length > 0;

    if (!hasDescription && !hasRequirements) {
      return NextResponse.json(
        { error: 'Provide a description or requirements so AI has context.' },
        { status: 400 }
      );
    }

    const profile = await generateJobProfilePreview({
      title: typeof body.title === 'string' ? body.title : '',
      description: body.description,
      requirements: body.requirements,
      companyName: typeof body.companyName === 'string' ? body.companyName : '',
      employmentType: body.employmentType,
      location: body.location
    });

    if (!profile) {
      return NextResponse.json(
        {
          error: 'AI profile generation failed. Please ensure description or requirements are provided.'
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      message: 'AI job profile generated successfully.',
      aiJobProfile: profile,
      aiSummary: profile.summary
    });
  } catch (error) {
    console.error('Error generating AI job profile preview:', error);
    return NextResponse.json(
      { error: 'Failed to generate AI job profile' },
      { status: 500 }
    );
  }
};

export const POST = withTableAuthAppRouter('jobs', handler);
