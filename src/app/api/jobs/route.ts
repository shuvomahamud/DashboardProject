import { NextRequest, NextResponse } from 'next/server';
import { withTableAuthAppRouter } from '@/lib/auth/withTableAuthAppRouter';
import prisma from '@/lib/prisma';
import { refreshJobProfile, parseJobProfile, JobProfileSchema, sanitizeProfile, JobProfile } from '@/lib/ai/jobProfileService';
import { parseSkillRequirementConfig } from '@/lib/ai/skillRequirements';
import { resolveExperiencePayload } from '@/lib/jobs/experience';

export const dynamic = 'force-dynamic';

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

    const jobsWithProfile = jobs.map(job => ({
      ...job,
      aiJobProfile: parseJobProfile(job.aiJobProfileJson)
    }));

    return NextResponse.json({
      jobs: jobsWithProfile,
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

    let experienceFields: {
      requiredExperienceYears: number;
      preferredExperienceMinYears: number | null;
      preferredExperienceMaxYears: number | null;
    };
    try {
      experienceFields = resolveExperiencePayload(body);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid experience requirements.';
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const jobData: any = {
      title: body.title,
      description: body.description,
      requirements: body.requirements,
      salaryMin,
      salaryMax,
      location: body.location,
      isRemote: body.isRemote || false,
      employmentType: body.employmentType,
      status: body.status || 'active',
      expiryDate: body.expiryDate ? new Date(body.expiryDate) : null,
      companyName: body.companyName,
      requiredExperienceYears: experienceFields.requiredExperienceYears,
      preferredExperienceMinYears: experienceFields.preferredExperienceMinYears,
      preferredExperienceMaxYears: experienceFields.preferredExperienceMaxYears,
      aiExtractJson: body.aiExtractJson,
      aiSummary: body.aiSummary
    };

    let manualProfile: JobProfile | null = null;
    if (body.aiJobProfile) {
      const parsedProfile = JobProfileSchema.safeParse(body.aiJobProfile);
      if (!parsedProfile.success) {
        return NextResponse.json(
          { error: parsedProfile.error.message },
          { status: 400 }
        );
      }
      manualProfile = sanitizeProfile(parsedProfile.data);
      jobData.aiJobProfileJson = JSON.stringify(manualProfile);
      jobData.aiJobProfileUpdatedAt = new Date();
      jobData.aiJobProfileVersion = manualProfile.version;
      jobData.aiSummary = manualProfile.summary;
    }

    const mandatorySkillRequirements = parseSkillRequirementConfig(body.mandatorySkillRequirements).map(
      item => item.skill
    );
    jobData.mandatorySkillRequirements =
      mandatorySkillRequirements.length > 0 ? mandatorySkillRequirements : null;

    const job = await prisma.job.create({
      data: jobData
    });

    let refreshedJob = job;
    let profile = manualProfile;
    if (!manualProfile) {
      try {
        profile = await refreshJobProfile(job.id);
        if (profile) {
          refreshedJob = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
        }
      } catch (profileError) {
        console.warn(`Job profile generation failed for job ${job.id}`, profileError);
      }
    }

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

    return NextResponse.json(
      {
        ...refreshedJob,
        aiJobProfile: profile ?? parseJobProfile(refreshedJob.aiJobProfileJson)
      },
      { status: 201 }
    );

  } catch (error) {
    console.error('Error creating job:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Apply table-based authentication for 'jobs' table
const protectedGET = withTableAuthAppRouter('jobs', GET);
const protectedPOST = withTableAuthAppRouter('jobs', POST);
export { protectedGET as GET, protectedPOST as POST };
