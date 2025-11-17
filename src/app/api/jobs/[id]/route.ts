import { NextRequest, NextResponse } from 'next/server';
import { withTableAuthAppRouter } from '@/lib/auth/withTableAuthAppRouter';
import prisma from '@/lib/prisma';
import { refreshJobProfile, parseJobProfile, JobProfileSchema, sanitizeProfile, JobProfile } from '@/lib/ai/jobProfileService';
import { parseSkillRequirementConfig } from '@/lib/ai/skillRequirements';
import { resolveExperiencePayload } from '@/lib/jobs/experience';

export const dynamic = 'force-dynamic';

type SearchMode = 'deep-scan' | 'graph-search' | null;

const extractSearchMode = (meta: unknown): SearchMode => {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
    return null;
  }
  const mode = (meta as Record<string, unknown>).searchMode;
  return mode === 'deep-scan' || mode === 'graph-search' ? mode : null;
};

async function GET(req: NextRequest) {
  try {
    // Extract params from URL path
    const url = new URL(req.url);
    const pathSegments = url.pathname.split('/');
    const jobId = parseInt(pathSegments[pathSegments.length - 1]);
    
    if (isNaN(jobId)) {
      return NextResponse.json({ error: 'Invalid job ID' }, { status: 400 });
    }

    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: {
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

    const normalizedMandatorySkills = parseSkillRequirementConfig(job.mandatorySkillRequirements).map(
      item => item.skill
    );

    const importRuns = await prisma.import_email_runs.findMany({
      where: { job_id: jobId },
      orderBy: { created_at: 'desc' },
      take: 20,
      select: {
        id: true,
        mailbox: true,
        search_text: true,
        max_emails: true,
        status: true,
        created_at: true,
        started_at: true,
        finished_at: true,
        meta: true
      }
    });

    return NextResponse.json({
      ...job,
      mandatorySkillRequirements: normalizedMandatorySkills,
      aiJobProfile: parseJobProfile(job.aiJobProfileJson),
      importRuns: importRuns.map(run => {
        const searchMode = extractSearchMode(run.meta);
        return {
          id: run.id,
          mailbox: run.mailbox,
          searchText: run.search_text,
          maxEmails: run.max_emails,
          status: run.status,
          createdAt: run.created_at,
          startedAt: run.started_at,
          finishedAt: run.finished_at,
          highVolume: searchMode === 'deep-scan',
          searchMode
        };
      })
    });

  } catch (error) {
    console.error('Error fetching job:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function PUT(req: NextRequest) {
  try {
    // Extract params from URL path
    const url = new URL(req.url);
    const pathSegments = url.pathname.split('/');
    const jobId = parseInt(pathSegments[pathSegments.length - 1]);
    
    if (isNaN(jobId)) {
      return NextResponse.json({ error: 'Invalid job ID' }, { status: 400 });
    }

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
    
    const updateData: any = {
      title: body.title,
      description: body.description,
      requirements: body.requirements,
      salaryMin,
      salaryMax,
      location: body.location,
      isRemote: body.isRemote,
      employmentType: body.employmentType,
      status: body.status,
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
      updateData.aiJobProfileJson = JSON.stringify(manualProfile);
      updateData.aiJobProfileUpdatedAt = new Date();
      updateData.aiJobProfileVersion = manualProfile.version;
      updateData.aiSummary = manualProfile.summary;
    }

    const mandatorySkillRequirements = parseSkillRequirementConfig(body.mandatorySkillRequirements).map(
      item => item.skill
    );
    updateData.mandatorySkillRequirements =
      mandatorySkillRequirements.length > 0 ? mandatorySkillRequirements : null;

    const job = await prisma.job.update({
      where: { id: jobId },
      data: updateData
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
        console.warn(`Job profile regeneration failed for job ${job.id}`, profileError);
      }
    }

    // Trigger job embedding update (fire-and-forget, non-blocking)
    if (process.env.OPENAI_API_KEY) {
      import('@/lib/ai/embedJob').then(({ upsertJobEmbedding }) => {
        upsertJobEmbedding(job.id).catch(embedError => {
          console.warn(`Non-blocking job embedding failed for job ${job.id}:`, embedError);
        });
      }).catch(importError => {
        console.warn(`Failed to import job embedding module:`, importError);
      });
    }

    return NextResponse.json({
      ...refreshedJob,
      aiJobProfile: profile ?? parseJobProfile(refreshedJob.aiJobProfileJson)
    });

  } catch (error) {
    console.error('Error updating job:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function DELETE(req: NextRequest) {
  try {
    // Extract params from URL path
    const url = new URL(req.url);
    const pathSegments = url.pathname.split('/');
    const jobId = parseInt(pathSegments[pathSegments.length - 1]);
    
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
const protectedGET = withTableAuthAppRouter('jobs', GET);
const protectedPUT = withTableAuthAppRouter('jobs', PUT);
const protectedDELETE = withTableAuthAppRouter('jobs', DELETE);
export { protectedGET as GET, protectedPUT as PUT, protectedDELETE as DELETE };
