import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { JobContext } from '../jobContext';

interface PromptTemplate {
  systemMessage: string;
  userTemplate: string;
}

interface ResumeParserPrompt {
  systemMessage: string;
  userMessage: string;
}

const TEMPLATE_MARKERS = {
  system: '---SYSTEM---',
  user: '---USER---'
} as const;

const TEMPLATE_PATH = path.join(
  process.cwd(),
  'src',
  'lib',
  'ai',
  'prompts',
  'resumeParserPrompt.txt'
);

let cachedTemplate: PromptTemplate | null = null;

function loadPromptTemplate(): PromptTemplate {
  if (cachedTemplate) {
    return cachedTemplate;
  }

  const raw = readFileSync(TEMPLATE_PATH, 'utf8');
  const systemIndex = raw.indexOf(TEMPLATE_MARKERS.system);
  const userIndex = raw.indexOf(TEMPLATE_MARKERS.user);

  if (systemIndex === -1 || userIndex === -1 || userIndex <= systemIndex) {
    throw new Error('Invalid resume parser prompt template format.');
  }

  const systemMessage = raw
    .slice(systemIndex + TEMPLATE_MARKERS.system.length, userIndex)
    .trim();
  const userTemplate = raw
    .slice(userIndex + TEMPLATE_MARKERS.user.length)
    .trim();

  cachedTemplate = { systemMessage, userTemplate };
  return cachedTemplate;
}

const formatList = (items: string[] | undefined | null, max = 8) => {
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

const formatMandatoryRequirements = (items: JobContext['mandatorySkillRequirements']) => {
  if (!items || items.length === 0) {
    return '- None provided.';
  }

  return items
    .slice(0, 40)
    .map(item => `- ${item.skill}`)
    .join('\n');
};

const buildProfileSection = (jobContext: JobContext): string => {
  const profile = jobContext.jobProfile;
  if (!profile) {
    return 'PROFILE SNAPSHOT: No structured profile available. Use job summary and description snippet.';
  }

  return `PROFILE SNAPSHOT (AI extracted):
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
- Location constraints: ${profile.locationConstraints ?? 'unspecified'}`;
};

const buildMandatorySection = (jobContext: JobContext): string => {
  return `MANDATORY SKILL REQUIREMENTS (feed into resume.skillExperience):
${formatMandatoryRequirements(jobContext.mandatorySkillRequirements)}`;
};

const applyReplacements = (template: string, replacements: Record<string, string>): string => {
  let result = template;
  for (const [key, value] of Object.entries(replacements)) {
    const pattern = new RegExp(`{{${key}}}`, 'g');
    result = result.replace(pattern, value);
  }
  return result;
};

export function getResumeParserPrompt(
  jobContext: JobContext,
  resumeText: string
): ResumeParserPrompt {
  const template = loadPromptTemplate();

  const userMessage = applyReplacements(template.userTemplate, {
    JOB_TITLE: jobContext.jobTitle ?? '',
    JOB_SUMMARY: jobContext.jobDescriptionShort ?? '',
    PROFILE_SECTION: buildProfileSection(jobContext),
    MANDATORY_SECTION: buildMandatorySection(jobContext),
    JOB_DESCRIPTION_SNIPPET: jobContext.jobDescriptionExcerpt ?? '',
    RESUME_TEXT: resumeText ?? ''
  });

  return {
    systemMessage: template.systemMessage,
    userMessage
  };
}
