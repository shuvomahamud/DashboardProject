/**
 * Analyze all resumes for Job 59
 *
 * Usage: npx tsx scripts/analyze-job-59-resumes.ts
 */

import prisma from '../src/lib/prisma';

const JOB_ID = 59;

async function main() {
  console.log('='.repeat(80));
  console.log(`Analyzing Resumes for Job ${JOB_ID}`);
  console.log('='.repeat(80));
  console.log();

  // Get all job applications for this job
  const jobApplications = await prisma.jobApplication.findMany({
    where: {
      jobId: JOB_ID
    },
    include: {
      resume: {
        select: {
          id: true,
          fileName: true,
          originalName: true,
          mimeType: true,
          sourceType: true,
          sourceFrom: true,
          sourceSubject: true,
          sourceMessageId: true,
          createdAt: true,
          parsedAt: true,
          rawText: true
        }
      }
    },
    orderBy: {
      appliedDate: 'desc'
    }
  });

  console.log(`📝 Total Job Applications: ${jobApplications.length}`);
  console.log();

  // Categorize resumes
  const resumes = jobApplications.map(app => app.resume).filter(Boolean) as NonNullable<typeof jobApplications[0]['resume']>[];

  const resumeFiles: typeof resumes = [];
  const visaFiles: typeof resumes = [];
  const credentialFiles: typeof resumes = [];
  const otherFiles: typeof resumes = [];

  for (const resume of resumes) {
    const fileName = resume.originalName.toLowerCase();
    const subject = (resume.sourceSubject || '').toLowerCase();
    const rawText = ((resume.rawText || '').substring(0, 5000)).toLowerCase(); // Only check first 5000 chars

    const isVisa =
      fileName.includes('visa') ||
      fileName.includes('i-9') ||
      fileName.includes('i9') ||
      fileName.includes('authorization') ||
      subject.includes('visa') ||
      subject.includes('i-9') ||
      rawText.includes('visa application') ||
      rawText.includes('visa petition') ||
      rawText.includes('form i-9');

    const isCredential =
      fileName.includes('credential') ||
      fileName.includes('certificate') ||
      fileName.includes('certification') ||
      fileName.includes('license') ||
      fileName.includes('degree') ||
      fileName.includes('transcript') ||
      subject.includes('credential') ||
      subject.includes('certificate') ||
      subject.includes('certification') ||
      subject.includes('degree') ||
      subject.includes('transcript');

    if (isVisa) {
      visaFiles.push(resume);
    } else if (isCredential) {
      credentialFiles.push(resume);
    } else if (
      fileName.includes('resume') ||
      fileName.includes('cv') ||
      fileName.endsWith('.pdf') ||
      fileName.endsWith('.doc') ||
      fileName.endsWith('.docx')
    ) {
      resumeFiles.push(resume);
    } else {
      otherFiles.push(resume);
    }
  }

  console.log('📊 Categorization:');
  console.log(`  ✅ Resume Files (Valid Candidates): ${resumeFiles.length}`);
  console.log(`  ❌ Visa Documents: ${visaFiles.length}`);
  console.log(`  ❌ Credential Documents: ${credentialFiles.length}`);
  console.log(`  ❓ Other Files: ${otherFiles.length}`);
  console.log();

  // MIME type breakdown
  const mimeTypes = resumes.reduce((acc, resume) => {
    acc[resume.mimeType] = (acc[resume.mimeType] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  console.log('📋 File Type Distribution:');
  for (const [mimeType, count] of Object.entries(mimeTypes).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${mimeType}: ${count}`);
  }
  console.log();

  // Show visa documents that should be excluded
  if (visaFiles.length > 0) {
    console.log('🚫 VISA DOCUMENTS (should be excluded):');
    console.log('='.repeat(80));
    for (const file of visaFiles) {
      console.log(`Resume ID: ${file.id}`);
      console.log(`  File: ${file.originalName}`);
      console.log(`  Subject: ${file.sourceSubject || 'N/A'}`);
      console.log(`  Source From: ${file.sourceFrom || 'N/A'}`);
      console.log(`  Created: ${file.createdAt.toISOString()}`);
      console.log();
    }
    console.log();
  }

  // Show credential documents that should be excluded
  if (credentialFiles.length > 0) {
    console.log('🚫 CREDENTIAL DOCUMENTS (should be excluded):');
    console.log('='.repeat(80));
    for (const file of credentialFiles) {
      console.log(`Resume ID: ${file.id}`);
      console.log(`  File: ${file.originalName}`);
      console.log(`  Subject: ${file.sourceSubject || 'N/A'}`);
      console.log(`  Source From: ${file.sourceFrom || 'N/A'}`);
      console.log(`  Created: ${file.createdAt.toISOString()}`);
      console.log();
    }
    console.log();
  }

  // Show other files for investigation
  if (otherFiles.length > 0) {
    console.log('❓ OTHER/UNKNOWN FILES (First 10):');
    console.log('='.repeat(80));
    for (const file of otherFiles.slice(0, 10)) {
      console.log(`Resume ID: ${file.id}`);
      console.log(`  File: ${file.originalName}`);
      console.log(`  MIME: ${file.mimeType}`);
      console.log(`  Subject: ${file.sourceSubject || 'N/A'}`);
      console.log(`  Source From: ${file.sourceFrom || 'N/A'}`);
      console.log(`  Created: ${file.createdAt.toISOString()}`);
      console.log();
    }
    console.log();
  }

  // Sample valid resume files
  console.log('✅ SAMPLE VALID RESUME FILES (First 10):');
  console.log('='.repeat(80));
  for (const file of resumeFiles.slice(0, 10)) {
    console.log(`Resume ID: ${file.id}`);
    console.log(`  File: ${file.originalName}`);
    console.log(`  Subject: ${file.sourceSubject || 'N/A'}`);
    console.log(`  Source From: ${file.sourceFrom || 'N/A'}`);
    console.log(`  Parsed: ${file.parsedAt ? 'Yes' : 'No'}`);
    console.log(`  Created: ${file.createdAt.toISOString()}`);
    console.log();
  }

  console.log('='.repeat(80));
  console.log('📊 FINAL SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total Emails Imported: ${jobApplications.length}`);
  console.log(`Valid Resume Candidates: ${resumeFiles.length}`);
  console.log(`Documents to Exclude:`);
  console.log(`  - Visa: ${visaFiles.length}`);
  console.log(`  - Credentials: ${credentialFiles.length}`);
  console.log(`  - Other: ${otherFiles.length}`);
  console.log(`Total to Exclude: ${visaFiles.length + credentialFiles.length + otherFiles.length}`);
  console.log();
  console.log(`✅ Expected Resume Count: 160`);
  console.log(`✅ Actual Resume Count: ${resumeFiles.length}`);
  console.log(`✅ Difference: ${Math.abs(160 - resumeFiles.length)} ${resumeFiles.length < 160 ? '(missing)' : '(extra)'}`);
  console.log('='.repeat(80));

  // Provide recommendations
  console.log();
  console.log('💡 RECOMMENDATIONS:');
  if (visaFiles.length > 0 || credentialFiles.length > 0) {
    console.log(`  - Exclude ${visaFiles.length + credentialFiles.length} visa/credential documents from candidate list`);
  }
  if (resumeFiles.length !== 160) {
    if (resumeFiles.length > 160) {
      console.log(`  - Review the ${resumeFiles.length - 160} extra files to ensure they are valid resumes`);
    } else {
      console.log(`  - Investigate why ${160 - resumeFiles.length} expected resumes are missing`);
    }
  }
  console.log('='.repeat(80));
}

main()
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
