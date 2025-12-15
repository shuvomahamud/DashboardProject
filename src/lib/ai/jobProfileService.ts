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
      .filter(item => item.length > 0);
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
  rewrittenJobDescription: z
    .string()
    .transform(value => value.trim())
    .default(''),
  rewrittenRequirements: stringArray.optional().default([]),
  mustHaveSkills: stringArray.optional().default([]),
  niceToHaveSkills: stringArray,
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
  const model = process.env.OPENAI_JOB_PROFILE_MODEL || 'gpt-5.1';
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

  const systemMessage = `You are a senior technical recruiter. Build a JobContext optimized for resume keyword matching and scoring. We match resume keywords to the job’s extracted keyword lists; completeness, correctness, and consistent keyword forms directly affect the score.

SCORING CONTEXT (for priority):
- Mandatory Skills contribute the largest share (up to 70 points, split evenly). Missing/empty mandatory list makes this bucket 0.
- Profile dimensions share 15 points: nice-to-have skills, target job titles, tools & technologies, responsibilities, domain keywords. Each scores by match ratio; only dimensions with items are active.
- Experience alignment contributes points only if required years are provided; missing years make this bucket 0. Ranges can add preferred-range credit.
- Disqualifiers apply a penalty only if explicitly listed and detected.
Goal: maximize must-have keyword coverage and keep categories cleanly separated for reliable matching.

INPUT:
- A job description/requirements blob (title/company may be blank). Use only what is provided; do not invent details.

OUTPUT (STRICT, MINIFIED JSON ONLY):
{"version":"${JOB_PROFILE_VERSION}","rewrittenJobDescription":"concise, modern rewrite; 'unknown' if absent","rewrittenRequirements":["clear bullet"],"summary":"<=600 chars factual paraphrase of role + key requirements","mustHaveSkills":["mandatory keyword"],"niceToHaveSkills":["optional keyword"],"targetTitles":["role title"],"responsibilities":["action/outcome phrase"],"toolsAndTech":["tech/tool/platform"],"domainKeywords":["industry/sector/business area"],"certifications":["certification"],"disqualifiers":["explicit constraint"],"requiredExperienceYears":null,"preferredExperienceYears":null,"locationConstraints":null}

RULES:
- Use only provided text; if not stated, use null or empty arrays. Never fabricate.
- Arrays: concise, deduped, resume-detectable keywords. No long sentences. No “not specified.”
- Normalize keywords: consistent casing and common resume forms (e.g., “REST API” not “restful apis”).
- mustHaveSkills: the mandatory master list. Include ALL required/enforceable items, including required technologies/tools/platforms. Optimized for keyword matching.
- niceToHaveSkills: optional/preferred only. Must NOT overlap with mustHaveSkills.
- toolsAndTech: concrete technologies/tools/platforms (languages, frameworks, libraries, DBs, CI/CD, IDEs, cloud). Overlap with mustHaveSkills is allowed when a tech is required. toolsAndTech must NOT overlap with niceToHaveSkills, targetTitles, responsibilities, or domainKeywords.
- targetTitles: job titles only. No overlap with niceToHaveSkills, toolsAndTech, responsibilities, or domainKeywords. May overlap mustHaveSkills only if the JD explicitly requires a title.
- responsibilities: action/outcome phrases (verbs + object). No tech/tool names. No overlap with other non-mandatory lists.
- domainKeywords: sectors/industries/business areas (e.g., public sector, healthcare, finance, permitting, inspections, parks operations, revenue tracking). Do NOT include system names, agencies, or product names. No overlap with other non-mandatory lists.
- certifications: only explicit certifications.
- disqualifiers: only explicit constraints (clearance, visa/work authorization, onsite requirement, shift, background check, location restrictions).
- experience: extract integer years if stated. For ranges like “5–7 years”, set requiredExperienceYears=5 and preferredExperienceYears=7. If absent, null.
- locationConstraints: only if explicit; else null.
- rewrittenJobDescription / rewrittenRequirements: if no usable content, use "unknown" and ["unknown"].
- summary: <=600 chars, factual, no fluff.

FORMAT:
- Respond with minified JSON ONLY (single compact object), no Markdown, no prose.`;

  const userMessage = `Job posting:\n<<<JOB_POSTING\n${jobText}\nJOB_POSTING`;

  const response = await client.chat.completions.create({
    model,
    temperature,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemMessage },
      { role: 'user', content: userMessage }
    ],
    // gpt-5.1 uses max_completion_tokens instead of max_tokens
    max_completion_tokens: 1500
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
    rewrittenJobDescription: profile.rewrittenJobDescription || '',
    rewrittenRequirements: dedupeList(profile.rewrittenRequirements),
    summary: profile.summary.slice(0, 600),
    mustHaveSkills: dedupeList(profile.mustHaveSkills),
    niceToHaveSkills: dedupeList(profile.niceToHaveSkills),
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
  }
  return result;
}

export async function generateJobProfilePreview(input: {
  title: string;
  description?: string | null;
  requirements?: string | null;
  companyName?: string | null;
  employmentType?: string | null;
  location?: string | null;
}): Promise<JobProfile | null> {
  if (!process.env.OPENAI_API_KEY) {
    console.info('[job-profile] OPENAI_API_KEY missing, skipping preview generation');
    return null;
  }

  const cleanDescription = (input.description || '').trim();
  const cleanRequirements = (input.requirements || '').trim();

  if (!cleanDescription && !cleanRequirements) {
    console.warn('[job-profile] preview: missing description and requirements, skipping');
    return null;
  }

  try {
    const profile = await extractJobProfile({
      title: input.title,
      description: cleanDescription,
      requirements: cleanRequirements,
      companyName: input.companyName || null,
      employmentType: input.employmentType || null,
      location: input.location || null
    });
    return profile;
  } catch (error) {
    console.error('[job-profile] preview generation failed', {
      title: input.title,
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}
