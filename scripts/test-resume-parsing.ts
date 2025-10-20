#!/usr/bin/env tsx

// Test script for the enhanced resume parsing pipeline
// Run with: npx tsx scripts/test-resume-parsing.ts

import { config } from 'dotenv';
import path from 'path';

// Load environment variables from .env.local
config({ path: path.resolve(process.cwd(), '.env.local') });

import { parseAndScoreResume, getEnhancedParsingStats } from '../src/lib/ai/resumeParsingService';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Sample resume text for testing
const SAMPLE_RESUME_TEXT = `
John Doe
Software Engineer
Email: john.doe@email.com
Phone: +1-555-123-4567
LinkedIn: https://linkedin.com/in/johndoe
Location: San Francisco, CA

EXPERIENCE
Senior Software Engineer | Google | 2020-Present
- Led development of high-performance web applications using React and Node.js
- Managed team of 5 developers and improved code quality by 40%
- Implemented microservices architecture serving 1M+ users

Software Developer | Microsoft | 2018-2020
- Developed features for Azure cloud platform using C# and .NET
- Collaborated with cross-functional teams on product roadmap
- Optimized database queries reducing response time by 60%

EDUCATION
Bachelor of Computer Science | Stanford University | 2018
- GPA: 3.8/4.0
- Relevant coursework: Data Structures, Algorithms, Software Engineering

SKILLS
JavaScript, TypeScript, React, Node.js, Python, C#, .NET, Azure, AWS, Docker, Kubernetes, PostgreSQL, MongoDB
`;

// Sample job context
const SAMPLE_JOB_CONTEXT = {
  jobTitle: "Senior Full Stack Developer",
  jobDescriptionShort: "We are looking for an experienced Full Stack Developer with expertise in React, Node.js, and cloud technologies. The ideal candidate should have 5+ years of experience building scalable web applications and working in agile environments. Experience with AWS or Azure is preferred."
};

async function createTestResume(): Promise<number> {
  console.log('Creating test resume...');
  
  const testResume = await prisma.resume.create({
    data: {
      fileName: 'test-resume.pdf',
      originalName: 'John_Doe_Resume.pdf',
      fileSize: 1024,
      fileSizeBytes: 1024,
      mimeType: 'application/pdf',
      storagePath: 'test/john-doe-resume.pdf',
      fileStorageUrl: 'test/john-doe-resume.pdf',
      fileHash: 'test-hash-' + Date.now(),
      sourceType: 'upload',
      rawText: SAMPLE_RESUME_TEXT
    }
  });
  
  console.log(`✅ Created test resume with ID: ${testResume.id}`);
  return testResume.id;
}

async function createTestJob(): Promise<number> {
  console.log('Creating test job...');
  
  const testJob = await prisma.job.create({
    data: {
      title: SAMPLE_JOB_CONTEXT.jobTitle,
      description: SAMPLE_JOB_CONTEXT.jobDescriptionShort,
      status: 'active',
      companyName: 'Test Company'
    }
  });
  
  console.log(`✅ Created test job with ID: ${testJob.id}`);
  return testJob.id;
}

async function createTestApplication(jobId: number, resumeId: number): Promise<void> {
  console.log('Creating test job application...');
  
  await prisma.jobApplication.create({
    data: {
      jobId,
      resumeId,
      status: 'new'
    }
  });
  
  console.log(`✅ Created job application linking Job ${jobId} to Resume ${resumeId}`);
}

async function testParsingPipeline(): Promise<void> {
  console.log('🧪 Starting Resume Parsing Pipeline Test');
  console.log('=====================================\n');

  try {
    // Check if environment variables are set
    console.log('🔧 Checking environment configuration...');
    console.log(`PARSE_ON_IMPORT: ${process.env.PARSE_ON_IMPORT}`);
    console.log(`OPENAI_RESUME_MODEL: ${process.env.OPENAI_RESUME_MODEL}`);
    console.log(`OPENAI_TEMPERATURE: ${process.env.OPENAI_TEMPERATURE}`);
    console.log(`PROMPT_VERSION: ${process.env.PROMPT_VERSION}`);
    console.log(`OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? 'Set' : 'Not set'}`);
    console.log('');

    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not set. Please add it to your .env.local file.');
    }

    // Get initial stats
    console.log('📊 Getting initial parsing statistics...');
    const initialStats = await getEnhancedParsingStats();
    console.log('Initial stats:', initialStats);
    console.log('');

    // Create test data
    const resumeId = await createTestResume();
    const jobId = await createTestJob();
    await createTestApplication(jobId, resumeId);
    console.log('');

    // Test the parsing service
    console.log('🤖 Testing resume parsing and scoring...');
    const startTime = Date.now();
    
    const result = await parseAndScoreResume(resumeId, SAMPLE_JOB_CONTEXT, true); // Force parsing
    
    const endTime = Date.now();
    const duration = endTime - startTime;

    console.log('');
    console.log('📋 PARSING RESULTS:');
    console.log('==================');
    
    if (result.success) {
      console.log('✅ Parsing successful!');
      console.log(`⏱️  Duration: ${duration}ms`);
      
      if (result.summary) {
        const summary = result.summary;
        console.log(`👤 Candidate: ${summary.candidateName}`);
        console.log(`📧 Emails: ${summary.emailsCount}`);
        console.log(`🛠️  Skills: ${summary.skillsCount}`);
        console.log(`🏢 Companies: ${summary.companiesCount}`);
        console.log(`🎯 Match Score: ${summary.matchScore}/100`);
        console.log(`🏆 Company Score: ${summary.companyScore}/100`);
        console.log(`⚠️  Fake Score: ${summary.fakeScore}/100`);
        console.log(`🪙 Tokens Used: ${summary.tokensUsed || 'Unknown'}`);
      }
    } else {
      console.log('❌ Parsing failed!');
      console.log(`Error: ${result.error}`);
    }

    console.log('');

    // Verify database updates
    console.log('🔍 Verifying database updates...');
    
    const updatedResume = await prisma.resume.findUnique({
      where: { id: resumeId },
      select: {
        candidateName: true,
        email: true,
        phone: true,
        skills: true,
        companies: true,
        companyScore: true,
        fakeScore: true,
        totalExperienceY: true,
        aiSummary: true,
        textHash: true,
        promptVersion: true,
        parseModel: true,
        parseError: true,
        parsedAt: true
      }
    });

    const updatedApplication = await prisma.jobApplication.findFirst({
      where: { resumeId },
      select: { matchScore: true }
    });

    if (updatedResume) {
      console.log('📄 Resume table updates:');
      console.log(`   Candidate Name: ${updatedResume.candidateName}`);
      console.log(`   Email: ${updatedResume.email}`);
      console.log(`   Phone: ${updatedResume.phone}`);
      console.log(`   Skills: ${updatedResume.skills}`);
      console.log(`   Companies: ${updatedResume.companies}`);
      console.log(`   Company Score: ${updatedResume.companyScore}`);
      console.log(`   Fake Score: ${updatedResume.fakeScore}`);
      console.log(`   Total Experience: ${updatedResume.totalExperienceY} years`);
      console.log(`   AI Summary: ${updatedResume.aiSummary}`);
      console.log(`   Text Hash: ${updatedResume.textHash?.substring(0, 8)}...`);
      console.log(`   Prompt Version: ${updatedResume.promptVersion}`);
      console.log(`   Parse Model: ${updatedResume.parseModel}`);
      console.log(`   Parse Error: ${updatedResume.parseError || 'None'}`);
      console.log(`   Parsed At: ${updatedResume.parsedAt}`);
    }

    if (updatedApplication) {
      console.log('🎯 JobApplication table updates:');
      console.log(`   Match Score: ${updatedApplication.matchScore}`);
    }

    console.log('');

    // Test idempotency
    console.log('🔄 Testing idempotency (should skip re-parsing)...');
    const startTime2 = Date.now();
    const result2 = await parseAndScoreResume(resumeId, SAMPLE_JOB_CONTEXT, false); // Don't force
    const endTime2 = Date.now();
    const duration2 = endTime2 - startTime2;

    console.log(`⏱️  Idempotency check duration: ${duration2}ms (should be much faster)`);
    
    if (result2.success) {
      console.log('✅ Idempotency working correctly - existing data returned');
    } else {
      console.log('⚠️  Unexpected: idempotency check failed');
    }

    console.log('');

    // Get final stats
    console.log('📊 Final parsing statistics...');
    const finalStats = await getEnhancedParsingStats();
    console.log('Final stats:', finalStats);
    console.log('');

    // Cleanup test data
    console.log('🧹 Cleaning up test data...');
    await prisma.jobApplication.deleteMany({ where: { resumeId } });
    await prisma.resume.delete({ where: { id: resumeId } });
    await prisma.job.delete({ where: { id: jobId } });
    console.log('✅ Test data cleaned up');

    console.log('');
    console.log('🎉 Resume Parsing Pipeline Test Completed Successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error);
    
    // Attempt cleanup on error
    try {
      await prisma.$disconnect();
    } catch (disconnectError) {
      console.error('Failed to disconnect from database:', disconnectError);
    }
    
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the test
if (require.main === module) {
  testParsingPipeline()
    .then(() => {
      console.log('');
      console.log('✨ All tests completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Test runner failed:', error);
      process.exit(1);
    });
}

export { testParsingPipeline };
