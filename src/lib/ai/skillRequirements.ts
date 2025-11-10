import { z } from 'zod';

const trimSkill = (value: string) => value.trim().replace(/\s+/g, ' ');

const skillNameSchema = z
  .string()
  .transform(value => trimSkill(value))
  .refine(value => value.length > 0, { message: 'skill name required' })
  .transform(value => (value.length > 120 ? value.slice(0, 120) : value));

const monthsSchema = z
  .union([z.number(), z.string(), z.null(), z.undefined()])
  .transform(value => {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) {
      return null;
    }
    return Math.min(1200, Math.round(numeric));
  });

const confidenceSchema = z
  .union([z.number(), z.string(), z.null(), z.undefined()])
  .transform(value => {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric)) {
      return null;
    }
    return Math.max(0, Math.min(1, numeric));
  });

const manualAssessmentSchema = z.object({
  skill: skillNameSchema,
  months: monthsSchema,
  source: z
    .union([z.string(), z.null(), z.undefined()])
    .transform(value => (value ? value : 'manual')),
  confidence: confidenceSchema,
  notes: z
    .union([z.string(), z.null(), z.undefined()])
    .transform(value => (value ? value.slice(0, 200) : null))
}).transform(value => ({
  ...value,
  months: value.months,
  confidence: value.confidence ?? (value.source === 'manual' ? 1 : null)
}));

const aiSkillExperienceSchema = z.object({
  skill: skillNameSchema,
  months: z
    .union([z.number(), z.string()])
    .transform(value => Math.max(0, Math.min(1200, Math.round(Number(value) || 0)))),
  confidence: confidenceSchema.transform(value => (value === null ? 0.5 : value)),
  evidence: z
    .union([z.string(), z.null(), z.undefined()])
    .transform(value => (value ? value.slice(0, 240) : null)),
  lastUsed: z
    .union([z.string(), z.null(), z.undefined()])
    .transform(value => (value ? value.slice(0, 40) : null)),
  source: z
    .union([z.string(), z.null(), z.undefined()])
    .transform(value => value ?? 'ai')
});

const skillRequirementSchema = z.object({
  skill: skillNameSchema
});

const skillRequirementUnionSchema = z.union([skillRequirementSchema, skillNameSchema]);

const skillRequirementArraySchema = z
  .array(skillRequirementUnionSchema)
  .max(100)
  .transform(list =>
    dedupeBySkill(
      list.map(item => (typeof item === 'string' ? { skill: item } : item))
    )
  );

export type SkillRequirement = z.infer<typeof skillRequirementSchema>;

export interface ManualSkillAssessment extends z.infer<typeof manualAssessmentSchema> {}
export interface SkillExperienceEntry extends z.infer<typeof aiSkillExperienceSchema> {}

export interface SkillRequirementEvaluation {
  skill: string;
  matched: boolean;
  manualFound: boolean;
  aiFound: boolean;
}

export interface SkillRequirementEvaluationSummary {
  evaluations: SkillRequirementEvaluation[];
  allMet: boolean;
  manualCoverageMissing: string[];
  unmetRequirements: string[];
  metRequirements: string[];
  aiDetectedWithoutManual: string[];
}

const normalizeSkillKey = (value: string) => value.trim().toLowerCase();

function dedupeBySkill<T extends { skill: string }>(list: T[]): T[] {
  const seen = new Map<string, T>();
  for (const entry of list) {
    const key = normalizeSkillKey(entry.skill);
    if (!seen.has(key)) {
      seen.set(key, entry);
      continue;
    }
    const existing = seen.get(key)!;
    // Prefer entry with higher inferred months if available
    const existingMonths = (existing as any).months ?? 0;
    const incomingMonths = (entry as any).months ?? 0;
    if (incomingMonths > existingMonths) {
      seen.set(key, entry);
    }
  }
  return Array.from(seen.values());
}

function coerceToArray(input: unknown): unknown[] {
  if (Array.isArray(input)) {
    return input;
  }
  if (input === null || input === undefined) {
    return [];
  }
  if (typeof input === 'string') {
    try {
      const parsed = JSON.parse(input);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function parseSkillRequirementConfig(input: unknown): SkillRequirement[] {
  const items = coerceToArray(input);
  const result = skillRequirementArraySchema.safeParse(items);
  if (!result.success) {
    return [];
  }
  return result.data;
}

export function parseManualSkillAssessments(input: unknown): ManualSkillAssessment[] {
  if (Array.isArray(input) && input.every(item => typeof item === 'string')) {
    const transformed = (input as string[]).map(skill => ({
      skill,
      months: null,
      source: 'legacy_list',
      confidence: null,
      notes: null
    }));
    return dedupeBySkill(transformed);
  }

  const items = coerceToArray(input);
  const result = z.array(manualAssessmentSchema).safeParse(items);
  if (!result.success) {
    return [];
  }
  return dedupeBySkill(result.data);
}

export function parseAiSkillExperience(input: unknown): SkillExperienceEntry[] {
  const items = coerceToArray(input);
  const result = z.array(aiSkillExperienceSchema).safeParse(items);
  if (!result.success) {
    return [];
  }
  return dedupeBySkill(result.data);
}

export function evaluateSkillRequirements(
  requirements: SkillRequirement[],
  manualAssessments: ManualSkillAssessment[],
  aiExperiences: SkillExperienceEntry[]
): SkillRequirementEvaluationSummary {
  if (!requirements.length) {
    return {
      evaluations: [],
      allMet: true,
      manualCoverageMissing: [],
      unmetRequirements: [],
      aiDetectedWithoutManual: [],
      metRequirements: []
    };
  }

  const manualMap = new Map<string, ManualSkillAssessment>();
  for (const assessment of manualAssessments) {
    const key = normalizeSkillKey(assessment.skill);
    if (!manualMap.has(key)) {
      manualMap.set(key, assessment);
    }
  }

  const aiMap = new Map<string, SkillExperienceEntry>();
  for (const entry of aiExperiences) {
    const key = normalizeSkillKey(entry.skill);
    const existing = aiMap.get(key);
    if (!existing || entry.months > existing.months) {
      aiMap.set(key, entry);
    }
  }

  const evaluations: SkillRequirementEvaluation[] = [];
  const manualCoverageMissing: string[] = [];
  const unmetRequirements: string[] = [];
  const metRequirements: string[] = [];
  const aiDetectedWithoutManual: string[] = [];

  for (const requirement of requirements) {
    const key = normalizeSkillKey(requirement.skill);
    const manualFound = manualMap.has(key);
    const aiFound = aiMap.has(key);
    const matched = manualFound || aiFound;

    if (!manualFound) {
      manualCoverageMissing.push(requirement.skill);
      if (aiFound) {
        aiDetectedWithoutManual.push(requirement.skill);
      }
    }

    if (matched) {
      metRequirements.push(requirement.skill);
    } else {
      unmetRequirements.push(requirement.skill);
    }

    evaluations.push({
      skill: requirement.skill,
      matched,
      manualFound,
      aiFound
    });
  }

  return {
    evaluations,
    allMet: evaluations.every(item => item.matched),
    manualCoverageMissing: dedupeSkillList(manualCoverageMissing),
    unmetRequirements: dedupeSkillList(unmetRequirements),
    metRequirements: dedupeSkillList(metRequirements),
    aiDetectedWithoutManual: dedupeSkillList(aiDetectedWithoutManual)
  };
}

function dedupeSkillList(list: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const skill of list) {
    const key = normalizeSkillKey(skill);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(skill);
  }
  return result;
}
