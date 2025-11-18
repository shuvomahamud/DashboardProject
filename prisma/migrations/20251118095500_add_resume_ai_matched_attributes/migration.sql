ALTER TABLE "Resume"
  ADD COLUMN IF NOT EXISTS "aiMatchedAttributes" JSONB;
