/**
 * Convert a skill/technology label into a canonical token that is easier to match.
 * - Lowercases and removes diacritics
 * - Preserves + and # for languages like C++ / C#
 * - Collapses whitespace/punctuation
 * - Drops bare version tokens like "v13" or "13.1"
 */
export function canonicalizeSkill(value: string | null | undefined): string {
  if (!value) return '';

  const base = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  const withoutVersions = base.replace(/\b(?:v(?:ersion)?\s*)?\d+(?:\.\d+)*\b/g, ' ');

  return withoutVersions
    .replace(/[^a-z0-9+#]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const normalizeSkillKey = canonicalizeSkill;
