-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('SCHEDULED', 'CANCELLED', 'SUCCEEDED', 'WAITING_RERUN', 'WAITING', 'DELAYED', 'RUNNING', 'STALLED', 'FAILED', 'PAUSED');

-- CreateEnum
CREATE TYPE "JobStepStatus" AS ENUM ('SUCCEEDED', 'RUNNING', 'WAITING_RERUN', 'FAILED');

-- CreateTable
CREATE TABLE "Schedule"
(
    "id"             SERIAL      NOT NULL,
    "name"           TEXT        NOT NULL,
    "cronExpression" TEXT        NOT NULL,
    "active"         BOOLEAN     NOT NULL DEFAULT true,
    "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMPTZ,

    CONSTRAINT "Schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job"
(
    "id"            SERIAL      NOT NULL,
    "bullId"        TEXT,
    "scheduleId"    INTEGER,
    "name"          TEXT        NOT NULL,
    "status"        "JobStatus" NOT NULL DEFAULT 'WAITING',
    "scheduledAt"   TIMESTAMPTZ,
    "payload"       JSONB,
    "sentryTrace"   TEXT,
    "sentryBaggage" TEXT,
    "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMPTZ,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobStep"
(
    "jobId"     INTEGER         NOT NULL,
    "name"      TEXT            NOT NULL,
    "status"    "JobStepStatus" NOT NULL DEFAULT 'RUNNING',
    "result"    JSONB,
    "retries"   INTEGER         NOT NULL DEFAULT 0,
    "runs"      INTEGER         NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ,

    CONSTRAINT "JobStep_pkey" PRIMARY KEY ("jobId", "name")
);

-- CreateIndex
CREATE UNIQUE INDEX "Schedule_name_cronExpression_key" ON "Schedule" ("name", "cronExpression");

-- CreateIndex
CREATE UNIQUE INDEX "Job_bullId_key" ON "Job" ("bullId");

-- CreateIndex
CREATE INDEX "Job_scheduleId_idx" ON "Job" ("scheduleId");

-- CreateIndex
CREATE INDEX "Job_status_idx" ON "Job" ("status");

-- CreateIndex
CREATE INDEX "Job_name_idx" ON "Job" ("name");

-- AddForeignKey
ALTER TABLE "Job"
    ADD CONSTRAINT "Job_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "Schedule" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobStep"
    ADD CONSTRAINT "JobStep_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
