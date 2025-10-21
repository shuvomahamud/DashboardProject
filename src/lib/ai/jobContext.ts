import type { JobProfile } from './jobProfileService';
import { parseJobProfile } from './jobProfileService';

export interface JobContext {
  jobTitle: string;
  jobDescriptionShort: string;
  jobDescriptionExcerpt: string;
  jobProfile: JobProfile | null;
}

interface BuildJobContextParams {
  title: string;
  description?: string | null;
  aiJobProfileJson?: string | null;
  fallbackSummary?: string | null;
}

export function buildJobContext({
  title,
  description,
  aiJobProfileJson,
  fallbackSummary
}: BuildJobContextParams): JobContext {
  const rawDescription = description?.trim() ?? '';
  const profile = parseJobProfile(aiJobProfileJson);

  const summary = profile?.summary?.trim() ?? fallbackSummary?.trim() ?? rawDescription;
  const shortSummary = summary.length > 500 ? `${summary.substring(0, 500)}...` : summary;
  const excerpt = rawDescription.length > 800 ? `${rawDescription.substring(0, 800)}...` : rawDescription;

  return {
    jobTitle: title,
    jobDescriptionShort: shortSummary || title,
    jobDescriptionExcerpt: excerpt,
    jobProfile: profile
  };
}
