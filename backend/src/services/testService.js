// src/services/testService.js
const prisma = require('../config/database');
const browserAgentAI = require('./browserAgentAi');
const promptVersionService = require('./promptVersionService');
const fs = require('fs').promises;
const path = require('path');

class TestService {

  async createTest(data) {
    return await prisma.test.create({
      data: {
        testName: data.testName,
        description: data.description,
        userPrompt: data.userPrompt,
        targetUrl: data.targetUrl
      }
    });
  }

  async runTest(testData) {
    // 1. PROMPT VERSIYON: testName + targetUrl üzerinden versiyon bul/oluştur
    //    Bu çağrı kendi içinde Test kaydı da oluşturur
    const promptVersion = await promptVersionService.findOrCreateVersion(
      testData.testName,
      testData.targetUrl,
      testData.userPrompt
    );

    // 2. TestRun kaydını oluştur
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

    // 3. AI döngüsünü çalıştır
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

    // 4. Durum belirle
    let finalStatus;
    if (result.bugDetected) finalStatus = 'BUG_FOUND';
    else if (result.success) finalStatus = 'SUCCESS';
    else if (result.error) finalStatus = 'ERROR';
    else finalStatus = 'FAIL';

    const errorMsg = result.bugDetected
      ? `BUG: ${result.bugDescription}`
      : result.error || null;

    // 5. TestRun güncelle
    await prisma.testRun.update({
      where: { id: testRun.id },
      data: {
        status: finalStatus,
        endTime: new Date(),
        durationMs: result.duration || 0,
        errorMsg
      }
    });

    // 6. Prompt versiyon istatistiklerini güncelle
    await promptVersionService.updateStats(promptVersion.id, finalStatus, result.duration);

    console.log(`📊 Sonuç: ${finalStatus} | ${promptVersion.version} güncellendi`);

    return await prisma.testRun.findUnique({
      where: { id: testRun.id },
      include: {
        test: true,
        promptVersion: true,
        steps: { include: { screenshot: true }, orderBy: { stepNumber: 'asc' } }
      }
    });
  }

  // ───────────────────────────────────────────────────────────────────────
  // YENİ: Bir testi belirli prompt ile yeniden koş
  // testRunId verilirse → onun bilgileriyle yeniden koşar
  // overridePrompt verilirse → orijinal yerine bu prompt kullanılır
  // ───────────────────────────────────────────────────────────────────────
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

  async getTestHistory(limit = 50) {
    return await prisma.testRun.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        test: true,
        promptVersion: { select: { version: true, successRate: true, isActive: true } },
        steps: { include: { screenshot: true } }
      }
    });
  }

  async getTestById(id) {
    return await prisma.testRun.findUnique({
      where: { id: parseInt(id) },
      include: {
        test: true,
        promptVersion: true,
        steps: { include: { screenshot: true }, orderBy: { stepNumber: 'asc' } }
      }
    });
  }

  // ───────────────────────────────────────────────────────────────────────
  // YENİ: Bir testi (TestRun ve ilgili tüm verileri) sil
  // Cascade delete sayesinde steps ve screenshot meta otomatik silinir
  // ───────────────────────────────────────────────────────────────────────
  async deleteTestRun(testRunId) {
    const id = parseInt(testRunId);

    // Önce screenshot dosyalarını topla (silmek için)
    const run = await prisma.testRun.findUnique({
      where: { id },
      include: {
        steps: { include: { screenshot: true } }
      }
    });

    if (!run) throw new Error('Silinecek test bulunamadı');

    const screenshotPaths = run.steps
      .map(s => s.screenshot?.filePath)
      .filter(Boolean);

    // TestRun sil — steps cascade ile gider
    await prisma.testRun.delete({ where: { id } });

    // Bu testRun'a bağlı orphan screenshot'ları temizle
    // (testStep silinince screenshotId null olur, orphan kalır)
    const orphanScreenshots = await prisma.screenshot.findMany({
      where: { testSteps: { none: {} } }
    });

    if (orphanScreenshots.length > 0) {
      await prisma.screenshot.deleteMany({
        where: { id: { in: orphanScreenshots.map(s => s.id) } }
      });
    }

    // Disk'ten dosyaları sil (best-effort)
    for (const filePath of screenshotPaths) {
      try {
        await fs.unlink(filePath);
      } catch (err) {
        // Dosya zaten silinmiş veya yok — sorun değil
      }
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