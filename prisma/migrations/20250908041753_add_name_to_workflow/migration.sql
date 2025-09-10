-- AlterTable
ALTER TABLE "public"."Workflow"
    ADD COLUMN "name" TEXT;

-- UpdateData
UPDATE "public"."Workflow"
SET "name" = key
WHERE "name" IS NULL;

-- ModifyColumn
ALTER TABLE "public"."Workflow"
    ALTER COLUMN "name" SET NOT NULL;