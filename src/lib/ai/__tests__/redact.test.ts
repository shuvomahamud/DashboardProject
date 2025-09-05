import { describe, it, expect } from '@jest/globals';
import { redactForLLM } from '../schema/resumeSchema';

// Note: These tests would normally run with Jest, but for now they serve as documentation
// To run them, you'd need to install and configure Jest

describe('PII Redaction', () => {
  describe('SSN Redaction', () => {
    it('should mask SSNs with dashes in standard format', () => {
      const testCases = [
        {
          input: 'SSN: 123-45-6789',
          expected: 'SSN: XXX-XX-XXXX'
        },
        {
          input: 'My social security number is 987-65-4321.',
          expected: 'My social security number is XXX-XX-XXXX.'
        },
        {
          input: 'Multiple SSNs: 111-11-1111 and 222-22-2222',
          expected: 'Multiple SSNs: XXX-XX-XXXX and XXX-XX-XXXX'
        }
      ];

      testCases.forEach(({ input, expected }) => {
        expect(redactForLLM(input)).toBe(expected);
      });
    });

    it('should mask 9-digit SSNs without dashes', () => {
      const testCases = [
        {
          input: 'SSN 123456789',
          expected: 'SSN XXXXXXXXX'
        },
        {
          input: 'Social: 987654321 Phone: 5551234567',
          expected: 'Social: XXXXXXXXX Phone: 5551234567'
        }
      ];

      testCases.forEach(({ input, expected }) => {
        expect(redactForLLM(input)).toBe(expected);
      });
    });

    it('should not redact partial or invalid SSN patterns', () => {
      const safeInputs = [
        'Phone: 123-456-7890', // 10 digits, not SSN
        'ID: 12345', // too short
        'Reference: 123-45', // incomplete
        'Code: 1234-5678-9012', // credit card pattern
        'Zip: 12345-6789', // zip+4 code
        '123-456-78901', // too many digits
        'Amount: $123.45', // currency
        'Date: 2023-12-25' // date format
      ];

      safeInputs.forEach(input => {
        expect(redactForLLM(input)).toBe(input);
      });
    });
  });

  describe('Normal text preservation', () => {
    it('should preserve names, emails, and phone numbers', () => {
      const preservedText = `
        John Smith
        Email: john.smith@company.com
        Phone: (555) 123-4567
        LinkedIn: linkedin.com/in/johnsmith
        Address: 123 Main St, Anytown, NY 12345
        
        EXPERIENCE:
        Senior Software Engineer at Google (2020-present)
        - Developed scalable web applications
        - Led team of 5 engineers
        
        EDUCATION:
        BS Computer Science, MIT (2018)
        GPA: 3.8/4.0
        
        SKILLS:
        JavaScript, Python, React, Node.js, SQL
      `;

      expect(redactForLLM(preservedText)).toBe(preservedText);
    });

    it('should handle mixed content correctly', () => {
      const mixedText = `
        Name: Jane Doe
        Email: jane@example.com
        Phone: 555-0123
        SSN: 123-45-6789
        Reference ID: 987654321
        Bank Account: 1234567890
      `;

      const expected = `
        Name: Jane Doe
        Email: jane@example.com
        Phone: 555-0123
        SSN: XXX-XX-XXXX
        Reference ID: XXXXXXXXX
        Bank Account: 1234567890
      `;

      expect(redactForLLM(mixedText)).toBe(expected);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty and null inputs gracefully', () => {
      expect(redactForLLM('')).toBe('');
      expect(redactForLLM('   ')).toBe('   '); // whitespace only
      expect(redactForLLM(null as any)).toBe(null);
      expect(redactForLLM(undefined as any)).toBe(undefined);
    });

    it('should handle very long text efficiently', () => {
      const longText = 'Normal text '.repeat(1000) + '123-45-6789' + ' more text'.repeat(1000);
      const result = redactForLLM(longText);
      
      expect(result).toContain('XXX-XX-XXXX');
      expect(result).toContain('Normal text');
      expect(result).toContain('more text');
      expect(result).not.toContain('123-45-6789');
    });

    it('should handle text with special characters', () => {
      const specialText = `
        Unicode name: José María
        Email: josé@company.com
        SSN: 123-45-6789
        Special chars: @#$%^&*()
        Emoji: 👋 Hello!
      `;

      const result = redactForLLM(specialText);
      expect(result).toContain('José María');
      expect(result).toContain('josé@company.com');
      expect(result).toContain('XXX-XX-XXXX');
      expect(result).toContain('👋 Hello!');
    });
  });
});