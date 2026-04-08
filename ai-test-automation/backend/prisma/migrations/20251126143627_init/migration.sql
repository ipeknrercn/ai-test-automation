-- CreateTable
CREATE TABLE "tests" (
    "id" SERIAL NOT NULL,
    "testName" TEXT NOT NULL,
    "description" TEXT,
    "userPrompt" TEXT NOT NULL,
    "targetUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_runs" (
    "id" SERIAL NOT NULL,
    "testId" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3),
    "durationMs" INTEGER,
    "errorMsg" TEXT,
    "browser" TEXT NOT NULL DEFAULT 'chromium',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "test_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_steps" (
    "id" SERIAL NOT NULL,
    "testRunId" INTEGER NOT NULL,
    "stepNumber" INTEGER NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "action" TEXT NOT NULL,
    "target" TEXT,
    "value" TEXT,
    "screenshotId" INTEGER,
    "aiReasoning" TEXT,
    "aiConfidence" DOUBLE PRECISION,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "errorMsg" TEXT,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "test_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prompt_versions" (
    "id" SERIAL NOT NULL,
    "testId" INTEGER NOT NULL,
    "version" TEXT NOT NULL,
    "promptText" TEXT NOT NULL,
    "totalRuns" INTEGER NOT NULL DEFAULT 0,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "failCount" INTEGER NOT NULL DEFAULT 0,
    "successRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgDurationMs" INTEGER,
    "parentVersionId" INTEGER,
    "improvementReason" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prompt_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "screenshots" (
    "id" SERIAL NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileSize" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "format" TEXT NOT NULL DEFAULT 'png',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "screenshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "test_runs_testId_idx" ON "test_runs"("testId");

-- CreateIndex
CREATE INDEX "test_runs_status_idx" ON "test_runs"("status");

-- CreateIndex
CREATE INDEX "test_steps_testRunId_idx" ON "test_steps"("testRunId");

-- CreateIndex
CREATE INDEX "prompt_versions_testId_idx" ON "prompt_versions"("testId");

-- CreateIndex
CREATE UNIQUE INDEX "prompt_versions_testId_version_key" ON "prompt_versions"("testId", "version");

-- AddForeignKey
ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_testId_fkey" FOREIGN KEY ("testId") REFERENCES "tests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_steps" ADD CONSTRAINT "test_steps_testRunId_fkey" FOREIGN KEY ("testRunId") REFERENCES "test_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_steps" ADD CONSTRAINT "test_steps_screenshotId_fkey" FOREIGN KEY ("screenshotId") REFERENCES "screenshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prompt_versions" ADD CONSTRAINT "prompt_versions_testId_fkey" FOREIGN KEY ("testId") REFERENCES "tests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prompt_versions" ADD CONSTRAINT "prompt_versions_parentVersionId_fkey" FOREIGN KEY ("parentVersionId") REFERENCES "prompt_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
