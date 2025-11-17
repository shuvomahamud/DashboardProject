/**
 * Find all resumes from karan@bnbtechinc.com
 *
 * Usage: npx tsx scripts/find-all-karan-resumes.ts
 */

import prisma from '../src/lib/prisma';

const MAILBOX = 'karan@bnbtechinc.com';
const SEARCH_TEXT = '110714404';

async function main() {
  console.log('='.repeat(80));
  console.log('Find All Resumes from Karan');
  console.log('='.repeat(80));
  console.log();

  // 1. Find all resumes from this email
  const allResumesFromEmail = await prisma.resume.findMany({
    where: {
      sourceFrom: {
        contains: MAILBOX,
        mode: 'insensitive'
      }
    },
    select: {
      id: true,
      fileName: true,
      originalName: true,
      sourceSubject: true,
      sourceFrom: true,
      createdAt: true
    },
    orderBy: {
      createdAt: 'desc'
    },
    take: 20
  });

  console.log(`📄 Total Resumes from ${MAILBOX}: ${allResumesFromEmail.length}`);

  if (allResumesFromEmail.length > 0) {
    console.log('\nSample Resumes (First 10):');
    for (const resume of allResumesFromEmail.slice(0, 10)) {
      console.log(`  - ID: ${resume.id}`);
      console.log(`    File: ${resume.originalName}`);
      console.log(`    From: ${resume.sourceFrom}`);
      console.log(`    Subject: ${resume.sourceSubject || 'N/A'}`);
      console.log(`    Created: ${resume.createdAt.toISOString()}`);
      console.log();
    }
  }
  console.log();

  // 2. Search for resumes containing the search text
  const resumesWithSearchText = await prisma.resume.findMany({
    where: {
      OR: [
        {
          sourceSubject: {
            contains: SEARCH_TEXT,
            mode: 'insensitive'
          }
        },
        {
          sourceFrom: {
            contains: SEARCH_TEXT,
            mode: 'insensitive'
          }
        },
        {
          rawText: {
            contains: SEARCH_TEXT,
            mode: 'insensitive'
          }
        },
        {
          parsedText: {
            contains: SEARCH_TEXT,
            mode: 'insensitive'
          }
        }
      ]
    },
    select: {
      id: true,
      fileName: true,
      originalName: true,
      sourceSubject: true,
      sourceFrom: true,
      createdAt: true
    },
    orderBy: {
      createdAt: 'desc'
    },
    take: 20
  });

  console.log(`🔍 Resumes containing "${SEARCH_TEXT}": ${resumesWithSearchText.length}`);

  if (resumesWithSearchText.length > 0) {
    console.log('\nSample Resumes (First 10):');
    for (const resume of resumesWithSearchText.slice(0, 10)) {
      console.log(`  - ID: ${resume.id}`);
      console.log(`    File: ${resume.originalName}`);
      console.log(`    From: ${resume.sourceFrom || 'N/A'}`);
      console.log(`    Subject: ${resume.sourceSubject || 'N/A'}`);
      console.log(`    Created: ${resume.createdAt.toISOString()}`);
      console.log();
    }
  }
  console.log();

  // 3. Check all import_email_items regardless of run
  const allEmailItems = await prisma.import_email_items.findMany({
    where: {
      job_id: {
        in: [57, 59] // Both job IDs from the import runs
      }
    },
    select: {
      id: true,
      run_id: true,
      job_id: true,
      status: true,
      step: true,
      resume_id: true,
      created_at: true
    },
    orderBy: {
      created_at: 'desc'
    },
    take: 20
  });

  console.log(`📧 Total Email Items for Jobs 57 & 59: ${allEmailItems.length}`);

  if (allEmailItems.length > 0) {
    console.log('\nSample Email Items (First 10):');
    for (const item of allEmailItems.slice(0, 10)) {
      console.log(`  - Item ID: ${item.id}`);
      console.log(`    Run ID: ${item.run_id}`);
      console.log(`    Job ID: ${item.job_id}`);
      console.log(`    Status: ${item.status}`);
      console.log(`    Step: ${item.step}`);
      console.log(`    Resume ID: ${item.resume_id || 'None'}`);
      console.log(`    Created: ${item.created_at.toISOString()}`);
      console.log();
    }
  }
  console.log();

  // 4. Check all job applications for these jobs
  const jobApplications = await prisma.jobApplication.findMany({
    where: {
      jobId: {
        in: [57, 59]
      }
    },
    include: {
      resume: {
        select: {
          id: true,
          fileName: true,
          originalName: true,
          sourceFrom: true,
          sourceSubject: true
        }
      }
    },
    orderBy: {
      appliedDate: 'desc'
    },
    take: 20
  });

  console.log(`📝 Total Job Applications for Jobs 57 & 59: ${jobApplications.length}`);

  if (jobApplications.length > 0) {
    console.log('\nSample Applications (First 10):');
    for (const app of jobApplications.slice(0, 10)) {
      console.log(`  - App ID: ${app.id}`);
      console.log(`    Job ID: ${app.jobId}`);
      console.log(`    Resume ID: ${app.resumeId}`);
      console.log(`    Resume File: ${app.resume?.originalName || 'N/A'}`);
      console.log(`    From: ${app.resume?.sourceFrom || 'N/A'}`);
      console.log(`    Applied: ${app.appliedDate?.toISOString() || 'N/A'}`);
      console.log();
    }

    // Filter for resumes from karan
    const karanApplications = jobApplications.filter(app =>
      app.resume?.sourceFrom?.toLowerCase().includes('karan')
    );
    console.log(`\n📧 Applications from Karan: ${karanApplications.length}`);
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
