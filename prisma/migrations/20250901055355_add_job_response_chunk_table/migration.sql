-- CreateTable
CREATE TABLE "public"."JobResponseChunk" (
    "id" SERIAL NOT NULL,
    "jobId" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobResponseChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobResponseChunk_jobId_idx" ON "public"."JobResponseChunk"("jobId");

-- AddForeignKey
ALTER TABLE "public"."JobResponseChunk" ADD CONSTRAINT "JobResponseChunk_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "public"."Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
