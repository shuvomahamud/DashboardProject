/**
 * Find missing emails that were found but not processed
 *
 * Usage: npx tsx scripts/find-missing-emails.ts
 */

import prisma from '../src/lib/prisma';

async function main() {
  console.log('='.repeat(80));
  console.log('Finding Missing/Unprocessed Emails');
  console.log('='.repeat(80));
  console.log();

  // Check all import runs for search text 110714404
  const importRuns = await prisma.import_email_runs.findMany({
    where: {
      search_text: '110714404'
    },
    orderBy: {
      created_at: 'desc'
    }
  });

  console.log(`Import Runs Found: ${importRuns.length}`);
  console.log();

  for (const run of importRuns) {
    console.log(`Run ID: ${run.id}`);
    console.log(`  Job ID: ${run.job_id}`);
    console.log(`  Status: ${run.status}`);
    console.log(`  Total Messages: ${run.total_messages}`);
    console.log(`  Processed Messages: ${run.processed_messages}`);
    console.log();

    // Get email items for this run
    const emailItems = await prisma.import_email_items.findMany({
      where: {
        run_id: run.id
      },
      select: {
        id: true,
        external_message_id: true,
        status: true,
        step: true,
        attempts: true,
        last_error: true,
        resume_id: true,
        created_at: true
      }
    });

    console.log(`  Email Items Created: ${emailItems.length}`);

    // Group by status
    const statusCounts = emailItems.reduce((acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    console.log(`  Status Distribution:`);
    for (const [status, count] of Object.entries(statusCounts).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${status}: ${count}`);
    }

    // Items without resumes
    const itemsWithoutResumes = emailItems.filter(item => !item.resume_id);
    if (itemsWithoutResumes.length > 0) {
      console.log(`\n  ❌ Items WITHOUT Resumes: ${itemsWithoutResumes.length}`);
      console.log(`  Details:`);
      for (const item of itemsWithoutResumes) {
        console.log(`    - Item ID: ${item.id}`);
        console.log(`      Status: ${item.status}`);
        console.log(`      Step: ${item.step}`);
        console.log(`      Attempts: ${item.attempts}`);
        console.log(`      Error: ${item.last_error || 'None'}`);
        console.log();
      }
    }

    // Items with errors
    const itemsWithErrors = emailItems.filter(item => item.last_error);
    if (itemsWithErrors.length > 0) {
      console.log(`\n  ⚠️  Items WITH Errors: ${itemsWithErrors.length}`);
      console.log(`  Sample Errors:`);
      for (const item of itemsWithErrors.slice(0, 5)) {
        console.log(`    - Item ID: ${item.id}`);
        console.log(`      Status: ${item.status}`);
        console.log(`      Step: ${item.step}`);
        console.log(`      Resume ID: ${item.resume_id || 'None'}`);
        console.log(`      Error: ${item.last_error.substring(0, 200)}...`);
        console.log();
      }
    }

    console.log('='.repeat(80));
  }

  // Summary across all runs
  console.log('\n📊 OVERALL SUMMARY');
  console.log('='.repeat(80));

  const totalExpectedEmails = importRuns.reduce((sum, run) => sum + (run.total_messages || 0), 0);
  const totalProcessedEmails = importRuns.reduce((sum, run) => sum + run.processed_messages, 0);

  console.log(`Total Emails Found Across All Runs: ${totalExpectedEmails}`);
  console.log(`Total Emails Processed: ${totalProcessedEmails}`);
  console.log(`Difference: ${totalExpectedEmails - totalProcessedEmails}`);
  console.log();

  // Get unique resumes count
  const allEmailItems = await prisma.import_email_items.findMany({
    where: {
      run: {
        search_text: '110714404'
      }
    },
    select: {
      resume_id: true
    }
  });

  const uniqueResumeIds = new Set(allEmailItems.filter(item => item.resume_id).map(item => item.resume_id));
  console.log(`Unique Resumes Created: ${uniqueResumeIds.size}`);

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
