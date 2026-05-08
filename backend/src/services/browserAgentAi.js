// src/services/browserAgentAi.js
//
// HİBRİT BROWSER AGENT (v2)
//
// İYİLEŞTİRMELER:
// 1. errorReason history'ye ekleniyor → AI hatadan ders alıyor
// 2. Döngü tespiti: aynı element+action 3 kez fail olduysa break
// 3. Custom-dropdown sonrası daha uzun bekleme (700ms → 1000ms)
// 4. Date input'lar için ekstra validation log

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs').promises;
const aiService = require('./aiService');
const { extractInteractiveElements } = require('./domExtractor');
const { annotateScreenshot } = require('./screenshotAnnotator');
const { executeWithHealing, evaluateConfidence } = require('./actionExecutor');
const prisma = require('../config/database');

const SCREENSHOTS_DIR = path.join(__dirname, '../../test-results/screenshots');
const MAX_STEPS = 25;
const STEP_DELAY_MS = 500;
const POST_ACTION_WAIT = 1200;
const POST_DROPDOWN_WAIT = 1500; // YENI: Custom dropdown sonrası daha uzun bekle
const MAX_CONSECUTIVE_FAILS_SAME_TARGET = 3; // YENI: Aynı element+action max bu kadar fail edebilir

class BrowserAgentAI {
  async executeTest(testRunId, userPrompt, targetUrl) {
    await fs.mkdir(SCREENSHOTS_DIR, { recursive: true });

    const browser = await chromium.launch({
      headless: false,
      slowMo: 100,
      args: ['--start-maximized']
    });
    const context = await browser.newContext({ viewport: null });
    const page = await context.newPage();

    const startTime = Date.now();
    const history = [];
    let stepNumber = 0;
    let bugDetected = false;
    let bugDescription = null;
    let testCompleted = false;
    let testSuccess = false;
    let lastError = null;
    let manualReview = false;
    let manualReviewReason = null;
    const requireLeaveThenMyLeave = /leave/.test(String(userPrompt).toLowerCase()) && /my leave/.test(String(userPrompt).toLowerCase());
    let leaveNavDone = false;

    try {
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(1500);
      await page.bringToFront();

      while (stepNumber < MAX_STEPS && !testCompleted) {
        stepNumber++;
        const stepStartTime = Date.now();

        console.log(`\n📍 Adım ${stepNumber}/${MAX_STEPS}`);

        const cleanShot = await page.screenshot({ fullPage: false });
        const elements = await extractInteractiveElements(page);
        console.log(`   🔍 ${elements.length} etkileşimli element bulundu`);

        const annotatedShot = await annotateScreenshot(cleanShot, elements);
        const annotatedBase64 = annotatedShot.toString('base64');

        // YENİ: Döngü tespiti — aynı element+action 3 kez fail ettiyse zorla farklı strateji
        const recentFails = history.slice(-MAX_CONSECUTIVE_FAILS_SAME_TARGET).filter(h => !h.success);
        const stuckInLoop = recentFails.length >= MAX_CONSECUTIVE_FAILS_SAME_TARGET &&
          recentFails.every(h => h.elementId === recentFails[0].elementId && h.action === recentFails[0].action);

        if (stuckInLoop) {
          console.log(`   🔁 Döngü tespit edildi: element ${recentFails[0].elementId} + ${recentFails[0].action} ${MAX_CONSECUTIVE_FAILS_SAME_TARGET} kez fail. Test sonlandırılıyor.`);
          await this._saveStep({
            testRunId, stepNumber,
            action: 'error', target: null, value: null,
            aiReasoning: `Döngü tespit edildi: ${MAX_CONSECUTIVE_FAILS_SAME_TARGET} kez aynı hata. Element ${recentFails[0].elementId} + ${recentFails[0].action} sürekli fail oldu.`,
            aiConfidence: 0, success: false,
            errorMsg: 'Test döngüsel hata nedeniyle sonlandırıldı',
            durationMs: Date.now() - stepStartTime,
            screenshotBuffer: cleanShot
          });
          lastError = 'Döngüsel hata: aynı element + aksiyon tekrarlanıyor';
          break;
        }

        let decision;
        try {
          decision = await aiService.decideNextAction({
            userPrompt,
            screenshotBase64: annotatedBase64,
            elements,
            history,
            currentUrl: page.url()
          });
        } catch (err) {
          console.error(`   ❌ AI karar hatası: ${err.message}`);
          await this._saveStep({
            testRunId, stepNumber,
            action: 'error', target: null, value: null,
            aiReasoning: `AI karar veremedi: ${err.message}`,
            aiConfidence: 0, success: false,
            errorMsg: err.message,
            durationMs: Date.now() - stepStartTime,
            screenshotBuffer: cleanShot
          });
          lastError = err.message;
          break;
        }

        console.log(`   🤖 AI: ${decision.action}${decision.elementId ? ` element=${decision.elementId}` : ''}${decision.value ? ` value="${decision.value}"` : ''} (güven: %${(decision.confidence * 100).toFixed(0)})`);

        if (decision.bugDetected) {
          console.log(`   🐛 BUG: ${decision.bugDescription}`);
          bugDetected = true;
          bugDescription = decision.bugDescription;
          await this._saveStep({
            testRunId, stepNumber,
            action: decision.action,
            target: decision.element ? this._fingerprintToTarget(decision.element) : null,
            value: decision.value,
            aiReasoning: decision.reasoning,
            aiConfidence: decision.confidence,
            success: false,
            errorMsg: `BUG: ${bugDescription}`,
            durationMs: Date.now() - stepStartTime,
            screenshotBuffer: cleanShot
          });
          break;
        }

        if (decision.action === 'complete') {
          testCompleted = true;
          testSuccess = decision.success === true;
          await this._saveStep({
            testRunId, stepNumber,
            action: 'complete', target: null, value: null,
            aiReasoning: decision.reasoning,
            aiConfidence: decision.confidence,
            success: testSuccess,
            errorMsg: testSuccess ? null : decision.reasoning,
            durationMs: Date.now() - stepStartTime,
            screenshotBuffer: cleanShot
          });
          console.log(`   ✅ Test tamamlandı (success: ${testSuccess})`);
          break;
        }

        const confEval = evaluateConfidence(decision.confidence);
        if (!confEval.passed) {
          console.log(`   ⚠️  ${confEval.message}`);
          manualReview = true;
          manualReviewReason = confEval.message;
        }

        let actionResult;
        if (requireLeaveThenMyLeave && decision.action === 'click') {
          const targetText = String(decision.element?.text || '').toLowerCase();
          const isMyLeave = targetText.includes('my leave');
          if (isMyLeave && !leaveNavDone) {
            actionResult = {
              success: false,
              strategyUsed: null,
              fallbackChain: [],
              error: 'Sıra ihlali: "My Leave" tıklanmadan önce "Leave" adımı tamamlanmalı'
            };
          }
        }

        const preActionUrl = page.url();
        if (!actionResult) {
          try {
            actionResult = await this._executeAction(page, decision);
          } catch (err) {
            actionResult = { success: false, error: err.message, fallbackChain: [] };
          }
        }

        // YENİ: Custom dropdown sonrası daha uzun bekle
        if (actionResult.success) {
          if (decision.element?.type === 'custom-dropdown' && decision.action === 'click') {
            await page.waitForTimeout(POST_DROPDOWN_WAIT);
          } else if (['click', 'press', 'select', 'navigate'].includes(decision.action)) {
            await page.waitForTimeout(POST_ACTION_WAIT);
            await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
          }
        }

        if (actionResult.success && this._isNavigationLikeClick(decision)) {
          const navCheck = this._validateNavigationResult(preActionUrl, page.url(), decision.element);
          if (!navCheck.ok) {
            actionResult = {
              success: false,
              strategyUsed: actionResult.strategyUsed,
              fallbackChain: actionResult.fallbackChain || [],
              error: navCheck.reason
            };
          }
        }

        if (actionResult.success && decision.action === 'click') {
          const targetText = String(decision.element?.text || '').toLowerCase();
          if (targetText.includes('leave') && !targetText.includes('my leave')) {
            leaveNavDone = true;
          }
        }

        const target = decision.element ? this._fingerprintToTarget(decision.element) : (decision.value || null);
        let errorMsg = null;
        if (!actionResult.success) {
          errorMsg = actionResult.error;
        } else if (actionResult.warning) {
          errorMsg = `⚠️ ${actionResult.warning}`;
        } else if (confEval.manual) {
          errorMsg = `⚠️ ${confEval.message}`;
        }

        await this._saveStep({
          testRunId, stepNumber,
          action: decision.action,
          target,
          value: decision.value,
          aiReasoning: this._buildReasoning(decision, actionResult, confEval),
          aiConfidence: decision.confidence,
          success: actionResult.success,
          errorMsg,
          durationMs: Date.now() - stepStartTime,
          screenshotBuffer: cleanShot
        });

        // YENİ: errorReason history'ye ekle (AI bunu okuyup ders alacak)
        history.push({
          stepNumber,
          action: decision.action,
          elementId: decision.elementId,
          value: decision.value,
          success: actionResult.success,
          strategy: actionResult.strategyUsed,
          errorReason: actionResult.success ? null : (actionResult.error || 'bilinmeyen hata').substring(0, 200)
        });

        if (!actionResult.success) {
          console.log(`   ❌ Aksiyon başarısız: ${actionResult.error}`);
        } else {
          console.log(`   ✓ Strateji: ${actionResult.strategyUsed}`);
        }

        await page.waitForTimeout(STEP_DELAY_MS);
      }

      if (!testCompleted && stepNumber >= MAX_STEPS) {
        console.log(`   ⚠️ Maksimum adım sayısına ulaşıldı (${MAX_STEPS})`);
      }

      const duration = Date.now() - startTime;
      const successSteps = history.filter(h => h.success).length;
      const failedSteps = history.length - successSteps;

      return {
        success: testSuccess,
        bugDetected,
        bugDescription,
        manualReview,
        manualReviewReason,
        totalSteps: stepNumber,
        successSteps,
        failedSteps,
        duration,
        error: lastError,
        maxStepsReached: stepNumber >= MAX_STEPS && !testCompleted
      };
    } catch (err) {
      console.error('Browser agent fatal error:', err);
      return {
        success: false, bugDetected, bugDescription, manualReview, manualReviewReason,
        totalSteps: stepNumber, successSteps: 0, failedSteps: stepNumber,
        duration: Date.now() - startTime,
        error: err.message
      };
    } finally {
      await browser.close().catch(() => {});
    }
  }

  async _executeAction(page, decision) {
    const { action, element, value } = decision;

    if (action === 'navigate' && value) {
      await page.goto(value, { waitUntil: 'domcontentloaded', timeout: 30000 });
      return { success: true, strategyUsed: 'navigate', fallbackChain: [] };
    }

    if (action === 'wait') {
      const ms = parseInt(value) || 1000;
      await page.waitForTimeout(ms);
      return { success: true, strategyUsed: 'wait', fallbackChain: [] };
    }

    if (action === 'scroll') {
      const dir = (value || 'down').toLowerCase();
      if (dir === 'down') await page.evaluate(() => window.scrollBy(0, 600));
      else if (dir === 'up') await page.evaluate(() => window.scrollBy(0, -600));
      else if (dir === 'top') await page.evaluate(() => window.scrollTo(0, 0));
      else if (dir === 'bottom') await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      return { success: true, strategyUsed: 'scroll', fallbackChain: [] };
    }

    if (action === 'verify') {
      return { success: true, strategyUsed: 'verify', fallbackChain: [] };
    }

    if (action === 'press' && !element) {
      await page.keyboard.press(value || 'Enter');
      return { success: true, strategyUsed: 'keyboard', fallbackChain: [] };
    }

    if (!element) {
      return { success: false, error: 'Element seçilmedi ama element-bazlı aksiyon istendi', fallbackChain: [] };
    }

    return await executeWithHealing(page, element, action, value);
  }

  _fingerprintToTarget(element) {
    const fp = element.fingerprint;
    return fp.dataTest || fp.id || fp.cssSelector || fp.text || `bbox(${element.bbox.x},${element.bbox.y})`;
  }

  _isNavigationLikeClick(decision) {
    return decision.action === 'click' && ['link', 'menuitem', 'tab'].includes(decision.element?.type);
  }

  _routeKeywordFromText(text) {
    const normalized = String(text || '').toLowerCase().replace(/[^a-z0-9\s-]/g, ' ');
    const tokens = normalized.split(/\s+/).filter(t => t.length >= 3);
    return tokens[0] || null;
  }

  _validateNavigationResult(beforeUrl, afterUrl, element) {
    const before = String(beforeUrl || '').toLowerCase();
    const after = String(afterUrl || '').toLowerCase();
    if (after !== before) {
      const expectedKeyword = this._routeKeywordFromText(element?.text);
      if (expectedKeyword && !after.includes(expectedKeyword)) {
        return {
          ok: false,
          reason: `Navigasyon şüpheli: URL değişti ama "${expectedKeyword}" içermiyor (${afterUrl})`
        };
      }
      return { ok: true };
    }
    return { ok: false, reason: 'Navigasyon doğrulanamadı: URL değişmedi' };
  }

  _buildReasoning(decision, actionResult, confEval) {
    const parts = [decision.reasoning];

    if (actionResult.strategyUsed && actionResult.strategyUsed !== 'wait' && actionResult.strategyUsed !== 'scroll') {
      parts.push(`[Strateji: ${actionResult.strategyUsed}]`);
    }

    if (actionResult.fallbackChain && actionResult.fallbackChain.length > 1) {
      const failed = actionResult.fallbackChain.filter(f => f.status === 'failed').length;
      if (failed > 0) parts.push(`[${failed} fallback denendi]`);
    }

    if (confEval.manual) parts.push(`[⚠ Düşük güven]`);
    if (actionResult.warning) parts.push(`[⚠ ${actionResult.warning}]`);

    return parts.join(' ').substring(0, 500);
  }

  async _saveStep({ testRunId, stepNumber, action, target, value, aiReasoning, aiConfidence, success, errorMsg, durationMs, screenshotBuffer }) {
    const filename = `run-${testRunId}-step-${stepNumber}-${Date.now()}.png`;
    const filePath = path.join(SCREENSHOTS_DIR, filename);
    await fs.writeFile(filePath, screenshotBuffer);

    const screenshot = await prisma.screenshot.create({
      data: { filePath, fileSize: screenshotBuffer.length, format: 'png' }
    });

    await prisma.testStep.create({
      data: {
        testRunId, stepNumber,
        timestamp: new Date(),
        action,
        target: target ? String(target).substring(0, 500) : null,
        value: value ? String(value).substring(0, 500) : null,
        aiReasoning: aiReasoning ? aiReasoning.substring(0, 500) : null,
        aiConfidence,
        success,
        errorMsg: errorMsg ? errorMsg.substring(0, 500) : null,
        durationMs,
        screenshotId: screenshot.id
      }
    });
  }
}

module.exports = new BrowserAgentAI();