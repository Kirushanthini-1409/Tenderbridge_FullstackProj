-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('INTERESTED', 'SUBMITTED', 'UNDER_EVALUATION', 'RESULT_RELEASED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ProcurementStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'REJECTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "VerificationType" AS ENUM ('BUSINESS', 'ORGANIZATION');

-- CreateTable
CREATE TABLE "Tender" (
    "id" UUID NOT NULL,
    "referenceNumber" TEXT,
    "title" TEXT NOT NULL,
    "category" TEXT,
    "issuingAuthority" TEXT,
    "status" TEXT,
    "submissionDeadline" TIMESTAMP(3),
    "estimatedValue" DECIMAL(18,2),
    "officialLink" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tender_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Application" (
    "id" UUID NOT NULL,
    "ownerAuthId" TEXT NOT NULL,
    "tenderId" UUID NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'INTERESTED',
    "notes" TEXT,
    "referenceNo" TEXT,
    "submissionDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedOpportunity" (
    "id" UUID NOT NULL,
    "ownerAuthId" TEXT NOT NULL,
    "tenderId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedOpportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerListing" (
    "id" UUID NOT NULL,
    "ownerAuthId" TEXT NOT NULL,
    "tenderId" UUID NOT NULL,
    "companyName" TEXT NOT NULL,
    "offeredCapabilities" TEXT NOT NULL,
    "contactPerson" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationProcurement" (
    "id" UUID NOT NULL,
    "ownerAuthId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "estimatedValue" DECIMAL(18,2),
    "location" TEXT,
    "submissionDeadline" TIMESTAMP(3) NOT NULL,
    "minTurnover" DECIMAL(18,2),
    "minExperienceYears" INTEGER,
    "requiredDocuments" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "ProcurementStatus" NOT NULL DEFAULT 'DRAFT',
    "referenceNumber" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationProcurement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationRequest" (
    "id" UUID NOT NULL,
    "ownerAuthId" TEXT NOT NULL,
    "type" "VerificationType" NOT NULL,
    "organizationName" TEXT NOT NULL,
    "businessName" TEXT,
    "contactPerson" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "contactPhone" TEXT,
    "registrationNo" TEXT,
    "documents" JSONB NOT NULL DEFAULT '[]',
    "status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "decisionNote" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerificationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tender_referenceNumber_key" ON "Tender"("referenceNumber");

-- CreateIndex
CREATE INDEX "Tender_submissionDeadline_idx" ON "Tender"("submissionDeadline");

-- CreateIndex
CREATE INDEX "Application_ownerAuthId_updatedAt_idx" ON "Application"("ownerAuthId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Application_ownerAuthId_tenderId_key" ON "Application"("ownerAuthId", "tenderId");

-- CreateIndex
CREATE INDEX "SavedOpportunity_ownerAuthId_createdAt_idx" ON "SavedOpportunity"("ownerAuthId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SavedOpportunity_ownerAuthId_tenderId_key" ON "SavedOpportunity"("ownerAuthId", "tenderId");

-- CreateIndex
CREATE INDEX "PartnerListing_tenderId_createdAt_idx" ON "PartnerListing"("tenderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationProcurement_referenceNumber_key" ON "OrganizationProcurement"("referenceNumber");

-- CreateIndex
CREATE INDEX "OrganizationProcurement_ownerAuthId_createdAt_idx" ON "OrganizationProcurement"("ownerAuthId", "createdAt");

-- CreateIndex
CREATE INDEX "OrganizationProcurement_status_submissionDeadline_idx" ON "OrganizationProcurement"("status", "submissionDeadline");

-- CreateIndex
CREATE INDEX "VerificationRequest_status_createdAt_idx" ON "VerificationRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "VerificationRequest_ownerAuthId_createdAt_idx" ON "VerificationRequest"("ownerAuthId", "createdAt");

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "Tender"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedOpportunity" ADD CONSTRAINT "SavedOpportunity_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "Tender"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerListing" ADD CONSTRAINT "PartnerListing_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "Tender"("id") ON DELETE CASCADE ON UPDATE CASCADE;

