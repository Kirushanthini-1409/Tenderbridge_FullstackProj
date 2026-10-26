CREATE TABLE "TenderResult" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenderId" UUID NOT NULL,
    "summary" TEXT NOT NULL,
    "publishedByAuthId" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TenderResult_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdminAuditEvent" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actorAuthId" TEXT NOT NULL,
    "actorRole" VARCHAR(20) NOT NULL,
    "action" VARCHAR(80) NOT NULL,
    "entityType" VARCHAR(60) NOT NULL,
    "entityId" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdminAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TenderResult_tenderId_key" ON "TenderResult"("tenderId");
CREATE INDEX "AdminAuditEvent_createdAt_idx" ON "AdminAuditEvent"("createdAt");
CREATE INDEX "AdminAuditEvent_actorAuthId_createdAt_idx" ON "AdminAuditEvent"("actorAuthId", "createdAt");
CREATE INDEX "AdminAuditEvent_entityType_entityId_createdAt_idx" ON "AdminAuditEvent"("entityType", "entityId", "createdAt");

ALTER TABLE "TenderResult" ADD CONSTRAINT "TenderResult_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "Tender"("id") ON DELETE CASCADE ON UPDATE CASCADE;
