-- AlterTable
ALTER TABLE "test_runs" ADD COLUMN     "folderId" INTEGER;

-- CreateTable
CREATE TABLE "folders" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#3b82f6',
    "icon" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "folders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "folders_name_key" ON "folders"("name");

-- CreateIndex
CREATE INDEX "test_runs_folderId_idx" ON "test_runs"("folderId");

-- AddForeignKey
ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
