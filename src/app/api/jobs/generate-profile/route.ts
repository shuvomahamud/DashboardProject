import { NextRequest, NextResponse } from 'next/server';
import { withTableAuthAppRouter } from '@/lib/auth/withTableAuthAppRouter';
import { generateJobProfilePreview } from '@/lib/ai/jobProfileService';

const REQUIRED_FIELDS = ['title', 'companyName'] as const;

const handler = async (req: NextRequest) => {
  if (req.method !== 'POST') {
    return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const body = await req.json();

    for (const field of REQUIRED_FIELDS) {
      if (!body?.[field] || typeof body[field] !== 'string' || !body[field].trim()) {
        return NextResponse.json(
          { error: `${field} is required to run AI profile generation` },
          { status: 400 }
        );
      }
    }

    const profile = await generateJobProfilePreview({
      title: body.title,
      description: body.description,
      requirements: body.requirements,
      companyName: body.companyName,
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
