// src/services/browserAgentAi.js
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs').promises;
const prisma = require('../config/database');
const aiService = require('./aiService');

// ═══════════════════════════════════════════════════════════════════════════
// YAPILANDIRMA — HIZ İÇİN OPTİMİZE EDİLDİ
// ═══════════════════════════════════════════════════════════════════════════
const CONFIG = {
  maxSteps: 25,                  // Karmaşık testler için artırıldı
  minConfidence: 0.5,
  stepDelayMs: 500,              // 1000 → 500 (yarıya indirildi)
  screenshotDir: path.join(__dirname, '../../test-results/screenshots'),
  headless: false,
  slowMo: 100,                   // 300 → 100 (3 kat hızlı)
  navigationTimeout: 15000,
  actionTimeout: 8000,           // 15000 → 8000 (yarıya indirildi)
  postActionDelay: 250,          // 400 → 250 (eylem sonrası bekleme)
  retryOnSelectorFailure: true,
};

class BrowserAgentAI {

  constructor() {
    this.browser = null;
    this.page = null;
    this.context = null;
    this.testRunId = null;
    this.steps = [];
  }

  async executeTest(testRunId, userPrompt, targetUrl) {
    this.testRunId = testRunId;
    this.steps = [];
    const startTime = Date.now();

    try {
      await this._initBrowser();
      await fs.mkdir(CONFIG.screenshotDir, { recursive: true });

      if (targetUrl) {
        await this.page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: CONFIG.navigationTimeout });
        console.log(`🌐 ${targetUrl}`);
      }

      let stepCount = 0;
      let testComplete = false;
      let bugDetected = false;
      let bugDescription = null;

      while (!testComplete && stepCount < CONFIG.maxSteps) {
        stepCount++;
        console.log(`\n${'─'.repeat(50)}\n📍 ADIM ${stepCount} / ${CONFIG.maxSteps}\n${'─'.repeat(50)}`);

        const preScreenshotPath = await this._takeScreenshot(`${stepCount}_pre`);
        const pageContext = await this._gatherPageContext();

        let decision;
        try {
          decision = await aiService.analyzeScreenshot(preScreenshotPath, userPrompt, this.steps, pageContext);
        } catch (aiError) {
          console.error(`❌ AI yanıt veremedi: ${aiError.message}`);
          const errorStep = await this._saveStep(
            { action: 'verify', target: null, value: null, reasoning: `AI hatası: ${aiError.message}`, confidence: 0, testComplete: false, bugDetected: false, bugDescription: null, alternativeSelectors: [] },
            { success: false, duration: 0, error: aiError.message },
            preScreenshotPath, stepCount
          );
          this.steps.push(errorStep);
          await this._sleep(CONFIG.stepDelayMs);
          continue;
        }

        if (!this._validateDecision(decision)) {
          console.error(`❌ Geçersiz karar`);
          await this._sleep(CONFIG.stepDelayMs);
          continue;
        }

        console.log(`🤖 ${decision.action} → ${decision.target || '-'} ${decision.value ? `= "${decision.value}"` : ''} (${(decision.confidence * 100).toFixed(0)}%)`);
        if (decision.reasoning) console.log(`   💭 ${decision.reasoning}`);

        if (decision.bugDetected) {
          bugDetected = true;
          bugDescription = decision.bugDescription;
          console.log(`🐛 BUG: ${bugDescription}`);
        }

        let actionResult = await this._executeAction(decision);

        // Selector retry — daha akıllı
        if (!actionResult.success && CONFIG.retryOnSelectorFailure && this._isSelectorAction(decision.action)) {
          console.log(`🔄 Yeniden analiz...`);
          const retryScreenshot = await this._takeScreenshot(`${stepCount}_retry`);
          const retryPageContext = await this._gatherPageContext();
          try {
            const retryDecision = await aiService.analyzeScreenshot(
              retryScreenshot,
              userPrompt,
              [...this.steps, { action: decision.action, target: decision.target, success: false, errorMsg: actionResult.error, value: decision.value }],
              retryPageContext
            );
            if (this._validateDecision(retryDecision)) {
              const retryResult = await this._executeAction(retryDecision);
              if (retryResult.success) {
                decision = retryDecision;
                actionResult = retryResult;
              }
            }
          } catch (e) {
            console.error(`   ↳ Retry başarısız: ${e.message}`);
          }
        }

        if (!actionResult.success) {
          console.log(`   ⚠️ Adım başarısız — test devam ediyor`);
        }

        let resultScreenshotPath = preScreenshotPath;
        if (actionResult.success && decision.action !== 'verify' && decision.action !== 'wait') {
          try {
            await this._sleep(CONFIG.postActionDelay);
            resultScreenshotPath = await this._takeScreenshot(stepCount);
          } catch { /* pre-action kullan */ }
        }

        const savedStep = await this._saveStep(decision, actionResult, resultScreenshotPath, stepCount);
        this.steps.push(savedStep);

        testComplete = decision.testComplete === true;
        if (testComplete) {
          console.log(bugDetected ? `🐛 Test bitti — bug bulundu` : `✅ Test başarıyla tamamlandı`);
        }

        await this._sleep(CONFIG.stepDelayMs);
      }

      if (stepCount >= CONFIG.maxSteps && !testComplete) {
        console.log(`⚠️ Maksimum adım (${CONFIG.maxSteps})`);
      }

      // Final screenshot
      try {
        await this._sleep(500);
        const finalPath = await this._takeScreenshot('final');
        const finalStats = await fs.stat(finalPath);
        await prisma.screenshot.create({ data: { filePath: finalPath, fileSize: finalStats.size, format: 'png' } });
      } catch { /* önemsiz */ }

      const duration = Date.now() - startTime;
      const failedSteps = this.steps.filter(s => !s.success).length;
      const successSteps = this.steps.filter(s => s.success).length;

      console.log(`\n🏁 ${(duration/1000).toFixed(1)}s | ${stepCount} adım | ✓${successSteps} ✗${failedSteps}`);

      return {
        success: testComplete && !bugDetected,
        bugDetected, bugDescription,
        totalSteps: stepCount, failedSteps, successSteps, duration,
      };

    } catch (error) {
      console.error(`❌ Kritik: ${error.message}`);
      return {
        success: false, bugDetected: false, bugDescription: null,
        totalSteps: this.steps.length,
        failedSteps: this.steps.filter(s => !s.success).length,
        successSteps: this.steps.filter(s => s.success).length,
        duration: Date.now() - startTime,
        error: error.message,
      };
    } finally {
      await this._closeBrowser();
    }
  }

  async _initBrowser() {
    this.browser = await chromium.launch({ headless: CONFIG.headless, slowMo: CONFIG.slowMo, args: ['--start-maximized'] });
    this.context = await this.browser.newContext({ viewport: null });
    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(CONFIG.actionTimeout);
    await this.page.bringToFront();
    console.log('✅ Tarayıcı başlatıldı');
  }

  /**
   * Görüntü tek başına bazen yanlış alanı işaret eder. Erişilebilirlik ağacı + görünür form
   * kontrollerinin özeti modelin doğru Playwright seçicisi yazmasına yardım eder.
   */
  async _gatherPageContext() {
    const chunks = [];
    try {
      const snap = await this.page.accessibility.snapshot({ interestingOnly: true });
      const json = JSON.stringify(snap);
      chunks.push(json.length > 10000 ? `${json.slice(0, 10000)}\n...[truncated]` : json);
    } catch (e) {
      chunks.push(`(accessibility snapshot: ${e.message})`);
    }
    try {
      const interactive = await this.page.evaluate(() => {
        const sel =
          'input:not([type="hidden"]), select, textarea, button, [role="button"], [role="combobox"], [role="listbox"], a[href]';
        const nodes = Array.from(document.querySelectorAll(sel));
        return nodes.slice(0, 72).map((el) => {
          const r = el.getBoundingClientRect();
          const inView =
            r.width > 0 &&
            r.height > 0 &&
            r.bottom > 0 &&
            r.top < window.innerHeight &&
            r.right > 0 &&
            r.left < window.innerWidth;
          if (!inView) return null;
          const tag = el.tagName.toLowerCase();
          const type = el.type || '';
          const id = el.id || '';
          const nm = el.name || '';
          const ph = el.placeholder || '';
          let label = '';
          if (el.labels && el.labels[0]) label = (el.labels[0].innerText || '').trim().slice(0, 100);
          if (!label) label = el.getAttribute('aria-label') || '';
          const role = el.getAttribute('role') || '';
          let options = null;
          if (tag === 'select') {
            options = Array.from(el.options)
              .slice(0, 16)
              .map((o) => ({ value: o.value, text: (o.text || '').trim().slice(0, 60) }));
          }
          return { tag, type, id, name: nm, placeholder: ph, label, role, options };
        }).filter(Boolean);
      });
      chunks.push('\n--- görünür etkileşimli öğeler (özet) ---\n' + JSON.stringify(interactive));
    } catch (e) {
      chunks.push(`\n(interactive özet: ${e.message})`);
    }
    const full = chunks.join('\n');
    return full.length > 14000 ? `${full.slice(0, 14000)}\n...[truncated]` : full;
  }

  async _takeScreenshot(stepLabel) {
    const label = String(stepLabel).padStart(3, '0');
    const filename = `run_${this.testRunId}_step_${label}.png`;
    const screenshotPath = path.join(CONFIG.screenshotDir, filename);
    try {
      await this.page.screenshot({ path: screenshotPath, fullPage: false });
    } catch (err) {
      console.error(`📸 ${err.message}`);
    }
    return screenshotPath;
  }

  _validateDecision(decision) {
    if (!decision || typeof decision !== 'object') return false;
    const valid = ['navigate', 'click', 'fill', 'select', 'type', 'press', 'wait', 'scroll', 'hover', 'verify'];
    if (!valid.includes(decision.action)) return false;
    const needsTarget = ['click', 'fill', 'select', 'type', 'hover', 'navigate'];
    if (needsTarget.includes(decision.action) && !decision.target) return false;
    if (['fill', 'type'].includes(decision.action) && decision.value == null) return false;
    if (typeof decision.confidence !== 'number') decision.confidence = 0.5;
    return true;
  }

  _isSelectorAction(action) {
    return ['click', 'fill', 'select', 'type', 'hover'].includes(action);
  }

  async _executeAction(decision) {
    const startTime = Date.now();
    try {
      switch (decision.action) {
        case 'navigate':
          await this.page.goto(decision.target, { waitUntil: 'domcontentloaded', timeout: CONFIG.navigationTimeout });
          break;
        case 'click':
          await this._safeAction(decision.target, l => l.click());
          break;
        case 'fill':
          await this._safeAction(decision.target, l => l.fill(decision.value || ''));
          break;
        case 'select':
          await this._safeAction(decision.target, async (l) => {
            const raw = String(decision.value ?? '').trim();
            try {
              await l.selectOption({ label: raw });
            } catch {
              try {
                await l.selectOption(raw);
              } catch {
                await l.selectOption({ value: raw });
              }
            }
          });
          break;
        case 'type':
          await this._safeAction(decision.target, l => l.pressSequentially(decision.value || '', { delay: 30 }));
          break;
        case 'press':
          await this.page.keyboard.press(decision.value || decision.target);
          break;
        case 'wait':
          await this._sleep(Math.min(parseInt(decision.value) || 1500, 5000));
          break;
        case 'scroll':
          await this.page.evaluate(() => window.scrollBy(0, 400));
          break;
        case 'hover':
          await this._safeAction(decision.target, l => l.hover());
          break;
        case 'verify':
          // verify eylem yapmaz; reasoning'i log'la
          break;
      }
      return { success: true, duration: Date.now() - startTime };
    } catch (error) {
      if (decision.alternativeSelectors?.length) {
        const fallback = await this._tryAlternatives(decision, startTime);
        if (fallback.success) return fallback;
      }
      console.error(`   ❌ ${error.message}`);
      return { success: false, duration: Date.now() - startTime, error: error.message };
    }
  }

  async _safeAction(selector, actionFn) {
    const locator = this.page.locator(selector).first();
    await locator.waitFor({ state: 'visible', timeout: CONFIG.actionTimeout });
    await locator.scrollIntoViewIfNeeded();
    await actionFn(locator);
  }

  async _tryAlternatives(decision, startTime) {
    for (const alt of decision.alternativeSelectors) {
      try {
        console.log(`   🔁 Alternatif: ${alt}`);
        const result = await this._executeAction({ ...decision, target: alt, alternativeSelectors: [] });
        if (result.success) return { success: true, duration: Date.now() - startTime };
      } catch { /* devam */ }
    }
    return { success: false, duration: Date.now() - startTime, error: 'Tüm selectorlar başarısız' };
  }

  async _saveStep(decision, actionResult, screenshotPath, stepNumber) {
    let screenshotId = null;
    try {
      const stats = await fs.stat(screenshotPath);
      const ss = await prisma.screenshot.create({ data: { filePath: screenshotPath, fileSize: stats.size, format: 'png' } });
      screenshotId = ss.id;
    } catch (err) {
      console.error(`   📸 DB: ${err.message}`);
    }

    try {
      return await prisma.testStep.create({
        data: {
          testRunId: this.testRunId,
          stepNumber,
          timestamp: new Date(),
          action: decision.action,
          target: decision.target || null,
          value: decision.value || null,
          screenshotId,
          aiReasoning: decision.reasoning || '',
          aiConfidence: decision.confidence,
          success: actionResult.success,
          errorMsg: actionResult.error || null,
          durationMs: actionResult.duration,
        },
      });
    } catch (err) {
      console.error(`   💾 DB: ${err.message}`);
      return { action: decision.action, target: decision.target, success: actionResult.success, value: decision.value };
    }
  }

  async _closeBrowser() {
    try {
      if (this.context) { await this.context.close(); this.context = null; }
      if (this.browser) { await this.browser.close(); this.browser = null; }
      this.page = null;
    } catch (err) {
      console.error(`Kapatma: ${err.message}`);
    }
  }

  _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
}

module.exports = new BrowserAgentAI();