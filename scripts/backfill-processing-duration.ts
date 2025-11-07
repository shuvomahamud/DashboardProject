import { PrismaClient, Prisma } from '@prisma/client';
import type { ImportRunSummary } from '../src/types/importQueue';

const prisma = new PrismaClient();

async function backfillProcessingDuration() {
  try {
    console.log('Starting backfill of processing_duration_ms and summary...');

    // Find all completed runs that need backfill
    const runsToUpdate = await prisma.import_email_runs.findMany({
      where: {
        OR: [
          { processing_duration_ms: { equals: null } },
          { summary: { equals: Prisma.JsonNull } }
        ],
        started_at: { not: null },
        finished_at: { not: null },
      },
      select: {
        id: true,
        started_at: true,
        finished_at: true,
        total_messages: true,
        processed_messages: true,
        processing_duration_ms: true,
        summary: true,
      },
    });

    console.log(`Found ${runsToUpdate.length} runs to backfill`);

    let updated = 0;
    let skipped = 0;

    for (const run of runsToUpdate) {
      if (!run.started_at || !run.finished_at) {
        skipped++;
        continue;
      }

      const updateData: any = {};

      // Calculate processing duration if missing
      if (run.processing_duration_ms === null) {
        const durationMs = run.finished_at.getTime() - run.started_at.getTime();
        if (durationMs >= 0) {
          updateData.processing_duration_ms = durationMs;
        } else {
          console.warn(`Skipping run ${run.id}: negative duration (${durationMs}ms)`);
          skipped++;
          continue;
        }
      }

      // Generate summary if missing
      if (run.summary === null) {
        // Get items for this run to calculate summary
        const items = await prisma.import_email_items.findMany({
          where: { run_id: run.id },
          select: {
            status: true,
            resume_id: true,
            gpt_status: true,
            gpt_attempts: true,
            gpt_last_error: true,
            external_message_id: true,
            last_error: true,
          },
        });

        const totalItems = items.length;
        const failedItems = items.filter(item => item.status === 'failed');
        const resumeItems = items.filter(item => item.resume_id !== null);
        const failedResumes = resumeItems.filter(item =>
          item.gpt_status === 'failed' || item.gpt_status === 'error'
        );
        const retryResumes = resumeItems.filter(item =>
          item.gpt_status === 'pending_retry' || item.gpt_status === 'retrying'
        );

        const summary: ImportRunSummary = {
          totals: {
            totalMessages: run.total_messages,
            processedMessages: run.processed_messages,
            failedMessages: failedItems.length,
          },
          resumeParsing: {
            total: resumeItems.length,
            failed: failedResumes.length,
            retries: retryResumes.length,
            failedResumes: failedResumes.map(item => ({
              resumeId: item.resume_id,
              status: item.gpt_status || 'unknown',
              error: item.gpt_last_error,
              attempts: item.gpt_attempts,
            })),
            retryResumes: retryResumes.map(item => ({
              resumeId: item.resume_id,
              status: item.gpt_status || 'unknown',
              error: item.gpt_last_error,
              attempts: item.gpt_attempts,
            })),
          },
          itemFailures: failedItems.map(item => ({
            messageId: item.external_message_id,
            error: item.last_error,
          })),
          warnings: [],
        };

        updateData.summary = summary as unknown as Prisma.InputJsonValue;
      }

      // Update if there's data to update
      if (Object.keys(updateData).length > 0) {
        await prisma.import_email_runs.update({
          where: { id: run.id },
          data: updateData,
        });
        updated++;

        if (updated % 10 === 0) {
          console.log(`Progress: ${updated}/${runsToUpdate.length} runs updated`);
        }
      } else {
        skipped++;
      }
    }

    console.log(`\nBackfill complete!`);
    console.log(`- Updated: ${updated} runs`);
    console.log(`- Skipped: ${skipped} runs`);
  } catch (error) {
    console.error('Error during backfill:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

backfillProcessingDuration();
