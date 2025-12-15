import { Prisma } from '@prisma/client';
import * as crypto from 'crypto';
import { z } from 'zod';
import prisma, { withRetry } from '../prisma';
import { getOpenAIClient } from './openaiClient';
import type { JobContext } from './jobContext';
import { getResumeParserPrompt } from './prompts/resumeParserPrompt';
import { computeProfileMatchScore } from './scoring/profileMatchScoring';
import type { MatchScoreDetails } from './scoring/profileMatchScoring';
import type { JobProfile } from './jobProfileService';
import {
  evaluateSkillRequirements,
  parseManualSkillAssessments,
  parseAiSkillExperience,
  normalizeSkillKey,
  type ManualSkillAssessment,
  type SkillExperienceEntry,
  type SkillRequirementEvaluationSummary
} from './skillRequirements';

type ResumeLogContext = Record<string, unknown>;

const RESUME_LOG_PREFIX = '[resume-parsing]';
const OPENAI_SLOW_THRESHOLD_MS = 12000;

const toPositiveInt = (value: string | undefined, fallback: number) => {
  if (!value) return fallback;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const DEFAULT_PARSE_TIMEOUT_MS = toPositiveInt(process.env.OPENAI_RESUME_TIMEOUT_MS, 20000);
const LONG_TEXT_CHAR_THRESHOLD = toPositiveInt(process.env.OPENAI_LONG_TEXT_THRESHOLD, 15000);
const LONG_TEXT_TIMEOUT_MS = toPositiveInt(process.env.OPENAI_LONG_TEXT_TIMEOUT_MS, 32000);
const MAX_PARSE_TIMEOUT_MS = toPositiveInt(process.env.OPENAI_RESUME_MAX_TIMEOUT_MS, 45000);
const TIMEOUT_RETRY_BACKOFF_MS = toPositiveInt(process.env.OPENAI_TIMEOUT_RETRY_BACKOFF_MS, 8000);
const SKILL_VERIFY_MODEL =
  process.env.OPENAI_SKILL_VERIFY_MODEL ||
  process.env.OPENAI_RESUME_MODEL ||
  'gpt-4o-mini';

const resumeLogInfo = (message: string, context?: ResumeLogContext) => {
  if (context) {
    console.info(`${RESUME_LOG_PREFIX} ${message}`, context);
  } else {
    console.info(`${RESUME_LOG_PREFIX} ${message}`);
  }
};

const resumeLogWarn = (message: string, context?: ResumeLogContext) => {
  if (context) {
    console.warn(`${RESUME_LOG_PREFIX} ${message}`, context);
  } else {
    console.warn(`${RESUME_LOG_PREFIX} ${message}`);
  }
};

const resumeLogError = (message: string, context?: ResumeLogContext) => {
  if (context) {
    console.error(`${RESUME_LOG_PREFIX} ${message}`, context);
  } else {
    console.error(`${RESUME_LOG_PREFIX} ${message}`);
  }
};

// Helpers for hardened schema
const stringOrNull = z.union([z.string(), z.null()]).optional();
const number0to100 = z.coerce.number().min(0).max(100);
const number0to80 = z.coerce.number().min(0).max(80);
const number0to1200 = z.coerce.number().min(0).max(1200);

// Arrays may sometimes come as a single string; accept both & normalize to array
const stringArray = z.union([z.array(z.string()), z.string()])
  .transform(v => Array.isArray(v) ? v : (v ? [v] : []))
  .default([]);

// Enhanced schema for analysis output
export const AnalysisSchema = z.object({
  mustHaveSkillsMatched: stringArray,
  mustHaveSkillsMissing: stringArray,
  niceToHaveSkillsMatched: stringArray,
  targetTitlesMatched: stringArray,
  responsibilitiesMatched: stringArray,
  toolsAndTechMatched: stringArray,
  domainKeywordsMatched: stringArray,
  certificationsMatched: stringArray,
  disqualifiersDetected: stringArray,
  notes: stringOrNull
}).default({
  mustHaveSkillsMatched: [],
  mustHaveSkillsMissing: [],
  niceToHaveSkillsMatched: [],
  targetTitlesMatched: [],
  responsibilitiesMatched: [],
  toolsAndTechMatched: [],
  domainKeywordsMatched: [],
  certificationsMatched: [],
  disqualifiersDetected: [],
  notes: null
});

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
    skillExperience: z.array(z.object({
      skill: z.string(),
      months: number0to1200,
      confidence: z.coerce.number().min(0).max(1).optional().default(0.5),
      evidence: stringOrNull,
      lastUsed: stringOrNull,
      source: z.string().optional().default('ai')
    })).default([]),
    education: z.array(z.object({
      degree: stringOrNull,
      institution: stringOrNull,
      year: stringOrNull
    })).default([]),
    employment: z.array(z.object({
      company: stringOrNull,
      title: stringOrNull,
      startDate: stringOrNull,
      endDate: stringOrNull,
      employmentType: stringOrNull
    })).optional(),
    notes: stringOrNull.optional()
  }),
  analysis: AnalysisSchema,
  summary: z.string()
});

export type EnhancedParsedResume = z.infer<typeof EnhancedResumeParseSchema>;
export type ProfileAnalysis = z.infer<typeof AnalysisSchema>;

interface ParseResult {
  success: boolean;
  data?: EnhancedParsedResume;
  error?: string;
  tokensUsed?: number;
  errorCode?: 'timeout' | 'api';
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
  matchScoreDetails?: MatchScoreDetails;
}

interface ComputedScores {
  matchScore: number;
  companyScore: number;
  fakeScore: number;
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
    raw.summary = [name, '-', title, years ? `(${years})` : '', skills ? `, ${skills}` : '']
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
        ['company', 'title', 'startDate', 'endDate', 'employmentType'].forEach(k => fixScalar(e, k));
        if (e?.endDate === 'Present') e.endDate = null;
      });
    }
    if (Array.isArray(raw?.resume?.education)) {
      raw.resume.education.forEach((e: any) => {
        ['degree', 'institution', 'year'].forEach(k => fixScalar(e, k));
      });
    }

    if (raw?.resume?.skillExperience) {
      try {
        raw.resume.skillExperience = parseAiSkillExperience(raw.resume.skillExperience);
      } catch {
        raw.resume.skillExperience = [];
      }
    } else if (raw?.resume) {
      raw.resume.skillExperience = [];
    }

    // NEW: normalize summary last
    coerceSummary(raw);
  } catch {
    // Silently handle any sanitization errors
  }
  return raw;
}

const TOKEN_REGEX = /[A-Za-z0-9+#]+/g;
const MIN_PREFIX_MATCH = 4;
const PHRASE_WINDOW = 8;

interface ResumeToken {
  value: string;
  normalized: string;
  stem: string;
}

const normalizeValue = (value: string) => normalizeSkillKey(value);

const normalizeToken = (token: string) => token.toLowerCase();

const skillMatchesSet = (skill: string, normalizedSet: Set<string>): boolean => {
  const key = normalizeSkillKey(skill);
  if (!key) return false;
  if (normalizedSet.has(key)) return true;
  for (const candidate of normalizedSet) {
    if (!candidate) continue;
    if (key.includes(candidate) || candidate.includes(key)) {
      return true;
    }
  }
  return false;
};

const stemToken = (token: string): string => {
  let stem = token;

  if (stem.endsWith('ies') && stem.length > 4) {
    return `${stem.slice(0, -3)}y`;
  }

  const suffixes = [
    'ization', 'isation', 'ational', 'fulness', 'ousness', 'iveness',
    'ability', 'ment', 'ments', 'ities', 'ally', 'lessly', 'less',
    'ness', 'ingly', 'edly', 'ing', 'ers', 'ies', 'ed', 'er', 'ly', 'es', 's'
  ];

  for (const suffix of suffixes) {
    if (stem.endsWith(suffix) && stem.length > suffix.length + 2) {
      stem = stem.slice(0, -suffix.length);
      break;
    }
  }

  if (stem.endsWith('tion') && stem.length > 4) {
    stem = stem.slice(0, -3);
  }

  return stem;
};

const buildResumeTokens = (text: string | null | undefined): ResumeToken[] => {
  if (!text) return [];
  const tokens: ResumeToken[] = [];
  const iterator = text.matchAll(TOKEN_REGEX);
  for (const match of iterator) {
    const raw = match[0];
    const normalized = normalizeToken(raw);
    if (!normalized) continue;
    tokens.push({
      value: raw,
      normalized,
      stem: stemToken(normalized)
    });
  }
  return tokens;
};

const splitPhraseTokens = (phrase: string): string[] =>
  (phrase ?? '')
    .split(/[^A-Za-z0-9+#]+/)
    .map(token => normalizeToken(token))
    .map(token => token.replace(/[^a-z0-9+#]/g, ''))
    .filter(token => token.length > 0);

const tokensAreSimilar = (resumeToken: ResumeToken, target: string): boolean => {
  if (!target) return false;
  if (resumeToken.normalized === target) return true;
  if (resumeToken.stem && resumeToken.stem === stemToken(target)) return true;

  if (target.length >= MIN_PREFIX_MATCH && resumeToken.normalized.startsWith(target)) {
    return true;
  }
  if (resumeToken.normalized.length >= MIN_PREFIX_MATCH && target.startsWith(resumeToken.normalized)) {
    return true;
  }
  if (target.length >= MIN_PREFIX_MATCH && resumeToken.normalized.includes(target)) {
    return true;
  }
  if (resumeToken.normalized.length >= MIN_PREFIX_MATCH && target.includes(resumeToken.normalized)) {
    return true;
  }
  return false;
};

const phraseMatches = (tokens: ResumeToken[], phraseTokens: string[], windowSize: number = PHRASE_WINDOW): boolean => {
  if (phraseTokens.length === 0) return false;
  for (let i = 0; i < tokens.length; i++) {
    if (!tokensAreSimilar(tokens[i], phraseTokens[0])) continue;
    let currentIndex = i;
    let matched = true;
    for (let j = 1; j < phraseTokens.length; j++) {
      const target = phraseTokens[j];
      let found = false;
      for (let k = currentIndex + 1; k < tokens.length && k <= currentIndex + windowSize; k++) {
        if (tokensAreSimilar(tokens[k], target)) {
          currentIndex = k;
          found = true;
          break;
        }
      }
      if (!found) {
        matched = false;
        break;
      }
    }
    if (matched) {
      return true;
    }
  }
  return false;
};

const matchPhrasesInResume = (phrases: string[], tokens: ResumeToken[]): string[] => {
  const matches: string[] = [];
  const seen = new Set<string>();
  for (const phrase of phrases ?? []) {
    const trimmed = phrase?.trim();
    if (!trimmed || normalizeValue(trimmed) === 'not specified') continue;
    const phraseTokens = splitPhraseTokens(trimmed);
    if (phraseTokens.length === 0) continue;
    if (phraseMatches(tokens, phraseTokens)) {
      const key = normalizeValue(trimmed);
      if (!seen.has(key)) {
        seen.add(key);
        matches.push(trimmed);
      }
    }
  }
  return matches;
};

const dedupePreserveOrder = (values: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = normalizeValue(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(value);
  }
  return result;
};

interface SkillVerificationResult {
  confirmedMustHave: string[];
  extraNiceToHave: string[];
  extraTools: string[];
}

async function verifySkillMatchesWithAI(params: {
  resumeText: string;
  jobProfile: JobProfile | null;
  manualMustHave: string[];
  manualNiceToHave: string[];
  manualTools: string[];
  targetMustHave: string[];
}): Promise<SkillVerificationResult | null> {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  const client = getOpenAIClient();
  const model = SKILL_VERIFY_MODEL;
  const temperature = Number(process.env.OPENAI_JOB_PROFILE_TEMPERATURE || 0);

  const jobProfile = params.jobProfile;

  const truncateText = (text: string, limit = 12_000) =>
    text.length > limit ? `${text.slice(0, limit)}\n...[truncated]` : text;

  const listSection = (title: string, items: string[]) =>
    `${title}:\n${items.length > 0 ? items.map(item => `- ${item}`).join('\n') : '- (none)'}`;

  const mustHaveTargets = dedupePreserveOrder(params.targetMustHave ?? []);

  const userMessage = [
    'Review the resume carefully and determine which mandatory skills are explicitly demonstrated. '
    + 'Only confirm a skill if the resume clearly describes experience, responsibilities, or deliverables for it. '
    + 'Do not guess or hallucinate; omit any skill that lacks direct evidence.',
    '',
    listSection('Mandatory skills to verify', mustHaveTargets),
    listSection('Manual matches detected earlier', params.manualMustHave),
    '',
    listSection('Job profile nice-to-have skills', jobProfile?.niceToHaveSkills ?? []),
    listSection('Job profile tools & tech', jobProfile?.toolsAndTech ?? []),
    '',
    listSection('Manual nice-to-have matches', params.manualNiceToHave),
    listSection('Manual tools matches', params.manualTools),
    '',
    'Resume (redacted):',
    truncateText(params.resumeText)
  ].join('\n');

  try {
    const response = await client.chat.completions.create({
      model,
      temperature,
      response_format: { type: 'json_object' },
      max_tokens: 500,
      messages: [
        {
          role: 'system',
          content:
            'You are an evidence-focused resume screener. Respond ONLY with minified JSON of shape '
            + '{"confirmedMustHave":["skill"],"extraNiceToHave":["skill"],"extraTools":["tool"]}. '
            + 'All items must appear in the provided job profile lists AND be explicitly supported by the resume text. '
            + 'If you are unsure, leave the arrays empty. Never hallucinate.'
        },
        {
          role: 'user',
          content: userMessage
        }
      ]
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return null;
    }

    const parsed = JSON.parse(content);

    const sanitizeExtras = (values: unknown, allowed: Set<string>, manual: Set<string>) => {
      if (!Array.isArray(values)) return [];
      return dedupePreserveOrder(
        values
          .map(value => (typeof value === 'string' ? value.trim() : ''))
          .filter(value => value.length > 0)
          .filter(value => allowed.has(normalizeValue(value)))
          .filter(value => !manual.has(normalizeValue(value)))
      );
    };

    const allowedMust = new Set(mustHaveTargets.map(normalizeValue));
    const allowedNice = new Set(
      (jobProfile?.niceToHaveSkills ?? []).map(normalizeValue)
    );
    const allowedTools = new Set(
      (jobProfile?.toolsAndTech ?? []).map(normalizeValue)
    );

    const manualMustSet = new Set(params.manualMustHave.map(normalizeValue));
    const manualNiceSet = new Set(params.manualNiceToHave.map(normalizeValue));
    const manualToolSet = new Set(params.manualTools.map(normalizeValue));

    return {
      confirmedMustHave: sanitizeExtras(parsed.confirmedMustHave, allowedMust, manualMustSet),
      extraNiceToHave: sanitizeExtras(parsed.extraNiceToHave, allowedNice, manualNiceSet),
      extraTools: sanitizeExtras(parsed.extraTools, allowedTools, manualToolSet)
    };
  } catch (error) {
    resumeLogWarn('skill_verification_ai_error', {
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

const isAbortError = (error: unknown) => {
  if (!error) return false;
  const name = (error as { name?: string }).name?.toLowerCase() ?? '';
  const message = (error as { message?: string }).message?.toLowerCase() ?? '';
  return name === 'aborterror' || name === 'timeouterror' || message.includes('aborted');
};

// Main parsing function - single call to gpt-4o-mini with no fallback
async function callOpenAIForParsing(
  jobContext: JobContext,
  redactedText: string,
  timeoutMs: number = 20000
): Promise<ParseResult> {
  try {
    const model = process.env.OPENAI_RESUME_MODEL || 'gpt-4o-mini';
    const temperature = Number(process.env.OPENAI_TEMPERATURE || 0.1);

    const { systemMessage, userMessage } = getResumeParserPrompt(jobContext, redactedText);

    resumeLogInfo('openai request start', {
      model,
      temperature,
      timeoutMs,
      textLength: redactedText.length,
      jobProfileVersion: jobContext.jobProfile?.version ?? null,
      jobProfilePresent: Boolean(jobContext.jobProfile)
    });

    const openaiClient = getOpenAIClient();
    const apiStart = Date.now();
    const completion = await openaiClient.chat.completions.create(
      {
        model,
        messages: [
          {
            role: 'system',
            content: systemMessage
          },
          {
            role: 'user',
            content: userMessage
          }
        ],
        response_format: { type: 'json_object' },
        temperature,
        max_tokens: 8192
      },
      { signal: AbortSignal.timeout(timeoutMs) }
    );
    const apiDuration = Date.now() - apiStart;

    const response = completion.choices[0]?.message?.content;
    const finishReason = completion.choices[0]?.finish_reason;
    const tokensUsed = completion.usage?.total_tokens || 0;

    resumeLogInfo('openai call complete', {
      model,
      durationMs: apiDuration,
      tokensUsed,
      finishReason
    });

    if (apiDuration > OPENAI_SLOW_THRESHOLD_MS) {
      resumeLogWarn('openai call slow', { model, durationMs: apiDuration, timeoutMs });
    }

    if (finishReason === 'length') {
      resumeLogWarn('openai response truncated', { model, tokensUsed });
      return {
        success: false,
        error: 'OpenAI response was truncated due to length limit. Try a shorter resume or increase max_tokens.'
      };
    }

    if (!response) {
      return {
        success: false,
        error: 'No response from OpenAI'
      };
    }

    let parsedData;
    try {
      parsedData = JSON.parse(response);
    } catch (parseError) {
      resumeLogError('openai response parse error', {
        error: parseError instanceof Error ? parseError.message : 'unknown parse error',
        responsePreview: response.slice(0, 500)
      });
      return {
        success: false,
        error: 'Invalid JSON response from OpenAI'
      };
    }

    return {
      success: true,
      data: parsedData,
      tokensUsed
    };

  } catch (error: any) {
    const aborted = isAbortError(error);
    resumeLogError('openai api error', {
      timeoutMs,
      error: aborted ? 'timeout' : (error instanceof Error ? error.message : 'unknown')
    });
    return {
      success: false,
      error: aborted
        ? `OpenAI timeout after ${timeoutMs}ms`
        : (error instanceof Error ? error.message : 'Unknown OpenAI API error'),
      errorCode: aborted ? 'timeout' : 'api'
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

    // Normalize optional sections
    validated.resume.employment = Array.isArray(validated.resume.employment)
      ? validated.resume.employment
      : [];
    validated.resume.notes = typeof validated.resume.notes === 'string' ? validated.resume.notes : '';

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
}, resumeSide: {
  candidateName: string | null;
  email: string | null;
  phone: string | null;
  skills: string | null; // csv string from Resume table
  totalExperienceY: number | null; // cast Decimal -> number in caller
  companyScore: number | null;     // cast Decimal -> number in caller
  fakeScore: number | null;        // cast Decimal -> number in caller
  originalName: string | null;     // from Resume table
  sourceFrom: string | null;       // from Resume table
}, matchScore: number | null) {
  return {
    id: app.id,
    jobId: app.jobId,
    resumeId: app.resumeId,
    status: app.status ?? "new",
    notes: null,                // keep as null, user can edit separately
    updatedAt: app.updatedAt?.toISOString() ?? null,
    appliedDate: app.appliedDate?.toISOString() ?? null,
    candidateName: resumeSide.candidateName,
    email: resumeSide.email,
    phone: resumeSide.phone,
    aiMatch: matchScore,        // <- from jobApplication.matchScore
    aiCompany: resumeSide.companyScore, // <- from Resume.companyScore
    aiFake: resumeSide.fakeScore,       // <- from Resume.fakeScore
    originalName: resumeSide.originalName, // <- from Resume table
    sourceFrom: resumeSide.sourceFrom,     // <- from Resume table
    skills: resumeSide.skills,  // csv as-is
    experience: resumeSide.totalExperienceY, // years numeric
    createdAt: null             // optional; set if you track it on JobApplication
  };
}

// Convert processed data to database fields for Resume
function toResumeDbFields(
  data: EnhancedParsedResume,
  extras: {
    scores: ComputedScores;
    manualSkills?: string[];
    aiExtraSkills?: string[];
    manualTools?: string[];
    aiExtraTools?: string[];
    aiSkillExperience?: SkillExperienceEntry[];
    skillRequirementEvaluation?: Record<string, unknown> | null;
  }
): Record<string, any> {
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
  
  const record: Record<string, any> = {
    aiExtractJson: JSON.stringify(data),
    aiSummary: data.summary,
    candidateName: candidate.name,
    email: candidate.emails[0]?.toLowerCase() || null,
    phone: candidate.phones[0] || null,
    skills: skillsCsv || null,
    companies: companiesCsv || null,
    employmentHistoryJson: JSON.stringify(normalizedEmployment),
    totalExperienceY: candidate.totalExperienceYears,
    companyScore: extras.scores.companyScore,
    fakeScore: extras.scores.fakeScore,
    parsedAt: new Date(),
    textHash: null, // Will be set by caller
    promptVersion: process.env.PROMPT_VERSION || 'v1',
    parseModel: process.env.OPENAI_RESUME_MODEL || 'gpt-4o-mini',
    parseError: null,
    manualSkillsMatched: extras?.manualSkills && extras.manualSkills.length > 0 ? extras.manualSkills : null,
    aiExtraSkills: extras?.aiExtraSkills && extras.aiExtraSkills.length > 0 ? extras.aiExtraSkills : null,
    manualToolsMatched: extras?.manualTools && extras.manualTools.length > 0 ? extras.manualTools : null,
    aiExtraTools: extras?.aiExtraTools && extras.aiExtraTools.length > 0 ? extras.aiExtraTools : null,
    aiSkillExperience: extras?.aiSkillExperience && extras.aiSkillExperience.length > 0 ? extras.aiSkillExperience : null,
    skillRequirementEvaluation: extras?.skillRequirementEvaluation ?? null,
    aiMatchedAttributes: buildAiMatchedAttributes(data)
  };

  return record;
}

function buildAiMatchedAttributes(data: EnhancedParsedResume) {
  const analysis = AnalysisSchema.parse(data.analysis ?? {});
  return {
    analysis,
    candidateExperienceYears: data.resume?.candidate?.totalExperienceYears ?? null,
    resumeSkills: Array.isArray(data.resume?.skills) ? data.resume.skills : [],
    matched: {
      mustHaveSkills: analysis.mustHaveSkillsMatched ?? [],
      niceToHaveSkills: analysis.niceToHaveSkillsMatched ?? [],
      responsibilities: analysis.responsibilitiesMatched ?? [],
      toolsAndTech: analysis.toolsAndTechMatched ?? [],
      domainKeywords: analysis.domainKeywordsMatched ?? [],
      certifications: analysis.certificationsMatched ?? [],
      targetTitles: analysis.targetTitlesMatched ?? []
    }
  };
}

// Check if resume needs parsing (idempotency)
async function needsParsing(resumeId: number, textHash: string): Promise<boolean> {
  try {
    const resume = await withRetry(() =>
      prisma.resume.findUnique({
        where: { id: resumeId },
        select: {
          textHash: true,
          promptVersion: true,
          parseModel: true,
          parsedAt: true
        }
      })
    );

    if (!resume) return true;

    // Parse if any of these changed or if never parsed
    return (
      !resume.parsedAt ||
      resume.textHash !== textHash ||
      resume.promptVersion !== (process.env.PROMPT_VERSION || 'v1') ||
      resume.parseModel !== (process.env.OPENAI_RESUME_MODEL || 'gpt-4o-mini')
    );
  } catch (error) {
    resumeLogError('needs_parsing_check_failed', {
      error: error instanceof Error ? error.message : String(error)
    });
    return true; // Default to parsing on error
  }
}

// Main public function: Parse and score resume
export async function parseAndScoreResume(
  resumeId: number,
  jobContext: JobContext,
  force: boolean = false,
  timeoutMs: number = 20000
): Promise<{ success: boolean; summary?: ParseSummary; error?: string }> {
  const parseStart = Date.now();
  try {
    // Check if PARSE_ON_IMPORT is enabled
    if (!force && process.env.PARSE_ON_IMPORT !== 'true') {
      return {
        success: false,
        error: 'Resume parsing is disabled (PARSE_ON_IMPORT=false)'
      };
    }

    // Fetch resume with retry logic
    const resume = await withRetry(() =>
      prisma.resume.findUnique({
        where: { id: resumeId },
        select: {
          id: true,
          rawText: true,
          fileName: true,
          candidateCity: true,
          candidateState: true,
          sourceCandidateLocation: true,
          email: true,
          phone: true,
          sourceCandidateEmail: true,
          sourceCandidatePhone: true,
          manualSkillAssessments: true,
          manualSkillsMatched: true,
          applications: {
            select: { jobId: true }
          }
        }
      })
    );

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

    const originalLocationSnapshot = {
      sourceCandidateLocation: resume.sourceCandidateLocation ?? null,
      candidateCity: resume.candidateCity ?? null,
      candidateState: resume.candidateState ?? null
    };

    // Generate text hash for idempotency
    const textHash = generateTextHash(resume.rawText);
    
    // Check if parsing is needed (unless forced)
    if (!force && !(await needsParsing(resumeId, textHash))) {
      // Return existing data with retry logic
      const existingResume = await withRetry(() =>
        prisma.resume.findUnique({
          where: { id: resumeId },
          select: {
            candidateName: true,
            email: true,
            skills: true,
            companyScore: true,
            fakeScore: true
          }
        })
      );

      const existingApplication = await withRetry(() =>
        prisma.jobApplication.findFirst({
          where: { resumeId },
          select: { matchScore: true }
        })
      );

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

    resumeLogInfo('parse resume start', { resumeId, fileName: resume.fileName });

    // Redact sensitive data and truncate to prevent timeouts
    const redactedText = redactSensitiveData(resume.rawText);
    const processedText = redactedText;
    const textLength = processedText.length;

    const requestedTimeout = Math.max(timeoutMs ?? DEFAULT_PARSE_TIMEOUT_MS, 1000);
    const baseTimeout = Math.max(requestedTimeout, DEFAULT_PARSE_TIMEOUT_MS);
    const cappedBaseTimeout = Math.min(baseTimeout, MAX_PARSE_TIMEOUT_MS);
    let effectiveTimeout = cappedBaseTimeout;

    if (textLength >= LONG_TEXT_CHAR_THRESHOLD) {
      const extendedTimeout = Math.min(Math.max(effectiveTimeout, LONG_TEXT_TIMEOUT_MS), MAX_PARSE_TIMEOUT_MS);
      if (extendedTimeout > effectiveTimeout) {
        effectiveTimeout = extendedTimeout;
        resumeLogWarn('parse_timeout_extended_for_long_text', {
          resumeId,
          textLength,
          timeoutMs: effectiveTimeout
        });
      }
    }

    let manualAssessments: ManualSkillAssessment[] = parseManualSkillAssessments(
      (resume as any).manualSkillAssessments ?? (resume as any).manualSkillsMatched ?? null
    );

    // Call OpenAI for parsing with timeout
    let parseResult = await callOpenAIForParsing(jobContext, processedText, effectiveTimeout);

    if (!parseResult.success && parseResult.errorCode === 'timeout') {
      const retryTimeout = Math.min(
        MAX_PARSE_TIMEOUT_MS,
        effectiveTimeout + TIMEOUT_RETRY_BACKOFF_MS
      );
      if (retryTimeout > effectiveTimeout) {
        resumeLogWarn('parse_retry_after_timeout', {
          resumeId,
          previousTimeout: effectiveTimeout,
          retryTimeout,
          textLength
        });
        effectiveTimeout = retryTimeout;
        parseResult = await callOpenAIForParsing(jobContext, processedText, retryTimeout);
      }
    }

    if (!parseResult.success) {
      // Mark parse failure with retry logic
      await withRetry(() =>
        prisma.resume.update({
          where: { id: resumeId },
          data: {
            parseError: parseResult.error,
            textHash,
            promptVersion: process.env.PROMPT_VERSION || 'v1',
            parseModel: process.env.OPENAI_RESUME_MODEL || 'gpt-4o-mini'
          }
        })
      );

      resumeLogError('parse_fail', { resumeId, reason: parseResult.error });
      return {
        success: false,
        error: parseResult.error
      };
    }

    // Validate and process the response
    const validation = validateAndProcess(parseResult.data!);
    
    if (!validation.valid) {
      // Mark schema validation failure with retry logic
      await withRetry(() =>
        prisma.resume.update({
          where: { id: resumeId },
          data: {
            parseError: `schema: ${validation.error}`,
            textHash,
            promptVersion: process.env.PROMPT_VERSION || 'v1',
            parseModel: process.env.OPENAI_RESUME_MODEL || 'gpt-4o-mini'
          }
        })
      );

      resumeLogError('parse_fail_schema', { resumeId, error: validation.error });
      return {
        success: false,
        error: `Schema validation failed: ${validation.error}`
      };
    }

    const validatedData = validation.data!;
    const scores: ComputedScores = {
      matchScore: 0,
      companyScore: 0,
      fakeScore: 0
    };

    if (!jobContext.mandatorySkillRequirements || jobContext.mandatorySkillRequirements.length === 0) {
      resumeLogWarn('job_context_missing_mandatory_requirements', {
        resumeId,
        jobTitle: jobContext.jobTitle
      });
    }

    let manualMustMatches: string[] = [];
    let manualNiceMatches: string[] = [];
    let manualToolsMatches: string[] = [];
    let manualSkillsCombined: string[] = [];
    let aiExtraSkills: string[] = [];
    let aiExtraTools: string[] = [];

    let verification: SkillVerificationResult | null = null;



    let manualSkillSet = new Set<string>();
    let manualToolSet = new Set<string>();

    if (jobContext.jobProfile && resume.rawText) {
      const tokens = buildResumeTokens(resume.rawText);
      const profileMust = jobContext.jobProfile.mustHaveSkills ?? [];
      const profileNice = jobContext.jobProfile.niceToHaveSkills ?? [];
      const profileTools = jobContext.jobProfile.toolsAndTech ?? [];

      const manualNormalizedSet = new Set(
        manualAssessments.map(assessment => normalizeSkillKey(assessment.skill))
      );

      const textMustMatches = matchPhrasesInResume(profileMust, tokens);
      const textNiceMatches = matchPhrasesInResume(profileNice, tokens);
      const textToolMatches = matchPhrasesInResume(profileTools, tokens);

      const autoSkillCandidates = dedupePreserveOrder([...textMustMatches, ...textNiceMatches]);
      if (autoSkillCandidates.length > 0) {
        const additions: ManualSkillAssessment[] = [];
        for (const skill of autoSkillCandidates) {
          const normalized = normalizeSkillKey(skill);
          if (manualNormalizedSet.has(normalized)) {
            continue;
          }
          additions.push({
            skill,
            months: null,
            source: 'auto',
            confidence: null,
            notes: null
          });
          manualNormalizedSet.add(normalized);
        }
        if (additions.length > 0) {
          manualAssessments = [...manualAssessments, ...additions];
        }
      }

      manualSkillsCombined = dedupePreserveOrder([
        ...manualAssessments.map(assessment => assessment.skill),
        ...textMustMatches,
        ...textNiceMatches
      ]);

      const manualMustFromAssessments = profileMust.filter(skill => skillMatchesSet(skill, manualNormalizedSet));
      const manualNiceFromAssessments = profileNice.filter(skill => skillMatchesSet(skill, manualNormalizedSet));
      const manualToolsFromAssessments = profileTools.filter(skill => skillMatchesSet(skill, manualNormalizedSet));

      manualMustMatches = dedupePreserveOrder([...manualMustFromAssessments, ...textMustMatches]);
      manualNiceMatches = dedupePreserveOrder([...manualNiceFromAssessments, ...textNiceMatches]);
      manualToolsMatches = dedupePreserveOrder([...manualToolsFromAssessments, ...textToolMatches]);
      manualSkillSet = new Set(manualSkillsCombined.map(skill => normalizeSkillKey(skill)));
      manualToolSet = new Set(manualToolsMatches.map(tool => normalizeSkillKey(tool)));

      validatedData.analysis.mustHaveSkillsMatched = manualMustMatches;
      validatedData.analysis.mustHaveSkillsMissing = (jobContext.jobProfile?.mustHaveSkills ?? []).filter(
        skill => !manualSkillSet.has(normalizeSkillKey(skill))
      );

      const previousNiceMatches = Array.isArray(validatedData.analysis.niceToHaveSkillsMatched)
        ? validatedData.analysis.niceToHaveSkillsMatched
        : [];
      const previousToolsMatches = Array.isArray(validatedData.analysis.toolsAndTechMatched)
        ? validatedData.analysis.toolsAndTechMatched
        : [];

      validatedData.analysis.niceToHaveSkillsMatched = manualNiceMatches;
      validatedData.analysis.toolsAndTechMatched = manualToolsMatches;

      const mandatorySkillTargets = dedupePreserveOrder([
        ...(jobContext.mandatorySkillRequirements ?? []).map(requirement => requirement.skill),
        ...(jobContext.jobProfile?.mustHaveSkills ?? [])
      ]);

      verification = await verifySkillMatchesWithAI({
        resumeText: processedText,
        jobProfile: jobContext.jobProfile,
        manualMustHave: manualMustMatches,
        manualNiceToHave: manualNiceMatches,
        manualTools: manualToolsMatches,
        targetMustHave: mandatorySkillTargets
      });

      if (verification) {
        const aiOnlyMust = (verification.confirmedMustHave ?? []).filter(
          skill => !manualSkillSet.has(normalizeSkillKey(skill))
        );
        const extraNice = verification.extraNiceToHave ?? [];
        const combinedExtras = dedupePreserveOrder([...aiOnlyMust, ...extraNice]);

        aiExtraSkills = combinedExtras.filter(skill => !manualSkillSet.has(normalizeSkillKey(skill)));
        aiExtraTools = dedupePreserveOrder(verification.extraTools ?? []).filter(
          tool => !manualToolSet.has(normalizeSkillKey(tool))
        );
      } else {
        const aiSkillUnion = dedupePreserveOrder([...manualMustMatches, ...previousNiceMatches]);
        aiExtraSkills = aiSkillUnion.filter(skill => !manualSkillSet.has(normalizeSkillKey(skill)));
        aiExtraTools = dedupePreserveOrder(previousToolsMatches).filter(
          tool => !manualToolSet.has(normalizeSkillKey(tool))
        );
      }
    } else {
      manualSkillsCombined = [];
      manualToolsMatches = [];
      aiExtraSkills = [];
      aiExtraTools = [];
      manualSkillSet = new Set();
      manualToolSet = new Set();
      validatedData.analysis.mustHaveSkillsMatched = manualMustMatches;
      validatedData.analysis.mustHaveSkillsMissing = jobContext.jobProfile?.mustHaveSkills ?? [];
      validatedData.analysis.niceToHaveSkillsMatched = [];
      validatedData.analysis.toolsAndTechMatched = [];
    }

    const aiVerifierMustHave = verification?.confirmedMustHave ?? [];

    let aiSkillExperiences = parseAiSkillExperience(validatedData.resume.skillExperience);

    const resumeSkillList = Array.isArray(validatedData.resume.skills)
      ? validatedData.resume.skills
      : [];

    if (resumeSkillList.length > 0) {
      const knownSkillKeys = new Set<string>([
        ...manualAssessments.map(assessment => normalizeSkillKey(assessment.skill)),
        ...aiSkillExperiences.map(entry => normalizeSkillKey(entry.skill))
      ]);

      const inferredSkillExperience: SkillExperienceEntry[] = [];
      for (const skill of resumeSkillList) {
        const normalized = normalizeSkillKey(skill);
        if (!normalized || knownSkillKeys.has(normalized)) {
          continue;
        }
        inferredSkillExperience.push({
          skill,
          months: 0,
          confidence: 0.35,
          evidence: 'resume.skills',
          lastUsed: null,
          source: 'resume_skills'
        });
        knownSkillKeys.add(normalized);
      }

      if (inferredSkillExperience.length > 0) {
        aiSkillExperiences = [...aiSkillExperiences, ...inferredSkillExperience];
      }
    }

    if (aiVerifierMustHave.length > 0) {
      const aiSkillSet = new Set(aiSkillExperiences.map(entry => normalizeSkillKey(entry.skill)));
      for (const skill of aiVerifierMustHave) {
        const normalized = normalizeSkillKey(skill);
        if (!normalized || aiSkillSet.has(normalized)) continue;
        aiSkillExperiences.push({
          skill,
          months: 0,
          confidence: 0.6,
          evidence: null,
          lastUsed: null,
          source: 'ai_verifier'
        });
        aiSkillSet.add(normalized);
      }
    }

    validatedData.resume.skillExperience = aiSkillExperiences;

    resumeLogInfo('resume_skill_sources', {
      resumeId,
      manualAssessmentCount: manualAssessments.length,
      manualAssessments: manualAssessments.slice(0, 25).map(item => ({
        skill: item.skill,
        source: item.source,
        months: item.months
      })),
      aiSkillExperienceCount: aiSkillExperiences.length,
      aiSkillExamples: aiSkillExperiences.slice(0, 25).map(item => ({
        skill: item.skill,
        months: item.months,
        source: item.source
      })),
      resumeSkillList: resumeSkillList.slice(0, 25)
    });

    const requirementSummary: SkillRequirementEvaluationSummary = evaluateSkillRequirements(
      jobContext.mandatorySkillRequirements ?? [],
      manualAssessments,
      aiSkillExperiences
    );

    if ((jobContext.mandatorySkillRequirements?.length ?? 0) > 0) {
      resumeLogInfo('job_context_mandatory_snapshot', {
        resumeId,
        jobTitle: jobContext.jobTitle,
        totalRequirements: jobContext.mandatorySkillRequirements.length,
        requirements: jobContext.mandatorySkillRequirements.map(req => req.skill)
      });
      resumeLogInfo('mandatory_skill_evaluation_detail', {
        resumeId,
        matched: requirementSummary.evaluations.filter(e => e.matched).map(e => e.skill),
        unmet: requirementSummary.unmetRequirements,
        manualCoverageMissing: requirementSummary.manualCoverageMissing,
        aiDetectedWithoutManual: requirementSummary.aiDetectedWithoutManual
      });
    }

    validatedData.analysis.mustHaveSkillsMatched = requirementSummary.metRequirements ?? [];
    validatedData.analysis.mustHaveSkillsMissing = requirementSummary.unmetRequirements ?? [];

    resumeLogInfo('skill_match_summary', {
      resumeId,
      manualMustHave: manualMustMatches.length,
      manualNiceToHave: manualNiceMatches.length,
      manualTools: manualToolsMatches.length,
      aiExtraSkills: aiExtraSkills.length,
      aiExtraTools: aiExtraTools.length,
      mandatoryRequirements: jobContext.mandatorySkillRequirements?.length ?? 0,
      mandatoryAllMet: requirementSummary.allMet
    });

    let matchScoreDetails: MatchScoreDetails | null = null;
    if (jobContext.jobProfile && validatedData.analysis) {
      try {
        matchScoreDetails = computeProfileMatchScore(
          jobContext.jobProfile,
          validatedData.analysis,
          requirementSummary,
          {
            candidateExperienceYears: validatedData.resume.candidate.totalExperienceYears,
            experienceRequirements: jobContext.experience
          }
        );
        scores.matchScore = matchScoreDetails.finalScore;
        (validatedData as any).computedMatchScore = matchScoreDetails;
      } catch (error) {
        resumeLogWarn('match_score_compute_failed', {
          resumeId,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    } else if (!jobContext.jobProfile) {
      resumeLogWarn('job_profile_missing_for_scoring', { resumeId });
    }

    if (jobContext.mandatorySkillRequirements.length > 0) {
      if (requirementSummary.allMet) {
        resumeLogInfo('mandatory_skill_evaluation', {
          resumeId,
          requirements: jobContext.mandatorySkillRequirements.length,
          allMet: true
        });
      } else {
        resumeLogWarn('mandatory_skill_unmet', {
          resumeId,
          unmet: requirementSummary.unmetRequirements,
          manualCoverageMissing: requirementSummary.manualCoverageMissing
        });
      }
    }

    const candidateData = validatedData.resume.candidate;
    const hasMeaningfulData =
      Boolean(candidateData.name) ||
      (candidateData.emails && candidateData.emails.length > 0) ||
      (validatedData.resume.skills && validatedData.resume.skills.length > 0) ||
      (validatedData.resume.employment && validatedData.resume.employment.length > 0);

    if (!hasMeaningfulData) {
      resumeLogWarn('parse result empty', { resumeId });

      await withRetry(() =>
        prisma.resume.update({
          where: { id: resumeId },
          data: {
            parseError: 'EMPTY_PARSE_RESULT',
            textHash,
            promptVersion: process.env.PROMPT_VERSION || 'v1',
            parseModel: process.env.OPENAI_RESUME_MODEL || 'gpt-4o-mini'
          }
        })
      );

      return {
        success: false,
        error: 'Parsed resume contains no meaningful data'
      };
    }

    // Prepare database updates
    const skillRequirementEvaluationRecord =
      jobContext.mandatorySkillRequirements.length > 0
        ? {
            evaluatedAt: new Date().toISOString(),
            requirements: jobContext.mandatorySkillRequirements.map(req => req.skill),
            evaluations: requirementSummary.evaluations,
            manualCoverageMissing: requirementSummary.manualCoverageMissing,
            unmetRequirements: requirementSummary.unmetRequirements,
            metRequirements: requirementSummary.metRequirements,
            aiDetectedWithoutManual: requirementSummary.aiDetectedWithoutManual,
            allMet: requirementSummary.allMet
          }
        : null;

    const resumeFields = toResumeDbFields(validatedData, {
      scores,
      manualSkills: manualSkillsCombined,
      aiExtraSkills,
      manualTools: manualToolsMatches,
      aiExtraTools,
      aiSkillExperience: aiSkillExperiences,
      skillRequirementEvaluation: skillRequirementEvaluationRecord
    });
    resumeFields.textHash = textHash;

    // Preserve contact info gleaned from email metadata when available.
    if (resume.sourceCandidateEmail) {
      resumeFields.email = resume.sourceCandidateEmail.toLowerCase();
    } else if (!resumeFields.email && resume.email) {
      resumeFields.email = resume.email.toLowerCase();
    }

    if (resume.sourceCandidatePhone) {
      resumeFields.phone = resume.sourceCandidatePhone;
    } else if (!resumeFields.phone && resume.phone) {
      resumeFields.phone = resume.phone;
    }

    // Update Resume table with retry logic
    await withRetry(() =>
      prisma.resume.update({
        where: { id: resumeId },
        data: resumeFields
      })
    );

    // Update JobApplication with matchScore and aiExtractJson (for all applications of this resume)
    const jobApplications = await withRetry(() =>
      prisma.jobApplication.findMany({
        where: { resumeId },
        select: {
          id: true,
          jobId: true,
          resumeId: true,
          status: true,
          appliedDate: true,
          updatedAt: true
        }
      })
    );

    if (jobApplications.length > 0) {
      // Pull resume-side values once with retry logic
      const resumeAfter = await withRetry(() =>
        prisma.resume.findUnique({
          where: { id: resumeId },
          select: {
            candidateName: true,
            email: true,
            phone: true,
            skills: true,
            totalExperienceY: true,
            companyScore: true,
            fakeScore: true,
            originalName: true,
            sourceFrom: true
          }
        })
      );

      // Helper to cast Decimals to numbers
      const toNumber = (x: any) => (x == null ? null : Number(x));

      // Update each application with matchScore and snapshot with retry logic
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
              companyScore: scores.companyScore,
              fakeScore: toNumber(resumeAfter?.fakeScore),
              originalName: resumeAfter?.originalName ?? null,
              sourceFrom: resumeAfter?.sourceFrom ?? null
            },
            scores.matchScore
          );

          await withRetry(() =>
            prisma.jobApplication.update({
              where: { id: app.id },
              data: {
                matchScore: scores.matchScore,
                aiCompanyScore: scores.companyScore,
                aiExtractJson: validatedData as unknown as Prisma.InputJsonValue  // Store the full OpenAI response
              }
            })
          );
        })
      );

      resumeLogInfo('job applications updated with scores', {
        resumeId,
        applications: jobApplications.length
      });
    }

    // Build and return summary
    const summary: ParseSummary = {
      resumeId,
      candidateName: validatedData.resume.candidate.name,
      emailsCount: validatedData.resume.candidate.emails.length,
      skillsCount: validatedData.resume.skills.length,
      companiesCount: validatedData.resume.employment.length,
      matchScore: scores.matchScore,
      companyScore: scores.companyScore,
      fakeScore: scores.fakeScore,
      tokensUsed: parseResult.tokensUsed,
      matchScoreDetails: matchScoreDetails ?? undefined
    };

    const totalDuration = Date.now() - parseStart;
    resumeLogInfo('parse resume success', {
      resumeId,
      model: process.env.OPENAI_RESUME_MODEL || 'gpt-4o-mini',
      durationMs: totalDuration,
      jobProfileVersion: jobContext.jobProfile?.version ?? null,
      matchScore: summary.matchScore,
      companyScore: summary.companyScore,
      fakeScore: summary.fakeScore,
      tokensUsed: summary.tokensUsed ?? null,
      matchScoreStrategy: matchScoreDetails ? 'profile_weighted' : 'model_score'
    });

    return {
      success: true,
      summary
    };

  } catch (error) {
    const failureDuration = Date.now() - parseStart;
    resumeLogError('parse resume error', {
      resumeId,
      durationMs: failureDuration,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
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
    resumeLogError('get_parsing_stats_error', {
      error: error instanceof Error ? error.message : String(error)
    });
    return { total: 0, parsed: 0, unparsed: 0, withScores: 0, failed: 0 };
  }
}
