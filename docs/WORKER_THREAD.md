# Worker Thread Implementation

## Overview

The email import queue worker now runs **automatically** as a background thread when you start the development server with `npm run dev`.

## How It Works

### Architecture

1. **Next.js Instrumentation Hook** (`src/instrumentation.ts`)
   - Runs once when Next.js starts
   - Only in development mode (`NODE_ENV === 'development'`)
   - Calls `startWorkerThread()` to launch the worker

2. **Worker Thread Manager** (`src/lib/queue/worker-thread.ts`)
   - Creates a Node.js Worker Thread
   - Uses `tsx/cjs` loader to handle TypeScript files
   - Monitors worker health and auto-restarts on failure
   - Handles graceful shutdown on SIGINT/SIGTERM

3. **Worker Thread Main** (`src/lib/queue/worker-thread-main.ts`)
   - Entry point for the worker thread
   - Imports and runs the existing pg-boss worker logic
   - Sends 'ready' message to parent thread when initialized

### Key Features

- ✅ **Auto-start**: Worker starts automatically with `npm run dev`
- ✅ **TypeScript Support**: Uses tsx loader for seamless TS execution
- ✅ **Auto-restart**: Restarts worker automatically on crash (5-second delay)
- ✅ **Graceful Shutdown**: Properly terminates worker on dev server exit
- ✅ **Health Monitoring**: Logs worker status and errors

## Usage

### Development (Automatic Worker)

Simply run the dev server - the worker starts automatically:

```bash
npm run dev
```

You'll see:
```
🚀 Starting import queue worker in background thread...
🔧 Worker thread starting...
✅ pg-boss started
✅ Import queue worker is ready and listening
🚀 Starting import-emails worker (concurrency: 1, single-runner mode)
✅ Worker started and listening for import-emails jobs
✅ Worker thread initialized and listening for jobs
```

### First-Time Setup

If you see "Queue import-emails does not exist" errors, run the setup once:

```bash
npm run setup:queue
```

Then restart the dev server:
```bash
npm run dev
```

### Debugging (Separate Worker Process)

If you need to debug the worker separately, you can still run it as a standalone process:

```bash
# Terminal 1
npm run dev

# Terminal 2
npm run worker:import
```

**Note:** Only ONE worker should run at a time. If you start a separate process, the background thread will continue running (you may want to disable auto-start for debugging).

## Implementation Details

### Instrumentation Hook

```typescript
// src/instrumentation.ts
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    if (process.env.NODE_ENV === 'development') {
      const { startWorkerThread } = await import('./lib/queue/worker-thread');
      startWorkerThread();
    }
  }
}
```

### Worker Thread Configuration

```typescript
// src/lib/queue/worker-thread.ts
workerThread = new Worker(workerPath, {
  execArgv: ['--require', 'tsx/cjs']  // Enable TypeScript support
});
```

### Auto-Restart Logic

```typescript
workerThread.on('error', (error) => {
  console.error('❌ Worker thread error:', error.message);
  workerThread = null;

  // Auto-restart after 5 seconds
  console.log('🔄 Restarting worker in 5 seconds...');
  setTimeout(() => startWorkerThread(), 5000);
});
```

## Production Deployment

**Important:** The worker thread only runs in development mode. For production, deploy the worker separately as documented in [DEPLOYMENT_QUEUE.md](./DEPLOYMENT_QUEUE.md).

Production options:
- Vercel (Next.js) + Railway/Render (Worker)
- All-in-one on Railway/Render/Fly.io
- Vercel + Cron Jobs (with limitations)

## Troubleshooting

### Worker Not Starting

**Check logs for:**
```
🚀 Starting import queue worker in background thread...
```

If you don't see this, ensure:
1. `next.config.js` has `instrumentationHook: true` enabled
2. `src/instrumentation.ts` exists
3. `NODE_ENV=development` (not production)

### Queue Does Not Exist Error

```
pg-boss error: Queue import-emails does not exist
```

**Solution:**
```bash
npm run setup:queue
```

This creates the pg-boss schema and queue in your database.

### Worker Crashes Repeatedly

Check for:
1. Database connection issues (`DATABASE_URL` in `.env.local`)
2. Missing environment variables (MS_CLIENT_ID, MS_CLIENT_SECRET, etc.)
3. TypeScript compilation errors in worker code

Logs will show:
```
❌ Worker thread error: [error message]
🔄 Restarting worker in 5 seconds...
```

### Multiple Workers Running

Only ONE worker should process jobs at a time. If you run both:
- Background thread worker (auto-started with `npm run dev`)
- Separate process worker (`npm run worker:import`)

Both will compete for jobs. This is safe (pg-boss handles it), but inefficient.

**Solution:** Use only one approach during development.

## Benefits

### Before (Separate Worker)
```bash
# Terminal 1
npm run dev

# Terminal 2
npm run worker:import
```
- ❌ Two terminal windows required
- ❌ Easy to forget to start worker
- ❌ Manual coordination

### After (Background Thread)
```bash
npm run dev  # Worker starts automatically
```
- ✅ Single command
- ✅ Worker always runs when dev server runs
- ✅ Simpler development workflow
- ✅ Matches production behavior (worker always available)

## Files Modified

1. **Created:**
   - `src/instrumentation.ts` - Next.js hook to auto-start worker
   - `src/lib/queue/worker-thread.ts` - Worker thread manager
   - `src/lib/queue/worker-thread-main.ts` - Worker thread entry point
   - `docs/WORKER_THREAD.md` - This documentation

2. **Modified:**
   - `next.config.js` - Added `instrumentationHook: true`
   - `docs/SETUP_QUEUE.md` - Updated setup instructions
   - `CLAUDE.md` - Updated dev command description

## Technical Notes

- Uses Node.js `worker_threads` API (stable since Node 12)
- TypeScript support via `tsx/cjs` loader
- Worker runs in same process but different thread (shares memory efficiently)
- pg-boss manages queue state in PostgreSQL (safe for multi-worker scenarios)
- Parent-child communication via `postMessage()` / `on('message')`
