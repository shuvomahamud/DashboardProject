export type USState = {
  code: string;
  name: string;
};

export const US_STATES: USState[] = [
  { code: 'AL', name: 'Alabama' },
  { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' },
  { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' },
  { code: 'DE', name: 'Delaware' },
  { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' },
  { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' },
  { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' },
  { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' },
  { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' },
  { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' },
  { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' },
  { code: 'WY', name: 'Wyoming' },
  { code: 'DC', name: 'District of Columbia' }
];

const CODE_SET = new Set(US_STATES.map((state) => state.code));
const NAME_LOOKUP = new Map<string, string>();

US_STATES.forEach((state) => {
  const upperName = state.name.toUpperCase();
  const compactName = upperName.replace(/[^A-Z]/g, '');
  NAME_LOOKUP.set(state.code, state.code);
  NAME_LOOKUP.set(upperName, state.code);
  NAME_LOOKUP.set(compactName, state.code);
});

export const getStateName = (code: string | null | undefined): string | null => {
  if (!code) return null;
  const upper = code.trim().toUpperCase();
  const match = US_STATES.find((state) => state.code === upper);
  return match ? match.name : null;
};

export const normalizeStateCode = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const upper = trimmed.toUpperCase();
  if (CODE_SET.has(upper)) {
    return upper;
  }
  const compact = upper.replace(/[^A-Z]/g, '');
  if (compact.length === 2 && CODE_SET.has(compact)) {
    return compact;
  }
  return NAME_LOOKUP.get(compact) ?? NAME_LOOKUP.get(upper) ?? null;
};

export const parseCityState = (
  value: string | null | undefined
): { city: string | null; state: string | null } => {
  if (!value) {
    return { city: null, state: null };
  }
  let input = value.replace(/USA$/i, '').trim();
  if (!input) {
    return { city: null, state: null };
  }

  // Normalize whitespace
  input = input.replace(/\s+/g, ' ').replace(/\s+,/g, ',').trim();

  const commaMatch = input.match(/^(.*?)[,\-]\s*([^,\-]+)$/);
  if (commaMatch) {
    const potentialCity = commaMatch[1].trim().replace(/,$/, '');
    const potentialState = commaMatch[2].trim();
    const normalizedState = normalizeStateCode(potentialState);
    if (normalizedState) {
      return {
        city: potentialCity || null,
        state: normalizedState
      };
    }
  }

  const tokens = input.split(' ');
  if (tokens.length >= 2) {
    const lastToken = tokens[tokens.length - 1];
    const normalizedState = normalizeStateCode(lastToken);
    if (normalizedState) {
      const city = tokens.slice(0, -1).join(' ').replace(/[,\s]+$/g, '');
      return {
        city: city || null,
        state: normalizedState
      };
    }
  }

  return { city: null, state: null };
};
