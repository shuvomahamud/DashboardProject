/**
 * Worker thread main entry point
 *
 * This file runs in a separate worker thread and processes the import queue.
 * It's started automatically with the dev server via worker-thread.ts
 */

import { parentPort } from 'worker_threads';
import { startWorker } from './worker';

async function main() {
  try {
    console.log('🔧 Worker thread starting...');

    // Start the pg-boss worker
    await startWorker();

    // Notify parent thread that we're ready
    if (parentPort) {
      parentPort.postMessage({ type: 'ready' });
    }

    console.log('✅ Worker thread initialized and listening for jobs');

  } catch (error: any) {
    console.error('❌ Worker thread failed to start:', error.message);

    if (parentPort) {
      parentPort.postMessage({
        type: 'error',
        message: error.message
      });
    }

    process.exit(1);
  }
}

// Handle shutdown signals
process.on('SIGINT', () => {
  console.log('🛑 Worker thread received SIGINT, shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('🛑 Worker thread received SIGTERM, shutting down...');
  process.exit(0);
});

// Start the worker
main();
