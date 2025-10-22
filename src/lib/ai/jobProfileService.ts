import { z } from 'zod';
import prisma from '@/lib/prisma';
import { getOpenAIClient } from './openaiClient';

export const JOB_PROFILE_VERSION = 'v1';

const stringArray = z
  .union([z.array(z.string()), z.string()])
  .transform(value => {
    const list = Array.isArray(value) ? value : (value ? [value] : []);
    return list
      .map(item => item.trim())
      .filter(item => item.length > 0)
      .slice(0, 20);
  })
  .default([]);

const nullableString = z
  .union([z.string(), z.null()])
  .transform(value => {
    const trimmed = typeof value === 'string' ? value.trim() : null;
    return trimmed && trimmed.length > 0 ? trimmed : null;
  })
  .optional()
  .default(null);

const numberOrNull = z
  .union([z.number(), z.string(), z.null()])
  .transform(value => {
    if (value === null || value === undefined) {
      return null;
    }
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : null;
  })
  .optional()
  .default(null);

export const JobProfileSchema = z.object({
  version: z.string().default(JOB_PROFILE_VERSION),
  summary: z
    .string()
    .transform(value => value.trim())
    .refine(value => value.length <= 600, 'summary must be ≤ 600 characters')
    .default(''),
  mustHaveSkills: stringArray,
  niceToHaveSkills: stringArray,
  softSkills: stringArray,
  targetTitles: stringArray,
  responsibilities: stringArray,
  requiredExperienceYears: numberOrNull,
  preferredExperienceYears: numberOrNull,
  domainKeywords: stringArray,
  certifications: stringArray,
  locationConstraints: nullableString,
  disqualifiers: stringArray,
  toolsAndTech: stringArray
});

export type JobProfile = z.infer<typeof JobProfileSchema>;

export function parseJobProfile(json: string | null | undefined): JobProfile | null {
  if (!json) {
    return null;
  }
  try {
    const data = JSON.parse(json);
    const validated = JobProfileSchema.safeParse(data);
    if (!validated.success) {
      console.warn('[job-profile] stored profile failed validation', validated.error.issues);
      return null;
    }
    return sanitizeProfile(validated.data);
  } catch (error) {
    console.warn('[job-profile] failed to parse stored profile json', error);
    return null;
  }
}

export async function refreshJobProfile(jobId: number): Promise<JobProfile | null> {
  try {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        title: true,
        description: true,
        requirements: true,
        companyName: true,
        employmentType: true,
        location: true
      }
    });

    if (!job) {
      console.warn('[job-profile] job not found for refresh', { jobId });
      return null;
    }

    return generateAndStoreJobProfile(job);
  } catch (error) {
    console.error('[job-profile] refresh failed', { jobId, error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

export async function generateAndStoreJobProfile(job: {
  id: number;
  title: string;
  description: string | null;
  requirements?: string | null;
  companyName?: string | null;
  employmentType?: string | null;
  location?: string | null;
}): Promise<JobProfile | null> {
  if (!process.env.OPENAI_API_KEY) {
    console.info('[job-profile] OPENAI_API_KEY missing, skipping profile generation');
    return null;
  }

  const cleanDescription = (job.description || '').trim();
  const cleanRequirements = (job.requirements || '').trim();

  if (!cleanDescription && !cleanRequirements) {
    console.warn('[job-profile] job missing description and requirements, skipping', { jobId: job.id });
    return null;
  }

  try {
    const profile = await extractJobProfile({
      title: job.title,
      description: cleanDescription,
      requirements: cleanRequirements,
      companyName: job.companyName || null,
      employmentType: job.employmentType || null,
      location: job.location || null
    });

    await prisma.job.update({
      where: { id: job.id },
      data: {
        aiJobProfileJson: JSON.stringify(profile),
        aiJobProfileUpdatedAt: new Date(),
        aiJobProfileVersion: profile.version
      }
    });

    console.info('[job-profile] profile updated', { jobId: job.id });
    return profile;
  } catch (error) {
    console.error('[job-profile] generation failed', {
      jobId: job.id,
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

async function extractJobProfile(input: {
  title: string;
  description: string;
  requirements: string;
  companyName: string | null;
  employmentType: string | null;
  location: string | null;
}): Promise<JobProfile> {
  const client = getOpenAIClient();
  const model = process.env.OPENAI_JOB_PROFILE_MODEL || process.env.OPENAI_RESUME_MODEL || 'gpt-4o-mini';
  const temperature = Number(process.env.OPENAI_JOB_PROFILE_TEMPERATURE || 0.1);

  const segments = [
    `ROLE TITLE: ${input.title}`,
    input.companyName ? `COMPANY: ${input.companyName}` : null,
    input.employmentType ? `EMPLOYMENT TYPE: ${input.employmentType}` : null,
    input.location ? `LOCATION: ${input.location}` : null,
    input.description ? `JOB DESCRIPTION:\n${input.description}` : null,
    input.requirements ? `REQUIREMENTS:\n${input.requirements}` : null
  ].filter(Boolean);

  const jobText = segments.join('\n\n').slice(0, 12_000);

  const systemMessage = `You are a senior technical recruiter. Extract structured hiring criteria from the job posting.
Respond with minified JSON matching the schema below. Use concise wording.

{
  "version": "${JOB_PROFILE_VERSION}",
  "summary": "<=400 chars overview for LLM context",
  "mustHaveSkills": ["skill"],
  "niceToHaveSkills": ["skill"],
  "softSkills": ["skill"],
  "targetTitles": ["role title"],
  "responsibilities": ["brief responsibility"],
  "requiredExperienceYears": null,
  "preferredExperienceYears": null,
  "domainKeywords": ["industry or product context"],
  "certifications": ["certification"],
  "locationConstraints": "string|null",
  "disqualifiers": ["factor that disqualifies"],
  "toolsAndTech": ["tools, platforms, frameworks"]
}

Rules:
- Prefer bullet essentials; keep arrays <=12 items.
- Years should be integers; use null if unclear.
- Disqualifiers include clearance, visa, location, shift, etc.
- Summary must paraphrase requirements, not the posting verbatim.`;

  const userMessage = `Job posting:\n<<<JOB_POSTING\n${jobText}\nJOB_POSTING`;

  const response = await client.chat.completions.create({
    model,
    temperature,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemMessage },
      { role: 'user', content: userMessage }
    ],
    max_tokens: 1500
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('Empty response from OpenAI while generating job profile');
  }

  const parsed = JSON.parse(content);
  const validation = JobProfileSchema.safeParse(parsed);

  if (!validation.success) {
    throw new Error(`Job profile schema validation failed: ${validation.error.message}`);
  }

  return sanitizeProfile(validation.data);
}

export function sanitizeProfile(profile: JobProfile): JobProfile {
  return {
    version: JOB_PROFILE_VERSION,
    summary: profile.summary.slice(0, 600),
    mustHaveSkills: dedupeList(profile.mustHaveSkills),
    niceToHaveSkills: dedupeList(profile.niceToHaveSkills),
    softSkills: dedupeList(profile.softSkills),
    targetTitles: dedupeList(profile.targetTitles),
    responsibilities: dedupeList(profile.responsibilities),
    requiredExperienceYears: profile.requiredExperienceYears,
    preferredExperienceYears: profile.preferredExperienceYears,
    domainKeywords: dedupeList(profile.domainKeywords),
    certifications: dedupeList(profile.certifications),
    locationConstraints: profile.locationConstraints,
    disqualifiers: dedupeList(profile.disqualifiers),
    toolsAndTech: dedupeList(profile.toolsAndTech)
  };
}

function dedupeList(list: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of list) {
    const key = item.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
    if (result.length >= 12) {
      break;
    }
  }
  return result;
}
