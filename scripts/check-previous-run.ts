/**
 * Check previous successful import run
 *
 * Usage: npx tsx scripts/check-previous-run.ts
 */

import prisma from '../src/lib/prisma';

const RUN_ID = '1953f21f-1cbd-4cf9-9506-9ed0be95ae64'; // Previous successful run

async function main() {
  console.log('='.repeat(80));
  console.log('Previous Import Run Analysis');
  console.log('='.repeat(80));
  console.log();

  // Get the import run details
  const importRun = await prisma.import_email_runs.findUnique({
    where: { id: RUN_ID },
    include: {
      Job: {
        select: {
          id: true,
          title: true
        }
      }
    }
  });

  if (!importRun) {
    console.log('Import run not found!');
    return;
  }

  console.log('Import Run Details:');
  console.log(`  Run ID: ${importRun.id}`);
  console.log(`  Job: ${importRun.Job.title} (ID: ${importRun.Job.id})`);
  console.log(`  Mailbox: ${importRun.mailbox}`);
  console.log(`  Search Text: ${importRun.search_text}`);
  console.log(`  Status: ${importRun.status}`);
  console.log(`  Total Messages: ${importRun.total_messages}`);
  console.log(`  Processed Messages: ${importRun.processed_messages}`);
  console.log(`  Created: ${importRun.created_at.toISOString()}`);
  console.log(`  Finished: ${importRun.finished_at?.toISOString() || 'N/A'}`);
  console.log();

  // Get all email items for this run
  const emailItems = await prisma.import_email_items.findMany({
    where: {
      run_id: RUN_ID
    },
    select: {
      id: true,
      external_message_id: true,
      status: true,
      step: true,
      attempts: true,
      last_error: true,
      resume_id: true,
      gpt_status: true,
      created_at: true,
      updated_at: true
    },
    orderBy: {
      id: 'asc'
    }
  });

  console.log(`📧 Total Email Items: ${emailItems.length}`);
  console.log();

  // Status breakdown
  const statusCounts = emailItems.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  console.log('Status Breakdown:');
  for (const [status, count] of Object.entries(statusCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${status}: ${count}`);
  }
  console.log();

  // Step breakdown
  const stepCounts = emailItems.reduce((acc, item) => {
    acc[item.step] = (acc[item.step] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  console.log('Step Breakdown:');
  for (const [step, count] of Object.entries(stepCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${step}: ${count}`);
  }
  console.log();

  // Items with resumes
  const itemsWithResumes = emailItems.filter(item => item.resume_id !== null);
  console.log(`📄 Items with Resumes: ${itemsWithResumes.length}`);
  console.log();

  // Get all resumes from this run
  const resumes = await prisma.resume.findMany({
    where: {
      importItems: {
        some: {
          run_id: RUN_ID
        }
      }
    },
    select: {
      id: true,
      fileName: true,
      originalName: true,
      mimeType: true,
      sourceSubject: true,
      sourceFrom: true,
      createdAt: true,
      parsedAt: true,
      rawText: true
    },
    orderBy: {
      createdAt: 'desc'
    }
  });

  console.log(`📑 Total Resumes Created: ${resumes.length}`);
  console.log();

  // Categorize resumes
  const resumeFiles: typeof resumes = [];
  const visaFiles: typeof resumes = [];
  const credentialFiles: typeof resumes = [];
  const otherFiles: typeof resumes = [];

  for (const resume of resumes) {
    const fileName = resume.originalName.toLowerCase();
    const subject = (resume.sourceSubject || '').toLowerCase();
    const rawText = (resume.rawText || '').toLowerCase();

    const isVisa =
      fileName.includes('visa') ||
      subject.includes('visa') ||
      rawText.includes('visa application') ||
      rawText.includes('visa petition') ||
      fileName.includes('i-9') ||
      fileName.includes('i9');

    const isCredential =
      fileName.includes('credential') ||
      fileName.includes('certificate') ||
      fileName.includes('certification') ||
      fileName.includes('license') ||
      subject.includes('credential') ||
      subject.includes('certificate') ||
      subject.includes('certification');

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
  console.log(`  ✅ Resume Files: ${resumeFiles.length}`);
  console.log(`  ❌ Visa Documents: ${visaFiles.length}`);
  console.log(`  ❌ Credential Documents: ${credentialFiles.length}`);
  console.log(`  ❓ Other Files: ${otherFiles.length}`);
  console.log();

  // Show visa/credential files that should be excluded
  if (visaFiles.length > 0) {
    console.log('🚫 VISA Documents (should be excluded):');
    for (const file of visaFiles) {
      console.log(`  - ID: ${file.id}`);
      console.log(`    File: ${file.originalName}`);
      console.log(`    Subject: ${file.sourceSubject || 'N/A'}`);
      console.log();
    }
  }

  if (credentialFiles.length > 0) {
    console.log('🚫 CREDENTIAL Documents (should be excluded):');
    for (const file of credentialFiles) {
      console.log(`  - ID: ${file.id}`);
      console.log(`    File: ${file.originalName}`);
      console.log(`    Subject: ${file.sourceSubject || 'N/A'}`);
      console.log();
    }
  }

  if (otherFiles.length > 0) {
    console.log('❓ OTHER Files (First 10):');
    for (const file of otherFiles.slice(0, 10)) {
      console.log(`  - ID: ${file.id}`);
      console.log(`    File: ${file.originalName}`);
      console.log(`    Subject: ${file.sourceSubject || 'N/A'}`);
      console.log();
    }
  }

  console.log('='.repeat(80));
  console.log('📊 SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total Emails Imported: ${resumes.length}`);
  console.log(`Resume Candidates (excluding visa/credentials): ${resumeFiles.length}`);
  console.log(`Documents to Exclude: ${visaFiles.length + credentialFiles.length}`);
  console.log(`Expected Resume Count: 160`);
  console.log(`Difference: ${160 - resumeFiles.length} ${resumeFiles.length < 160 ? '(missing)' : '(extra)'}`);
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
