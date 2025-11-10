import type { JobProfile } from '../jobProfileService';
import type { ProfileAnalysis } from '../resumeParsingService';
import type { SkillRequirementEvaluationSummary } from '../skillRequirements';

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
  penalties: {
    disqualifierPenalty: number;
  };
  breakdown: Record<string, DimensionBreakdown>;
  mandatoryBreakdown: MandatoryContribution[];
  disqualifiersDetected: string[];
  notes: string | null;
  mandatorySkills?: SkillRequirementEvaluationSummary;
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
const PROFILE_TOTAL_POINTS = 30;

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

export function computeProfileMatchScore(
  profile: JobProfile,
  analysis: ProfileAnalysis,
  mandatorySummary?: SkillRequirementEvaluationSummary | null
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

  const baseScore = mandatoryScore + profileScore;

  let finalScore = baseScore;
  let disqualifierPenalty = 0;
  const disqualifiersDetected = analysis.disqualifiersDetected ?? [];

  if (stripNotSpecified(profile.disqualifiers).length > 0 && disqualifiersDetected.length > 0) {
    disqualifierPenalty = DISQUALIFIER_PENALTY;
    finalScore -= disqualifierPenalty;
  }

  finalScore = Math.max(0, Math.min(100, Math.round(finalScore)));
  const roundedBase = Math.max(0, Math.min(100, Math.round(baseScore)));

  return {
    baseScore: roundedBase,
    finalScore,
    mandatoryScore: Math.max(0, Math.min(MANDATORY_TOTAL_POINTS, Math.round(mandatoryScore))),
    mandatoryMaxPoints,
    profileScore: Math.max(0, Math.min(PROFILE_TOTAL_POINTS, Math.round(profileScore))),
    profileMaxPoints: PROFILE_TOTAL_POINTS,
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
