/**
 * Import Email Worker
 *
 * This script runs a single-threaded worker that processes email import jobs from the queue.
 *
 * Features:
 * - Single-runner concurrency (only 1 import at a time globally)
 * - FIFO queue processing
 * - Graceful shutdown on SIGINT/SIGTERM
 * - Automatic reconnection on errors
 *
 * Usage:
 *   npm run worker:import
 *   or
 *   npx tsx scripts/run-import-worker.ts
 */

import { startWorker } from '../src/lib/queue/worker';
import { stopBoss } from '../src/lib/queue/boss';

async function main() {
  console.log('🚀 Starting Import Email Worker');
  console.log('📋 Queue: import-emails');
  console.log('🔢 Concurrency: 1 (single-runner mode)');
  console.log('⏸️  Press Ctrl+C to stop\n');

  try {
    await startWorker();
  } catch (error: any) {
    console.error('❌ Failed to start worker:', error.message);
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n\n🛑 Received ${signal}, shutting down gracefully...`);
    try {
      await stopBoss();
      console.log('✅ Worker stopped');
      process.exit(0);
    } catch (error: any) {
      console.error('❌ Error during shutdown:', error.message);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Keep alive
  console.log('✅ Worker is running and waiting for jobs...\n');
}

main().catch((error) => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});
