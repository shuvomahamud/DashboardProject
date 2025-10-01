/**
 * Background worker thread that starts automatically with Next.js dev server
 *
 * This runs in a separate thread and processes the import queue without
 * blocking the main Next.js process.
 */

import { Worker } from 'worker_threads';
import path from 'path';

let workerThread: Worker | null = null;
let isStarting = false;

export function startWorkerThread() {
  // Prevent multiple starts
  if (workerThread || isStarting) {
    return;
  }

  isStarting = true;

  try {
    const workerPath = path.join(process.cwd(), 'src', 'lib', 'queue', 'worker-thread-main.ts');

    console.log('🚀 Starting import queue worker in background thread...');

    // Use tsx loader to handle TypeScript files
    workerThread = new Worker(workerPath, {
      execArgv: ['--require', 'tsx/cjs']
    });

    workerThread.on('message', (msg) => {
      if (msg.type === 'ready') {
        console.log('✅ Import queue worker is ready and listening');
      } else if (msg.type === 'log') {
        console.log('[Worker]', msg.message);
      } else if (msg.type === 'error') {
        console.error('[Worker Error]', msg.message);
      }
    });

    workerThread.on('error', (error) => {
      console.error('❌ Worker thread error:', error.message);
      workerThread = null;
      isStarting = false;

      // Auto-restart after 5 seconds
      console.log('🔄 Restarting worker in 5 seconds...');
      setTimeout(() => startWorkerThread(), 5000);
    });

    workerThread.on('exit', (code) => {
      if (code !== 0) {
        console.error(`❌ Worker thread exited with code ${code}`);
      }
      workerThread = null;
      isStarting = false;
    });

    isStarting = false;

  } catch (error: any) {
    console.error('❌ Failed to start worker thread:', error.message);
    workerThread = null;
    isStarting = false;
  }
}

export function stopWorkerThread() {
  if (workerThread) {
    console.log('🛑 Stopping import queue worker...');
    workerThread.terminate();
    workerThread = null;
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  stopWorkerThread();
});

process.on('SIGTERM', () => {
  stopWorkerThread();
});
