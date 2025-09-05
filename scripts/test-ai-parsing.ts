/**
 * Simple test script to validate AI parsing functionality
 * Run with: npx tsx scripts/test-ai-parsing.ts
 */

import { redactForLLM, ResumeParseSchema, toDbFields } from '@/lib/ai/schema/resumeSchema';
import { getBudgetStatus } from '@/lib/ai/openaiClient';
import { getParsingStats } from '@/lib/ai/parseResume';

async function testAIParsing() {
  try {
    console.log('🧪 Testing AI Resume Parsing Components...\n');

    // Test 1: PII Redaction
    console.log('1️⃣ Testing PII Redaction:');
    const testText = `
      John Smith
      Email: john@company.com
      Phone: (555) 123-4567
      SSN: 123-45-6789
      ID: 987654321
      Address: 123 Main St
    `;
    
    const redacted = redactForLLM(testText);
    console.log('Original contains SSN:', testText.includes('123-45-6789'));
    console.log('Redacted contains SSN:', redacted.includes('123-45-6789'));
    console.log('Redacted contains XXX-XX-XXXX:', redacted.includes('XXX-XX-XXXX'));
    console.log('✅ PII redaction test completed\n');

    // Test 2: Schema Validation
    console.log('2️⃣ Testing Resume Schema Validation:');
    const mockResumeData = {
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
        }
      ],
      notes: 'Experienced developer'
    };

    const validationResult = ResumeParseSchema.safeParse(mockResumeData);
    console.log('Schema validation passed:', validationResult.success);
    
    if (validationResult.success) {
      // Test 3: Database Field Conversion
      console.log('3️⃣ Testing Database Field Conversion:');
      const dbFields = toDbFields(validationResult.data);
      console.log('Generated AI Summary:', dbFields.aiSummary);
      console.log('Skills:', dbFields.skills);
      console.log('Companies:', dbFields.companies);
      console.log('Total Experience Years:', dbFields.totalExperienceY);
      console.log('✅ Database field conversion test completed\n');
    }

    // Test 4: Budget Status Check
    console.log('4️⃣ Testing AI Budget Status:');
    const budgetStatus = getBudgetStatus();
    console.log('Budget Date:', budgetStatus.date);
    console.log('Tokens Used:', budgetStatus.tokensUsed);
    console.log('Token Limit:', budgetStatus.limit);
    console.log('Remaining:', budgetStatus.remaining);
    console.log('Percent Used:', budgetStatus.percentUsed + '%');
    console.log('✅ Budget status test completed\n');

    // Test 5: Parsing Statistics (requires database)
    console.log('5️⃣ Testing Parsing Statistics:');
    try {
      const stats = await getParsingStats();
      console.log('Total Resumes:', stats.total);
      console.log('Parsed Resumes:', stats.parsed);
      console.log('Unparsed Resumes:', stats.unparsed);
      console.log('Resumes with Text:', stats.withText);
      console.log('✅ Parsing statistics test completed\n');
    } catch (statsError) {
      console.log('⚠️  Database stats unavailable (expected in test environment)');
      console.log('Error:', statsError instanceof Error ? statsError.message : 'Unknown error');
      console.log('');
    }

    // Test 6: OpenAI Configuration Check
    console.log('6️⃣ Testing OpenAI Configuration:');
    console.log('AI_FEATURES enabled:', process.env.AI_FEATURES === 'on');
    console.log('OpenAI API Key configured:', !!process.env.OPENAI_API_KEY);
    console.log('AI Model:', process.env.AI_MODEL_PARSE || 'gpt-4o-mini (default)');
    console.log('Daily Token Budget:', process.env.AI_DAILY_TOKEN_BUDGET || '200000 (default)');
    
    if (!process.env.OPENAI_API_KEY) {
      console.log('⚠️  OpenAI API Key not found in environment');
    }
    
    if (process.env.AI_FEATURES !== 'on') {
      console.log('⚠️  AI features are disabled (AI_FEATURES != "on")');
    }

    console.log('\n🎉 AI Parsing component tests completed!');
    console.log('\n📋 Next steps:');
    console.log('1. Add OpenAI API key to .env.local');
    console.log('2. Set AI_FEATURES=on in .env.local');
    console.log('3. Create or import some resumes');
    console.log('4. Test individual parsing: POST /api/resumes/{id}/parse');
    console.log('5. Test batch parsing: POST /api/resumes/parse-missing');

  } catch (error) {
    console.error('❌ AI Parsing test failed:', error);
    process.exit(1);
  }
}

// Run the test
testAIParsing();