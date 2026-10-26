CREATE TYPE "ClarificationStatus" AS ENUM ('OPEN', 'RESPONDED', 'CLOSED');

CREATE TABLE "ApplicationClarification" (
    "id" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "subject" VARCHAR(180) NOT NULL,
    "status" "ClarificationStatus" NOT NULL DEFAULT 'OPEN',
    "responseDeadline" TIMESTAMP(3),
    "createdByAuthId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "ApplicationClarification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ApplicationClarificationMessage" (
    "id" UUID NOT NULL,
    "clarificationId" UUID NOT NULL,
    "senderAuthId" TEXT NOT NULL,
    "senderRole" VARCHAR(20) NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicationClarificationMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ApplicationClarification_applicationId_status_createdAt_idx"
    ON "ApplicationClarification"("applicationId", "status", "createdAt");

CREATE INDEX "ApplicationClarificationMessage_clarificationId_createdAt_idx"
    ON "ApplicationClarificationMessage"("clarificationId", "createdAt");

ALTER TABLE "ApplicationClarification"
    ADD CONSTRAINT "ApplicationClarification_applicationId_fkey"
    FOREIGN KEY ("applicationId") REFERENCES "Application"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ApplicationClarificationMessage"
    ADD CONSTRAINT "ApplicationClarificationMessage_clarificationId_fkey"
    FOREIGN KEY ("clarificationId") REFERENCES "ApplicationClarification"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
