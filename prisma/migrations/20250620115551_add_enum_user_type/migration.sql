/*
  Warnings:

  - Added the required column `role` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN','DEVELOPER', 'DATA_ENTRY', 'OBSERVER');

-- AlterTable
ALTER TABLE "User"
    ADD COLUMN "role" "Role" DEFAULT 'OBSERVER' NOT NULL;

-- Update default admin user type

UPDATE "User"
set "role" = 'ADMIN'
where "email" = 'admin@honeybeeherb.com';