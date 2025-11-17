/**
 * Check email resumes for specific search criteria
 *
 * Usage: npx tsx scripts/check-email-resumes.ts
 *
 * This script queries resumes imported from emails to verify:
 * - How many emails were imported for a specific mailbox
 * - How many contain specific search text
 * - Breakdown of file types (resumes vs other documents)
 */

import prisma from '../src/lib/prisma';

const MAILBOX = 'karan@bnbtechinc.com';
const SEARCH_TEXT = '110714404';

async function main() {
  console.log('='.repeat(80));
  console.log('Email Resume Verification Report');
  console.log('='.repeat(80));
  console.log(`Mailbox: ${MAILBOX}`);
  console.log(`Search Text: ${SEARCH_TEXT}`);
  console.log('='.repeat(80));
  console.log();

  // 1. Check import runs for this search text
  const importRuns = await prisma.import_email_runs.findMany({
    where: {
      mailbox: MAILBOX,
      search_text: SEARCH_TEXT
    },
    orderBy: {
      created_at: 'desc'
    },
    select: {
      id: true,
      job_id: true,
      status: true,
      total_messages: true,
      processed_messages: true,
      created_at: true,
      finished_at: true,
      last_error: true
    }
  });

  console.log(`📥 Import Runs Found: ${importRuns.length}`);
  if (importRuns.length > 0) {
    console.log('\nImport Run Details:');
    for (const run of importRuns) {
      console.log(`  - Run ID: ${run.id}`);
      console.log(`    Job ID: ${run.job_id}`);
      console.log(`    Status: ${run.status}`);
      console.log(`    Total Messages: ${run.total_messages || 'N/A'}`);
      console.log(`    Processed: ${run.processed_messages}`);
      console.log(`    Created: ${run.created_at.toISOString()}`);
      console.log(`    Finished: ${run.finished_at?.toISOString() || 'In Progress'}`);
      if (run.last_error) {
        console.log(`    Last Error: ${run.last_error}`);
      }
      console.log();
    }
  }
  console.log();

  // 2. Check all resumes from this email address containing the search text
  const allResumes = await prisma.resume.findMany({
    where: {
      sourceFrom: MAILBOX,
      OR: [
        { sourceSubject: { contains: SEARCH_TEXT, mode: 'insensitive' } },
        { rawText: { contains: SEARCH_TEXT, mode: 'insensitive' } },
        { parsedText: { contains: SEARCH_TEXT, mode: 'insensitive' } }
      ]
    },
    select: {
      id: true,
      fileName: true,
      originalName: true,
      mimeType: true,
      sourceSubject: true,
      createdAt: true,
      parsedAt: true,
      rawText: true
    },
    orderBy: {
      createdAt: 'desc'
    }
  });

  console.log(`📄 Total Resumes Found: ${allResumes.length}`);
  console.log();

  // 3. Categorize resumes by file type and content
  const resumeFiles: typeof allResumes = [];
  const visaFiles: typeof allResumes = [];
  const credentialFiles: typeof allResumes = [];
  const otherFiles: typeof allResumes = [];

  for (const resume of allResumes) {
    const fileName = resume.originalName.toLowerCase();
    const subject = (resume.sourceSubject || '').toLowerCase();
    const rawText = (resume.rawText || '').toLowerCase();

    // Check if it's a visa/credential document
    const isVisa =
      fileName.includes('visa') ||
      subject.includes('visa') ||
      rawText.includes('visa application') ||
      rawText.includes('visa petition');

    const isCredential =
      fileName.includes('credential') ||
      fileName.includes('certificate') ||
      fileName.includes('license') ||
      subject.includes('credential') ||
      subject.includes('certificate');

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

  console.log('📊 Breakdown by Type:');
  console.log(`  ✅ Resume Files: ${resumeFiles.length}`);
  console.log(`  ❌ Visa Documents: ${visaFiles.length}`);
  console.log(`  ❌ Credential Documents: ${credentialFiles.length}`);
  console.log(`  ❓ Other Files: ${otherFiles.length}`);
  console.log();

  // 4. Breakdown by MIME type
  const mimeTypes = allResumes.reduce((acc, resume) => {
    acc[resume.mimeType] = (acc[resume.mimeType] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  console.log('📋 Breakdown by File Type:');
  for (const [mimeType, count] of Object.entries(mimeTypes).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${mimeType}: ${count}`);
  }
  console.log();

  // 5. Show sample resume files
  console.log('📝 Sample Resume Files (First 10):');
  for (const resume of resumeFiles.slice(0, 10)) {
    console.log(`  - ID: ${resume.id}`);
    console.log(`    File: ${resume.originalName}`);
    console.log(`    Subject: ${resume.sourceSubject || 'N/A'}`);
    console.log(`    Created: ${resume.createdAt.toISOString()}`);
    console.log(`    Parsed: ${resume.parsedAt ? 'Yes' : 'No'}`);
    console.log();
  }

  // 6. Show visa/credential files that should be excluded
  if (visaFiles.length > 0) {
    console.log('🚫 Visa Documents to Exclude (First 5):');
    for (const file of visaFiles.slice(0, 5)) {
      console.log(`  - ID: ${file.id}`);
      console.log(`    File: ${file.originalName}`);
      console.log(`    Subject: ${file.sourceSubject || 'N/A'}`);
      console.log();
    }
  }

  if (credentialFiles.length > 0) {
    console.log('🚫 Credential Documents to Exclude (First 5):');
    for (const file of credentialFiles.slice(0, 5)) {
      console.log(`  - ID: ${file.id}`);
      console.log(`    File: ${file.originalName}`);
      console.log(`    Subject: ${file.sourceSubject || 'N/A'}`);
      console.log();
    }
  }

  // 7. Summary
  console.log('='.repeat(80));
  console.log('📊 SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total Emails Found: ${allResumes.length}`);
  console.log(`Resume Candidates (excluding visa/credentials): ${resumeFiles.length}`);
  console.log(`Expected: 160`);
  console.log(`Difference: ${160 - resumeFiles.length} ${resumeFiles.length < 160 ? '(missing)' : '(extra)'}`);
  console.log('='.repeat(80));

  // 8. Check if there are unparsed resumes
  const unparsedCount = resumeFiles.filter(r => !r.parsedAt).length;
  if (unparsedCount > 0) {
    console.log(`\n⚠️  Warning: ${unparsedCount} resume(s) have not been parsed yet`);
  }
}

main()
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
