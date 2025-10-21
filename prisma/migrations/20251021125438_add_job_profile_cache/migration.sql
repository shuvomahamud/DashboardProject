-- AlterTable
ALTER TABLE "Job" ADD COLUMN "aiJobProfileJson" TEXT,
ADD COLUMN "aiJobProfileUpdatedAt" TIMESTAMPTZ(6),
ADD COLUMN "aiJobProfileVersion" TEXT;
