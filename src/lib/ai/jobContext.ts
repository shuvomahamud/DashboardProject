import type { JobProfile } from './jobProfileService';
import { parseJobProfile } from './jobProfileService';
import type { SkillRequirement } from './skillRequirements';
import { parseSkillRequirementConfig } from './skillRequirements';
import {
  ExperienceRequirements,
  mergeExperienceRequirements,
  normalizeExperienceRequirements
} from '@/lib/jobs/experience';

export interface JobContext {
  jobTitle: string;
  jobDescriptionShort: string;
  jobDescriptionExcerpt: string;
  jobProfile: JobProfile | null;
  mandatorySkillRequirements: SkillRequirement[];
  experience: ExperienceRequirements;
}

interface BuildJobContextParams {
  title: string;
  description?: string | null;
  aiJobProfileJson?: string | null;
  fallbackSummary?: string | null;
  mandatorySkillRequirements?: unknown;
  requiredExperienceYears?: number | null;
  preferredExperienceMinYears?: number | null;
  preferredExperienceMaxYears?: number | null;
}

export function buildJobContext({
  title,
  description,
  aiJobProfileJson,
  fallbackSummary,
  mandatorySkillRequirements,
  requiredExperienceYears,
  preferredExperienceMinYears,
  preferredExperienceMaxYears
}: BuildJobContextParams): JobContext {
  const rawDescription = description?.trim() ?? '';
  const profile = parseJobProfile(aiJobProfileJson);
  const requirements = parseSkillRequirementConfig(mandatorySkillRequirements);

  const summary = profile?.summary?.trim() ?? fallbackSummary?.trim() ?? rawDescription;
  const shortSummary = summary.length > 500 ? `${summary.substring(0, 500)}...` : summary;
  const excerpt = rawDescription.length > 800 ? `${rawDescription.substring(0, 800)}...` : rawDescription;
  const jobExperience = normalizeExperienceRequirements({
    requiredYears: requiredExperienceYears ?? null,
    preferredMinYears: preferredExperienceMinYears ?? null,
    preferredMaxYears: preferredExperienceMaxYears ?? null
  });
  const profileExperience = normalizeExperienceRequirements({
    requiredYears: profile?.requiredExperienceYears ?? null,
    preferredMinYears: profile?.preferredExperienceYears ?? null,
    preferredMaxYears: profile?.preferredExperienceYears ?? null
  });
  const experience = mergeExperienceRequirements(jobExperience, profileExperience);

  return {
    jobTitle: title,
    jobDescriptionShort: shortSummary || title,
    jobDescriptionExcerpt: excerpt,
    jobProfile: profile,
    mandatorySkillRequirements: requirements,
    experience
  };
}
