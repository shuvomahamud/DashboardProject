ALTER TABLE "Resume"
  ADD COLUMN IF NOT EXISTS "sourceCandidateEmail" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceCandidatePhone" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceCandidateLocation" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceWorkAuthorization" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceRecruiterName" TEXT;
