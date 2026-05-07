/*
  Warnings:

  - You are about to drop the column `folderId` on the `test_runs` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "test_runs" DROP CONSTRAINT "test_runs_folderId_fkey";

-- DropIndex
DROP INDEX "test_runs_folderId_idx";

-- AlterTable
ALTER TABLE "test_runs" DROP COLUMN "folderId";

-- CreateTable
CREATE TABLE "test_run_folders" (
    "testRunId" INTEGER NOT NULL,
    "folderId" INTEGER NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "test_run_folders_pkey" PRIMARY KEY ("testRunId","folderId")
);

-- CreateIndex
CREATE INDEX "test_run_folders_testRunId_idx" ON "test_run_folders"("testRunId");

-- CreateIndex
CREATE INDEX "test_run_folders_folderId_idx" ON "test_run_folders"("folderId");

-- AddForeignKey
ALTER TABLE "test_run_folders" ADD CONSTRAINT "test_run_folders_testRunId_fkey" FOREIGN KEY ("testRunId") REFERENCES "test_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_run_folders" ADD CONSTRAINT "test_run_folders_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
