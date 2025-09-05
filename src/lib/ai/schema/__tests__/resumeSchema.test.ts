import { describe, it, expect } from '@jest/globals';
import { ResumeParseSchema, toDbFields, redactForLLM } from '../resumeSchema';

// Note: These tests would normally run with Jest, but for now they serve as documentation
// To run them, you'd need to install and configure Jest

describe('ResumeParseSchema', () => {
  it('should validate a complete resume object', () => {
    const validResume = {
      candidate: {
        name: 'John Doe',
        emails: ['john.doe@example.com'],
        phones: ['+1-555-123-4567'],
        linkedinUrl: 'https://linkedin.com/in/johndoe',
        currentLocation: 'San Francisco, CA',
        totalExperienceYears: 5.5
      },
      skills: ['javascript', 'typescript', 'react', 'node.js'],
      education: [
        {
          degree: 'Bachelor of Computer Science',
          institution: 'Stanford University',
          year: 2018
        }
      ],
      employment: [
        {
          company: 'Google',
          title: 'Software Engineer',
          startDate: '2020-01',
          endDate: null,
          employmentType: 'full-time'
        },
        {
          company: 'Facebook',
          title: 'Frontend Developer',
          startDate: '2018-06',
          endDate: '2019-12',
          employmentType: 'full-time'
        }
      ],
      notes: 'Experienced developer with strong background in web technologies'
    };

    const result = ResumeParseSchema.safeParse(validResume);
    expect(result.success).toBe(true);
  });

  it('should handle minimal resume object with nulls', () => {
    const minimalResume = {
      candidate: {
        name: null,
        emails: [],
        phones: [],
        linkedinUrl: null,
        currentLocation: null,
        totalExperienceYears: null
      },
      skills: [],
      education: [],
      employment: [],
      notes: null
    };

    const result = ResumeParseSchema.safeParse(minimalResume);
    expect(result.success).toBe(true);
  });

  it('should reject invalid schema with missing required fields', () => {
    const invalidResume = {
      candidate: {
        name: 'John Doe',
        emails: ['john@example.com']
        // missing required fields
      },
      skills: ['javascript']
      // missing required fields
    };

    const result = ResumeParseSchema.safeParse(invalidResume);
    expect(result.success).toBe(false);
  });

  it('should reject invalid data types', () => {
    const invalidResume = {
      candidate: {
        name: 'John Doe',
        emails: 'john@example.com', // should be array
        phones: [],
        linkedinUrl: null,
        currentLocation: null,
        totalExperienceYears: 'five' // should be number
      },
      skills: [],
      education: [],
      employment: [],
      notes: null
    };

    const result = ResumeParseSchema.safeParse(invalidResume);
    expect(result.success).toBe(false);
  });
});

describe('toDbFields', () => {
  it('should convert parsed resume to database fields correctly', () => {
    const parsedResume = {
      candidate: {
        name: 'Jane Smith',
        emails: ['jane@example.com', 'jane.smith@company.com'],
        phones: ['+1-555-987-6543'],
        linkedinUrl: 'https://linkedin.com/in/janesmith',
        currentLocation: 'New York, NY',
        totalExperienceYears: 3.0
      },
      skills: ['Python', 'Machine Learning', 'python', 'SQL'], // test deduplication
      education: [
        {
          degree: 'MS Computer Science',
          institution: 'MIT',
          year: 2020
        }
      ],
      employment: [
        {
          company: 'Microsoft',
          title: 'Data Scientist',
          startDate: '2021-01',
          endDate: null,
          employmentType: 'full-time'
        },
        {
          company: 'Startup Inc',
          title: 'ML Engineer',
          startDate: '2020-06',
          endDate: '2020-12',
          employmentType: 'contract'
        }
      ],
      notes: 'Strong analytical background'
    };

    const dbFields = toDbFields(parsedResume);

    expect(dbFields.skills).toBe('python, machine learning, sql'); // lowercased and deduplicated
    expect(dbFields.companies).toBe('Microsoft, Startup Inc');
    expect(dbFields.totalExperienceY).toBe(3.0);
    expect(dbFields.aiSummary).toBe('Jane Smith - Data Scientist (3 years experience)');
    expect(dbFields.employmentHistoryJson).toContain('Microsoft');
    expect(dbFields.aiExtractJson).toContain('Jane Smith');
  });

  it('should handle empty arrays and null values', () => {
    const emptyResume = {
      candidate: {
        name: null,
        emails: [],
        phones: [],
        linkedinUrl: null,
        currentLocation: null,
        totalExperienceYears: null
      },
      skills: [],
      education: [],
      employment: [],
      notes: null
    };

    const dbFields = toDbFields(emptyResume);

    expect(dbFields.skills).toBe(''); // empty string for empty array
    expect(dbFields.companies).toBe(''); // empty string for empty array
    expect(dbFields.totalExperienceY).toBeNull();
    expect(dbFields.aiSummary).toBe(''); // empty summary
  });

  it('should round experience years to 2 decimal places', () => {
    const resume = {
      candidate: {
        name: 'Test User',
        emails: [],
        phones: [],
        linkedinUrl: null,
        currentLocation: null,
        totalExperienceYears: 5.666666 // should be rounded to 5.67
      },
      skills: [],
      education: [],
      employment: [],
      notes: null
    };

    const dbFields = toDbFields(resume);
    expect(dbFields.totalExperienceY).toBe(5.67);
  });
});

describe('redactForLLM', () => {
  it('should redact SSN patterns with dashes', () => {
    const text = 'My SSN is 123-45-6789 and phone is 555-1234.';
    const redacted = redactForLLM(text);
    expect(redacted).toBe('My SSN is XXX-XX-XXXX and phone is 555-1234.');
  });

  it('should redact 9-digit SSN patterns without dashes', () => {
    const text = 'SSN: 123456789 Phone: 5551234567';
    const redacted = redactForLLM(text);
    expect(redacted).toBe('SSN: XXXXXXXXX Phone: 5551234567');
  });

  it('should leave normal text unchanged', () => {
    const text = 'John Doe, Software Engineer at Google. Phone: (555) 123-4567. Email: john@google.com';
    const redacted = redactForLLM(text);
    expect(redacted).toBe(text); // should be unchanged
  });

  it('should handle empty or null input', () => {
    expect(redactForLLM('')).toBe('');
    expect(redactForLLM(null as any)).toBe(null);
    expect(redactForLLM(undefined as any)).toBe(undefined);
  });

  it('should not redact partial matches', () => {
    const text = 'Phone: 12345 or 123-45 or reference number 123-45-678';
    const redacted = redactForLLM(text);
    expect(redacted).toBe(text); // should be unchanged as they don't match full SSN patterns
  });
});