-- CreateTable
CREATE TABLE IF NOT EXISTS "import_email_items" (
    "id" BIGSERIAL NOT NULL,
    "run_id" UUID NOT NULL,
    "job_id" INTEGER NOT NULL,
    "external_message_id" TEXT NOT NULL,
    "external_thread_id" TEXT,
    "received_at" TIMESTAMPTZ(6),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "step" TEXT NOT NULL DEFAULT 'none',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_email_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "import_email_items_run_id_external_message_id_key" ON "import_email_items"("run_id", "external_message_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "import_email_items_run_id_status_id_idx" ON "import_email_items"("run_id", "status", "id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "import_email_items_job_id_idx" ON "import_email_items"("job_id");

-- AddForeignKey
ALTER TABLE "import_email_items" ADD CONSTRAINT "import_email_items_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "import_email_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_email_items" ADD CONSTRAINT "import_email_items_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add external_message_id to JobApplication for idempotency
ALTER TABLE "JobApplication" ADD COLUMN IF NOT EXISTS "external_message_id" TEXT;
