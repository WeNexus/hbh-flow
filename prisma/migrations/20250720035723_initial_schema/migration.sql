-- CreateEnum
CREATE TYPE "public"."Role" AS ENUM ('SYSTEM', 'ADMIN', 'DEVELOPER', 'DATA_ENTRY', 'OBSERVER');

-- CreateEnum
CREATE TYPE "public"."JobStatus" AS ENUM ('SCHEDULED', 'CANCELLED', 'SUCCEEDED', 'WAITING_RERUN', 'WAITING', 'DELAYED', 'RUNNING', 'STALLED', 'FAILED', 'PAUSED', 'DRAFT');

-- CreateEnum
CREATE TYPE "public"."JobStepStatus" AS ENUM ('SUCCEEDED', 'RUNNING', 'WAITING_RERUN', 'FAILED');

-- CreateEnum
CREATE TYPE "public"."Action" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."Resource" AS ENUM ('USER', 'WORKFLOW', 'OAUTH2_AUTH_STATE', 'OAUTH2_TOKEN', 'JOB', 'SCHEDULE', 'FOLDER', 'WEBHOOK', 'EVENT');

-- CreateEnum
CREATE TYPE "public"."Trigger" AS ENUM ('MANUAL', 'WEBHOOK', 'SCHEDULE', 'EVENT');

-- CreateEnum
CREATE TYPE "public"."WebhookHashLocation" AS ENUM ('HEADER', 'QUERY');

-- CreateEnum
CREATE TYPE "public"."HashAlgorithm" AS ENUM ('sha256', 'sha512', 'md5');

-- CreateTable
CREATE TABLE "public"."User"
(
    "id"        SERIAL          NOT NULL,
    "role"      "public"."Role" NOT NULL DEFAULT 'OBSERVER',
    "name"      TEXT            NOT NULL,
    "email"     TEXT            NOT NULL,
    "password"  TEXT            NOT NULL,
    "createdAt" TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Activity"
(
    "id"         SERIAL            NOT NULL,
    "userId"     INTEGER           NOT NULL,
    "resource"   "public"."Resource",
    "resourceId" JSONB,
    "action"     "public"."Action" NOT NULL,
    "subAction"  TEXT,
    "details"    JSONB,
    "createdAt"  TIMESTAMPTZ       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Revision"
(
    "id"         SERIAL              NOT NULL,
    "activityId" INTEGER             NOT NULL,
    "resource"   "public"."Resource" NOT NULL,
    "resourceId" JSONB               NOT NULL,
    "action"     "public"."Action"   NOT NULL,
    "data"       JSONB,
    "delta"      JSONB,
    "createdAt"  TIMESTAMPTZ         NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Revision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Folder"
(
    "id"          SERIAL      NOT NULL,
    "parentId"    INTEGER,
    "name"        TEXT        NOT NULL,
    "description" TEXT,
    "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMPTZ,

    CONSTRAINT "Folder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Workflow"
(
    "id"        SERIAL      NOT NULL,
    "folderId"  INTEGER,
    "key"       TEXT        NOT NULL,
    "active"    BOOLEAN     NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ,

    CONSTRAINT "Workflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Webhook"
(
    "id"            SERIAL      NOT NULL,
    "workflowId"    INTEGER     NOT NULL,
    "name"          TEXT        NOT NULL,
    "description"   TEXT,
    "token"         TEXT,
    "secret"        TEXT,
    "hashLocation"  "public"."WebhookHashLocation",
    "hashKey"       TEXT,
    "hashAlgorithm" "public"."HashAlgorithm",
    "active"        BOOLEAN     NOT NULL DEFAULT true,
    "expiresAt"     TIMESTAMPTZ NOT NULL,
    "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMPTZ,

    CONSTRAINT "Webhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Event"
(
    "id"         SERIAL      NOT NULL,
    "workflowId" INTEGER     NOT NULL,
    "name"       TEXT        NOT NULL,
    "provider"   TEXT,
    "connection" TEXT,
    "active"     BOOLEAN     NOT NULL DEFAULT true,
    "dangling"   BOOLEAN     NOT NULL DEFAULT false,
    "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMPTZ,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Schedule"
(
    "id"                SERIAL      NOT NULL,
    "workflowId"        INTEGER     NOT NULL,
    "cronExpression"    TEXT        NOT NULL,
    "oldCronExpression" TEXT,
    "active"            BOOLEAN     NOT NULL DEFAULT true,
    "dangling"          BOOLEAN     NOT NULL DEFAULT false,
    "userDefined"       BOOLEAN     NOT NULL DEFAULT false,
    "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMPTZ,

    CONSTRAINT "Schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Job"
(
    "id"            SERIAL               NOT NULL,
    "parentId"      INTEGER,
    "bullId"        TEXT,
    "dedupeId"      TEXT,
    "workflowId"    INTEGER              NOT NULL,
    "status"        "public"."JobStatus" NOT NULL DEFAULT 'WAITING',
    "trigger"       "public"."Trigger"   NOT NULL DEFAULT 'MANUAL',
    "triggerId"     TEXT,
    "scheduledAt"   TIMESTAMPTZ,
    "payload"       JSONB,
    "sentryTrace"   TEXT,
    "sentryBaggage" TEXT,
    "createdAt"     TIMESTAMPTZ          NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMPTZ,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."JobStep"
(
    "jobId"     INTEGER                  NOT NULL,
    "name"      TEXT                     NOT NULL,
    "status"    "public"."JobStepStatus" NOT NULL DEFAULT 'RUNNING',
    "result"    JSONB,
    "resume"    JSONB,
    "retries"   INTEGER                  NOT NULL DEFAULT 0,
    "runs"      INTEGER                  NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ              NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ,

    CONSTRAINT "JobStep_pkey" PRIMARY KEY ("jobId", "name")
);

-- CreateTable
CREATE TABLE "public"."OAuth2AuthState"
(
    "state"      TEXT        NOT NULL,
    "verifier"   TEXT        NOT NULL,
    "provider"   TEXT        NOT NULL,
    "connection" TEXT        NOT NULL,
    "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuth2AuthState_pkey" PRIMARY KEY ("state")
);

-- CreateTable
CREATE TABLE "public"."OAuth2Token"
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

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User" ("email");

-- CreateIndex
CREATE INDEX "Activity_userId_idx" ON "public"."Activity" ("userId");

-- CreateIndex
CREATE INDEX "Activity_resource_resourceId_idx" ON "public"."Activity" ("resource", "resourceId");

-- CreateIndex
CREATE INDEX "Revision_resource_resourceId_idx" ON "public"."Revision" ("resource", "resourceId");

-- CreateIndex
CREATE INDEX "Revision_activityId_idx" ON "public"."Revision" ("activityId");

-- CreateIndex
CREATE UNIQUE INDEX "Workflow_key_key" ON "public"."Workflow" ("key");

-- CreateIndex
CREATE UNIQUE INDEX "Event_workflowId_provider_connection_name_key" ON "public"."Event" ("workflowId", "provider", "connection", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Schedule_workflowId_cronExpression_key" ON "public"."Schedule" ("workflowId", "cronExpression");

-- CreateIndex
CREATE UNIQUE INDEX "Job_bullId_key" ON "public"."Job" ("bullId");

-- CreateIndex
CREATE INDEX "Job_status_idx" ON "public"."Job" ("status");

-- CreateIndex
CREATE INDEX "Job_workflowId_idx" ON "public"."Job" ("workflowId");

-- AddForeignKey
ALTER TABLE "public"."Activity"
    ADD CONSTRAINT "Activity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Revision"
    ADD CONSTRAINT "Revision_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "public"."Activity" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Folder"
    ADD CONSTRAINT "Folder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "public"."Folder" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Workflow"
    ADD CONSTRAINT "Workflow_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "public"."Folder" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Webhook"
    ADD CONSTRAINT "Webhook_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "public"."Workflow" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Event"
    ADD CONSTRAINT "Event_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "public"."Workflow" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Job"
    ADD CONSTRAINT "Job_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "public"."Workflow" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."JobStep"
    ADD CONSTRAINT "JobStep_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "public"."Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
