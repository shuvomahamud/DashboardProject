/**
 * Check email import items status
 *
 * Usage: npx tsx scripts/check-email-items.ts
 */

import prisma from '../src/lib/prisma';

const MAILBOX = 'karan@bnbtechinc.com';
const SEARCH_TEXT = '110714404';
const RUN_ID = 'cb937586-3789-4239-8948-c0246a608126'; // Most recent run

async function main() {
  console.log('='.repeat(80));
  console.log('Email Import Items Status Report');
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
      gpt_attempts: true,
      gpt_last_error: true,
      created_at: true,
      updated_at: true
    },
    orderBy: {
      id: 'asc'
    }
  });

  console.log(`📧 Total Email Items: ${emailItems.length}`);
  console.log();

  // Group by status
  const statusCounts = emailItems.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  console.log('Status Breakdown:');
  for (const [status, count] of Object.entries(statusCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${status}: ${count}`);
  }
  console.log();

  // Group by step
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
  console.log(`📄 Items with Resumes Created: ${itemsWithResumes.length}`);
  console.log();

  // Items with errors
  const itemsWithErrors = emailItems.filter(item => item.last_error !== null);
  if (itemsWithErrors.length > 0) {
    console.log(`❌ Items with Errors: ${itemsWithErrors.length}`);
    console.log('\nSample Errors (First 5):');
    for (const item of itemsWithErrors.slice(0, 5)) {
      console.log(`  - Item ID: ${item.id}`);
      console.log(`    Status: ${item.status}`);
      console.log(`    Step: ${item.step}`);
      console.log(`    Attempts: ${item.attempts}`);
      console.log(`    Error: ${item.last_error?.substring(0, 200)}`);
      console.log();
    }
  }

  // Show pending items
  const pendingItems = emailItems.filter(item => item.status === 'pending');
  if (pendingItems.length > 0) {
    console.log(`⏳ Pending Items: ${pendingItems.length}`);
    console.log('\nSample Pending (First 5):');
    for (const item of pendingItems.slice(0, 5)) {
      console.log(`  - Item ID: ${item.id}`);
      console.log(`    Step: ${item.step}`);
      console.log(`    Attempts: ${item.attempts}`);
      console.log(`    Created: ${item.created_at.toISOString()}`);
      console.log();
    }
  }

  // Check if there are any resumes from this job
  const resumesForJob = await prisma.resume.findMany({
    where: {
      sourceFrom: MAILBOX,
      importItems: {
        some: {
          job_id: importRun.job_id
        }
      }
    },
    select: {
      id: true,
      fileName: true,
      originalName: true,
      sourceSubject: true,
      createdAt: true
    },
    orderBy: {
      createdAt: 'desc'
    },
    take: 10
  });

  console.log(`\n📑 Resumes for Job ${importRun.job_id}: ${resumesForJob.length}`);
  if (resumesForJob.length > 0) {
    console.log('\nSample Resumes (First 5):');
    for (const resume of resumesForJob.slice(0, 5)) {
      console.log(`  - ID: ${resume.id}`);
      console.log(`    File: ${resume.originalName}`);
      console.log(`    Subject: ${resume.sourceSubject || 'N/A'}`);
      console.log(`    Created: ${resume.createdAt.toISOString()}`);
      console.log();
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
