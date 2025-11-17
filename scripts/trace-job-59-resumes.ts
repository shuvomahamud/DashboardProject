/**
 * Trace where Job 59 resumes came from
 *
 * Usage: npx tsx scripts/trace-job-59-resumes.ts
 */

import prisma from '../src/lib/prisma';

const JOB_ID = 59;

async function main() {
  console.log('='.repeat(80));
  console.log(`Tracing Resume Sources for Job ${JOB_ID}`);
  console.log('='.repeat(80));
  console.log();

  // Get all applications for Job 59
  const applications = await prisma.jobApplication.findMany({
    where: {
      jobId: JOB_ID
    },
    include: {
      resume: {
        include: {
          importItems: {
            include: {
              run: {
                select: {
                  id: true,
                  job_id: true,
                  mailbox: true,
                  search_text: true,
                  status: true,
                  created_at: true
                }
              }
            }
          }
        }
      }
    },
    orderBy: {
      appliedDate: 'desc'
    }
  });

  console.log(`Total Applications for Job ${JOB_ID}: ${applications.length}`);
  console.log();

  // Analyze where resumes came from
  let fromEmailImport = 0;
  let fromUpload = 0;
  let fromOther = 0;
  let hasImportItems = 0;
  let noImportItems = 0;

  const runSources = new Map<string, number>();

  for (const app of applications) {
    if (!app.resume) continue;

    if (app.resume.sourceType === 'email') {
      fromEmailImport++;
    } else if (app.resume.sourceType === 'upload') {
      fromUpload++;
    } else {
      fromOther++;
    }

    if (app.resume.importItems && app.resume.importItems.length > 0) {
      hasImportItems++;

      for (const item of app.resume.importItems) {
        const runId = item.run.id;
        runSources.set(runId, (runSources.get(runId) || 0) + 1);
      }
    } else {
      noImportItems++;
    }
  }

  console.log('Source Type Distribution:');
  console.log(`  Email Import: ${fromEmailImport}`);
  console.log(`  Manual Upload: ${fromUpload}`);
  console.log(`  Other: ${fromOther}`);
  console.log();

  console.log('Import Items Association:');
  console.log(`  With Import Items: ${hasImportItems}`);
  console.log(`  Without Import Items: ${noImportItems}`);
  console.log();

  console.log('Import Run Sources:');
  for (const [runId, count] of Array.from(runSources.entries()).sort((a, b) => b[1] - a[1])) {
    const run = await prisma.import_email_runs.findUnique({
      where: { id: runId }
    });

    if (run) {
      console.log(`  Run: ${runId.substring(0, 8)}...`);
      console.log(`    Job ID: ${run.job_id}`);
      console.log(`    Search Text: ${run.search_text || 'N/A'}`);
      console.log(`    Status: ${run.status}`);
      console.log(`    Resumes from this run: ${count}`);
      console.log();
    }
  }

  // Sample resumes with import items
  console.log('Sample Resumes WITH Import Items (First 5):');
  const resumesWithItems = applications.filter(app => app.resume?.importItems && app.resume.importItems.length > 0);
  for (const app of resumesWithItems.slice(0, 5)) {
    console.log(`  Resume ID: ${app.resume!.id}`);
    console.log(`    File: ${app.resume!.originalName}`);
    console.log(`    Source Type: ${app.resume!.sourceType}`);
    console.log(`    Import Items: ${app.resume!.importItems!.length}`);
    if (app.resume!.importItems!.length > 0) {
      const item = app.resume!.importItems![0];
      console.log(`    Run ID: ${item.run_id.substring(0, 8)}...`);
      console.log(`    Run Job ID: ${item.run.job_id}`);
      console.log(`    Run Search: ${item.run.search_text || 'N/A'}`);
    }
    console.log();
  }

  // Sample resumes WITHOUT import items
  console.log('Sample Resumes WITHOUT Import Items (First 5):');
  const resumesWithoutItems = applications.filter(app => !app.resume?.importItems || app.resume.importItems.length === 0);
  for (const app of resumesWithoutItems.slice(0, 5)) {
    console.log(`  Resume ID: ${app.resume!.id}`);
    console.log(`    File: ${app.resume!.originalName}`);
    console.log(`    Source Type: ${app.resume!.sourceType}`);
    console.log(`    Source From: ${app.resume!.sourceFrom || 'N/A'}`);
    console.log(`    Source Message ID: ${app.resume!.sourceMessageId || 'N/A'}`);
    console.log(`    Created: ${app.resume!.createdAt.toISOString()}`);
    console.log();
  }

  console.log('='.repeat(80));
  console.log('🔍 FINDINGS');
  console.log('='.repeat(80));
  console.log(`Job ${JOB_ID} has ${applications.length} applications`);
  console.log(`${hasImportItems} resumes are linked to import runs`);
  console.log(`${noImportItems} resumes have NO import run association`);
  console.log();
  console.log('This suggests:');
  if (noImportItems > 0) {
    console.log(`  - ${noImportItems} resumes were created WITHOUT import_email_items records`);
    console.log(`  - These might be from a different import mechanism or manual upload`);
  }
  if (hasImportItems > 0) {
    console.log(`  - ${hasImportItems} resumes properly linked to import runs`);
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
