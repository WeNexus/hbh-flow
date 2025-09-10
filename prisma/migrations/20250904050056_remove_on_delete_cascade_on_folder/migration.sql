-- DropForeignKey
ALTER TABLE "public"."Workflow" DROP CONSTRAINT "Workflow_folderId_fkey";

-- AddForeignKey
ALTER TABLE "public"."Workflow" ADD CONSTRAINT "Workflow_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "public"."Folder"("id") ON DELETE SET DEFAULT ON UPDATE CASCADE;
