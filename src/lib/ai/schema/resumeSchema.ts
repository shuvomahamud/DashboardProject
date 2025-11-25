import { z } from 'zod';

// Zod schema for the parsed resume JSON structure
export const ResumeParseSchema = z.object({
  candidate: z.object({
    name: z.string().nullable(),
    emails: z.array(z.string()),
    phones: z.array(z.string()),
    linkedinUrl: z.string().nullable(),
    currentLocation: z.string().nullable(),
    totalExperienceYears: z.number().nullable()
  }),
  skills: z.array(z.string()),
  education: z.array(z.object({
    degree: z.string(),
    institution: z.string().nullable(),
    year: z.number().nullable().optional()
  })),
  employment: z.array(z.object({
    company: z.string().nullable().optional(),
    title: z.string().nullable(),
    startDate: z.string().nullable(),
    endDate: z.string().nullable(),
    employmentType: z.string().nullable()
  })),
  notes: z.string().nullable()
});

export type ParsedResume = z.infer<typeof ResumeParseSchema>;

// Helper to convert parsed resume to database fields
export function toDbFields(parsed: ParsedResume) {
  // Flatten skills to comma-separated string (lowercased and unique)
  const uniqueSkills = [...new Set(parsed.skills.map(s => s.toLowerCase()))];
  const skills = uniqueSkills.join(', ');

  // Extract unique companies from employment
  const uniqueCompanies = [...new Set(
    parsed.employment
      .map(emp => emp.company)
      .filter(company => company && company.trim())
      .map(company => company.trim())
  )];
  const companies = uniqueCompanies.join(', ');

  // Employment history as JSON string
  const employmentHistoryJson = JSON.stringify(parsed.employment);

  // Total experience years (rounded to 2 decimal places)
  const totalExperienceY = parsed.candidate.totalExperienceYears 
    ? Math.round(parsed.candidate.totalExperienceYears * 100) / 100 
    : null;

  // Generate AI summary (1-2 lines: name + primary title + total exp if present)
  let aiSummary = '';
  if (parsed.candidate.name) {
    aiSummary += parsed.candidate.name;
  }
  
  // Add primary title from most recent employment
  const recentEmployment = parsed.employment.find(emp => emp.title);
  if (recentEmployment?.title) {
    aiSummary += aiSummary ? ` - ${recentEmployment.title}` : recentEmployment.title;
  }
  
  // Add total experience if available
  if (parsed.candidate.totalExperienceYears) {
    const years = parsed.candidate.totalExperienceYears;
    const yearText = years === 1 ? 'year' : 'years';
    aiSummary += aiSummary ? ` (${years} ${yearText} experience)` : `${years} ${yearText} experience`;
  }

  return {
    skills: skills || null,
    companies: companies || null,
    employmentHistoryJson: employmentHistoryJson || null,
    totalExperienceY: totalExperienceY,
    aiSummary: aiSummary || null,
    aiExtractJson: JSON.stringify(parsed)
  };
}

// PII redaction function - minimal implementation to mask SSN-like patterns
export function redactForLLM(text: string): string {
  if (!text) return text;
  
  // Mask SSN-like patterns: XXX-XX-XXXX
  let redacted = text.replace(/\b\d{3}-\d{2}-\d{4}\b/g, 'XXX-XX-XXXX');
  
  // Also handle SSNs without dashes: XXXXXXXXX
  redacted = redacted.replace(/\b\d{9}\b/g, 'XXXXXXXXX');
  
  return redacted;
}

// JSON Schema for OpenAI structured outputs (compatible with the Zod schema)
export const RESUME_JSON_SCHEMA = {
  type: "object",
  properties: {
    candidate: {
      type: "object",
      properties: {
        name: { type: ["string", "null"] },
        emails: { 
          type: "array", 
          items: { type: "string" },
          description: "Deduplicated email addresses in lowercase"
        },
        phones: { 
          type: "array", 
          items: { type: "string" },
          description: "Phone numbers in normalized format"
        },
        linkedinUrl: { type: ["string", "null"] },
        currentLocation: { type: ["string", "null"] },
        totalExperienceYears: { 
          type: ["number", "null"],
          description: "Total years of professional experience"
        }
      },
      required: ["name", "emails", "phones", "linkedinUrl", "currentLocation", "totalExperienceYears"],
      additionalProperties: false
    },
    skills: { 
      type: "array", 
      items: { type: "string" },
      description: "Technical and professional skills, lowercased and unique"
    },
    education: {
      type: "array",
      items: {
        type: "object",
        properties: {
          degree: { type: "string" },
          institution: { type: ["string", "null"] },
          year: { type: ["number", "null"] }
        },
        required: ["degree", "institution"],
        additionalProperties: false
      }
    },
    employment: {
      type: "array",
      items: {
        type: "object",
        properties: {
          company: { type: ["string", "null"] },
          title: { type: ["string", "null"] },
          startDate: { 
            type: ["string", "null"],
            description: "ISO format yyyy-mm or yyyy-mm-dd if available"
          },
          endDate: { 
            type: ["string", "null"],
            description: "ISO format yyyy-mm or yyyy-mm-dd, null if current position"
          },
          employmentType: { 
            type: ["string", "null"],
            description: "full-time, part-time, contract, internship, etc."
          }
        },
        required: ["title", "startDate", "endDate", "employmentType"],
        additionalProperties: false
      }
    },
    notes: { 
      type: ["string", "null"],
      description: "Optional short freeform notes about the candidate"
    }
  },
  required: ["candidate", "skills", "education", "employment", "notes"],
  additionalProperties: false
} as const;
