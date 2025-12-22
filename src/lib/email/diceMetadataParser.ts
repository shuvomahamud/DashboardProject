import { parseCityState } from '@/lib/location/usStates';

const htmlEntityMap: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'"
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const labelPattern = (label: string) => {
  const escaped = escapeRegExp(label);
  return new RegExp(`^${escaped}\\s*[\\-:]+\\s*(.+)$`, 'i');
};

const repeatedLabelPattern = (label: string) => {
  const escaped = escapeRegExp(label);
  return new RegExp(`^${escaped}\\s*${escaped}\\s*[\\-:]?\\s*(.+)$`, 'i');
};

const spacedLabelPattern = (label: string) => {
  const escaped = escapeRegExp(label);
  return new RegExp(`^${escaped}\\s+(.+)$`, 'i');
};

const replaceHtmlEntities = (value: string) =>
  value.replace(/&[a-zA-Z0-9#]+;/g, entity => htmlEntityMap[entity] ?? entity);

const htmlToPlainText = (html: string): string =>
  replaceHtmlEntities(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|tr|table)>/gi, '\n')
      .replace(/<\/t[dh]>/gi, '\t')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
  );

const splitLines = (text: string) =>
  text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

const normalizeLineValue = (value: string) =>
  replaceHtmlEntities(value).replace(/\s+/g, ' ').trim();

const inlineLabelTokens = [
  'email',
  'candidate email',
  'phone number',
  'phone',
  'work authorization',
  'work auth',
  'representation',
  'location',
  'preferred location',
  'match',
  'resume',
  'cover letter',
  'recruiter',
  'recruiter name'
];

const findInlineLabeledValue = (line: string, label: string) => {
  const escaped = escapeRegExp(label);
  const regex = new RegExp(`\\b${escaped}(?:\\s*${escaped})?\\b`, 'i');
  const match = line.match(regex);
  if (!match || match.index === undefined) {
    return null;
  }

  const remainder = line.slice(match.index + match[0].length);
  const cleaned = remainder.replace(/^[\s:\-]+/, '');
  if (!cleaned) {
    return null;
  }

  let end = cleaned.length;
  for (const otherLabel of inlineLabelTokens) {
    if (otherLabel.toLowerCase() === label.toLowerCase()) {
      continue;
    }
    const otherRegex = new RegExp(`\\b${escapeRegExp(otherLabel)}\\b`, 'i');
    const otherMatch = cleaned.match(otherRegex);
    if (otherMatch?.index !== undefined && otherMatch.index > 0 && otherMatch.index < end) {
      end = otherMatch.index;
    }
  }

  return normalizeLineValue(cleaned.slice(0, end));
};

const findLabeledValue = (lines: string[], labels: string[]) => {
  for (const line of lines) {
    for (const label of labels) {
      const candidates = [
        labelPattern(label),
        repeatedLabelPattern(label),
        spacedLabelPattern(label)
      ];
      for (const regex of candidates) {
        const match = line.match(regex);
        if (match && match[1]) {
          return normalizeLineValue(match[1]);
        }
      }
      const inlineMatch = findInlineLabeledValue(line, label);
      if (inlineMatch) {
        return inlineMatch;
      }
    }
  }
  return null;
};

const sanitizeEmail = (value: string | null) => {
  if (!value) return null;
  if (/not\s+provided|n\/a|na/i.test(value)) {
    return null;
  }
  const match = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0].toLowerCase() : null;
};

const sanitizePhone = (value: string | null) => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/not\s+provided|n\/a|na/i.test(trimmed)) {
    return null;
  }
  return trimmed;
};

const findEmailInLines = (lines: string[]) => {
  for (const line of lines) {
    if (!/\bemail\b/i.test(line)) {
      continue;
    }
    const match = line.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    if (match) {
      return match[0].toLowerCase();
    }
  }
  return null;
};

const normalizeRecruiterValue = (value: string | null) => {
  if (!value) return null;
  const lowered = value.toLowerCase();
  if (lowered.startsWith('represented') || lowered.startsWith('direct')) {
    return null;
  }
  return value;
};

export interface DiceCandidateMetadata {
  candidateEmail?: string;
  candidatePhone?: string;
  candidateLocation?: string;
  candidateCity?: string;
  candidateState?: string;
  workAuthorization?: string;
  recruiterName?: string;
}

export interface DiceParserInput {
  bodyText?: string | null;
  bodyHtml?: string | null;
  bodyPreview?: string | null;
  subject?: string | null;
}

const isLikelyDiceEmail = (content: string) => /dice/i.test(content);

export function parseDiceCandidateMetadata(input: DiceParserInput): DiceCandidateMetadata {
  const rawText =
    (input.bodyText && input.bodyText.trim().length > 0
      ? input.bodyText
      : input.bodyHtml && input.bodyHtml.trim().length > 0
      ? htmlToPlainText(input.bodyHtml)
      : input.bodyPreview || '') || '';

  const combined = `${input.subject || ''}\n${rawText}`;
  if (!isLikelyDiceEmail(combined)) {
    return {};
  }

  const lines = splitLines(rawText);
  if (lines.length === 0) {
    return {};
  }

  const metadata: DiceCandidateMetadata = {};

  metadata.candidateEmail = sanitizeEmail(
    findLabeledValue(lines, ['email', 'candidate email']) || null
  ) || undefined;
  metadata.candidatePhone =
    sanitizePhone(findLabeledValue(lines, ['phone number', 'phone'])) || undefined;
  metadata.candidateLocation =
    findLabeledValue(lines, ['location', 'preferred location']) || undefined;
  metadata.workAuthorization =
    findLabeledValue(lines, ['work authorization', 'work auth']) || undefined;

  if (!metadata.candidateEmail) {
    const fallbackEmail = findEmailInLines(lines);
    if (fallbackEmail) {
      metadata.candidateEmail = fallbackEmail;
    }
  }

  if (metadata.candidateLocation) {
    const { city, state } = parseCityState(metadata.candidateLocation);
    if (city) {
      metadata.candidateCity = city;
    }
    if (state) {
      metadata.candidateState = state;
    }
  }

  const recruiterValue = normalizeRecruiterValue(
    findLabeledValue(lines, ['recruiter', 'recruiter name'])
  );
  if (recruiterValue) {
    metadata.recruiterName = recruiterValue;
  }

  return metadata;
}
