-- CreateTable: import_email_runs with global single-runner guarantees
-- This table tracks email import operations with two key constraints:
-- 1. Only one active/queued run per Job (prevents duplicate imports for same job)
-- 2. Only one running import globally (single-runner FIFO queue)

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

-- (A) ONE active-or-queued per JOB
-- This unique partial index ensures that each Job can have at most one enqueued/running import
-- Blocks duplicate enqueue requests for the same job
CREATE UNIQUE INDEX IF NOT EXISTS import_runs_one_active_per_job
ON import_email_runs (job_id)
WHERE (status IN ('enqueued','running'));

-- (B) ONE running globally
-- This unique partial index enforces a single running import across the whole system
-- Guarantees that worker can only process one import at a time
CREATE UNIQUE INDEX IF NOT EXISTS import_runs_single_running_global
ON import_email_runs ((TRUE))
WHERE (status = 'running');

-- Optional: faster queue scans (FIFO processing)
CREATE INDEX IF NOT EXISTS import_runs_enqueued_created_idx
ON import_email_runs (created_at)
WHERE (status = 'enqueued');

-- Index for quick status lookups
CREATE INDEX IF NOT EXISTS import_runs_status_idx
ON import_email_runs (status, created_at DESC);

-- Index for job-specific queries
CREATE INDEX IF NOT EXISTS import_runs_job_id_idx
ON import_email_runs (job_id, created_at DESC);
