ALTER TABLE "Tender"
  ADD COLUMN "location" TEXT,
  ADD COLUMN "quantity" TEXT,
  ADD COLUMN "openingDate" TIMESTAMP(3),
  ADD COLUMN "deliveryDuration" TEXT,
  ADD COLUMN "extractionMetadata" JSONB;

ALTER TABLE "OrganizationProcurement"
  ADD COLUMN "quantity" TEXT,
  ADD COLUMN "openingDate" TIMESTAMP(3),
  ADD COLUMN "deliveryDuration" TEXT,
  ADD COLUMN "extractionMetadata" JSONB;

CREATE TABLE "TenderExtraction" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "procurementId" UUID,
  "tenderId" UUID,
  "sourceType" VARCHAR(32) NOT NULL,
  "sourceName" TEXT,
  "extractor" VARCHAR(40) NOT NULL,
  "overallConfidence" DOUBLE PRECISION NOT NULL,
  "extractedValues" JSONB NOT NULL,
  "fieldConfidence" JSONB NOT NULL,
  "fieldEvidence" JSONB NOT NULL,
  "missingInformation" JSONB NOT NULL,
  "reviewStatus" VARCHAR(24) NOT NULL DEFAULT 'NEEDS_REVIEW',
  "reviewedByAuthId" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdByAuthId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TenderExtraction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TenderExtraction_procurementId_createdAt_idx" ON "TenderExtraction"("procurementId", "createdAt");
CREATE INDEX "TenderExtraction_tenderId_createdAt_idx" ON "TenderExtraction"("tenderId", "createdAt");
ALTER TABLE "TenderExtraction" ADD CONSTRAINT "TenderExtraction_procurementId_fkey" FOREIGN KEY ("procurementId") REFERENCES "OrganizationProcurement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TenderExtraction" ADD CONSTRAINT "TenderExtraction_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "Tender"("id") ON DELETE CASCADE ON UPDATE CASCADE;
