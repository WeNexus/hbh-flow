-- AlterTable for Activity: convert resourceId to JSONB safely
ALTER TABLE "Activity"
    ALTER COLUMN "resourceId" TYPE JSONB
        USING to_jsonb("resourceId");

-- AlterTable for Revision: convert resourceId to JSONB safely (non-null)
ALTER TABLE "Revision"
    ALTER COLUMN "resourceId" TYPE JSONB
        USING to_jsonb("resourceId");
