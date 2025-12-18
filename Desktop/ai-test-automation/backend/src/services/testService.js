// src/services/testService.js
const prisma = require('../config/database');
const aiService = require('./aiService');
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const MAX_STEPS = 15;
const SCREENSHOT_DIR = path.join(
  __dirname,
  '../../test-results/screenshots'
);

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

class TestService {
  // ===============================
  // Yeni test oluştur
  // ===============================
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

  // ===============================
  // 🤖 AI ile test çalıştır
  // ===============================
  async runAITest(testData) {
    const test = await this.createTest({
      testName: testData.testName,
      userPrompt: testData.userPrompt,
      targetUrl: testData.targetUrl
    });

    const testRun = await prisma.testRun.create({
      data: {
        testId: test.id,
        status: 'RUNNING',
        startTime: new Date(),
        browser: 'chromium'
      }
    });

    const browser = await chromium.launch({
      headless: false,
      slowMo: 500
    });

    const page = await browser.newPage();

    if (testData.targetUrl) {
      await page.goto(testData.targetUrl);
    }

    let previousSteps = [];
    let testComplete = false;

    for (let stepNumber = 1; stepNumber <= MAX_STEPS; stepNumber++) {
      const screenshotPath = path.join(
        SCREENSHOT_DIR,
        `test-${testRun.id}-step-${stepNumber}.png`
      );

      await page.screenshot({ path: screenshotPath });

      const aiDecision = await aiService.analyzeScreenshot(
        screenshotPath,
        testData.userPrompt,
        previousSteps
      );

      let success = true;
      let errorMsg = null;
      const start = Date.now();

      try {
        await this._executeAction(page, aiDecision);
      } catch (err) {
        success = false;
        errorMsg = err.message;
      }

      const durationMs = Date.now() - start;

      const step = await prisma.testStep.create({
        data: {
          testRunId: testRun.id,
          stepNumber,
          timestamp: new Date(),
          action: aiDecision.action,
          target: aiDecision.target,
          value: aiDecision.value,
          aiReasoning: aiDecision.reasoning,
          aiConfidence: aiDecision.confidence,
          success,
          errorMsg,
          durationMs
        }
      });

      previousSteps.push(step);

      if (aiDecision.testComplete || !success) {
        testComplete = true;
        break;
      }
    }

    await browser.close();

    await prisma.testRun.update({
      where: { id: testRun.id },
      data: {
        status: testComplete ? 'SUCCESS' : 'FAIL',
        endTime: new Date()
      }
    });

    return await prisma.testRun.findUnique({
      where: { id: testRun.id },
      include: {
        test: true,
        steps: true
      }
    });
  }

  // ===============================
  // Playwright action executor
  // ===============================
  async _executeAction(page, step) {
    switch (step.action) {
      case 'navigate':
        await page.goto(step.target);
        break;
      case 'click':
        await page.click(step.target);
        break;
      case 'fill':
        await page.fill(step.target, step.value || '');
        break;
      case 'type':
        await page.type(step.target, step.value || '');
        break;
      case 'wait':
        await page.waitForTimeout(Number(step.value) || 1000);
        break;
      case 'hover':
        await page.hover(step.target);
        break;
      default:
        throw new Error(`Bilinmeyen action: ${step.action}`);
    }
  }

  // ===============================
  // Test geçmişi
  // ===============================
  async getTestHistory(limit = 10) {
    return await prisma.testRun.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        test: true,
        steps: true
      }
    });
  }

  // ===============================
  // Test by ID
  // ===============================
  async getTestById(id) {
    return await prisma.testRun.findUnique({
      where: { id: parseInt(id) },
      include: {
        test: true,
        steps: {
          orderBy: { stepNumber: 'asc' }
        }
      }
    });
  }

  // ===============================
  // İstatistikler
  // ===============================
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
      successRate:
        totalTests > 0
          ? ((successTests / totalTests) * 100).toFixed(2)
          : 0
    };
  }
}

module.exports = new TestService();
