/**
 * Final comprehensive email import report for karan@bnbtechinc.com / 110714404
 *
 * Usage: npx tsx scripts/final-email-import-report.ts
 */

import prisma from '../src/lib/prisma';

const SEARCH_TEXT = '110714404';
const EXPECTED_COUNT = 160;

async function main() {
  console.log('╔' + '═'.repeat(78) + '╗');
  console.log('║' + ' '.repeat(15) + 'FINAL EMAIL IMPORT REPORT' + ' '.repeat(38) + '║');
  console.log('╚' + '═'.repeat(78) + '╝');
  console.log();
  console.log(`Search Text: "${SEARCH_TEXT}"`);
  console.log(`Expected Candidates: ${EXPECTED_COUNT}`);
  console.log();

  // Get all import runs for this search
  const runs = await prisma.import_email_runs.findMany({
    where: {
      search_text: SEARCH_TEXT
    },
    include: {
      Job: {
        select: {
          id: true,
          title: true
        }
      }
    },
    orderBy: {
      created_at: 'asc'
    }
  });

  console.log('═'.repeat(80));
  console.log('IMPORT RUNS SUMMARY');
  console.log('═'.repeat(80));
  console.log();

  for (const run of runs) {
    console.log(`Run #${runs.indexOf(run) + 1}: ${run.id.substring(0, 12)}...`);
    console.log(`  Job: ${run.Job.title} (ID: ${run.job_id})`);
    console.log(`  Status: ${run.status}`);
    console.log(`  Emails Found: ${run.total_messages || 0}`);
    console.log(`  Emails Processed: ${run.processed_messages}`);
    console.log(`  Created: ${run.created_at.toISOString()}`);
    console.log(`  Finished: ${run.finished_at?.toISOString() || 'N/A'}`);
    console.log();
  }

  // Get ALL applications across both jobs
  const allApplications = await prisma.jobApplication.findMany({
    where: {
      jobId: {
        in: runs.map(r => r.job_id)
      }
    },
    include: {
      resume: {
        select: {
          id: true,
          fileName: true,
          originalName: true,
          sourceType: true,
          sourceMessageId: true,
          sourceFrom: true,
          sourceSubject: true,
          createdAt: true,
          rawText: true
        }
      },
      job: {
        select: {
          id: true,
          title: true
        }
      }
    }
  });

  // Group by job
  const job57Apps = allApplications.filter(app => app.jobId === 57);
  const job59Apps = allApplications.filter(app => app.jobId === 59);

  console.log('═'.repeat(80));
  console.log('APPLICATIONS BY JOB');
  console.log('═'.repeat(80));
  console.log();
  console.log(`Job 57 (.NET Developer): ${job57Apps.length} applications`);
  console.log(`Job 59 (Systems Developer - 14404): ${job59Apps.length} applications`);
  console.log(`Total: ${allApplications.length} applications`);
  console.log();

  // Analyze Job 59 resumes (the current job)
  console.log('═'.repeat(80));
  console.log('JOB 59 ANALYSIS - Systems Developer - 14404');
  console.log('═'.repeat(80));
  console.log();

  const job59Resumes = job59Apps.map(app => app.resume).filter(Boolean);

  // Categorize
  const categories = {
    resume: [] as typeof job59Resumes,
    visa: [] as typeof job59Resumes,
    credential: [] as typeof job59Resumes,
    other: [] as typeof job59Resumes
  };

  for (const resume of job59Resumes) {
    if (!resume) continue;

    const fileName = resume.originalName.toLowerCase();
    const subject = (resume.sourceSubject || '').toLowerCase();
    const preview = (resume.rawText || '').substring(0, 2000).toLowerCase();

    // More aggressive filtering
    const visaKeywords = [
      'visa', 'i-9', 'i9', 'authorization', 'work permit', 'h-1b', 'h1b',
      'green card', 'ead', 'opt', 'cpt', 'immigration', 'passport'
    ];

    const credentialKeywords = [
      'credential', 'certificate', 'certification', 'license', 'degree',
      'transcript', 'diploma', 'attestation'
    ];

    const isVisa = visaKeywords.some(kw =>
      fileName.includes(kw) || subject.includes(kw) || preview.includes(kw)
    );

    const isCredential = credentialKeywords.some(kw =>
      fileName.includes(kw) || subject.includes(kw) || preview.includes(kw)
    );

    if (isVisa) {
      categories.visa.push(resume);
    } else if (isCredential) {
      categories.credential.push(resume);
    } else {
      categories.resume.push(resume);
    }
  }

  console.log('Categorization:');
  console.log(`  ✅ Valid Resumes: ${categories.resume.length}`);
  console.log(`  ❌ Visa Documents: ${categories.visa.length}`);
  console.log(`  ❌ Credential Documents: ${categories.credential.length}`);
  console.log(`  ❓ Other: ${categories.other.length}`);
  console.log();

  const toExclude = categories.visa.length + categories.credential.length;
  const validCandidates = categories.resume.length;

  console.log('Calculation:');
  console.log(`  Total Resumes: ${job59Resumes.length}`);
  console.log(`  Documents to Exclude: ${toExclude}`);
  console.log(`  Valid Candidates: ${validCandidates}`);
  console.log();

  // Show what should be excluded
  if (categories.visa.length > 0) {
    console.log('VISA DOCUMENTS TO EXCLUDE:');
    console.log('-'.repeat(80));
    for (const resume of categories.visa) {
      console.log(`  ❌ Resume ID: ${resume!.id} - ${resume!.originalName}`);
      if (resume!.sourceSubject) {
        console.log(`     Subject: ${resume!.sourceSubject}`);
      }
    }
    console.log();
  }

  if (categories.credential.length > 0) {
    console.log('CREDENTIAL DOCUMENTS TO EXCLUDE:');
    console.log('-'.repeat(80));
    for (const resume of categories.credential) {
      console.log(`  ❌ Resume ID: ${resume!.id} - ${resume!.originalName}`);
      if (resume!.sourceSubject) {
        console.log(`     Subject: ${resume!.sourceSubject}`);
      }
    }
    console.log();
  }

  // Final summary
  console.log('═'.repeat(80));
  console.log('FINAL SUMMARY');
  console.log('═'.repeat(80));
  console.log();
  console.log(`Latest Import Run (Job 59):`);
  const latestRun = runs.find(r => r.job_id === 59);
  if (latestRun) {
    console.log(`  Emails Found: ${latestRun.total_messages || 0}`);
    console.log(`  Resumes Created: ${job59Resumes.length}`);
    console.log(`  Missing: ${(latestRun.total_messages || 0) - job59Resumes.length}`);
  }
  console.log();
  console.log(`Candidate Count:`);
  console.log(`  Expected: ${EXPECTED_COUNT}`);
  console.log(`  Actual Valid Resumes: ${validCandidates}`);
  console.log(`  Difference: ${validCandidates - EXPECTED_COUNT} ${validCandidates >= EXPECTED_COUNT ? '(extra)' : '(missing)'}`);
  console.log();

  if (toExclude > 0) {
    console.log(`✅ Recommendation:`);
    console.log(`   Exclude ${toExclude} visa/credential document(s) from the candidate list`);
    console.log(`   Final count would be: ${validCandidates}`);
  }

  console.log();
  console.log('═'.repeat(80));

  // Check why emails are missing
  if (latestRun && latestRun.total_messages && latestRun.total_messages > job59Resumes.length) {
    console.log();
    console.log('⚠️  INVESTIGATION NEEDED:');
    console.log(`   ${latestRun.total_messages} emails were found but only ${job59Resumes.length} resumes were created`);
    console.log(`   ${latestRun.total_messages - job59Resumes.length} emails were not processed into resumes`);
    console.log();
    console.log('Possible reasons:');
    console.log('   1. Emails had no attachments');
    console.log('   2. Attachments were not resume files');
    console.log('   3. Processing errors occurred');
    console.log('   4. Duplicate resumes were skipped');
    console.log();
  }

  console.log('Report generated: ' + new Date().toISOString());
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
