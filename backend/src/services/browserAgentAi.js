// src/services/browserAgentAi.js
//
// ════════════════════════════════════════════════════════════════════
// VERSION-AWARE BROWSER AGENT (DÜZELTİLMİŞ — GERÇEK DALLANMA)
// ════════════════════════════════════════════════════════════════════
//
// V1 (Baseline):    Legacy AI service + tek strateji selector
// V2 (+DOM):        Yeni AI service (ID tabanlı), TEMİZ screenshot, executeSimple
// V3 (+SoM):        Yeni AI service + ANNOTATED screenshot, executeSimple
// V4 (Full Hybrid): Yeni AI service + ANNOTATED screenshot + executeWithHealing
//
// ÖNCEKI HATA: agent her durumda V4 mantığı çalıştırıyordu, sadece env'i
// metadata olarak kaydediyordu. ŞİMDİ: isFeatureEnabled() ile gerçek dallanma.

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs').promises;

// ─── İKİ AYRI AI SERVICE ───
const aiService = require('./aiService');              // V2/V3/V4 için (ID tabanlı)
const aiServiceLegacy = require('./aiServiceLegacy');  // V1 için (selector tabanlı)

const { extractInteractiveElements } = require('./domExtractor');
const { annotateScreenshot } = require('./screenshotAnnotator');

// ─── İKİ AYRI EXECUTOR ───
const {
  executeWithHealing,    // V4 için (9 katmanlı self-healing)
  executeSimple,         // V2/V3 için (tek strateji)
  evaluateConfidence,
  isNavigationElement,
  isFormActionElement,
  isInPageActionElement
} = require('./actionExecutor');

// ─── VERSİYON KONTROLÜ ───
const { resolveVersion, isFeatureEnabled } = require('../config/architectureVersion');
const { checkPromptCompliance } = require('./promptCompliance');
const { normalizeDateForElement } = require('../utils/dateFormat');

const prisma = require('../config/database');

const SCREENSHOTS_DIR = path.join(__dirname, '../../test-results/screenshots');
const MAX_STEPS = 25;
const STEP_DELAY_MS = 500;
const POST_ACTION_WAIT = 1200;
const POST_DROPDOWN_WAIT = 1500;
const POST_SCROLL_WAIT = 800;
const MAX_CONSECUTIVE_FAILS = 3;
const BROWSER_SLOW_MO = Number(process.env.BROWSER_SLOW_MO || 220);

class BrowserAgentAI {
  /**
   * @param {object} [options]
   * @param {string} [options.architectureVersion] - V1|V2|V3|V4 (process.env yerine; paralel koşum güvenli)
   */
  async executeTest(testRunId, userPrompt, targetUrl, options = {}) {
    await fs.mkdir(SCREENSHOTS_DIR, { recursive: true });

    // ════════════════════════════════════════════════════════════════
    // VERSİYON BİLGİSİNİ AL VE LOGla
    // ════════════════════════════════════════════════════════════════
    const version = resolveVersion(options.architectureVersion);
    console.log(`\n┌────────────────────────────────────────────────────┐`);
    console.log(`│ 🔧 Mimari: ${version.name.padEnd(40)} │`);
    console.log(`│    DOM extraction:  ${(isFeatureEnabled('domExtraction', version) ? '✓ AÇIK' : '✗ KAPALI').padEnd(28)} │`);
    console.log(`│    SoM annotation:  ${(isFeatureEnabled('somAnnotation', version) ? '✓ AÇIK' : '✗ KAPALI').padEnd(28)} │`);
    console.log(`│    Self-healing:    ${(isFeatureEnabled('selfHealing', version) ? '✓ AÇIK' : '✗ KAPALI').padEnd(28)} │`);
    console.log(`│    Loop detection:  ${(isFeatureEnabled('loopDetection', version) ? '✓ AÇIK' : '✗ KAPALI').padEnd(28)} │`);
    console.log(`└────────────────────────────────────────────────────┘\n`);

    const browser = await chromium.launch({
      headless: false,
      slowMo: BROWSER_SLOW_MO,
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
    let failureSummary = null;
    let lastError = null;
    let manualReview = false;
    let manualReviewReason = null;
    const requireLeaveThenMyLeave = /leave/.test(String(userPrompt).toLowerCase()) &&
      /my leave/.test(String(userPrompt).toLowerCase());
    let leaveNavDone = false;

    const metrics = {
      totalAiCalls: 0,
      totalApiTokensEstimate: 0,
      retryCount: 0,
      bboxFallbacks: 0,
      strategyUsageCounts: {},
      confidenceScores: []
    };

    try {
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(1500);
      await page.bringToFront();

      while (stepNumber < MAX_STEPS && !testCompleted) {
        stepNumber++;
        const stepStartTime = Date.now();

        console.log(`\n📍 Adım ${stepNumber}/${MAX_STEPS}`);

        // ──────────────────────────────────────────────────────────
        // DÖNGÜ TESPİTİ — Sadece V3+ aktif (V1/V2 baseline davranışı)
        // ──────────────────────────────────────────────────────────
        if (isFeatureEnabled('loopDetection', version)) {
          const recentFails = history.slice(-MAX_CONSECUTIVE_FAILS).filter(h => !h.success);
          const stuck = recentFails.length >= MAX_CONSECUTIVE_FAILS &&
            recentFails.every(h =>
              ((h.elementId && h.elementId === recentFails[0].elementId) ||
               (h.target && h.target === recentFails[0].target)) &&
              h.action === recentFails[0].action
            );

          if (stuck) {
            console.log(`   🔁 Döngü tespit edildi, test sonlandırılıyor`);
            await this._saveStep({
              testRunId, stepNumber, action: 'error',
              target: null, value: null,
              aiReasoning: `Döngü tespit edildi: ${MAX_CONSECUTIVE_FAILS} kez aynı hata`,
              aiConfidence: 0, success: false,
              errorMsg: 'Döngüsel hata',
              durationMs: Date.now() - stepStartTime,
              screenshotBuffer: await page.screenshot()
            });
            lastError = 'Döngüsel hata';
            failureSummary = 'Aynı aksiyon tekrarlandı (döngü); test durduruldu.';
            break;
          }
        }

        // ──────────────────────────────────────────────────────────
        // ADIM 1: SCREENSHOT
        // ──────────────────────────────────────────────────────────
        const cleanShot = await page.screenshot({ fullPage: false });

        // ──────────────────────────────────────────────────────────
        // ADIM 2: DOM EXTRACTION — Sadece V2+ aktif
        // ──────────────────────────────────────────────────────────
        let elements = [];
        if (isFeatureEnabled('domExtraction', version)) {
          elements = await extractInteractiveElements(page);
          console.log(`   🔍 [V2+] DOM extraction: ${elements.length} element bulundu`);
        } else {
          console.log(`   ⚪ [V1] DOM extraction yok, ham screenshot kullanılıyor`);
        }

        // ──────────────────────────────────────────────────────────
        // ADIM 3: SoM ANNOTATION — Sadece V3+ aktif
        // ──────────────────────────────────────────────────────────
        let aiScreenshotBase64;
        if (isFeatureEnabled('somAnnotation', version) && elements.length > 0) {
          const annotatedShot = await annotateScreenshot(cleanShot, elements);
          aiScreenshotBase64 = annotatedShot.toString('base64');
          console.log(`   🎨 [V3+] SoM annotation: ${elements.length} bounding box çizildi`);
        } else {
          aiScreenshotBase64 = cleanShot.toString('base64');
          if (isFeatureEnabled('domExtraction', version)) {
            console.log(`   ⚪ [V2] SoM yok, temiz screenshot AI'a gönderiliyor`);
          }
        }

        // ──────────────────────────────────────────────────────────
        // ADIM 4: AI KARAR — V1 farklı service kullanır
        // ──────────────────────────────────────────────────────────
        let decision;
        try {
          if (isFeatureEnabled('domExtraction', version)) {
            // V2/V3/V4: Yeni AI service (ID tabanlı)
            console.log(`   🤖 AI çağrısı: ID-tabanlı service (SoM=${isFeatureEnabled('somAnnotation', version) ? 'açık' : 'kapalı'})`);
            decision = await aiService.decideNextAction({
              userPrompt,
              screenshotBase64: aiScreenshotBase64,
              elements,
              history,
              currentUrl: page.url(),
              somEnabled: isFeatureEnabled('somAnnotation', version)
            });
          } else {
            // V1: Legacy AI service (selector tabanlı)
            console.log(`   🤖 AI çağrısı: Legacy service (selector istiyor)`);
            decision = await aiServiceLegacy.decideNextAction({
              userPrompt,
              screenshotBase64: aiScreenshotBase64,
              history,
              currentUrl: page.url()
            });
          }
          metrics.totalAiCalls++;
          metrics.totalApiTokensEstimate += this._estimateTokens(elements, history);
          if (decision.confidence != null) metrics.confidenceScores.push(decision.confidence);
        } catch (err) {
          console.error(`   ❌ AI karar hatası: ${err.message}`);
          await this._saveStep({
            testRunId, stepNumber, action: 'error',
            target: null, value: null,
            aiReasoning: `AI karar veremedi: ${err.message}`,
            aiConfidence: 0, success: false, errorMsg: err.message,
            durationMs: Date.now() - stepStartTime,
            screenshotBuffer: cleanShot
          });
          lastError = err.message;
          failureSummary = `AI karar veremedi: ${err.message}`.substring(0, 400);
          break;
        }

        const decisionLog = `${decision.action}` +
          (decision.elementId ? ` element=${decision.elementId}` : '') +
          (decision.target ? ` target=${decision.target}` : '') +
          (decision.value ? ` value="${String(decision.value).substring(0, 30)}"` : '');
        console.log(`   🎯 Karar: ${decisionLog} (güven: %${(decision.confidence * 100).toFixed(0)})`);

        // ──────────────────────────────────────────────────────────
        // Bug Detection
        // ──────────────────────────────────────────────────────────
        if (decision.bugDetected) {
          bugDetected = true;
          bugDescription = decision.bugDescription;
          failureSummary = `Uygulama hatası tespit edildi: ${bugDescription || 'AI bug bildirdi'}`;
          testSuccess = false;
          await this._saveStep({
            testRunId, stepNumber, action: decision.action,
            target: decision.element ? this._fingerprintToTarget(decision.element) : decision.target,
            value: decision.value,
            aiReasoning: decision.reasoning, aiConfidence: decision.confidence,
            success: false, errorMsg: `BUG: ${bugDescription}`,
            durationMs: Date.now() - stepStartTime,
            screenshotBuffer: cleanShot
          });
          break;
        }

        // ──────────────────────────────────────────────────────────
        // Tamamlama
        // ──────────────────────────────────────────────────────────
        if (decision.action === 'complete') {
          testCompleted = true;
          const outcome = this._resolveCompletionOutcome(history, decision, userPrompt);
          testSuccess = outcome.success;
          failureSummary = outcome.failureSummary;
          await this._saveStep({
            testRunId, stepNumber, action: 'complete',
            target: null, value: null,
            aiReasoning: decision.reasoning, aiConfidence: decision.confidence,
            success: testSuccess,
            errorMsg: testSuccess ? null : failureSummary,
            durationMs: Date.now() - stepStartTime,
            screenshotBuffer: cleanShot
          });
          if (testSuccess) {
            console.log('   ✅ Test tamamlandı (tüm adımlar başarılı)');
          } else {
            console.log(`   ⛔ Test başarısız: ${failureSummary}`);
          }
          break;
        }

        // ──────────────────────────────────────────────────────────
        // ADIM 5: AKSİYON UYGULAMA — V4 farklı executor kullanır
        // ──────────────────────────────────────────────────────────
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

        if (
          isFeatureEnabled('loopDetection', version) &&
          decision.action === 'scroll' &&
          history.slice(-5).filter((h) => h.action === 'scroll').length >= 2
        ) {
          console.log('   ⛔ Ardışık scroll engellendi (dropdown seçeneğine tıkla)');
          actionResult = {
            success: false,
            strategyUsed: null,
            fallbackChain: [],
            error: 'Gereksiz scroll döngüsü — açık listedeki dropdown-option öğesine tıkla'
          };
        }

        const preActionUrl = page.url();
        if (!actionResult) {
          try {
            actionResult = await this._executeAction(page, decision, version, userPrompt);
          } catch (err) {
            actionResult = { success: false, error: err.message, fallbackChain: [] };
          }
        }

        // Metrikleri topla
        if (actionResult.strategyUsed) {
          metrics.strategyUsageCounts[actionResult.strategyUsed] =
            (metrics.strategyUsageCounts[actionResult.strategyUsed] || 0) + 1;
          if (actionResult.strategyUsed.includes('bbox')) metrics.bboxFallbacks++;
        }
        if (actionResult.fallbackChain && actionResult.fallbackChain.length > 1) {
          metrics.retryCount += actionResult.fallbackChain.length - 1;
        }

        // Aksiyon sonrası bekle
        if (actionResult.success) {
          if (
            (decision.element?.type === 'custom-dropdown' && decision.action === 'click') ||
            (decision.element?.type === 'dropdown-option' && decision.action === 'click')
          ) {
            await page.waitForTimeout(POST_DROPDOWN_WAIT);
          } else if (['click', 'press', 'select', 'navigate'].includes(decision.action)) {
            await page.waitForTimeout(POST_ACTION_WAIT);
            await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
          }
        }

        if (actionResult.success && this._isNavigationLikeClick(decision)) {
          const navCheck = await this._validateNavigationResult(
            page,
            preActionUrl,
            page.url(),
            decision.element
          );
          if (!navCheck.ok) {
            actionResult = {
              success: false,
              strategyUsed: actionResult.strategyUsed,
              fallbackChain: actionResult.fallbackChain || [],
              error: navCheck.reason
            };
          } else if (navCheck.hint) {
            actionResult.postActionHint = navCheck.hint;
          }
        }

        if (
          actionResult.success &&
          decision.action === 'click' &&
          isFormActionElement(decision.element)
        ) {
          const submitHint = await this._detectSubmitFeedback(page, decision.element);
          if (submitHint) actionResult.postActionHint = submitHint;
        }

        if (actionResult.success && decision.action === 'click') {
          const targetText = String(decision.element?.text || '').toLowerCase();
          if (targetText.includes('leave') && !targetText.includes('my leave')) {
            leaveNavDone = true;
          }
        }

        const target = decision.element ? this._fingerprintToTarget(decision.element) : (decision.target || decision.value || null);
        let errorMsg = null;
        if (!actionResult.success) errorMsg = actionResult.error;
        else if (actionResult.warning) errorMsg = `⚠️ ${actionResult.warning}`;
        else if (confEval.manual) errorMsg = `⚠️ ${confEval.message}`;

        let stepScreenshot = cleanShot;
        try {
          stepScreenshot = await page.screenshot({ fullPage: false });
        } catch {
          stepScreenshot = cleanShot;
        }

        await this._saveStep({
          testRunId, stepNumber, action: decision.action,
          target, value: decision.value,
          aiReasoning: this._buildReasoning(decision, actionResult, confEval, version),
          aiConfidence: decision.confidence,
          success: actionResult.success, errorMsg,
          durationMs: Date.now() - stepStartTime,
          screenshotBuffer: stepScreenshot
        });

        history.push({
          stepNumber,
          action: decision.action,
          elementId: decision.elementId,
          target: decision.target,
          value: decision.value,
          success: actionResult.success,
          strategy: actionResult.strategyUsed,
          errorReason: actionResult.success ? null : (actionResult.error || 'unknown').substring(0, 200)
        });

        if (!actionResult.success) {
          console.log(`   ❌ ${actionResult.error?.substring(0, 100)}`);
        } else {
          console.log(`   ✓ Strateji: ${actionResult.strategyUsed}`);
        }

        await page.waitForTimeout(STEP_DELAY_MS);
      }

      const maxStepsReached = stepNumber >= MAX_STEPS && !testCompleted;
      if (!testCompleted) {
        testSuccess = false;
        failureSummary = this._buildIncompleteSummary({
          maxStepsReached,
          lastError,
          failedCount: history.filter(h => !h.success).length,
          history
        });
      } else if (!testSuccess && !failureSummary) {
        failureSummary = this._buildFailedStepsSummary(history);
      }

      const duration = Date.now() - startTime;
      const successSteps = history.filter(h => h.success).length;
      const failedSteps = history.filter(h => !h.success).length;

      if (testSuccess) {
        console.log(`\n📊 SONUÇ: BAŞARILI (${successSteps} başarılı adım)`);
      } else {
        console.log(`\n📊 SONUÇ: BAŞARISIZ — ${failureSummary || lastError || 'Bilinmeyen hata'}`);
      }

      return {
        success: testSuccess,
        bugDetected, bugDescription,
        failureSummary: testSuccess ? null : (failureSummary || lastError),
        manualReview,
        manualReviewReason,
        totalSteps: stepNumber, successSteps, failedSteps,
        duration,
        error: testSuccess ? null : (failureSummary || lastError),
        maxStepsReached,
        architectureVersion: version.name,
        metrics: {
          ...metrics,
          avgConfidence: metrics.confidenceScores.length > 0
            ? metrics.confidenceScores.reduce((a, b) => a + b, 0) / metrics.confidenceScores.length
            : 0,
          avgStepDurationMs: stepNumber > 0 ? Math.round(duration / stepNumber) : 0
        }
      };
    } catch (err) {
      console.error('Browser agent fatal:', err);
      const fatalSummary = `Sistem hatası: ${err.message}`;
      console.log(`\n📊 SONUÇ: BAŞARISIZ — ${fatalSummary}`);
      return {
        success: false, bugDetected, bugDescription,
        failureSummary: fatalSummary,
        manualReview, manualReviewReason,
        totalSteps: stepNumber, successSteps: 0, failedSteps: stepNumber,
        duration: Date.now() - startTime, error: fatalSummary,
        architectureVersion: version.name, metrics
      };
    } finally {
      await browser.close().catch(() => {});
    }
  }

  /**
   * Aksiyonu uygula — V4'te self-healing, diğerlerinde simple
   */
  async _executeAction(page, decision, version, userPrompt = '') {
    const { action, element, value, target } = decision;

    if (
      element &&
      (action === 'fill' || action === 'type') &&
      (element.type === 'date-input' || /yyyy|dd|mm|date/i.test(element.fingerprint?.placeholder || ''))
    ) {
      const raw = value ?? decision.value;
      if (raw != null && raw !== '') {
        decision.value = normalizeDateForElement(String(raw), element, userPrompt);
      }
    }

    // Element bağımsız aksiyonlar
    if (action === 'navigate' && value) {
      await page.goto(value, { waitUntil: 'domcontentloaded', timeout: 30000 });
      return { success: true, strategyUsed: 'navigate', fallbackChain: [] };
    }
    if (action === 'wait') {
      await page.waitForTimeout(parseInt(value) || 1000);
      return { success: true, strategyUsed: 'wait', fallbackChain: [] };
    }
    if (action === 'scroll') {
      const dir = (value || 'down').toLowerCase();
      if (dir === 'down' || dir === 'up') {
        const delta = dir === 'down' ? 120 : -120;
        for (let i = 0; i < 6; i++) {
          await page.mouse.wheel(0, delta);
          await page.waitForTimeout(90);
        }
      } else if (dir === 'top') {
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
      } else if (dir === 'bottom') {
        await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));
      }
      await page.waitForTimeout(POST_SCROLL_WAIT);
      return { success: true, strategyUsed: 'scroll', fallbackChain: [] };
    }
    if (action === 'verify') {
      return { success: true, strategyUsed: 'verify', fallbackChain: [] };
    }
    if (action === 'press' && !element && !target) {
      await page.keyboard.press(value || 'Enter');
      return { success: true, strategyUsed: 'keyboard', fallbackChain: [] };
    }

    // ════════════════════════════════════════════════════════════════
    // ELEMENT BAZLI AKSİYONLAR — BURASI VERSİYONA GÖRE DALLANIR
    // ════════════════════════════════════════════════════════════════

    // V2/V3/V4: element nesnesi var (DOM extraction'dan)
    if (element) {
      if (isFeatureEnabled('selfHealing', version)) {
        console.log(`   ⚙️  [V4] executeWithHealing kullanılıyor`);
        return await executeWithHealing(page, element, action, value, version.features);
      }
      console.log(`   ⚙️  [V${isFeatureEnabled('somAnnotation', version) ? '3' : '2'}] executeSimple kullanılıyor (fallback yok)`);
      return await executeSimple(page, element, action, value);
    }

    // V1: AI doğrudan selector verdi (target field)
    if (target) {
      console.log(`   ⚙️  [V1] Doğrudan selector kullanılıyor: ${target}`);
      try {
        const locator = page.locator(target).first();
        await locator.waitFor({ state: 'visible', timeout: 3000 });

        switch (action) {
          case 'click': await locator.click({ timeout: 8000 }); break;
          case 'fill': await locator.fill(value || '', { timeout: 8000 }); break;
          case 'type':
            await locator.click();
            await locator.type(value || '', { delay: 50 });
            break;
          case 'select': await locator.selectOption(value, { timeout: 5000 }); break;
          case 'press': await locator.press(value || 'Enter'); break;
          case 'hover': await locator.hover(); break;
          default: throw new Error(`Bilinmeyen aksiyon: ${action}`);
        }
        return { success: true, strategyUsed: 'direct-selector', fallbackChain: [{ strategy: 'direct-selector', status: 'success' }] };
      } catch (err) {
        return {
          success: false,
          error: err.message,
          fallbackChain: [{ strategy: 'direct-selector', status: 'failed', error: err.message.substring(0, 150) }]
        };
      }
    }

    return { success: false, error: 'Ne element ne target verildi', fallbackChain: [] };
  }

  _fingerprintToTarget(element) {
    const fp = element.fingerprint;
    return fp.dataTest || fp.id || fp.cssSelector || fp.text || `bbox(${element.bbox.x},${element.bbox.y})`;
  }

  _isNavigationLikeClick(decision) {
    if (decision.action !== 'click' || !decision.element) return false;
    if (isInPageActionElement(decision.element)) return false;
    if (['link', 'menuitem', 'tab'].includes(decision.element.type)) return true;
    return isNavigationElement(decision.element);
  }

  _routeKeywordFromText(text) {
    const normalized = String(text || '').toLowerCase().replace(/[^a-z0-9\s-]/g, ' ');
    const tokens = normalized.split(/\s+/).filter((t) => t.length >= 3);
    if (tokens.length > 0) return tokens[0];
    const short = normalized.trim();
    if (short.length >= 4) return short;
    return null;
  }

  _urlPathAndHash(url) {
    try {
      const u = new URL(url);
      return { path: u.pathname.toLowerCase(), hash: u.hash.toLowerCase(), full: url.toLowerCase() };
    } catch {
      return { path: '', hash: '', full: String(url || '').toLowerCase() };
    }
  }

  /**
   * AI "complete" dese bile: önceki adımlarda hata varsa success=false.
   */
  _resolveCompletionOutcome(history, decision, userPrompt) {
    const failed = history.filter(h => !h.success);
    const aiClaimsSuccess = decision.success !== false;

    if (!aiClaimsSuccess) {
      const reason = (decision.reasoning || 'AI testi başarısız olarak işaretledi.').substring(0, 280);
      return { success: false, failureSummary: reason };
    }

    if (failed.length > 0) {
      return {
        success: false,
        failureSummary: this._buildFailedStepsSummary(history, {
          prefix: 'Prompt tamamlanamadı: AI erken bitti.'
        })
      };
    }

    const compliance = checkPromptCompliance(userPrompt, history);
    if (!compliance.ok) {
      console.log(`   ⛔ Prompt uyumu: ${compliance.message}`);
      return { success: false, failureSummary: compliance.message };
    }

    return { success: true, failureSummary: null };
  }

  _buildFailedStepsSummary(history, opts = {}) {
    const failed = history.filter(h => !h.success);
    if (failed.length === 0) return opts.prefix || 'Bilinmeyen başarısızlık';

    const last = failed[failed.length - 1];
    const targetPart = last.target ? ` hedef="${String(last.target).substring(0, 60)}"` : '';
    const errPart = (last.errorReason || 'hata detayı yok').substring(0, 120);
    const core = `${failed.length} adım başarısız. Son: ${last.action}${targetPart} — ${errPart}`;
    return opts.prefix ? `${opts.prefix} ${core}`.substring(0, 400) : core.substring(0, 400);
  }

  _buildIncompleteSummary({ maxStepsReached, lastError, failedCount, history }) {
    if (lastError) return lastError.substring(0, 400);
    if (maxStepsReached) {
      const failHint = failedCount > 0
        ? ` ${failedCount} adım hata verdi.`
        : '';
      return `Test ${MAX_STEPS} adımda tamamlanamadı; prompt bitmedi.${failHint}`.substring(0, 400);
    }
    if (failedCount > 0) return this._buildFailedStepsSummary(history);
    return 'Test beklenmedik şekilde sonlandı.';
  }

  async _validateNavigationResult(page, beforeUrl, afterUrl, element) {
    const before = this._urlPathAndHash(beforeUrl);
    const after = this._urlPathAndHash(afterUrl);
    const text = String(element?.text || '').toLowerCase();
    const href = element?.attrs?.href || element?.fingerprint?.href || '';

    const changed = after.path !== before.path || after.hash !== before.hash || after.full !== before.full;
    if (!changed) {
      const spaOk = await this._validateSpaContentChange(page, element);
      if (spaOk.ok) return spaOk;
      return { ok: false, reason: 'Navigasyon doğrulanamadı: URL değişmedi' };
    }

    if (href) {
      try {
        const hrefPath = new URL(href, beforeUrl || afterUrl).pathname.toLowerCase();
        const segment = hrefPath.split('/').filter(Boolean).pop();
        if (segment && segment.length > 2 && (after.path.includes(segment) || after.full.includes(segment))) {
          return { ok: true };
        }
      } catch { /* ignore */ }
    }

    if (text.includes('contact') || text.includes('iletişim') || text.includes('iletisim')) {
      if (after.path.includes('contact') || after.path.includes('iletisim') || after.full.includes('contact')) {
        return { ok: true };
      }
      return {
        ok: false,
        reason: `Navigasyon şüpheli: contact/iletişim sayfasına gidilmedi (${afterUrl})`
      };
    }

    const expectedKeyword = this._routeKeywordFromText(element?.text);
    if (expectedKeyword && !after.path.includes(expectedKeyword) && !after.full.includes(expectedKeyword)) {
      return {
        ok: false,
        reason: `Navigasyon şüpheli: URL değişti ama "${expectedKeyword}" içermiyor (${afterUrl})`
      };
    }

    return { ok: true };
  }

  /** Menü dışı SPA: URL aynı kalır ama adım/form değişir */
  async _validateSpaContentChange(page, element) {
    try {
      const body = (await page.locator('body').innerText({ timeout: 3000 })).toLowerCase();
      const stepHints =
        /enter your information|confirm|your name|e-?mail|subject|thank you|teşekkür|başarı|gönderildi|received|thank you for your order|checkout complete|add to cart|remove|shopping cart/i;
      if (stepHints.test(body)) {
        return { ok: true, hint: 'SPA: sayfa içeriği güncellendi (form/sepet/checkout)' };
      }

      const dt = String(element?.fingerprint?.dataTest || '').toLowerCase();
      if (/add-to-cart|remove|shopping[-_]?cart|checkout/.test(dt)) {
        return { ok: true, hint: 'SPA: sepet/ürün aksiyonu (URL değişmeyebilir)' };
      }
    } catch { /* ignore */ }
    return { ok: false };
  }

  async _detectSubmitFeedback(page, element) {
    const label = String(element?.text || '').toLowerCase();
    if (!/\b(submit|gönder|send)\b/i.test(label)) return null;
    try {
      await page.waitForTimeout(800);
      const body = (await page.locator('body').innerText({ timeout: 3000 })).toLowerCase();
      if (/thank you|teşekkür|successfully|başarıyla|received|gönderildi|mesajınız|alındı/i.test(body)) {
        return 'Gönderim onayı: sayfada başarı/teşekkür metni görüldü';
      }
    } catch { /* ignore */ }
    return 'Submit tıklandı; e-postanın gerçekten iletilip iletilmediği sunucu/API loglarından doğrulanmalı';
  }

  _buildReasoning(decision, actionResult, confEval, version) {
    const parts = [`[${version.name}]`, decision.reasoning];
    if (actionResult.strategyUsed && !['wait', 'scroll'].includes(actionResult.strategyUsed)) {
      parts.push(`[Strateji: ${actionResult.strategyUsed}]`);
    }
    if (actionResult.fallbackChain && actionResult.fallbackChain.length > 1) {
      const failed = actionResult.fallbackChain.filter(f => f.status === 'failed').length;
      if (failed > 0) parts.push(`[${failed} fallback]`);
    }
    if (confEval.manual) parts.push(`[⚠ Düşük güven]`);
    if (actionResult.warning) parts.push(`[⚠ ${actionResult.warning}]`);
    if (actionResult.postActionHint) parts.push(`[${actionResult.postActionHint}]`);
    return parts.join(' ').substring(0, 500);
  }

  _estimateTokens(elements, history) {
    const imageTokens = 1600;
    const systemPromptTokens = 1500;
    const elementTokens = elements.length * 30;
    const historyTokens = history.length * 40;
    return imageTokens + systemPromptTokens + elementTokens + historyTokens;
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
        testRunId, stepNumber, timestamp: new Date(),
        action,
        target: target ? String(target).substring(0, 500) : null,
        value: value ? String(value).substring(0, 500) : null,
        aiReasoning: aiReasoning ? aiReasoning.substring(0, 500) : null,
        aiConfidence, success,
        errorMsg: errorMsg ? errorMsg.substring(0, 500) : null,
        durationMs, screenshotId: screenshot.id
      }
    });
  }
}

module.exports = new BrowserAgentAI();