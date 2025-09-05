-- Phase 2 and Phase 3 fields for Job and Resume models

-- Add applicationQuery field to Job
ALTER TABLE "Job" ADD COLUMN "applicationQuery" TEXT;

-- Add Phase 2 fields to Resume
ALTER TABLE "Resume" ADD COLUMN "sourceType" TEXT NOT NULL DEFAULT 'upload';
ALTER TABLE "Resume" ADD COLUMN "sourceMessageId" TEXT;
ALTER TABLE "Resume" ADD COLUMN "sourceSubject" TEXT;
ALTER TABLE "Resume" ADD COLUMN "sourceFrom" TEXT;
ALTER TABLE "Resume" ADD COLUMN "sourcePath" TEXT;
ALTER TABLE "Resume" ADD COLUMN "fileHash" TEXT;
ALTER TABLE "Resume" ADD COLUMN "fileSizeBytes" INTEGER;
ALTER TABLE "Resume" ADD COLUMN "fileStorageUrl" TEXT;
ALTER TABLE "Resume" ADD COLUMN "rawText" TEXT;

-- Add Phase 3 AI parsing fields to Resume
ALTER TABLE "Resume" ADD COLUMN "companies" TEXT;
ALTER TABLE "Resume" ADD COLUMN "employmentHistoryJson" TEXT;
ALTER TABLE "Resume" ADD COLUMN "totalExperienceY" DECIMAL(5,2);
ALTER TABLE "Resume" ADD COLUMN "parsedAt" TIMESTAMPTZ(6);

-- Add indexes
CREATE INDEX IF NOT EXISTS "Resume_fileHash_idx" ON "Resume"("fileHash");
CREATE INDEX IF NOT EXISTS "Resume_sourceMessageId_idx" ON "Resume"("sourceMessageId");
CREATE INDEX IF NOT EXISTS "Resume_parsedAt_idx" ON "Resume"("parsedAt");