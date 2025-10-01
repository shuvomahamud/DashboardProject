/**
 * Next.js Instrumentation Hook
 *
 * This runs once when the Next.js server starts, allowing us to initialize
 * background services like the import queue worker thread.
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  // Only run in Node.js runtime (not Edge)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Only start worker in development mode
    if (process.env.NODE_ENV === 'development') {
      const { startWorkerThread } = await import('./lib/queue/worker-thread');
      startWorkerThread();
    }
  }
}
