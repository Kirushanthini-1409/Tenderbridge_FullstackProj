-- AlterEnum
ALTER TYPE "ApplicationStatus" ADD VALUE IF NOT EXISTS 'DRAFT';

-- AlterTable
ALTER TABLE "Application" ADD COLUMN IF NOT EXISTS "revisions" JSONB DEFAULT '[]';
