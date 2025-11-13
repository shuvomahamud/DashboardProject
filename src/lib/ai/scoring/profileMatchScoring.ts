import type { JobProfile } from '../jobProfileService';
import type { ProfileAnalysis } from '../resumeParsingService';
import type { SkillRequirementEvaluationSummary } from '../skillRequirements';
import type { ExperienceRequirements } from '@/lib/jobs/experience';
import { clampExperienceYears, mergeExperienceRequirements, normalizeExperienceRequirements } from '@/lib/jobs/experience';

export interface DimensionBreakdown {
  label: string;
  available: number;
  matched: number;
  weight: number;
  scaledWeight: number;
  ratio: number;
  score: number;
}

export interface MandatoryContribution {
  skill: string;
  matched: boolean;
  manualFound: boolean;
  aiFound: boolean;
  maxContribution: number;
  contribution: number;
  ratio: number;
}

export interface MatchScoreDetails {
  baseScore: number;
  finalScore: number;
  mandatoryScore: number;
  mandatoryMaxPoints: number;
  profileScore: number;
  profileMaxPoints: number;
  experienceScore: number;
  experienceMaxPoints: number;
  candidateExperienceYears: number | null;
  experienceRequirements: ExperienceRequirements;
  penalties: {
    disqualifierPenalty: number;
  };
  breakdown: Record<string, DimensionBreakdown>;
  mandatoryBreakdown: MandatoryContribution[];
  disqualifiersDetected: string[];
  notes: string | null;
  mandatorySkills?: SkillRequirementEvaluationSummary;
}

interface MatchScoreOptions {
  candidateExperienceYears?: number | null;
  experienceRequirements?: ExperienceRequirements | null;
}

const DIMENSION_CONFIG: Array<{
  profileKey: keyof JobProfile;
  analysisKey: keyof ProfileAnalysis;
  label: string;
  weight: number;
}> = [
  { profileKey: 'niceToHaveSkills', analysisKey: 'niceToHaveSkillsMatched', label: 'Nice-to-have Skills', weight: 30 },
  { profileKey: 'targetTitles', analysisKey: 'targetTitlesMatched', label: 'Target Titles', weight: 20 },
  { profileKey: 'responsibilities', analysisKey: 'responsibilitiesMatched', label: 'Responsibilities', weight: 10 },
  { profileKey: 'toolsAndTech', analysisKey: 'toolsAndTechMatched', label: 'Tools & Technologies', weight: 20 },
  { profileKey: 'domainKeywords', analysisKey: 'domainKeywordsMatched', label: 'Domain Keywords', weight: 10 }
];

const DISQUALIFIER_PENALTY = 25;
const MANDATORY_TOTAL_POINTS = 70;
const PROFILE_TOTAL_POINTS = 15;
const EXPERIENCE_TOTAL_POINTS = 15;
const EXPERIENCE_BREAKDOWN_LABEL = 'Experience Alignment';

const normalize = (value: string) => value.trim().toLowerCase();

const stripNotSpecified = (list: string[] | undefined | null) =>
  (list ?? []).filter(item => item && normalize(item) !== 'not specified');

function computeMandatoryContribution(
  summary: SkillRequirementEvaluationSummary | null | undefined
): {
  score: number;
  maxPoints: number;
  breakdown: MandatoryContribution[];
  completed: number;
  total: number;
} {
  const evaluations = summary?.evaluations ?? [];
  if (!evaluations.length) {
    return {
      score: 0,
      maxPoints: 0,
      breakdown: [],
      completed: 0,
      total: 0
    };
  }

  const maxPoints = MANDATORY_TOTAL_POINTS;
  const perRequirement = evaluations.length > 0 ? maxPoints / evaluations.length : 0;
  let score = 0;
  let completed = 0;

  const breakdown = evaluations.map<MandatoryContribution>(evaluation => {
    const matched = evaluation.matched;
    const ratio = matched ? 1 : 0;
    const contribution = matched ? perRequirement : 0;
    if (matched) {
      completed += 1;
      score += contribution;
    }

    return {
      skill: evaluation.skill,
      matched,
      manualFound: evaluation.manualFound,
      aiFound: evaluation.aiFound,
      maxContribution: perRequirement,
      contribution,
      ratio
    };
  });

  return {
    score,
    maxPoints,
    breakdown,
    completed,
    total: evaluations.length
  };
}

function computeExperienceContribution(
  candidateExperienceYears: number | null | undefined,
  requirements: ExperienceRequirements
): {
  candidateYears: number | null;
  rawScore: number;
  ratio: number;
  available: number;
  matched: number;
  maxPoints: number;
} {
  const candidateYears = clampExperienceYears(candidateExperienceYears);
  if (requirements.requiredYears === null) {
    return {
      candidateYears,
      rawScore: 0,
      ratio: 0,
      available: 0,
      matched: 0,
      maxPoints: 0
    };
  }

  const hasPreferred = requirements.preferredMinYears !== null;
  const requiredWeight = hasPreferred ? EXPERIENCE_TOTAL_POINTS * 0.6 : EXPERIENCE_TOTAL_POINTS;
  const preferredWeight = hasPreferred ? EXPERIENCE_TOTAL_POINTS - requiredWeight : 0;
  let requiredScore = 0;
  let preferredScore = 0;
  let matched = 0;
  const available = hasPreferred ? 2 : 1;

  if (candidateYears !== null) {
    const meetsRequired = candidateYears >= requirements.requiredYears;
    if (meetsRequired) {
      matched += 1;
      requiredScore = requiredWeight;
    } else {
      const grace = Math.min(2, Math.max(0.5, requirements.requiredYears * 0.25));
      const lowerBound = Math.max(0, requirements.requiredYears - grace);
      const span = Math.max(1, requirements.requiredYears - lowerBound);
      if (candidateYears > lowerBound) {
        const progress = Math.min(1, Math.max(0, (candidateYears - lowerBound) / span));
        requiredScore = requiredWeight * progress;
      }
    }

    if (hasPreferred && meetsRequired) {
      const preferredMin = Math.max(requirements.requiredYears, requirements.preferredMinYears!);
      const preferredMax = Math.max(preferredMin, requirements.preferredMaxYears ?? preferredMin);

      if (candidateYears >= preferredMin && candidateYears <= preferredMax) {
        matched = 2;
        preferredScore = preferredWeight;
      } else if (candidateYears < preferredMin) {
        const span = Math.max(1, preferredMin - requirements.requiredYears);
        const distance = Math.max(0, candidateYears - requirements.requiredYears);
        const progress = Math.min(1, distance / span);
        preferredScore = preferredWeight * (0.5 + 0.5 * progress);
      } else {
        const buffer = Math.max(2, preferredMax * 0.5);
        const overage = candidateYears - preferredMax;
        if (overage >= buffer) {
          preferredScore = preferredWeight * 0.6;
        } else {
          const decay = overage / buffer;
          preferredScore = preferredWeight * (0.6 + 0.4 * (1 - decay));
        }
      }
    }
  }

  const rawScore = Math.min(
    EXPERIENCE_TOTAL_POINTS,
    Math.max(0, requiredScore + preferredScore)
  );
  const ratio = EXPERIENCE_TOTAL_POINTS > 0 ? rawScore / EXPERIENCE_TOTAL_POINTS : 0;

  return {
    candidateYears,
    rawScore,
    ratio,
    available,
    matched,
    maxPoints: EXPERIENCE_TOTAL_POINTS
  };
}

export function computeProfileMatchScore(
  profile: JobProfile,
  analysis: ProfileAnalysis,
  mandatorySummary?: SkillRequirementEvaluationSummary | null,
  options?: MatchScoreOptions
): MatchScoreDetails {
  const breakdown: Record<string, DimensionBreakdown> = {};

  const activeDimensions = DIMENSION_CONFIG.filter(({ profileKey }) => {
    const items = stripNotSpecified(profile[profileKey] as string[] | null | undefined);
    return items.length > 0;
  });

  const totalActiveWeight = activeDimensions.reduce((sum, dim) => sum + dim.weight, 0);
  const weightScale = totalActiveWeight > 0 ? PROFILE_TOTAL_POINTS / totalActiveWeight : 0;

  let profileScore = 0;

  activeDimensions.forEach(config => {
    const profileItems = stripNotSpecified(profile[config.profileKey] as string[] | null | undefined);
    if (profileItems.length === 0) {
      return;
    }

    const matchedItems = Array.isArray(analysis[config.analysisKey])
      ? (analysis[config.analysisKey] as string[])
      : [];

    const profileSet = new Set(profileItems.map(normalize));
    const matchedSet = new Set(matchedItems.map(normalize));
    let hits = 0;
    profileSet.forEach(item => {
      if (matchedSet.has(item)) {
        hits += 1;
      }
    });

    const ratio = profileItems.length === 0 ? 0 : Math.min(hits / profileItems.length, 1);
    const scaledWeight = config.weight * weightScale;
    const dimensionScore = scaledWeight * ratio;

    profileScore += dimensionScore;

    breakdown[config.label] = {
      label: config.label,
      available: profileItems.length,
      matched: hits,
      weight: config.weight,
      scaledWeight,
      ratio,
      score: dimensionScore
    };
  });

  const mandatoryResult = computeMandatoryContribution(mandatorySummary ?? null);
  const mandatoryScore = mandatoryResult.score;
  const mandatoryMaxPoints = mandatoryResult.maxPoints;

  if (mandatoryResult.total > 0) {
    const mandatoryRatio =
      mandatoryMaxPoints > 0 ? Math.min(1, Math.max(0, mandatoryScore / mandatoryMaxPoints)) : 0;
    breakdown['Mandatory Skills'] = {
      label: 'Mandatory Skills',
      available: mandatoryResult.total,
      matched: mandatoryResult.completed,
      weight: MANDATORY_TOTAL_POINTS,
      scaledWeight: mandatoryMaxPoints,
      ratio: mandatoryRatio,
      score: mandatoryScore
    };
  }

  const profileExperience = normalizeExperienceRequirements({
    requiredYears: profile.requiredExperienceYears ?? null,
    preferredMinYears: profile.preferredExperienceYears ?? null,
    preferredMaxYears: profile.preferredExperienceYears ?? null
  });
  const contextualExperience = options?.experienceRequirements
    ? normalizeExperienceRequirements(options.experienceRequirements)
    : null;
  const experienceRequirements = mergeExperienceRequirements(
    contextualExperience,
    profileExperience
  );
  const experienceResult = computeExperienceContribution(
    options?.candidateExperienceYears ?? null,
    experienceRequirements
  );

  if (experienceResult.maxPoints > 0) {
    breakdown[EXPERIENCE_BREAKDOWN_LABEL] = {
      label: EXPERIENCE_BREAKDOWN_LABEL,
      available: experienceResult.available,
      matched: experienceResult.matched,
      weight: EXPERIENCE_TOTAL_POINTS,
      scaledWeight: experienceResult.maxPoints,
      ratio: experienceResult.ratio,
      score: experienceResult.rawScore
    };
  }

  const baseScore = mandatoryScore + profileScore + experienceResult.rawScore;

  let finalScore = baseScore;
  let disqualifierPenalty = 0;
  const disqualifiersDetected = analysis.disqualifiersDetected ?? [];

  if (stripNotSpecified(profile.disqualifiers).length > 0 && disqualifiersDetected.length > 0) {
    disqualifierPenalty = DISQUALIFIER_PENALTY;
    finalScore -= disqualifierPenalty;
  }

  finalScore = Math.max(0, Math.min(100, Math.round(finalScore)));
  const roundedBase = Math.max(0, Math.min(100, Math.round(baseScore)));
  const roundedExperienceScore = Math.max(
    0,
    Math.min(EXPERIENCE_TOTAL_POINTS, Math.round(experienceResult.rawScore))
  );

  return {
    baseScore: roundedBase,
    finalScore,
    mandatoryScore: Math.max(0, Math.min(MANDATORY_TOTAL_POINTS, Math.round(mandatoryScore))),
    mandatoryMaxPoints,
    profileScore: Math.max(0, Math.min(PROFILE_TOTAL_POINTS, Math.round(profileScore))),
    profileMaxPoints: PROFILE_TOTAL_POINTS,
    experienceScore: roundedExperienceScore,
    experienceMaxPoints: experienceResult.maxPoints,
    candidateExperienceYears: experienceResult.candidateYears,
    experienceRequirements,
    penalties: {
      disqualifierPenalty
    },
    breakdown,
    mandatoryBreakdown: mandatoryResult.breakdown,
    disqualifiersDetected,
    notes: analysis.notes ?? null,
    mandatorySkills: mandatorySummary ?? undefined
  };
}
