-- AlterTable
ALTER TABLE "public"."OAuth2Token"
    ALTER COLUMN "refresh" DROP NOT NULL,
    ALTER COLUMN "expiresAt" DROP NOT NULL;
