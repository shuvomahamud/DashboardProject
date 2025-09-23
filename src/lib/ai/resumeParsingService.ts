import { PrismaClient, Prisma } from '@prisma/client';
import OpenAI from 'openai';
import * as crypto from 'crypto';
import { z } from 'zod';

const prisma = new PrismaClient();

let openai: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is missing or empty');
    }
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openai;
}

// Helpers for hardened schema
const stringOrNull = z.union([z.string(), z.null()]).optional();
const number0to100 = z.coerce.number().min(0).max(100);
const number0to80 = z.coerce.number().min(0).max(80);

// Arrays may sometimes come as a single string; accept both & normalize to array
const stringArray = z.union([z.array(z.string()), z.string()])
  .transform(v => Array.isArray(v) ? v : (v ? [v] : []))
  .default([]);

// Enhanced schema that includes all three scores with hardened validation
export const EnhancedResumeParseSchema = z.object({
  resume: z.object({
    candidate: z.object({
      name: stringOrNull,
      emails: stringArray,
      phones: stringArray,
      linkedinUrl: stringOrNull,        // now optional|nullable
      currentLocation: stringOrNull,    // now optional|nullable
      totalExperienceYears: number0to80
    }),
    skills: stringArray,
    education: z.array(z.object({
      degree: z.string(),
      institution: stringOrNull,
      year: stringOrNull
    })).default([]),
    employment: z.array(z.object({
      company: z.string(),
      title: stringOrNull,
      startDate: stringOrNull,          // "YYYY", "YYYY-MM", or null
      endDate: stringOrNull,            // "YYYY", "YYYY-MM", "Present" (we'll normalize), or null
      employmentType: stringOrNull
    })).default([]),
    notes: stringOrNull
  }),
  scores: z.object({
    matchScore: number0to100,
    companyScore: number0to100,
    fakeScore: number0to100
  }),
  summary: z.string()
});

export type EnhancedParsedResume = z.infer<typeof EnhancedResumeParseSchema>;

interface JobContext {
  jobTitle: string;
  jobDescriptionShort: string;
}

interface ParseResult {
  success: boolean;
  data?: EnhancedParsedResume;
  error?: string;
  tokensUsed?: number;
}

interface ParseSummary {
  resumeId: number;
  candidateName: string | null;
  emailsCount: number;
  skillsCount: number;
  companiesCount: number;
  matchScore: number;
  companyScore: number;
  fakeScore: number;
  tokensUsed?: number;
}

// Privacy redaction function for sensitive data
function redactSensitiveData(text: string): string {
  if (!text) return text;
  
  let redacted = text;
  
  // SSN-like patterns
  redacted = redacted.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '***-**-****');
  
  // Credit card-like patterns
  redacted = redacted.replace(/\b(?:\d[ -]?){13,16}\b/g, '************');
  
  // Optional DOB patterns (MM/DD/YYYY or similar)
  redacted = redacted.replace(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/g, '**/**/****');
  
  return redacted;
}

// Generate text hash for idempotency
function generateTextHash(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

// Pre-sanitizer to fix bad scalar shapes before Zod validation
function fixScalar<T extends Record<string, any>>(obj: T, key: keyof T) {
  const v = obj[key];
  if (v === undefined) return; // let optional stay missing
  if (v === null) return;
  if (typeof v === 'string') {
    obj[key] = v.trim() === '' ? null : v;
    return;
  }
  obj[key] = null; // arrays, objects, booleans, numbers -> null
}

function coerceSummary(raw: any) {
  // If model nested it by mistake, lift it
  if (raw?.summary === undefined && raw?.resume?.summary !== undefined) {
    raw.summary = raw.resume.summary;
    delete raw.resume.summary;
  }

  const s = raw?.summary;

  if (Array.isArray(s)) {
    raw.summary = s.filter(Boolean).join(' ').trim();
  } else if (s == null) {
    raw.summary = '';
  } else if (typeof s === 'object') {
    // Handle object cases - try to extract meaningful text
    raw.summary = s.text || s.description || s.summary || JSON.stringify(s);
  } else if (typeof s !== 'string') {
    raw.summary = String(s);
  }

  // Build a safe fallback if empty after coercion
  if (!raw.summary || !raw.summary.trim()) {
    const c = raw?.resume?.candidate ?? {};
    const title = raw?.resume?.employment?.[0]?.title || 'Professional';
    const name = c.name || 'Candidate';
    const years = typeof c.totalExperienceYears === 'number' ? `${c.totalExperienceYears}y` : '';
    const skills = Array.isArray(raw?.resume?.skills) ? raw.resume.skills.slice(0,3).join('/') : '';
    raw.summary = [name, '—', title, years ? `(${years})` : '', skills ? `, ${skills}` : '']
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Trim to UX budget
  raw.summary = raw.summary.slice(0, 140);
}

function sanitizeModelOutput(raw: any) {
  try {
    if (raw?.resume?.candidate) {
      const c = raw.resume.candidate;
      ['name', 'linkedinUrl', 'currentLocation'].forEach(k => fixScalar(c as any, k as any));
    }
    if (Array.isArray(raw?.resume?.employment)) {
      raw.resume.employment.forEach((e: any) => {
        ['title', 'startDate', 'endDate', 'employmentType'].forEach(k => fixScalar(e, k));
        if (e?.endDate === 'Present') e.endDate = null;
      });
    }
    if (Array.isArray(raw?.resume?.education)) {
      raw.resume.education.forEach((e: any) => {
        ['institution', 'year'].forEach(k => fixScalar(e, k));
      });
    }
    // Fix notes field
    if (raw?.resume) {
      fixScalar(raw.resume, 'notes');
    }

    // NEW: normalize summary last
    coerceSummary(raw);

    // Clamp scores before schema validation
    if (raw?.scores) {
      const scores = raw.scores;
      if (typeof scores.matchScore === 'number') {
        scores.matchScore = Math.max(0, Math.min(100, scores.matchScore));
      }
      if (typeof scores.companyScore === 'number') {
        scores.companyScore = Math.max(0, Math.min(100, scores.companyScore));
      }
      if (typeof scores.fakeScore === 'number') {
        scores.fakeScore = Math.max(0, Math.min(100, scores.fakeScore));
      }
    }
  } catch {
    // Silently handle any sanitization errors
  }
  return raw;
}

// Enhanced system message with numbered hard rules
const SYSTEM_MESSAGE = `You are an expert resume parser. Return **only minified JSON** that matches the schema below.
**Hard requirements (follow all):**

1. **Output:** JSON only. No prose, markdown, comments, or extra keys.
2. **Root object keys**: exactly \`resume\`, \`scores\`, \`summary\`. No others.
3. **Scalars policy:** For these scalar fields —
   \`resume.candidate.name\`, \`resume.candidate.linkedinUrl\`, \`resume.candidate.currentLocation\`,
   \`resume.employment[i].title\`, \`resume.employment[i].startDate\`, \`resume.employment[i].endDate\`, \`resume.employment[i].employmentType\`,
   — **always include the key**. If unknown, set to **null**. **Never** use arrays, objects, or empty strings.
4. **Dates:** \`YYYY\` or \`YYYY-MM\`. Use \`"Present"\` only inside the model, but **output** \`null\` for ongoing roles.
5. **Arrays policy:** \`emails\`, \`phones\`, \`skills\`, \`education\`, \`employment\` are arrays; if none, use \`[]\`.
6. **Scores:** \`matchScore\`, \`companyScore\`, \`fakeScore\` are integers **0–100**.
7. **Summary:** \`summary\` must be a **single string** at the root, ≤140 chars. Never null/array/object. If unsure, use \`""\`.
8. **Grounding:** Use only the job text and resume text. Do **not** invent facts. If company reputation is unclear, set \`companyScore\` to about **50**.
9. **Length budget:** Keep values concise; avoid repeating large text.

**WRONG examples (do not do):**

* \`"linkedinUrl": []\` (should be \`null\`)
* \`"summary": ["Senior .NET dev", "React"]\` (should be \`"Senior .NET dev"\`)

**Return JSON only.**`;

// Enhanced user message template with proper fencing and structure
function buildUserMessage(jobContext: JobContext, resumeText: string): string {
  return `JOB CONTEXT
Title: ${jobContext.jobTitle}

Description:
<<<JOB_DESCRIPTION
${jobContext.jobDescriptionShort}
JOB_DESCRIPTION

SCHEMA (return exactly this object; no extra keys):
{
  "resume": {
    "candidate": {
      "name": "string|null",
      "emails": ["string"],
      "phones": ["string"],
      "linkedinUrl": "string|null",
      "currentLocation": "string|null",
      "totalExperienceYears": 0
    },
    "skills": ["string"],
    "education": [
      {"degree": "string", "institution": "string|null", "year": "string|null"}
    ],
    "employment": [
      {"company": "string", "title": "string|null", "startDate": "YYYY[-MM]|null", "endDate": "YYYY[-MM]|null", "employmentType": "string|null"}
    ],
    "notes": "string|null"
  },
  "scores": {
    "matchScore": 0,
    "companyScore": 0,
    "fakeScore": 0
  },
  "summary": "string"
}

SCORING RUBRICS
- matchScore (0–100): skills(45), role/title fit(25), years(20), domain/context(10).
- companyScore (0–100): evidence-only in resume; if unclear, ~50.
- fakeScore (0–100): overlaps/impossibilities/ultra-short stints/contradictions/OCR artifacts → higher risk.

RESUME (redacted):
<<<RESUME_TEXT
${resumeText}
RESUME_TEXT`;
}

// Main parsing function - single call to gpt-4o-mini with no fallback
async function callOpenAIForParsing(jobContext: JobContext, redactedText: string): Promise<ParseResult> {
  try {
    const model = process.env.OPENAI_RESUME_MODEL || 'gpt-4o-mini';
    const temperature = Number(process.env.OPENAI_TEMPERATURE || 0.1);

    const openaiClient = getOpenAIClient();
    const completion = await openaiClient.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content: SYSTEM_MESSAGE
        },
        {
          role: 'user',
          content: buildUserMessage(jobContext, redactedText)
        }
      ],
      response_format: { type: 'json_object' },
      temperature
      // No max_tokens override - let the API default handle it
    });

    const response = completion.choices[0]?.message?.content;
    if (!response) {
      return {
        success: false,
        error: 'No response from OpenAI'
      };
    }

    // Parse JSON response
    let parsedData;
    try {
      parsedData = JSON.parse(response);
    } catch (parseError) {
      return {
        success: false,
        error: 'Invalid JSON response from OpenAI'
      };
    }

    // Debug logging for summary field type (dev only)
    if (process.env.NODE_ENV !== 'production') {
      const t = typeof parsedData?.summary;
      console.log('LLM summary typeof:', t, 'isArray:', Array.isArray(parsedData?.summary));
      if (parsedData?.resume?.summary !== undefined) {
        console.log('Found nested summary under resume.summary:', typeof parsedData.resume.summary);
      }
    }

    return {
      success: true,
      data: parsedData,
      tokensUsed: completion.usage?.total_tokens || 0
    };

  } catch (error) {
    console.error('OpenAI API error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown OpenAI API error'
    };
  }
}

// Validate and process parsed data
function validateAndProcess(rawData: any): { valid: boolean; data?: EnhancedParsedResume; error?: string } {
  try {
    // First sanitize the model output
    const sanitized = sanitizeModelOutput(rawData);

    // Then validate with hardened schema
    const validated = EnhancedResumeParseSchema.parse(sanitized);
    
    // Clamp scores to 0-100 range
    validated.scores.matchScore = Math.max(0, Math.min(100, Math.round(validated.scores.matchScore)));
    validated.scores.companyScore = Math.max(0, Math.min(100, Math.round(validated.scores.companyScore)));
    validated.scores.fakeScore = Math.max(0, Math.min(100, Math.round(validated.scores.fakeScore)));
    
    // Clamp total experience years
    validated.resume.candidate.totalExperienceYears = Math.max(0, Math.min(80, validated.resume.candidate.totalExperienceYears));
    
    return { valid: true, data: validated };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Schema validation failed'
    };
  }
}

// Helper function to build application snapshot
function buildApplicationSnapshot(app: {
  id: number;
  jobId: number;
  resumeId: number;
  status: string | null;
  appliedDate: Date | null;
  updatedAt: Date | null;
  sourceFrom: string | null;
  originalName: string | null;
}, resumeSide: {
  candidateName: string | null;
  email: string | null;
  phone: string | null;
  skills: string | null; // csv string from Resume table
  totalExperienceY: number | null; // cast Decimal -> number in caller
  companyScore: number | null;     // cast Decimal -> number in caller
  fakeScore: number | null;        // cast Decimal -> number in caller
}, matchScore: number | null) {
  return {
    id: app.id,
    jobId: app.jobId,
    resumeId: app.resumeId,
    status: app.status ?? "submitted",
    notes: null,                // keep as null, user can edit separately
    updatedAt: app.updatedAt?.toISOString() ?? null,
    appliedDate: app.appliedDate?.toISOString() ?? null,
    candidateName: resumeSide.candidateName,
    email: resumeSide.email,
    phone: resumeSide.phone,
    aiMatch: matchScore,        // <- from jobApplication.matchScore
    aiCompany: resumeSide.companyScore, // <- from Resume.companyScore
    aiFake: resumeSide.fakeScore,       // <- from Resume.fakeScore
    originalName: app.originalName,
    sourceFrom: app.sourceFrom,
    skills: resumeSide.skills,  // csv as-is
    experience: resumeSide.totalExperienceY, // years numeric
    createdAt: null             // optional; set if you track it on JobApplication
  };
}

// Convert processed data to database fields for Resume
function toResumeDbFields(data: EnhancedParsedResume): Record<string, any> {
  const candidate = data.resume.candidate;
  const skills = data.resume.skills;
  const employment = data.resume.employment;
  
  // Process skills - lowercase, dedupe, sort, join as CSV
  const uniqueSkills = Array.from(new Set(skills.map(s => s.toLowerCase().trim()))).filter(Boolean).sort();
  const skillsCsv = uniqueSkills.join(', ');
  
  // Process employment dates - normalize to YYYY-MM where possible
  const normalizedEmployment = employment.map(emp => ({
    ...emp,
    endDate: emp.endDate === 'Present' ? null : emp.endDate
  }));
  
  // Extract companies
  const uniqueCompanies = Array.from(new Set(
    employment.map(emp => emp.company).filter(Boolean).map(c => c.trim())
  ));
  const companiesCsv = uniqueCompanies.join(', ');
  
  return {
    aiExtractJson: JSON.stringify(data),
    aiSummary: data.summary,
    candidateName: candidate.name,
    email: candidate.emails[0]?.toLowerCase() || null,
    phone: candidate.phones[0] || null,
    skills: skillsCsv || null,
    companies: companiesCsv || null,
    employmentHistoryJson: JSON.stringify(normalizedEmployment),
    totalExperienceY: candidate.totalExperienceYears,
    companyScore: data.scores.companyScore,
    fakeScore: data.scores.fakeScore,
    parsedAt: new Date(),
    textHash: null, // Will be set by caller
    promptVersion: process.env.PROMPT_VERSION || 'v1',
    parseModel: process.env.OPENAI_RESUME_MODEL || 'gpt-4o-mini',
    parseError: null
  };
}

// Check if resume needs parsing (idempotency)
async function needsParsing(resumeId: number, textHash: string): Promise<boolean> {
  try {
    const resume = await prisma.resume.findUnique({
      where: { id: resumeId },
      select: {
        textHash: true,
        promptVersion: true,
        parseModel: true,
        parsedAt: true
      }
    });
    
    if (!resume) return true;
    
    // Parse if any of these changed or if never parsed
    return (
      !resume.parsedAt ||
      resume.textHash !== textHash ||
      resume.promptVersion !== (process.env.PROMPT_VERSION || 'v1') ||
      resume.parseModel !== (process.env.OPENAI_RESUME_MODEL || 'gpt-4o-mini')
    );
  } catch (error) {
    console.error('Error checking if resume needs parsing:', error);
    return true; // Default to parsing on error
  }
}

// Main public function: Parse and score resume
export async function parseAndScoreResume(
  resumeId: number,
  jobContext: JobContext,
  force: boolean = false
): Promise<{ success: boolean; summary?: ParseSummary; error?: string }> {
  try {
    // Check if PARSE_ON_IMPORT is enabled
    if (!force && process.env.PARSE_ON_IMPORT !== 'true') {
      return {
        success: false,
        error: 'Resume parsing is disabled (PARSE_ON_IMPORT=false)'
      };
    }

    // Fetch resume
    const resume = await prisma.resume.findUnique({
      where: { id: resumeId },
      select: {
        id: true,
        rawText: true,
        fileName: true,
        applications: {
          select: { jobId: true }
        }
      }
    });

    if (!resume) {
      return {
        success: false,
        error: `Resume with ID ${resumeId} not found`
      };
    }

    if (!resume.rawText) {
      return {
        success: false,
        error: 'Resume has no rawText to parse'
      };
    }

    // Generate text hash for idempotency
    const textHash = generateTextHash(resume.rawText);
    
    // Check if parsing is needed (unless forced)
    if (!force && !(await needsParsing(resumeId, textHash))) {
      // Return existing data
      const existingResume = await prisma.resume.findUnique({
        where: { id: resumeId },
        select: {
          candidateName: true,
          email: true,
          skills: true,
          companyScore: true,
          fakeScore: true
        }
      });

      const existingApplication = await prisma.jobApplication.findFirst({
        where: { resumeId },
        select: { matchScore: true }
      });

      return {
        success: true,
        summary: {
          resumeId,
          candidateName: existingResume?.candidateName || null,
          emailsCount: existingResume?.email ? 1 : 0,
          skillsCount: existingResume?.skills ? existingResume.skills.split(',').length : 0,
          companiesCount: 0, // Could calculate from employmentHistoryJson if needed
          matchScore: existingApplication?.matchScore?.toNumber() || 0,
          companyScore: existingResume?.companyScore?.toNumber() || 0,
          fakeScore: existingResume?.fakeScore?.toNumber() || 0
        }
      };
    }

    console.log(`Parsing resume ${resumeId} (${resume.fileName})`);

    // Redact sensitive data
    const redactedText = redactSensitiveData(resume.rawText);

    // Call OpenAI for parsing
    const parseResult = await callOpenAIForParsing(jobContext, redactedText);

    if (!parseResult.success) {
      // Mark parse failure
      await prisma.resume.update({
        where: { id: resumeId },
        data: {
          parseError: parseResult.error,
          textHash,
          promptVersion: process.env.PROMPT_VERSION || 'v1',
          parseModel: process.env.OPENAI_RESUME_MODEL || 'gpt-4o-mini'
        }
      });

      console.error(`parse_fail resumeId=${resumeId} reason=${parseResult.error}`);
      return {
        success: false,
        error: parseResult.error
      };
    }

    // Validate and process the response
    const validation = validateAndProcess(parseResult.data!);
    
    if (!validation.valid) {
      // Mark schema validation failure
      await prisma.resume.update({
        where: { id: resumeId },
        data: {
          parseError: `schema: ${validation.error}`,
          textHash,
          promptVersion: process.env.PROMPT_VERSION || 'v1',
          parseModel: process.env.OPENAI_RESUME_MODEL || 'gpt-4o-mini'
        }
      });

      console.error(`parse_fail resumeId=${resumeId} reason=schema`);
      return {
        success: false,
        error: `Schema validation failed: ${validation.error}`
      };
    }

    const validatedData = validation.data!;

    // Prepare database updates
    const resumeFields = toResumeDbFields(validatedData);
    resumeFields.textHash = textHash;

    // Update Resume table
    await prisma.resume.update({
      where: { id: resumeId },
      data: resumeFields
    });

    // Update JobApplication with matchScore and aiExtractJson (for all applications of this resume)
    const jobApplications = await prisma.jobApplication.findMany({
      where: { resumeId },
      select: {
        id: true,
        jobId: true,
        resumeId: true,
        status: true,
        appliedDate: true,
        updatedAt: true,
        sourceFrom: true,
        originalName: true
      }
    });

    if (jobApplications.length > 0) {
      // Pull resume-side values once
      const resumeAfter = await prisma.resume.findUnique({
        where: { id: resumeId },
        select: {
          candidateName: true,
          email: true,
          phone: true,
          skills: true,
          totalExperienceY: true,
          companyScore: true,
          fakeScore: true
        }
      });

      // Helper to cast Decimals to numbers
      const toNumber = (x: any) => (x == null ? null : Number(x));

      // Update each application with matchScore and snapshot
      await Promise.all(
        jobApplications.map(async app => {
          const snapshot = buildApplicationSnapshot(
            app,
            {
              candidateName: resumeAfter?.candidateName ?? null,
              email: resumeAfter?.email ?? null,
              phone: resumeAfter?.phone ?? null,
              skills: resumeAfter?.skills ?? null,
              totalExperienceY: toNumber(resumeAfter?.totalExperienceY),
              companyScore: validatedData.scores.companyScore,
              fakeScore: toNumber(resumeAfter?.fakeScore)
            },
            validatedData.scores.matchScore
          );

          await prisma.jobApplication.update({
            where: { id: app.id },
            data: {
              matchScore: validatedData.scores.matchScore,
              aiCompanyScore: validatedData.scores.companyScore,
              aiExtractJson: snapshot as unknown as Prisma.InputJsonValue
            }
          });
        })
      );
    }

    // Build and return summary
    const summary: ParseSummary = {
      resumeId,
      candidateName: validatedData.resume.candidate.name,
      emailsCount: validatedData.resume.candidate.emails.length,
      skillsCount: validatedData.resume.skills.length,
      companiesCount: validatedData.resume.employment.length,
      matchScore: validatedData.scores.matchScore,
      companyScore: validatedData.scores.companyScore,
      fakeScore: validatedData.scores.fakeScore,
      tokensUsed: parseResult.tokensUsed
    };

    console.log(`parse_ok resumeId=${resumeId} model=${process.env.OPENAI_RESUME_MODEL || 'gpt-4o-mini'} ms=${Date.now()}`);

    return {
      success: true,
      summary
    };

  } catch (error) {
    console.error('Unexpected error in parseAndScoreResume:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

// Helper function to get parsing statistics
export async function getEnhancedParsingStats(): Promise<{
  total: number;
  parsed: number;
  unparsed: number;
  withScores: number;
  failed: number;
}> {
  try {
    const [total, parsed, withScores, failed] = await Promise.all([
      prisma.resume.count(),
      prisma.resume.count({
        where: {
          parsedAt: { not: null },
          parseError: null
        }
      }),
      prisma.resume.count({
        where: {
          companyScore: { not: null },
          fakeScore: { not: null }
        }
      }),
      prisma.resume.count({
        where: {
          parseError: { not: null }
        }
      })
    ]);

    return {
      total,
      parsed,
      unparsed: total - parsed - failed,
      withScores,
      failed
    };
  } catch (error) {
    console.error('Error getting enhanced parsing stats:', error);
    return { total: 0, parsed: 0, unparsed: 0, withScores: 0, failed: 0 };
  }
}