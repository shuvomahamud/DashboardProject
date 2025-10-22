import { Prisma } from '@prisma/client';
import * as crypto from 'crypto';
import { z } from 'zod';
import prisma, { withRetry } from '../prisma';
import { getOpenAIClient } from './openaiClient';
import type { JobContext } from './jobContext';
import { computeProfileMatchScore } from './scoring/profileMatchScoring';
import type { MatchScoreDetails } from './scoring/profileMatchScoring';
import type { JobProfile } from './jobProfileService';

type ResumeLogContext = Record<string, unknown>;

const RESUME_LOG_PREFIX = '[resume-parsing]';
const OPENAI_SLOW_THRESHOLD_MS = 12000;

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

// Arrays may sometimes come as a single string; accept both & normalize to array
const stringArray = z.union([z.array(z.string()), z.string()])
  .transform(v => Array.isArray(v) ? v : (v ? [v] : []))
  .default([]);

// Enhanced schema that includes all three scores with hardened validation
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

const TOKEN_REGEX = /[A-Za-z0-9+#]+/g;
const MIN_PREFIX_MATCH = 4;
const PHRASE_WINDOW = 5;

interface ResumeToken {
  value: string;
  normalized: string;
  stem: string;
}

const normalizeValue = (value: string) => value.trim().toLowerCase();

const normalizeToken = (token: string) => token.toLowerCase();

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
  extraMustHave: string[];
  extraNiceToHave: string[];
  extraTools: string[];
}

async function verifySkillMatchesWithAI(params: {
  resumeText: string;
  jobProfile: JobProfile;
  manualMustHave: string[];
  manualNiceToHave: string[];
  manualTools: string[];
}): Promise<SkillVerificationResult | null> {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  const client = getOpenAIClient();
  const model =
    process.env.OPENAI_JOB_PROFILE_MODEL ||
    process.env.OPENAI_RESUME_MODEL ||
    'gpt-4o-mini';
  const temperature = Number(process.env.OPENAI_JOB_PROFILE_TEMPERATURE || 0);

  const jobProfile = params.jobProfile;

  const truncateText = (text: string, limit = 12_000) =>
    text.length > limit ? `${text.slice(0, limit)}\n...[truncated]` : text;

  const listSection = (title: string, items: string[]) =>
    `${title}:\n${items.length > 0 ? items.map(item => `- ${item}`).join('\n') : '- (none)'}`;

  const userMessage = [
    'You audit manual resume-skill matches. Only confirm skills that explicitly appear in the resume text. '
    + 'If a manual list already covers every mention, return empty arrays. '
    + 'Only add items that are listed in the corresponding job profile category and appear in the resume.',
    '',
    listSection('Job profile must-have skills', jobProfile.mustHaveSkills ?? []),
    listSection('Job profile nice-to-have skills', jobProfile.niceToHaveSkills ?? []),
    listSection('Job profile tools & tech', jobProfile.toolsAndTech ?? []),
    '',
    listSection('Manual must-have matches', params.manualMustHave),
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
            'You verify resume evidence. Respond ONLY with JSON of shape '
            + '{"extraMustHave":["skill"],"extraNiceToHave":["skill"],"extraTools":["tool"]}. '
            + 'Do not invent new skills; only list items present in the resume text and in the provided job profile lists.'
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

    const allowedMust = new Set(
      (jobProfile.mustHaveSkills ?? []).map(normalizeValue)
    );
    const allowedNice = new Set(
      (jobProfile.niceToHaveSkills ?? []).map(normalizeValue)
    );
    const allowedTools = new Set(
      (jobProfile.toolsAndTech ?? []).map(normalizeValue)
    );

    const manualMustSet = new Set(params.manualMustHave.map(normalizeValue));
    const manualNiceSet = new Set(params.manualNiceToHave.map(normalizeValue));
    const manualToolSet = new Set(params.manualTools.map(normalizeValue));

    return {
      extraMustHave: sanitizeExtras(parsed.extraMustHave, allowedMust, manualMustSet),
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

// Enhanced system message with numbered hard rules
const SYSTEM_MESSAGE = `You are an expert resume parser. Return **only minified JSON** that matches the schema below.

**CRITICAL: Your response MUST have exactly 4 root keys: "resume", "scores", "analysis", "summary". All four are REQUIRED.**

**Hard requirements (follow all):**

1. **Output:** JSON only. No prose, markdown, comments, or extra keys.
2. **Root object keys**: EXACTLY \`resume\`, \`scores\`, \`analysis\`, \`summary\`. **ALL FOUR REQUIRED**. No others.
3. **Scalars policy:** For these scalar fields -
   \`resume.candidate.name\`, \`resume.candidate.linkedinUrl\`, \`resume.candidate.currentLocation\`,
   \`resume.employment[i].title\`, \`resume.employment[i].startDate\`, \`resume.employment[i].endDate\`, \`resume.employment[i].employmentType\`,
   - **always include the key**. If unknown, set to **null**. **Never** use arrays, objects, or empty strings.
4. **Dates:** \`YYYY\` or \`YYYY-MM\`. Use \`"Present"\` only inside the model, but **output** \`null\` for ongoing roles.
5. **Arrays policy:** \`emails\`, \`phones\`, \`skills\`, \`education\`, \`employment\` are arrays; if none, use \`[]\`.
6. **SCORES ARE MANDATORY:** The \`scores\` object with \`matchScore\`, \`companyScore\`, \`fakeScore\` MUST be included. All are integers **0-100**. Set \`matchScore\` to 0 (system recalculates) but you MUST provide a number. NEVER omit the scores object.
7. **ANALYSIS REQUIRED:** The \`analysis\` object must exist exactly as shown in the schema. Arrays must contain strings (matching job profile wording when possible) or be \`[]\`.
8. **Summary:** \`summary\` must be a **single string** at the root, <=140 chars. Never null/array/object. If unsure, use \`""\`.
9. **Grounding:** Use only the job text and resume text. Do **not** invent facts. If company reputation is unclear, set \`companyScore\` to about **50**.
10. **BE CONCISE:** Limit employment history to last 10 jobs max. Keep skills list under 30 items. Omit verbose descriptions. Use minified JSON (no spaces).

**WRONG examples (do not do):**

* \`"linkedinUrl": []\` (should be \`null\`)
* \`"summary": ["Senior .NET dev", "React"]\` (should be \`"Senior .NET dev"\`)
* Missing the \`scores\` object (MUST be present!)
* Missing the \`summary\` field (MUST be present!)

**Return complete JSON with resume, scores, analysis, and summary.**`;

const formatList = (items: string[], max = 8) => {
  if (!items || items.length === 0) {
    return 'none';
  }
  const sliced = items.slice(0, max);
  let text = sliced.join(', ');
  if (items.length > sliced.length) {
    text += ', ...';
  }
  return text;
};

const formatYears = (value: number | null | undefined) => {
  if (value === null || value === undefined) {
    return 'unspecified';
  }
  return `${value} years`;
};

// Enhanced user message template with proper fencing and structure
function buildUserMessage(jobContext: JobContext, resumeText: string): string {
  const profile = jobContext.jobProfile;
  const profileSection = profile
    ? `PROFILE SNAPSHOT (AI extracted):
- Must-have skills: ${formatList(profile.mustHaveSkills)}
- Nice-to-have skills: ${formatList(profile.niceToHaveSkills)}
- Target titles: ${formatList(profile.targetTitles)}
- Responsibilities: ${formatList(profile.responsibilities)}
- Tools & tech: ${formatList(profile.toolsAndTech)}
- Domain keywords: ${formatList(profile.domainKeywords)}
- Certifications: ${formatList(profile.certifications)}
- Disqualifiers: ${formatList(profile.disqualifiers)}
- Required experience: ${formatYears(profile.requiredExperienceYears)}
- Preferred experience: ${formatYears(profile.preferredExperienceYears)}
- Location constraints: ${profile.locationConstraints ?? 'unspecified'}`
    : 'PROFILE SNAPSHOT: No structured profile available. Use job summary and description snippet.';

  return `JOB CONTEXT
Title: ${jobContext.jobTitle}

Summary:
${jobContext.jobDescriptionShort}

${profileSection}

RAW DESCRIPTION SNIPPET:
<<<JOB_DESCRIPTION
${jobContext.jobDescriptionExcerpt}
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
  "analysis": {
    "mustHaveSkillsMatched": ["string"],
    "mustHaveSkillsMissing": ["string"],
    "niceToHaveSkillsMatched": ["string"],
    "targetTitlesMatched": ["string"],
    "responsibilitiesMatched": ["string"],
    "toolsAndTechMatched": ["string"],
    "domainKeywordsMatched": ["string"],
    "certificationsMatched": ["string"],
    "disqualifiersDetected": ["string"],
    "notes": "string|null"
  },
  "summary": "string"
}

ANALYSIS RULES (MANDATORY):
- List matched/missing items using EXACT wording from the job profile lists above whenever possible.
- If nothing applies, return an empty array ([]) for that field.
- Disqualifiers should list any risk factors (e.g., missing required documents, visa issues, location conflicts).
- Notes may highlight nuance in <=150 chars or be null.

SCORING PLACEHOLDER:
- Set matchScore to 0 (the system will compute final points).
- Continue estimating companyScore and fakeScore based on resume evidence only.

RESUME (redacted):
<<<RESUME_TEXT
${resumeText}
RESUME_TEXT

REMINDER: Your response MUST include:
1. "resume" object with all candidate data
2. "scores" object with matchScore, companyScore, fakeScore (ALL REQUIRED!)
3. "summary" string

Return complete JSON now.`;
}

// Main parsing function - single call to gpt-4o-mini with no fallback
async function callOpenAIForParsing(
  jobContext: JobContext,
  redactedText: string,
  timeoutMs: number = 20000
): Promise<ParseResult> {
  try {
    const model = process.env.OPENAI_RESUME_MODEL || 'gpt-4o-mini';
    const temperature = Number(process.env.OPENAI_TEMPERATURE || 0.1);

    const systemMessage = SYSTEM_MESSAGE;
    const userMessage = buildUserMessage(jobContext, redactedText);

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

    if (!parsedData?.scores) {
      resumeLogError('openai response missing scores', {
        keys: Object.keys(parsedData || {})
      });
    }

    return {
      success: true,
      data: parsedData,
      tokensUsed
    };

  } catch (error: any) {
    const isAbort = error?.name === 'AbortError';
    resumeLogError('openai api error', {
      timeoutMs,
      error: isAbort ? 'timeout' : error?.message
    });
    return {
      success: false,
      error: isAbort ? `OpenAI timeout after ${timeoutMs}ms` : (error instanceof Error ? error.message : 'Unknown OpenAI API error')
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

    // Log final validated scores
    resumeLogInfo('scores validated', {
      matchScore: validated.scores.matchScore,
      companyScore: validated.scores.companyScore,
      fakeScore: validated.scores.fakeScore
    });

    // Warn if scores are suspiciously low/default
    if (validated.scores.matchScore === 0 && validated.scores.companyScore === 0 && validated.scores.fakeScore === 0) {
      resumeLogWarn('openai scores all zero', {});
    }

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
  extras?: {
    manualSkills?: string[];
    aiExtraSkills?: string[];
    manualTools?: string[];
    aiExtraTools?: string[];
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
    parseError: null,
    manualSkillsMatched: extras?.manualSkills && extras.manualSkills.length > 0 ? extras.manualSkills : null,
    aiExtraSkills: extras?.aiExtraSkills && extras.aiExtraSkills.length > 0 ? extras.aiExtraSkills : null,
    manualToolsMatched: extras?.manualTools && extras.manualTools.length > 0 ? extras.manualTools : null,
    aiExtraTools: extras?.aiExtraTools && extras.aiExtraTools.length > 0 ? extras.aiExtraTools : null
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

    // Call OpenAI for parsing with timeout
    const parseResult = await callOpenAIForParsing(jobContext, processedText, timeoutMs);

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

    let manualMustMatches: string[] = [];
    let manualNiceMatches: string[] = [];
    let manualToolsMatches: string[] = [];
    let manualSkillsCombined: string[] = [];
    let aiExtraSkills: string[] = [];
    let aiExtraTools: string[] = [];

    if (jobContext.jobProfile && resume.rawText) {
      const tokens = buildResumeTokens(resume.rawText);
      manualMustMatches = matchPhrasesInResume(jobContext.jobProfile.mustHaveSkills ?? [], tokens);
      manualNiceMatches = matchPhrasesInResume(jobContext.jobProfile.niceToHaveSkills ?? [], tokens);
      manualToolsMatches = matchPhrasesInResume(jobContext.jobProfile.toolsAndTech ?? [], tokens);

      manualSkillsCombined = dedupePreserveOrder([...manualMustMatches, ...manualNiceMatches]);

      const manualSkillSet = new Set(manualSkillsCombined.map(normalizeValue));
      const manualToolSet = new Set(manualToolsMatches.map(normalizeValue));

      const aiMustOriginal = Array.isArray(validatedData.analysis.mustHaveSkillsMatched)
        ? validatedData.analysis.mustHaveSkillsMatched
        : [];
      const aiNiceOriginal = Array.isArray(validatedData.analysis.niceToHaveSkillsMatched)
        ? validatedData.analysis.niceToHaveSkillsMatched
        : [];
      const aiToolsOriginal = Array.isArray(validatedData.analysis.toolsAndTechMatched)
        ? validatedData.analysis.toolsAndTechMatched
        : [];

      validatedData.analysis.mustHaveSkillsMatched = manualMustMatches;
      validatedData.analysis.mustHaveSkillsMissing = (jobContext.jobProfile.mustHaveSkills ?? []).filter(
        skill => !manualSkillSet.has(normalizeValue(skill))
      );
      validatedData.analysis.niceToHaveSkillsMatched = manualNiceMatches;
      validatedData.analysis.toolsAndTechMatched = manualToolsMatches;

      const verification = await verifySkillMatchesWithAI({
        resumeText: processedText,
        jobProfile: jobContext.jobProfile,
        manualMustHave: manualMustMatches,
        manualNiceToHave: manualNiceMatches,
        manualTools: manualToolsMatches
      });

      if (verification) {
        const combinedExtras = dedupePreserveOrder([
          ...(verification.extraMustHave ?? []),
          ...(verification.extraNiceToHave ?? [])
        ]);

        aiExtraSkills = combinedExtras.filter(skill => !manualSkillSet.has(normalizeValue(skill)));
        aiExtraTools = dedupePreserveOrder(verification.extraTools ?? []).filter(
          tool => !manualToolSet.has(normalizeValue(tool))
        );
      } else {
        const aiSkillUnion = dedupePreserveOrder([...aiMustOriginal, ...aiNiceOriginal]);
        aiExtraSkills = aiSkillUnion.filter(skill => !manualSkillSet.has(normalizeValue(skill)));
        aiExtraTools = dedupePreserveOrder(aiToolsOriginal).filter(
          tool => !manualToolSet.has(normalizeValue(tool))
        );
      }
    } else {
      manualSkillsCombined = [];
      manualToolsMatches = [];
      aiExtraSkills = [];
      aiExtraTools = [];
    }

    resumeLogInfo('skill_match_summary', {
      resumeId,
      manualMustHave: manualMustMatches.length,
      manualNiceToHave: manualNiceMatches.length,
      manualTools: manualToolsMatches.length,
      aiExtraSkills: aiExtraSkills.length,
      aiExtraTools: aiExtraTools.length
    });

    let matchScoreDetails: MatchScoreDetails | null = null;
    if (jobContext.jobProfile && validatedData.analysis) {
      try {
        matchScoreDetails = computeProfileMatchScore(jobContext.jobProfile, validatedData.analysis);
        validatedData.scores.matchScore = matchScoreDetails.finalScore;
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
    const resumeFields = toResumeDbFields(validatedData, {
      manualSkills: manualSkillsCombined,
      aiExtraSkills,
      manualTools: manualToolsMatches,
      aiExtraTools
    });
    resumeFields.textHash = textHash;

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
              companyScore: validatedData.scores.companyScore,
              fakeScore: toNumber(resumeAfter?.fakeScore),
              originalName: resumeAfter?.originalName ?? null,
              sourceFrom: resumeAfter?.sourceFrom ?? null
            },
            validatedData.scores.matchScore
          );

          await withRetry(() =>
            prisma.jobApplication.update({
              where: { id: app.id },
              data: {
                matchScore: validatedData.scores.matchScore,
                aiCompanyScore: validatedData.scores.companyScore,
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
      matchScore: validatedData.scores.matchScore,
      companyScore: validatedData.scores.companyScore,
      fakeScore: validatedData.scores.fakeScore,
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

