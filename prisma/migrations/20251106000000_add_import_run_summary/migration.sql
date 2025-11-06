-- AlterTable
ALTER TABLE "import_email_runs" ADD COLUMN IF NOT EXISTS "summary" JSONB;
