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
  // Testi çalıştır — Artık gerçek AI döngüsü burada başlıyor
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
    //    Bu çağrı döngünün tamamlanmasını bekler (async/await)
    const result = await browserAgentAI.executeTest(
      testRun.id,
      testData.userPrompt,
      testData.targetUrl
    );

    // 4. TestRun kaydını sonuçla güncelle
    const finalStatus = result.success ? 'SUCCESS' : (result.error ? 'ERROR' : 'FAIL');

    await prisma.testRun.update({
      where: { id: testRun.id },
      data: {
        status: finalStatus,
        endTime: new Date(),
        durationMs: result.duration,
        errorMsg: result.error || null,
      }
    });

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
  // Test geçmişini getir (değişmedi)
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
  // Belirli bir testi getir (değişmedi)
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
  // İstatistikler (değişmedi)
  // ───────────────────────────────────────────────────────────────────────
  async getStats() {
    const totalTests = await prisma.testRun.count();
    const successTests = await prisma.testRun.count({ where: { status: 'SUCCESS' } });
    const failedTests = await prisma.testRun.count({ where: { status: 'FAIL' } });

    return {
      total: totalTests,
      success: successTests,
      failed: failedTests,
      successRate: totalTests > 0 ? ((successTests / totalTests) * 100).toFixed(2) : 0
    };
  }
}

module.exports = new TestService();