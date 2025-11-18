CREATE TABLE IF NOT EXISTS "job_score_recalc_run" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "jobId" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "totalCandidates" INTEGER NOT NULL DEFAULT 0,
  "processedCandidates" INTEGER NOT NULL DEFAULT 0,
  "successCount" INTEGER NOT NULL DEFAULT 0,
  "failureCount" INTEGER NOT NULL DEFAULT 0,
  "message" TEXT,
  "error" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "startedAt" TIMESTAMPTZ,
  "finishedAt" TIMESTAMPTZ,
  CONSTRAINT "job_score_recalc_run_jobId_fkey"
    FOREIGN KEY ("jobId") REFERENCES "Job"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "job_score_recalc_run_jobId_idx"
  ON "job_score_recalc_run"("jobId");
