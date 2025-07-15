-- AlterTable
ALTER TABLE "Job"
    ADD COLUMN "dedupeId" TEXT;

-- CreateIndex
CREATE INDEX "Job_dedupeId_idx" ON "Job" ("dedupeId");
