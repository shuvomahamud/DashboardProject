# Email Import Queue System

This document describes the single-runner global import queue system that processes email imports one at a time with FIFO ordering.

## Architecture Overview

The system enforces two key constraints via PostgreSQL unique indexes:

1. **One active/queued run per Job** - Prevents duplicate imports for the same job
2. **One running import globally** - Ensures only one import processes at a time across the entire system

## Database Schema

### Table: `import_email_runs`

```sql
CREATE TABLE import_email_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id INT NOT NULL REFERENCES "Job"(id) ON DELETE CASCADE,
  requested_by TEXT,
  status TEXT NOT NULL CHECK (status IN ('enqueued','running','succeeded','failed','canceled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  progress NUMERIC(5,2) NOT NULL DEFAULT 0,
  total_messages INT,
  processed_messages INT NOT NULL DEFAULT 0,
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT
);
```

### Key Indexes

1. **`import_runs_one_active_per_job`** - Unique index on `(job_id)` where `status IN ('enqueued','running')`
   - Blocks duplicate enqueue requests for the same job

2. **`import_runs_single_running_global`** - Unique index on `((TRUE))` where `status = 'running'`
   - Enforces a single running import system-wide
   - Worker gracefully leaves jobs enqueued if constraint violated

3. **`import_runs_enqueued_created_idx`** - Index on `(created_at)` where `status = 'enqueued'`
   - Optimizes FIFO queue processing

## API Endpoints

### POST `/api/jobs/:jobId/import-emails/enqueue`

Enqueues an email import for a job.

**Behavior:**
- If job already has an `enqueued` or `running` import → returns existing run (no-op)
- Otherwise → creates new run with `status='enqueued'` and publishes to pg-boss queue

**Response:**
```json
{
  "runId": "uuid",
  "status": "enqueued",
  "message": "Import queued successfully",
  "existing": false
}
```

### POST `/api/import-email-runs/:runId/cancel`

Cancels an import run.

**Behavior:**
- If `enqueued` → marks as `canceled` immediately
- If `running` → marks as `canceled` (worker checks status between pages and stops)
- If already finished → returns current status

**Response:**
```json
{
  "message": "Import canceled successfully",
  "run": { ... }
}
```

### GET `/api/import-email-runs/summary`

Returns queue status for the Jobs page UI.

**Response:**
```json
{
  "inProgress": {
    "id": "uuid",
    "jobId": 123,
    "jobTitle": "Software Engineer",
    "status": "running",
    "progress": 45.5,
    "processedMessages": 91,
    "totalMessages": 200,
    "startedAt": "2025-10-01T12:00:00Z",
    "createdAt": "2025-10-01T11:55:00Z"
  },
  "enqueued": [
    {
      "id": "uuid",
      "jobId": 124,
      "jobTitle": "Product Manager",
      "status": "enqueued",
      "createdAt": "2025-10-01T12:05:00Z"
    }
  ],
  "recentDone": [
    {
      "id": "uuid",
      "jobId": 122,
      "jobTitle": "Data Scientist",
      "status": "succeeded",
      "progress": 100,
      "processedMessages": 150,
      "totalMessages": 150,
      "createdAt": "2025-10-01T10:00:00Z",
      "startedAt": "2025-10-01T10:05:00Z",
      "finishedAt": "2025-10-01T10:30:00Z"
    }
  ]
}
```

## Worker Service

### Starting the Worker

```bash
npm run worker:import
```

### Worker Logic

The worker subscribes to the `import-emails` queue with **concurrency = 1**:

```typescript
await boss.work('import-emails', { teamConcurrency: 1, teamSize: 1 }, async (job) => {
  // 1. Load run from DB
  // 2. Verify status is 'enqueued'
  // 3. Try to mark as 'running' (may fail due to global unique index)
  // 4. If successful, execute import with progress tracking
  // 5. Check for cancellation between pages
  // 6. Mark as 'succeeded' or 'failed' when done
});
```

### Graceful Handling

- **Global constraint violation**: If another import is running, the UPDATE fails and the job stays `enqueued`
- **Cancellation**: Worker checks `status` field between pages and stops if `canceled`
- **Rate limits**: Handles 429 errors with retry-after logic
- **Errors**: Marks run as `failed` with error message

## UI Components

### ImportQueueStatus Component

Location: `src/components/jobs/ImportQueueStatus.tsx`

Displays three sections:

1. **In Progress** - Shows the single running import (max 1)
   - Real-time progress bar
   - Cancel button
   - Message count and elapsed time

2. **Enqueued** - Lists all queued imports (FIFO order)
   - Cancel buttons for each
   - Queue position indicators

3. **Recently Finished** - Last 3 completed imports
   - Success/failure status
   - Error messages for failures
   - Processing statistics

**Features:**
- Auto-refreshes every 5 seconds when active
- Real-time progress updates
- One-click cancellation

### Jobs Page Integration

The `ImportQueueStatus` component is displayed at the top of the Jobs page:

```tsx
<div className="container-fluid mt-4">
  {/* Header */}
  <div className="d-flex justify-content-between align-items-center mb-4">
    ...
  </div>

  {/* Import Queue Status */}
  <ImportQueueStatus />

  {/* Jobs Table */}
  <DataTable ... />
</div>
```

## Environment Variables

- `MS_MAILBOX_USER_ID` - Mailbox to import from (required)
- `MS_IMPORT_LOOKBACK_DAYS` - How far back to search (default: 365 for bulk, 1095 for text search)
- `MS_IMPORT_LIMIT` - Max messages to process per import (default: 5000)
- `PARSE_ON_IMPORT` - Enable AI parsing during import (default: false)
- `DATABASE_URL` - PostgreSQL connection string (required)

## Testing

### Test Scenarios

1. **Enqueue for Job A, then Job A again**
   - ✅ Second call returns same run (no duplicate)

2. **Enqueue Job B while A is running**
   - ✅ B shows in "Enqueued"
   - ✅ A is sole "In Progress"

3. **Finish A**
   - ✅ B automatically moves to "In Progress"

4. **Force two workers**
   - ✅ Second fails to set `running` due to global index
   - ✅ B stays enqueued for next worker cycle

5. **Cancel enqueued run**
   - ✅ Disappears from "Enqueued"
   - ✅ Marked `canceled`, will not run

6. **Cancel running run**
   - ✅ Flips to `canceled` after current page
   - ✅ Next queued job starts

### Manual Testing

```bash
# Terminal 1: Start worker
npm run worker:import

# Terminal 2: Start dev server
npm run dev

# Browser: Navigate to /jobs
# - Use "Import Emails" button on job cards
# - Watch queue status update in real-time
# - Try canceling enqueued/running imports
```

## Deployment

### Production Setup

1. **Database Migration**
   ```bash
   npx prisma migrate deploy
   ```

2. **Start Worker as Service**
   ```bash
   # Using systemd (Linux)
   sudo systemctl start import-worker

   # Using PM2 (Node.js process manager)
   pm2 start npm --name "import-worker" -- run worker:import

   # Using Docker
   docker run -e DATABASE_URL=... app:latest npm run worker:import
   ```

3. **Monitoring**
   - Check worker logs for errors
   - Monitor database for stuck `running` jobs
   - Set up alerts for failed imports

### Scaling Considerations

- **Single worker only**: Do not scale worker horizontally (global constraint enforces this)
- **API horizontal scaling**: OK to scale API servers (stateless endpoints)
- **Database pooling**: Ensure connection pool can handle API + worker load
- **Job timeout**: Consider adding timeout for stuck `running` jobs (e.g., 24 hours)

## Troubleshooting

### Stuck in "running" state

If a run is stuck in `running` (e.g., worker crashed):

```sql
-- Find stuck runs (running for > 2 hours)
SELECT id, job_id, started_at, progress
FROM import_email_runs
WHERE status = 'running'
  AND started_at < NOW() - INTERVAL '2 hours';

-- Manually reset to failed
UPDATE import_email_runs
SET status = 'failed',
    finished_at = NOW(),
    last_error = 'Worker crashed or timeout'
WHERE id = 'stuck-run-id';
```

### Worker not processing jobs

1. Check worker logs: `npm run worker:import`
2. Verify DATABASE_URL is correct
3. Check pg-boss schema exists: `SELECT * FROM pgboss.job LIMIT 1;`
4. Verify no other worker is running (check global unique index)

### Import failing immediately

1. Check MS_MAILBOX_USER_ID is set
2. Verify Graph API credentials/permissions
3. Check worker logs for specific error messages
4. Review failed run's `last_error` field

## Related Files

- **Migration**: `prisma/migrations/20251001113203_add_import_email_runs/migration.sql`
- **Schema**: `prisma/schema.prisma` (ImportEmailRun model)
- **Queue**: `src/lib/queue/boss.ts` (pg-boss singleton)
- **Worker**: `src/lib/queue/worker.ts` (job processing logic)
- **Worker Script**: `scripts/run-import-worker.ts`
- **Enqueue API**: `src/app/api/jobs/[id]/import-emails/enqueue/route.ts`
- **Cancel API**: `src/app/api/import-email-runs/[runId]/cancel/route.ts`
- **Summary API**: `src/app/api/import-email-runs/summary/route.ts`
- **UI Component**: `src/components/jobs/ImportQueueStatus.tsx`
- **Jobs Page**: `src/app/jobs/page.tsx`
