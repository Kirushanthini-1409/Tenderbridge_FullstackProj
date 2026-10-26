CREATE TYPE "AccountRole" AS ENUM ('BUSINESS', 'ORGANIZATION');

ALTER TYPE "ApplicationStatus" ADD VALUE 'RECEIVED';
ALTER TYPE "ApplicationStatus" ADD VALUE 'UNDER_REVIEW';
ALTER TYPE "ApplicationStatus" ADD VALUE 'SHORTLISTED';
ALTER TYPE "ApplicationStatus" ADD VALUE 'REJECTED';

CREATE TABLE "AccountRoleAssignment" (
    "id" UUID NOT NULL,
    "ownerAuthId" TEXT NOT NULL,
    "role" "AccountRole" NOT NULL DEFAULT 'BUSINESS',
    "assignedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AccountRoleAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountRoleAssignment_ownerAuthId_key" ON "AccountRoleAssignment"("ownerAuthId");
CREATE INDEX "AccountRoleAssignment_role_updatedAt_idx" ON "AccountRoleAssignment"("role", "updatedAt");

-- BusinessProfile is part of the Prisma schema but was missing from the
-- initial migration. Create its base fields here before adding the fields
-- introduced by this migration below.
CREATE TABLE "BusinessProfile" (
    "id" UUID NOT NULL,
    "ownerAuthId" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "annualTurnover" DECIMAL(18,2) NOT NULL,
    "yearsOfExperience" INTEGER NOT NULL,
    "certifications" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BusinessProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BusinessProfile_ownerAuthId_key" ON "BusinessProfile"("ownerAuthId");
CREATE INDEX "BusinessProfile_ownerAuthId_idx" ON "BusinessProfile"("ownerAuthId");

ALTER TABLE "BusinessProfile"
  ADD COLUMN "shareInDirectory" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "publicContactEmail" TEXT;

ALTER TABLE "OrganizationProcurement"
  ADD COLUMN "requiredCertifications" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "locationRestrictions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "eligibilityCriteria" JSONB;

ALTER TABLE "Tender"
  ADD COLUMN "description" TEXT,
  ADD COLUMN "eligibilityCriteria" JSONB,
  ADD COLUMN "requiredDocuments" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE TABLE "SavedPartner" (
    "id" UUID NOT NULL,
    "ownerAuthId" TEXT NOT NULL,
    "partnerProfileId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SavedPartner_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SavedPartner_ownerAuthId_partnerProfileId_key" ON "SavedPartner"("ownerAuthId", "partnerProfileId");
CREATE INDEX "SavedPartner_ownerAuthId_createdAt_idx" ON "SavedPartner"("ownerAuthId", "createdAt");
ALTER TABLE "SavedPartner" ADD CONSTRAINT "SavedPartner_partnerProfileId_fkey"
  FOREIGN KEY ("partnerProfileId") REFERENCES "BusinessProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
