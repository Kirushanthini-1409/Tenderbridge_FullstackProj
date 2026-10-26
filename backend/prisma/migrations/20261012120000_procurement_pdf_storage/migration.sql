ALTER TABLE "OrganizationProcurement"
  ADD COLUMN "pdfFileName" TEXT,
  ADD COLUMN "pdfData" BYTEA,
  ADD COLUMN "extractedText" TEXT;
