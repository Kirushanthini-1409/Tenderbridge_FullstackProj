CREATE TYPE "TenderFaqStatus" AS ENUM ('PENDING', 'PUBLISHED', 'REJECTED');

ALTER TABLE "SavedOpportunity"
    ADD COLUMN "seenVersion" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "TenderVersion" (
    "id" UUID NOT NULL,
    "tenderId" UUID NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "changedFields" JSONB NOT NULL DEFAULT '[]',
    "createdByAuthId" TEXT,
    "source" VARCHAR(40) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenderVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TenderFaq" (
    "id" UUID NOT NULL,
    "tenderId" UUID NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT,
    "status" "TenderFaqStatus" NOT NULL DEFAULT 'PENDING',
    "askedByAuthId" TEXT,
    "answeredByAuthId" TEXT,
    "answeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenderFaq_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TenderVersion_tenderId_versionNumber_key"
    ON "TenderVersion"("tenderId", "versionNumber");
CREATE INDEX "TenderVersion_tenderId_createdAt_idx"
    ON "TenderVersion"("tenderId", "createdAt");
CREATE INDEX "TenderFaq_tenderId_status_createdAt_idx"
    ON "TenderFaq"("tenderId", "status", "createdAt");
CREATE INDEX "TenderFaq_askedByAuthId_createdAt_idx"
    ON "TenderFaq"("askedByAuthId", "createdAt");

ALTER TABLE "TenderVersion"
    ADD CONSTRAINT "TenderVersion_tenderId_fkey"
    FOREIGN KEY ("tenderId") REFERENCES "Tender"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TenderFaq"
    ADD CONSTRAINT "TenderFaq_tenderId_fkey"
    FOREIGN KEY ("tenderId") REFERENCES "Tender"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
