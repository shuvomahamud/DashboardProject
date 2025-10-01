/**
 * Cleanup script for stuck import runs
 *
 * Marks all "running" imports as "failed" so new ones can start.
 */

import prisma from '../src/lib/prisma';

async function cleanupStuckImports() {
  console.log('🔍 Looking for stuck imports...');

  const stuck = await prisma.import_email_runs.findMany({
    where: { status: 'running' },
    select: { id: true, job_id: true, created_at: true, started_at: true }
  });

  if (stuck.length === 0) {
    console.log('✅ No stuck imports found');
    return;
  }

  console.log(`\n⚠️  Found ${stuck.length} stuck import(s):`);
  stuck.forEach(run => {
    console.log(`   - Run ${run.id} (Job #${run.job_id})`);
    console.log(`     Started: ${run.started_at?.toISOString()}`);
  });

  console.log('\n🔧 Marking as failed...');

  const result = await prisma.import_email_runs.updateMany({
    where: { status: 'running' },
    data: {
      status: 'failed',
      finished_at: new Date(),
      last_error: 'Manually canceled - stuck in running state (processor never started)'
    }
  });

  console.log(`✅ Marked ${result.count} import(s) as failed`);
  console.log('\n✨ Done! Next cron cycle will pick up queued imports.');
}

cleanupStuckImports()
  .catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
