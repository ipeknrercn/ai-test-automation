// src/services/testService.js
const prisma = require('../config/database');
const browserAgentAI = require('./browserAgentAi');

class TestService {

  // ───────────────────────────────────────────────────────────────────────
  // Yeni test kaydı oluştur
  // ───────────────────────────────────────────────────────────────────────
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

  // ───────────────────────────────────────────────────────────────────────
  // Testi çalıştır — AI döngüsü browserAgentAi üzerinden başlar
  // ───────────────────────────────────────────────────────────────────────
  async runTest(testData) {
    // 1. Test kaydını oluştur
    const test = await this.createTest({
      testName: testData.testName,
      userPrompt: testData.userPrompt,
      targetUrl: testData.targetUrl
    });

    // 2. TestRun kaydını oluştur (durum: RUNNING)
    const testRun = await prisma.testRun.create({
      data: {
        testId: test.id,
        status: 'RUNNING',
        startTime: new Date(),
        browser: 'chromium'
      }
    });

    console.log(`\n🚀 Test başlatıldı — Run ID: ${testRun.id}`);
    console.log(`📝 Prompt: "${testData.userPrompt}"`);

    // 3. AI browser agent döngüsünü başlat
    let result;
    try {
      result = await browserAgentAI.executeTest(
        testRun.id,
        testData.userPrompt,
        testData.targetUrl
      );
    } catch (unexpectedError) {
      // browserAgentAI içinde yakalanmayan kritik hata
      result = {
        success: false,
        totalSteps: 0,
        duration: 0,
        error: unexpectedError.message
      };
    }

    // 4. TestRun kaydını sonuçla güncelle
    const finalStatus = result.success
      ? 'SUCCESS'
      : result.error
        ? 'ERROR'
        : 'FAIL';

    await prisma.testRun.update({
      where: { id: testRun.id },
      data: {
        status: finalStatus,
        endTime: new Date(),
        durationMs: result.duration || 0,
        errorMsg: result.error || null,
      }
    });

    console.log(`\n📊 Test sonucu: ${finalStatus} (${(result.duration / 1000).toFixed(1)}s)`);

    // 5. Tamamlanmış kaydı tüm detaylarıyla döndür
    return await prisma.testRun.findUnique({
      where: { id: testRun.id },
      include: {
        test: true,
        steps: {
          include: { screenshot: true },
          orderBy: { stepNumber: 'asc' }
        }
      }
    });
  }

  // ───────────────────────────────────────────────────────────────────────
  // Test geçmişini getir
  // ───────────────────────────────────────────────────────────────────────
  async getTestHistory(limit = 10) {
    return await prisma.testRun.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        test: true,
        steps: {
          include: { screenshot: true }
        }
      }
    });
  }

  // ───────────────────────────────────────────────────────────────────────
  // Belirli bir testi getir
  // ───────────────────────────────────────────────────────────────────────
  async getTestById(id) {
    return await prisma.testRun.findUnique({
      where: { id: parseInt(id) },
      include: {
        test: true,
        steps: {
          include: { screenshot: true },
          orderBy: { stepNumber: 'asc' }
        }
      }
    });
  }

  // ───────────────────────────────────────────────────────────────────────
  // RUNNING takılı kalan testleri temizle
  // Sunucu restart sonrası RUNNING kalan kayıtları FAIL'e çek
  // ───────────────────────────────────────────────────────────────────────
  async cleanupStaleRuns() {
    const updated = await prisma.testRun.updateMany({
      where: { status: 'RUNNING' },
      data: {
        status: 'FAIL',
        errorMsg: 'Sunucu yeniden başlatıldı, test yarıda kesildi.',
        endTime: new Date()
      }
    });
    if (updated.count > 0) {
      console.log(`🧹 ${updated.count} adet takılı RUNNING test temizlendi.`);
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  // İstatistikler
  // ───────────────────────────────────────────────────────────────────────
  async getStats() {
    const totalTests = await prisma.testRun.count();
    const successTests = await prisma.testRun.count({ where: { status: 'SUCCESS' } });
    const failedTests = await prisma.testRun.count({ where: { status: 'FAIL' } });

    return {
      total: totalTests,
      success: successTests,
      failed: failedTests,
      successRate: totalTests > 0
        ? ((successTests / totalTests) * 100).toFixed(2)
        : 0
    };
  }
}

module.exports = new TestService();