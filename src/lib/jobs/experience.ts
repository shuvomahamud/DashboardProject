export const MIN_EXPERIENCE_YEARS = 0;
export const MAX_EXPERIENCE_YEARS = 80;

const REQUIRED_EXPERIENCE_MESSAGE =
  'Required experience (years) is mandatory and must be between 0 and 80.';
const EXPERIENCE_RANGE_ERROR = `Experience must be between ${MIN_EXPERIENCE_YEARS} and ${MAX_EXPERIENCE_YEARS} years.`;
const PREFERRED_RANGE_FORMAT_MESSAGE =
  'Preferred experience must be a single number or a range like "10-12".';
const PREFERRED_MIN_MESSAGE =
  'Preferred experience must be greater than or equal to the required experience.';
const PREFERRED_MAX_MESSAGE = 'Preferred experience max cannot be less than the preferred minimum.';
const RANGE_SPLIT_REGEX = /\s*(?:-|–|—|to)\s*/i;

export interface ExperienceRequirements {
  requiredYears: number | null;
  preferredMinYears: number | null;
  preferredMaxYears: number | null;
}

export interface ExperienceFieldPayload {
  requiredExperienceYears: number;
  preferredExperienceMinYears: number | null;
  preferredExperienceMaxYears: number | null;
}

export type PreferredExperienceRange = {
  min: number | null;
  max: number | null;
};

export const clampExperienceYears = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  const rounded = Math.round(numeric);
  if (rounded < MIN_EXPERIENCE_YEARS) return MIN_EXPERIENCE_YEARS;
  if (rounded > MAX_EXPERIENCE_YEARS) return MAX_EXPERIENCE_YEARS;
  return rounded;
};

const assertPreferredConstraints = (
  min: number | null,
  max: number | null,
  required: number
) => {
  if (min !== null && min < required) {
    throw new Error(PREFERRED_MIN_MESSAGE);
  }
  if (min !== null && max !== null && max < min) {
    throw new Error(PREFERRED_MAX_MESSAGE);
  }
};

const parseYearsValue = (raw: string): number => {
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) {
    throw new Error(EXPERIENCE_RANGE_ERROR);
  }
  const rounded = Math.round(numeric);
  if (rounded < MIN_EXPERIENCE_YEARS || rounded > MAX_EXPERIENCE_YEARS) {
    throw new Error(EXPERIENCE_RANGE_ERROR);
  }
  return rounded;
};

export const parseRequiredExperienceInput = (value: string): number => {
  const trimmed = (value ?? '').toString().trim();
  if (!trimmed) {
    throw new Error(REQUIRED_EXPERIENCE_MESSAGE);
  }
  return parseYearsValue(trimmed);
};

export const parsePreferredExperienceInput = (
  value: string,
  requiredYears: number
): PreferredExperienceRange => {
  const trimmed = (value ?? '').toString().trim();
  if (!trimmed) {
    return { min: null, max: null };
  }

  const parts = trimmed.split(RANGE_SPLIT_REGEX);
  if (parts.length > 2) {
    throw new Error(PREFERRED_RANGE_FORMAT_MESSAGE);
  }

  const sanitizedParts = parts.map(part => part.trim());
  const [first, second] = sanitizedParts;

  if (!first) {
    throw new Error(PREFERRED_RANGE_FORMAT_MESSAGE);
  }

  const min = parseYearsValue(first);
  let max: number | null = null;

  if (sanitizedParts.length === 1 || !second) {
    max = min;
  } else {
    max = parseYearsValue(second);
  }

  assertPreferredConstraints(min, max, requiredYears);

  return { min, max };
};

export const formatPreferredExperienceRange = (
  min?: number | null,
  max?: number | null
): string => {
  const normalizedMin = typeof min === 'number' ? min : null;
  const normalizedMax = typeof max === 'number' ? max : null;

  if (normalizedMin === null && normalizedMax === null) {
    return '';
  }

  if (normalizedMin !== null && normalizedMax !== null) {
    if (normalizedMin === normalizedMax) {
      return String(normalizedMin);
    }
    return `${normalizedMin}-${normalizedMax}`;
  }

  return String(normalizedMin ?? normalizedMax);
};

export const resolveExperiencePayload = (body: any): ExperienceFieldPayload => {
  const requiredSource =
    body?.requiredExperienceYears ?? body?.aiJobProfile?.requiredExperienceYears ?? null;
  const requiredExperienceYears = clampExperienceYears(requiredSource);

  if (requiredExperienceYears === null) {
    throw new Error(REQUIRED_EXPERIENCE_MESSAGE);
  }

  let preferredExperienceMinYears = clampExperienceYears(
    body?.preferredExperienceMinYears ??
      body?.preferredExperienceYears ??
      body?.aiJobProfile?.preferredExperienceYears ??
      null
  );

  let preferredExperienceMaxYears = clampExperienceYears(
    body?.preferredExperienceMaxYears ??
      body?.preferredExperienceYears ??
      body?.aiJobProfile?.preferredExperienceYears ??
      null
  );

  if (preferredExperienceMinYears === null && preferredExperienceMaxYears !== null) {
    preferredExperienceMinYears = preferredExperienceMaxYears;
  } else if (preferredExperienceMinYears !== null && preferredExperienceMaxYears === null) {
    preferredExperienceMaxYears = preferredExperienceMinYears;
  }

  if (preferredExperienceMinYears !== null) {
    assertPreferredConstraints(
      preferredExperienceMinYears,
      preferredExperienceMaxYears,
      requiredExperienceYears
    );
  }

  return {
    requiredExperienceYears,
    preferredExperienceMinYears,
    preferredExperienceMaxYears
  };
};

export const normalizeExperienceRequirements = (
  input?: Partial<ExperienceRequirements> | null
): ExperienceRequirements => {
  if (!input) {
    return {
      requiredYears: null,
      preferredMinYears: null,
      preferredMaxYears: null
    };
  }

  const requiredYears = clampExperienceYears(input.requiredYears ?? null);
  let preferredMinYears = clampExperienceYears(input.preferredMinYears ?? null);
  let preferredMaxYears = clampExperienceYears(input.preferredMaxYears ?? null);

  if (preferredMinYears === null && preferredMaxYears !== null) {
    preferredMinYears = preferredMaxYears;
  } else if (preferredMinYears !== null && preferredMaxYears === null) {
    preferredMaxYears = preferredMinYears;
  }

  if (
    requiredYears !== null &&
    preferredMinYears !== null &&
    preferredMinYears < requiredYears
  ) {
    preferredMinYears = requiredYears;
  }

  if (
    preferredMinYears !== null &&
    preferredMaxYears !== null &&
    preferredMaxYears < preferredMinYears
  ) {
    preferredMaxYears = preferredMinYears;
  }

  return {
    requiredYears,
    preferredMinYears,
    preferredMaxYears
  };
};

export const mergeExperienceRequirements = (
  primary?: ExperienceRequirements | null,
  fallback?: ExperienceRequirements | null
): ExperienceRequirements => {
  const normalizedPrimary = normalizeExperienceRequirements(primary);
  const normalizedFallback = normalizeExperienceRequirements(fallback);

  return normalizeExperienceRequirements({
    requiredYears: normalizedPrimary.requiredYears ?? normalizedFallback.requiredYears ?? null,
    preferredMinYears:
      normalizedPrimary.preferredMinYears ?? normalizedFallback.preferredMinYears ?? null,
    preferredMaxYears:
      normalizedPrimary.preferredMaxYears ?? normalizedFallback.preferredMaxYears ?? null
  });
};

export const hasPreferredRange = (requirements: ExperienceRequirements): boolean => {
  return (
    typeof requirements.preferredMinYears === 'number' &&
    typeof requirements.preferredMaxYears === 'number'
  );
};

