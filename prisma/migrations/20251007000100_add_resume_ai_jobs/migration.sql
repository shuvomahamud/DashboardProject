-- Add GPT tracking columns to import_email_items
ALTER TABLE "import_email_items"
  ADD COLUMN IF NOT EXISTS "resume_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "gpt_status" TEXT NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS "gpt_attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "gpt_last_error" TEXT,
  ADD COLUMN IF NOT EXISTS "gpt_next_retry_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "gpt_last_started_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "gpt_last_finished_at" TIMESTAMPTZ;

-- Link items to resumes
ALTER TABLE "import_email_items"
  ADD CONSTRAINT "import_email_items_resume_id_fkey"
  FOREIGN KEY ("resume_id") REFERENCES "Resume"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "import_email_items_resume_id_idx"
  ON "import_email_items"("resume_id");

-- Create resume_ai_jobs queue table
CREATE TABLE IF NOT EXISTS "resume_ai_jobs" (
  "id" SERIAL PRIMARY KEY,
  "resumeId" INTEGER NOT NULL,
  "jobId" INTEGER NOT NULL,
  "runId" UUID,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "nextRetryAt" TIMESTAMPTZ,
  "lastStartedAt" TIMESTAMPTZ,
  "lastFinishedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "resume_ai_jobs_resumeId_fkey"
    FOREIGN KEY ("resumeId") REFERENCES "Resume"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "resume_ai_jobs_jobId_fkey"
    FOREIGN KEY ("jobId") REFERENCES "Job"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "resume_ai_jobs_resumeId_jobId_key"
    UNIQUE ("resumeId", "jobId")
);

CREATE INDEX IF NOT EXISTS "resume_ai_jobs_status_nextRetryAt_idx"
  ON "resume_ai_jobs"("status", "nextRetryAt");
