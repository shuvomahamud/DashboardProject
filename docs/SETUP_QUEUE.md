# Import Queue Setup Guide

## Database Setup

The `import_email_runs` table needs to be created in your database before using the queue system.

### Option 1: Using Prisma (Recommended)

```bash
# Push the schema to database
npx prisma db push

# Generate Prisma client (may need to restart dev server if locked)
npx prisma generate
```

### Option 2: Manual SQL

If Prisma has file lock issues, run this SQL directly:

```sql
CREATE TABLE IF NOT EXISTS import_email_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id INT NOT NULL,
  requested_by TEXT,
  status TEXT NOT NULL CHECK (status IN ('enqueued','running','succeeded','failed','canceled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  progress NUMERIC(5,2) NOT NULL DEFAULT 0,
  total_messages INT,
  processed_messages INT NOT NULL DEFAULT 0,
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  CONSTRAINT fk_import_runs_job FOREIGN KEY (job_id) REFERENCES "Job"(id) ON DELETE CASCADE
);

-- One active/queued per job
CREATE UNIQUE INDEX IF NOT EXISTS import_runs_one_active_per_job
ON import_email_runs (job_id)
WHERE (status IN ('enqueued','running'));

-- One running globally
CREATE UNIQUE INDEX IF NOT EXISTS import_runs_single_running_global
ON import_email_runs ((TRUE))
WHERE (status = 'running');

-- FIFO queue index
CREATE INDEX IF NOT EXISTS import_runs_enqueued_created_idx
ON import_email_runs (created_at)
WHERE (status = 'enqueued');

-- Status lookups
CREATE INDEX IF NOT EXISTS import_runs_status_idx
ON import_email_runs (status, created_at DESC);

-- Job lookups
CREATE INDEX IF NOT EXISTS import_runs_job_id_idx
ON import_email_runs (job_id, created_at DESC);
```

## Verify Setup

```bash
# Test database connection
npm run test:queue
```

## Start Worker

After database setup, start the worker in a separate terminal:

```bash
npm run worker:import
```

## Troubleshooting

### Error: "Table does not exist"

1. Stop your dev server (`Ctrl+C`)
2. Run: `npx prisma db push`
3. Run: `npx prisma generate`
4. Restart dev server: `npm run dev`

### Error: "EPERM: operation not permitted" (Prisma Generate)

This happens when the dev server is running and has locked the Prisma client files.

**Solution:**
1. Stop dev server
2. Run: `npx prisma generate`
3. Restart dev server

Alternatively, just restart your dev server - it will auto-generate on startup via `postinstall` script.

### Worker not processing jobs

1. Check worker logs: `npm run worker:import`
2. Verify table exists: `npm run test:queue`
3. Check pg-boss schema exists in database (created automatically on first run)

## Environment Variables Required

```env
DATABASE_URL=postgresql://...
MS_MAILBOX_USER_ID=user@domain.com  # For email imports
MS_CLIENT_ID=...
MS_CLIENT_SECRET=...
MS_TENANT_ID=...
```
