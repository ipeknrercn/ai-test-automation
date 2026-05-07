// src/services/testService.js
const prisma = require('../config/database');
const browserAgentAI = require('./browserAgentAi');
const promptVersionService = require('./promptVersionService');
const fs = require('fs').promises;

class TestService {

  async createTest(data) {
    return await prisma.test.create({ data });
  }

  async runTest(testData) {
    const promptVersion = await promptVersionService.findOrCreateVersion(
      testData.testName,
      testData.targetUrl,
      testData.userPrompt
    );

    const testRun = await prisma.testRun.create({
      data: {
        testId: promptVersion.testId,
        status: 'RUNNING',
        startTime: new Date(),
        browser: 'chromium',
        promptVersionId: promptVersion.id
      }
    });

    console.log(`\n🚀 Test başlatıldı — Run ID: ${testRun.id} | Versiyon: ${promptVersion.version}`);

    let result;
    try {
      result = await browserAgentAI.executeTest(testRun.id, testData.userPrompt, testData.targetUrl);
    } catch (err) {
      result = {
        success: false, bugDetected: false, bugDescription: null,
        totalSteps: 0, failedSteps: 0, successSteps: 0, duration: 0,
        error: err.message
      };
    }

    let finalStatus;
    if (result.manualReview) finalStatus = 'ERROR';
    else if (result.bugDetected) finalStatus = 'BUG_FOUND';
    else if (result.success) finalStatus = 'SUCCESS';
    else if (result.error) finalStatus = 'ERROR';
    else finalStatus = 'FAIL';

    const errorMsg = result.bugDetected
      ? `BUG: ${result.bugDescription}`
      : result.manualReviewReason || result.error || null;

    await prisma.testRun.update({
      where: { id: testRun.id },
      data: { status: finalStatus, endTime: new Date(), durationMs: result.duration || 0, errorMsg }
    });

    await promptVersionService.updateStats(promptVersion.id, finalStatus, result.duration);

    console.log(`📊 Sonuç: ${finalStatus} | ${promptVersion.version} güncellendi`);

    return await this.getTestById(testRun.id);
  }

  async rerunTest(testRunId, overridePrompt = null) {
    const original = await prisma.testRun.findUnique({
      where: { id: parseInt(testRunId) },
      include: { test: true }
    });

    if (!original) throw new Error('Tekrar koşulacak test bulunamadı');

    return await this.runTest({
      testName: original.test.testName,
      targetUrl: original.test.targetUrl,
      userPrompt: overridePrompt || original.test.userPrompt
    });
  }

  // Test history — folders dahil
  async getTestHistory(limit = 50) {
    const runs = await prisma.testRun.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        test: true,
        promptVersion: { select: { version: true, successRate: true, isActive: true } },
        steps: { include: { screenshot: true } },
        folderLinks: {
          include: { folder: true }
        }
      }
    });

    // folderLinks'i düzleştir → folders array
    return runs.map(r => ({
      ...r,
      folders: r.folderLinks.map(l => l.folder),
      folderLinks: undefined
    }));
  }

  async getTestById(id) {
    const run = await prisma.testRun.findUnique({
      where: { id: parseInt(id) },
      include: {
        test: true,
        promptVersion: true,
        steps: { include: { screenshot: true }, orderBy: { stepNumber: 'asc' } },
        folderLinks: { include: { folder: true } }
      }
    });

    if (!run) return null;

    return {
      ...run,
      folders: run.folderLinks.map(l => l.folder),
      folderLinks: undefined
    };
  }

  async deleteTestRun(testRunId) {
    const id = parseInt(testRunId);

    const run = await prisma.testRun.findUnique({
      where: { id },
      include: { steps: { include: { screenshot: true } } }
    });

    if (!run) throw new Error('Silinecek test bulunamadı');

    const screenshotPaths = run.steps.map(s => s.screenshot?.filePath).filter(Boolean);

    await prisma.testRun.delete({ where: { id } });

    const orphans = await prisma.screenshot.findMany({
      where: { testSteps: { none: {} } }
    });
    if (orphans.length > 0) {
      await prisma.screenshot.deleteMany({ where: { id: { in: orphans.map(s => s.id) } } });
    }

    for (const filePath of screenshotPaths) {
      try { await fs.unlink(filePath); } catch {}
    }

    return { deleted: true, screenshotsRemoved: screenshotPaths.length };
  }

  async cleanupStaleRuns() {
    const updated = await prisma.testRun.updateMany({
      where: { status: 'RUNNING' },
      data: { status: 'FAIL', errorMsg: 'Sunucu yeniden başlatıldı.', endTime: new Date() }
    });
    if (updated.count > 0) console.log(`🧹 ${updated.count} takılı test temizlendi.`);
  }

  async getStats() {
    const totalTests = await prisma.testRun.count();
    const successTests = await prisma.testRun.count({ where: { status: 'SUCCESS' } });
    const failedTests = await prisma.testRun.count({ where: { status: 'FAIL' } });
    const bugTests = await prisma.testRun.count({ where: { status: 'BUG_FOUND' } });

    return {
      total: totalTests,
      success: successTests,
      failed: failedTests,
      bugs: bugTests,
      successRate: totalTests > 0 ? ((successTests / totalTests) * 100).toFixed(2) : 0
    };
  }
}

module.exports = new TestService();