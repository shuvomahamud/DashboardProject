-- Add mandatory skill requirements config to Job
ALTER TABLE "Job"
ADD COLUMN IF NOT EXISTS "mandatorySkillRequirements" JSONB;

-- Capture manual and AI skill assessments on Resume
ALTER TABLE "Resume"
ADD COLUMN IF NOT EXISTS "manualSkillAssessments" JSONB,
ADD COLUMN IF NOT EXISTS "aiSkillExperience" JSONB,
ADD COLUMN IF NOT EXISTS "skillRequirementEvaluation" JSONB;
