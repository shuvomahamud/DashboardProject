/**
 * Cleanup script for stuck import runs
 *
 * Marks all "running" imports as "failed" so new ones can start.
 */

import prisma from '../src/lib/prisma';
import { Prisma } from '@prisma/client';
import { buildImportRunSummary } from '../src/lib/imports/runSummary';

async function cleanupStuckImports() {
  console.log('?? Looking for stuck imports...');

  const stuck = await prisma.import_email_runs.findMany({
    where: { status: 'running' },
    select: {
      id: true,
      job_id: true,
      created_at: true,
      started_at: true,
      total_messages: true,
      processed_messages: true
    }
  });

  if (stuck.length === 0) {
    console.log('? No stuck imports found');
    return;
  }

  console.log(`\n??  Found ${stuck.length} stuck import(s):`);
  stuck.forEach(run => {
    console.log(`   - Run ${run.id} (Job #${run.job_id})`);
    console.log(`     Started: ${run.started_at?.toISOString()}`);
  });

  console.log('\n?? Marking as failed...');

  const finishedAt = new Date();
  let updatedCount = 0;

  for (const run of stuck) {
    const start = run.started_at ?? run.created_at;
    const durationMs = Math.max(0, finishedAt.getTime() - start.getTime());
    let summary = null;
    try {
      summary = await buildImportRunSummary({
        runId: run.id,
        jobId: run.job_id,
        totalMessages: run.total_messages ?? null,
        processedMessages: run.processed_messages ?? 0,
        failedMessages: 0
      });
    } catch (error: any) {
      console.warn('Failed to build summary for stuck run', { runId: run.id, error: error?.message });
    }

    await prisma.import_email_runs.update({
      where: { id: run.id },
      data: {
        status: 'failed',
        finished_at: finishedAt,
        processing_duration_ms: durationMs,
        summary: summary ? (summary as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
        last_error: 'Manually canceled - stuck in running state (processor never started)'
      }
    });
    updatedCount += 1;
  }

  console.log(`? Marked ${updatedCount} import(s) as failed`);
  console.log('\n? Done! Next cron cycle will pick up queued imports.');
}

cleanupStuckImports()
  .catch(err => {
    console.error('? Error:', err);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
