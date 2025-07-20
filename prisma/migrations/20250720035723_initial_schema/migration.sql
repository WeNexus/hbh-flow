-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'DEVELOPER', 'DATA_ENTRY', 'OBSERVER');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('SCHEDULED', 'CANCELLED', 'SUCCEEDED', 'WAITING_RERUN', 'WAITING', 'DELAYED', 'RUNNING', 'STALLED', 'FAILED', 'PAUSED', 'DRAFT');

-- CreateEnum
CREATE TYPE "JobStepStatus" AS ENUM ('SUCCEEDED', 'RUNNING', 'WAITING_RERUN', 'FAILED');

-- CreateEnum
CREATE TYPE "Action" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'OTHER');

-- CreateEnum
CREATE TYPE "Resource" AS ENUM ('USER', 'WORKFLOW');

-- CreateEnum
CREATE TYPE "Trigger" AS ENUM ('MANUAL', 'WEBHOOK', 'SCHEDULE', 'EVENT');

-- CreateTable
CREATE TABLE "User"
(
    "id"        SERIAL      NOT NULL,
    "role"      "Role"      NOT NULL DEFAULT 'OBSERVER',
    "name"      TEXT        NOT NULL,
    "email"     TEXT        NOT NULL,
    "password"  TEXT        NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workflow"
(
    "id"               SERIAL      NOT NULL,
    "key"              TEXT        NOT NULL,
    "active"           BOOLEAN     NOT NULL DEFAULT true,
    "disabledEvents"   TEXT[],
    "disabledWebhooks" TEXT[],
    "createdAt"        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMPTZ,

    CONSTRAINT "Workflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Schedule"
(
    "id"             SERIAL      NOT NULL,
    "workflowId"     INTEGER     NOT NULL,
    "cronExpression" TEXT        NOT NULL,
    "active"         BOOLEAN     NOT NULL DEFAULT true,
    "dangling"       BOOLEAN     NOT NULL DEFAULT false,
    "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMPTZ,

    CONSTRAINT "Schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job"
(
    "id"            SERIAL      NOT NULL,
    "parentId"      INTEGER,
    "bullId"        TEXT,
    "dedupeId"      TEXT,
    "workflowId"    INTEGER     NOT NULL,
    "status"        "JobStatus" NOT NULL DEFAULT 'WAITING',
    "trigger"       "Trigger"   NOT NULL DEFAULT 'MANUAL',
    "triggerId"     TEXT,
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

-- CreateTable
CREATE TABLE "OAuth2AuthState"
(
    "state"      TEXT        NOT NULL,
    "verifier"   TEXT        NOT NULL,
    "provider"   TEXT        NOT NULL,
    "connection" TEXT        NOT NULL,
    "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuth2AuthState_pkey" PRIMARY KEY ("state")
);

-- CreateTable
CREATE TABLE "OAuth2Token"
(
    "connection" TEXT        NOT NULL,
    "provider"   TEXT        NOT NULL,
    "access"     TEXT        NOT NULL,
    "refresh"    TEXT        NOT NULL,
    "scopes"     TEXT[],
    "expiresAt"  TIMESTAMPTZ NOT NULL,
    "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMPTZ,

    CONSTRAINT "OAuth2Token_pkey" PRIMARY KEY ("provider", "connection")
);

-- CreateTable
CREATE TABLE "Activity"
(
    "id"         SERIAL      NOT NULL,
    "userId"     INTEGER     NOT NULL,
    "resource"   "Resource",
    "resourceId" TEXT,
    "action"     "Action"    NOT NULL,
    "subAction"  TEXT,
    "details"    JSONB,
    "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Revision"
(
    "id"         SERIAL      NOT NULL,
    "activityId" INTEGER     NOT NULL,
    "resource"   "Resource"  NOT NULL,
    "resourceId" TEXT        NOT NULL,
    "action"     "Action"    NOT NULL,
    "data"       JSONB,
    "delta"      JSONB,
    "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Revision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User" ("email");

-- CreateIndex
CREATE UNIQUE INDEX "Workflow_key_key" ON "Workflow" ("key");

-- CreateIndex
CREATE UNIQUE INDEX "Schedule_workflowId_cronExpression_key" ON "Schedule" ("workflowId", "cronExpression");

-- CreateIndex
CREATE UNIQUE INDEX "Job_bullId_key" ON "Job" ("bullId");

-- CreateIndex
CREATE INDEX "Job_status_idx" ON "Job" ("status");

-- CreateIndex
CREATE INDEX "Job_workflowId_idx" ON "Job" ("workflowId");

-- CreateIndex
CREATE INDEX "Activity_userId_idx" ON "Activity" ("userId");

-- CreateIndex
CREATE INDEX "Activity_resource_resourceId_idx" ON "Activity" ("resource", "resourceId");

-- CreateIndex
CREATE INDEX "Revision_resource_resourceId_idx" ON "Revision" ("resource", "resourceId");

-- AddForeignKey
ALTER TABLE "Job"
    ADD CONSTRAINT "Job_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobStep"
    ADD CONSTRAINT "JobStep_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity"
    ADD CONSTRAINT "Activity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Revision_activityId_idx" ON "Revision"("activityId");

-- AddForeignKey
ALTER TABLE "Revision" ADD CONSTRAINT "Revision_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
