import { PrismaClient } from '@prisma/client';
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

// Enhanced schema that includes all three scores
export const EnhancedResumeParseSchema = z.object({
  resume: z.object({
    candidate: z.object({
      name: z.string().nullable(),
      emails: z.array(z.string()),
      phones: z.array(z.string()),
      linkedinUrl: z.string().nullable(),
      currentLocation: z.string().nullable(),
      totalExperienceYears: z.number().min(0).max(80)
    }),
    skills: z.array(z.string()),
    education: z.array(z.object({
      degree: z.string(),
      institution: z.string().nullable(),
      year: z.string().nullable()
    })),
    employment: z.array(z.object({
      company: z.string(),
      title: z.string().nullable(),
      startDate: z.string().nullable(), // YYYY or YYYY-MM format
      endDate: z.string().nullable(), // YYYY or YYYY-MM or "Present"
      employmentType: z.string().nullable()
    })),
    notes: z.string().nullable()
  }),
  scores: z.object({
    matchScore: z.number().min(0).max(100),
    companyScore: z.number().min(0).max(100),
    fakeScore: z.number().min(0).max(100)
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

// System message for the LLM
const SYSTEM_MESSAGE = `You are an expert resume parser. **Return only minified JSON** that matches the schema provided.
• No markdown. No prose. No comments. No extra keys.
• Dates must be YYYY or YYYY-MM. Use "Present" for ongoing roles.
• If unknown, omit or use empty arrays.
• All three scores must be integers 0–100.
• Use only information in the job text and the resume text. **Do not invent facts.**
• If employer reputation is unclear, set companyScore to **~50** (±5).
• If risk indicators are absent, set fakeScore near **10** (low risk).
• If job fit is weak, set a low matchScore.
**Return JSON only.**`;

// User message template
function buildUserMessage(jobContext: JobContext, resumeText: string): string {
  return `Job Context
Title: ${jobContext.jobTitle}
Description (short):
"""
${jobContext.jobDescriptionShort}
"""

JSON Schema (shape reference; return exactly this object):
{
  "resume": {
    "candidate": {
      "name": "string?",
      "emails": ["string"],
      "phones": ["string"],
      "linkedinUrl": "string?",
      "currentLocation": "string?",
      "totalExperienceYears": 0
    },
    "skills": ["string"],
    "education": [
      {"degree": "string", "institution": "string?", "year": "string?"}
    ],
    "employment": [
      {"company": "string", "title": "string?", "startDate": "YYYY[-MM]?", "endDate": "YYYY[-MM]|Present?", "employmentType": "string?"}
    ],
    "notes": "string?"
  },
  "scores": {
    "matchScore": 0,
    "companyScore": 0,
    "fakeScore": 0
  },
  "summary": "string"
}

Scoring Rubrics
- matchScore (0–100): skills (45%), recent roles/titles vs job (25%), experience depth/years (20%), domain/context (10%).
- companyScore (0–100): evidence-only from resume:
  • Global/very well-known brand → 85–100
  • Publicly listed / large headcount / multi-region (if explicitly stated) → 70–85
  • Mid-market / notable startup → 55–70
  • Small/unknown/unclear → 35–55
  • Unverifiable/suspicious employer names → 0–35
  If unsure, set ~50 and do not invent.
- fakeScore (0–100, higher = riskier): raise for overlapping dates, impossible timelines/versions,
  many ultra-short stints, missing employer names, contradictory locations, OCR artifacts/buzzword stuffing.
  Map none/minor/moderate/severe ≈ 10/35/65/90 (then clamp 0–100).

Resume (redacted)
"""
${resumeText}
"""

Return only minified JSON.`;
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
    const validated = EnhancedResumeParseSchema.parse(rawData);
    
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

    // Update JobApplication with matchScore (for all applications of this resume)
    const jobApplications = await prisma.jobApplication.findMany({
      where: { resumeId },
      select: { id: true }
    });

    if (jobApplications.length > 0) {
      await Promise.all(
        jobApplications.map(app =>
          prisma.jobApplication.update({
            where: { id: app.id },
            data: { matchScore: validatedData.scores.matchScore }
          })
        )
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