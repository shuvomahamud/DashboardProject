import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function backfillDurations() {
  try {
    console.log('Starting backfill of processing_duration_ms...');

    // Find all runs with started_at and finished_at but no processing_duration_ms
    const runsToUpdate = await prisma.import_email_runs.findMany({
      where: {
        started_at: { not: null },
        finished_at: { not: null },
        processing_duration_ms: null,
      },
      select: {
        id: true,
        started_at: true,
        finished_at: true,
      },
    });

    console.log(`Found ${runsToUpdate.length} runs to backfill`);

    let updated = 0;
    for (const run of runsToUpdate) {
      if (run.started_at && run.finished_at) {
        const durationMs = run.finished_at.getTime() - run.started_at.getTime();

        await prisma.import_email_runs.update({
          where: { id: run.id },
          data: { processing_duration_ms: durationMs },
        });

        updated++;
        if (updated % 10 === 0) {
          console.log(`Updated ${updated}/${runsToUpdate.length} runs...`);
        }
      }
    }

    console.log(`✓ Successfully backfilled ${updated} runs`);
  } catch (error) {
    console.error('Error backfilling durations:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

backfillDurations();
