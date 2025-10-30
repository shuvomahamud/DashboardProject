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

export interface MatchScoreDetails {
  baseScore: number;
  finalScore: number;
  penalties: {
    disqualifierPenalty: number;
    mustHaveCapApplied: boolean;
  };
  breakdown: Record<string, DimensionBreakdown>;
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
  { profileKey: 'mustHaveSkills', analysisKey: 'mustHaveSkillsMatched', label: 'Must-have Skills', weight: 45 },
  { profileKey: 'niceToHaveSkills', analysisKey: 'niceToHaveSkillsMatched', label: 'Nice-to-have Skills', weight: 15 },
  { profileKey: 'targetTitles', analysisKey: 'targetTitlesMatched', label: 'Target Titles', weight: 10 },
  { profileKey: 'responsibilities', analysisKey: 'responsibilitiesMatched', label: 'Responsibilities', weight: 5 },
  { profileKey: 'toolsAndTech', analysisKey: 'toolsAndTechMatched', label: 'Tools & Technologies', weight: 10 },
  { profileKey: 'domainKeywords', analysisKey: 'domainKeywordsMatched', label: 'Domain Keywords', weight: 5 },
  { profileKey: 'certifications', analysisKey: 'certificationsMatched', label: 'Certifications', weight: 5 }
];

const DISQUALIFIER_PENALTY = 25;
const MUST_HAVE_CAP = 40;

const normalize = (value: string) => value.trim().toLowerCase();

const stripNotSpecified = (list: string[] | undefined | null) =>
  (list ?? []).filter(item => item && normalize(item) !== 'not specified');

export function computeProfileMatchScore(
  profile: JobProfile,
  analysis: ProfileAnalysis
): MatchScoreDetails {
  const breakdown: Record<string, DimensionBreakdown> = {};

  const activeDimensions = DIMENSION_CONFIG.filter(({ profileKey }) => {
    const items = stripNotSpecified(profile[profileKey] as string[] | null | undefined);
    return items.length > 0;
  });

  const totalActiveWeight = activeDimensions.reduce((sum, dim) => sum + dim.weight, 0);
  const weightScale = totalActiveWeight > 0 ? 100 / totalActiveWeight : 0;

  let baseScore = 0;

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

    baseScore += dimensionScore;

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

  let finalScore = baseScore;
  let disqualifierPenalty = 0;
  const disqualifiersDetected = analysis.disqualifiersDetected ?? [];

  if (stripNotSpecified(profile.disqualifiers).length > 0 && disqualifiersDetected.length > 0) {
    disqualifierPenalty = DISQUALIFIER_PENALTY;
    finalScore -= disqualifierPenalty;
  }

  let mustHaveCapApplied = false;
  const mustHaveProfile = stripNotSpecified(profile.mustHaveSkills);
  if (
    mustHaveProfile.length > 0 &&
    Array.isArray(analysis.mustHaveSkillsMissing) &&
    analysis.mustHaveSkillsMissing.length > 0
  ) {
    finalScore = Math.min(finalScore, MUST_HAVE_CAP);
    mustHaveCapApplied = true;
  }

  finalScore = Math.max(0, Math.min(100, Math.round(finalScore)));

  return {
    baseScore: Math.max(0, Math.min(100, Math.round(baseScore))),
    finalScore,
    penalties: {
      disqualifierPenalty,
      mustHaveCapApplied
    },
    breakdown,
    disqualifiersDetected,
    notes: analysis.notes ?? null
  };
}
