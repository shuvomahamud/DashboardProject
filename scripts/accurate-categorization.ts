/**
 * Accurate categorization of resumes for Job 59
 *
 * Usage: npx tsx scripts/accurate-categorization.ts
 */

import prisma from '../src/lib/prisma';

const JOB_ID = 59;
const EXPECTED_COUNT = 160;

async function main() {
  console.log('═'.repeat(80));
  console.log('ACCURATE RESUME CATEGORIZATION FOR JOB 59');
  console.log('═'.repeat(80));
  console.log();

  const applications = await prisma.jobApplication.findMany({
    where: { jobId: JOB_ID },
    include: {
      resume: {
        select: {
          id: true,
          fileName: true,
          originalName: true,
          sourceSubject: true
        }
      }
    }
  });

  const resumes = applications.map(app => app.resume).filter(Boolean);

  console.log(`Total Resumes: ${resumes.length}`);
  console.log();

  // More accurate categorization
  // Only flag as visa/credential if the FILENAME itself clearly indicates it's a document
  const categories = {
    resume: [] as typeof resumes,
    visa: [] as typeof resumes,
    credential: [] as typeof resumes,
    other: [] as typeof resumes
  };

  for (const resume of resumes) {
    if (!resume) continue;

    const fileName = resume.originalName.toLowerCase();
    const subject = (resume.sourceSubject || '').toLowerCase();

    // Only flag as visa document if the FILENAME specifically indicates it's a visa form/document
    // NOT if it just mentions visa status (which is normal in resumes)
    const isVisaDocument =
      fileName.includes('i-9') ||
      fileName.includes('i9') ||
      fileName.includes('visa application') ||
      fileName.includes('visa petition') ||
      fileName.includes('visa form') ||
      fileName.includes('authorization form') ||
      fileName.includes('work permit') ||
      subject.includes('i-9 form') ||
      subject.includes('visa application');

    // Only flag as credential document if it's specifically a certificate/credential file
    const isCredentialDocument =
      (fileName.includes('certificate') && !fileName.includes('resume')) ||
      (fileName.includes('certification') && !fileName.includes('resume')) ||
      (fileName.includes('credential') && !fileName.includes('resume')) ||
      fileName.includes('transcript') ||
      fileName.includes('diploma') ||
      (fileName.includes('degree') && !fileName.includes('resume'));

    if (isVisaDocument) {
      categories.visa.push(resume);
    } else if (isCredentialDocument) {
      categories.credential.push(resume);
    } else {
      categories.resume.push(resume);
    }
  }

  console.log('Categorization (Filename-Based Only):');
  console.log(`  ✅ Valid Candidate Resumes: ${categories.resume.length}`);
  console.log(`  ❌ Visa Documents: ${categories.visa.length}`);
  console.log(`  ❌ Credential Documents: ${categories.credential.length}`);
  console.log(`  ❓ Other: ${categories.other.length}`);
  console.log();

  const toExclude = categories.visa.length + categories.credential.length;

  if (categories.visa.length > 0) {
    console.log('VISA DOCUMENTS TO EXCLUDE:');
    for (const resume of categories.visa) {
      console.log(`  ❌ ID: ${resume!.id} - ${resume!.originalName}`);
    }
    console.log();
  }

  if (categories.credential.length > 0) {
    console.log('CREDENTIAL DOCUMENTS TO EXCLUDE:');
    for (const resume of categories.credential) {
      console.log(`  ❌ ID: ${resume!.id} - ${resume!.originalName}`);
    }
    console.log();
  }

  console.log('═'.repeat(80));
  console.log('FINAL SUMMARY');
  console.log('═'.repeat(80));
  console.log();
  console.log(`Import Run Results:`);
  console.log(`  Emails Found: 162`);
  console.log(`  Resumes Created: ${resumes.length}`);
  console.log(`  Not Processed: ${162 - resumes.length} (likely no attachments or duplicates)`);
  console.log();
  console.log(`Categorization:`);
  console.log(`  Valid Candidate Resumes: ${categories.resume.length}`);
  console.log(`  Documents to Exclude: ${toExclude}`);
  console.log(`  Final Candidate Count: ${categories.resume.length}`);
  console.log();
  console.log(`Comparison to Expected:`);
  console.log(`  Expected: ${EXPECTED_COUNT}`);
  console.log(`  Actual: ${categories.resume.length}`);
  const diff = categories.resume.length - EXPECTED_COUNT;
  console.log(`  Difference: ${diff > 0 ? '+' : ''}${diff}`);
  console.log();

  if (Math.abs(diff) <= 5) {
    console.log(`✅ Result is within acceptable range (±5 of expected)`);
  } else if (categories.resume.length < EXPECTED_COUNT) {
    console.log(`⚠️  Missing ${EXPECTED_COUNT - categories.resume.length} expected candidates`);
    console.log(`   Possible reasons:`);
    console.log(`   - Some emails had no resume attachments`);
    console.log(`   - Some resumes failed to process`);
    console.log(`   - Duplicates were skipped`);
  } else {
    console.log(`⚠️  ${categories.resume.length - EXPECTED_COUNT} more candidates than expected`);
    console.log(`   This may indicate the expected count was incorrect`);
  }

  console.log();
  console.log('═'.repeat(80));
}

main()
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
