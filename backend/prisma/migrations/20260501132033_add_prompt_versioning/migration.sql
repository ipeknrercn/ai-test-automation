/*
  Warnings:

  - Added the required column `updatedAt` to the `prompt_versions` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "prompt_versions" ADD COLUMN     "bugCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "test_runs" ADD COLUMN     "promptVersionId" INTEGER;

-- CreateIndex
CREATE INDEX "test_runs_promptVersionId_idx" ON "test_runs"("promptVersionId");

-- AddForeignKey
ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_promptVersionId_fkey" FOREIGN KEY ("promptVersionId") REFERENCES "prompt_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
