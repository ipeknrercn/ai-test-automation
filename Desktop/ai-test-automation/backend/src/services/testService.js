// src/services/testService.js
const prisma = require('../config/database');

class TestService {
  // Yeni test oluştur
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

  // Test çalıştır ve kaydet
  async runTest(testData) {
    try {
      // 1. Test kaydı oluştur
      const test = await this.createTest({
        testName: testData.testName,
        userPrompt: testData.userPrompt,
        targetUrl: testData.targetUrl
      });

      // 2. Test run başlat
      const testRun = await prisma.testRun.create({
        data: {
          testId: test.id,
          status: 'RUNNING',
          startTime: new Date(),
          browser: 'chromium'
        }
      });

      // TODO: Playwright ile testi çalıştır (Faz 5'te yapacağız)
      // Şimdilik mock data
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 3. Test run'ı güncelle
      await prisma.testRun.update({
        where: { id: testRun.id },
        data: {
          status: 'SUCCESS',
          endTime: new Date(),
          durationMs: 2000
        }
      });

      // 4. Sonucu döndür
      return await prisma.testRun.findUnique({
        where: { id: testRun.id },
        include: {
          test: true,
          steps: true
        }
      });
    } catch (error) {
      throw new Error(`Test execution failed: ${error.message}`);
    }
  }

  // Test geçmişini getir
  async getTestHistory(limit = 10) {
    return await prisma.testRun.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        test: true,
        steps: {
          include: {
            screenshot: true
          }
        }
      }
    });
  }

  // Belirli bir testi getir
  async getTestById(id) {
    return await prisma.testRun.findUnique({
      where: { id: parseInt(id) },
      include: {
        test: true,
        steps: {
          include: {
            screenshot: true
          },
          orderBy: { stepNumber: 'asc' }
        }
      }
    });
  }

  // Test istatistikleri
  async getStats() {
    const totalTests = await prisma.testRun.count();
    const successTests = await prisma.testRun.count({
      where: { status: 'SUCCESS' }
    });
    const failedTests = await prisma.testRun.count({
      where: { status: 'FAIL' }
    });

    return {
      total: totalTests,
      success: successTests,
      failed: failedTests,
      successRate: totalTests > 0 ? ((successTests / totalTests) * 100).toFixed(2) : 0
    };
  }
}

module.exports = new TestService();