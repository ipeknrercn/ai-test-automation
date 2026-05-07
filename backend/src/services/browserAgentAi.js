// src/services/browserAgentAi.js
const { chromium } = require('playwright');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;
const prisma = require('../config/database');
const aiService = require('./aiService');

const CONFIG = {
  maxSteps: 25,
  /** Sadece fiyat seçimi/sepet vb. kritik aksiyonlarda; scroll/wait ile durdurmayın */
  confidenceThreshold: 0.85,
  stepDelayMs: 500,
  screenshotDir: path.join(__dirname, '../../test-results/screenshots'),
  headless: process.env.PLAYWRIGHT_HEADLESS !== 'false',
  slowMo: 100,
  navigationTimeout: 15000,
  actionTimeout: 8000,
  postActionDelay: 250,
  retryOnSelectorFailure: true,
  maxInteractiveElements: 80,
  selfHealingRetries: 2,
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
      let manualReviewReason = null;

      while (!testComplete && stepCount < CONFIG.maxSteps) {
        stepCount++;
        console.log(`\n${'─'.repeat(50)}\n📍 ADIM ${stepCount} / ${CONFIG.maxSteps}\n${'─'.repeat(50)}`);

        const preArtifacts = await this._captureStepArtifacts(`${stepCount}_pre`);
        const pageContext = this._buildPageContext(preArtifacts.elements);

        let decision;
        try {
          decision = await aiService.analyzeScreenshot(
            preArtifacts.annotatedPath,
            userPrompt,
            this.steps,
            pageContext,
            preArtifacts.elements.map((el) => ({
              elementId: el.elementId,
              label: this._labelForElement(el),
              selectorHints: [el.css, el.testId, el.nameSelector, el.roleTextSelector].filter(Boolean),
            }))
          );
        } catch (aiError) {
          console.error(`❌ AI yanıt veremedi: ${aiError.message}`);
          const errorStep = await this._saveStep(
            { action: 'verify', target: null, value: null, reasoning: `AI hatası: ${aiError.message}`, confidence: 0 },
            { success: false, duration: 0, error: aiError.message },
            preArtifacts.cleanPath,
            stepCount
          );
          this.steps.push(errorStep);
          await this._sleep(CONFIG.stepDelayMs);
          continue;
        }

        if (!this._validateDecision(decision)) {
          console.error('❌ Geçersiz karar');
          await this._sleep(CONFIG.stepDelayMs);
          continue;
        }

        const resolvedDecision = this._resolveDecisionWithElement(decision, preArtifacts.elements);

        if (
          this._requiresConfidenceGate(resolvedDecision.action) &&
          resolvedDecision.confidence < CONFIG.confidenceThreshold
        ) {
          manualReviewReason = `Düşük güven skoru: ${(resolvedDecision.confidence * 100).toFixed(0)}%`;
          console.log(`🛑 Manual review: ${manualReviewReason}`);
          const reviewStep = await this._saveStep(
            { ...resolvedDecision, action: 'verify', reasoning: `${resolvedDecision.reasoning || ''} | ${manualReviewReason}`.trim() },
            { success: false, duration: 0, error: manualReviewReason },
            preArtifacts.cleanPath,
            stepCount
          );
          this.steps.push(reviewStep);
          break;
        }

        console.log(
          `🤖 ${resolvedDecision.action} → ${resolvedDecision.target || `#${resolvedDecision.elementId || '-'}`} ${
            resolvedDecision.value ? `= "${resolvedDecision.value}"` : ''
          } (${(resolvedDecision.confidence * 100).toFixed(0)}%)`
        );
        if (resolvedDecision.reasoning) console.log(`   💭 ${resolvedDecision.reasoning}`);

        if (resolvedDecision.bugDetected) {
          bugDetected = true;
          bugDescription = resolvedDecision.bugDescription;
          console.log(`🐛 BUG: ${bugDescription}`);
        }

        let actionResult = await this._executeAction(resolvedDecision);
        if (!actionResult.success && CONFIG.retryOnSelectorFailure && this._isSelectorAction(resolvedDecision.action)) {
          console.log('🔄 Self-healing fallback...');
          actionResult = await this._selfHealAction(resolvedDecision, actionResult, userPrompt);
        }

        if (!actionResult.success) {
          console.log('   ⚠️ Adım başarısız — test devam ediyor');
        }

        let resultScreenshotPath = preArtifacts.cleanPath;
        if (actionResult.success && resolvedDecision.action !== 'verify' && resolvedDecision.action !== 'wait') {
          try {
            await this._sleep(CONFIG.postActionDelay);
            resultScreenshotPath = await this._takeScreenshot(stepCount);
          } catch {}
        }

        const savedStep = await this._saveStep(resolvedDecision, actionResult, resultScreenshotPath, stepCount);
        this.steps.push(savedStep);

        // "testComplete" ancak bu adım gerçekten başarılıysa kabul edilir.
        testComplete = resolvedDecision.testComplete === true && actionResult.success;
        if (testComplete) {
          console.log(bugDetected ? '🐛 Test bitti — bug bulundu' : '✅ Test başarıyla tamamlandı');
        }

        await this._sleep(CONFIG.stepDelayMs);
      }

      if (stepCount >= CONFIG.maxSteps && !testComplete) {
        console.log(`⚠️ Maksimum adım (${CONFIG.maxSteps})`);
      }

      try {
        await this._sleep(500);
        const finalPath = await this._takeScreenshot('final');
        const finalStats = await fs.stat(finalPath);
        await prisma.screenshot.create({ data: { filePath: finalPath, fileSize: finalStats.size, format: 'png' } });
      } catch {}

      const duration = Date.now() - startTime;
      const failedSteps = this.steps.filter((s) => !s.success).length;
      const successSteps = this.steps.filter((s) => s.success).length;
      console.log(`\n🏁 ${(duration / 1000).toFixed(1)}s | ${stepCount} adım | ✓${successSteps} ✗${failedSteps}`);

      return {
        success: testComplete && !bugDetected && !manualReviewReason && failedSteps === 0,
        bugDetected,
        bugDescription,
        manualReview: !!manualReviewReason,
        manualReviewReason,
        totalSteps: stepCount,
        failedSteps,
        successSteps,
        duration,
      };
    } catch (error) {
      console.error(`❌ Kritik: ${error.message}`);
      return {
        success: false,
        bugDetected: false,
        bugDescription: null,
        totalSteps: this.steps.length,
        failedSteps: this.steps.filter((s) => !s.success).length,
        successSteps: this.steps.filter((s) => s.success).length,
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

  async _captureStepArtifacts(stepLabel) {
    const cleanPath = await this._takeScreenshot(stepLabel);
    const elements = await this._extractInteractiveElements();
    const annotatedPath = await this._annotateScreenshot(cleanPath, elements, stepLabel);
    return { cleanPath, annotatedPath, elements };
  }

  async _extractInteractiveElements() {
    const raw = await this.page.evaluate((maxElements) => {
      const selector = 'input:not([type="hidden"]), textarea, select, button, a[href], [role="button"], [role="link"], [role="combobox"], [role="listbox"], [role="menuitem"]';
      const nodes = Array.from(document.querySelectorAll(selector));
      const isVisible = (el) => {
        const style = window.getComputedStyle(el);
        if (style.visibility === 'hidden' || style.display === 'none') return false;
        const r = el.getBoundingClientRect();
        return r.width > 5 && r.height > 5 && r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;
      };
      const getText = (el) => (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 120);
      const out = [];
      for (const el of nodes) {
        if (!isVisible(el)) continue;
        const rect = el.getBoundingClientRect();
        const attrs = {
          tag: el.tagName.toLowerCase(),
          id: el.id || '',
          name: el.getAttribute('name') || '',
          placeholder: el.getAttribute('placeholder') || '',
          testId: el.getAttribute('data-testid') || '',
          ariaLabel: el.getAttribute('aria-label') || '',
          role: el.getAttribute('role') || '',
          text: getText(el),
          label: (el.labels && el.labels[0] ? (el.labels[0].innerText || '').trim() : ''),
        };
        const options = attrs.tag === 'select'
          ? Array.from(el.options).slice(0, 20).map((o) => ({ value: o.value, text: (o.text || '').trim().slice(0, 60) }))
          : null;
        out.push({
          attrs,
          bbox: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
          options,
        });
        if (out.length >= maxElements) break;
      }
      return out;
    }, CONFIG.maxInteractiveElements);
    return raw.map((item, idx) => this._decorateElement(idx + 1, item));
  }

  _decorateElement(elementId, item) {
    const { attrs, bbox, options } = item;
    const escaped = (v) => String(v || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const roleTextSelector = attrs.role && attrs.text ? `[role="${escaped(attrs.role)}"]:has-text("${escaped(attrs.text.slice(0, 50))}")` : null;
    const selectors = [
      attrs.id ? `#${escaped(attrs.id)}` : null,
      attrs.testId ? `[data-testid="${escaped(attrs.testId)}"]` : null,
      attrs.name ? `${attrs.tag}[name="${escaped(attrs.name)}"]` : null,
      attrs.placeholder ? `${attrs.tag}[placeholder="${escaped(attrs.placeholder)}"]` : null,
      attrs.ariaLabel ? `${attrs.tag}[aria-label="${escaped(attrs.ariaLabel)}"]` : null,
      roleTextSelector,
    ].filter(Boolean);
    return {
      elementId,
      tag: attrs.tag,
      text: attrs.text,
      label: attrs.label,
      testId: attrs.testId || null,
      css: selectors[0] || null,
      xpath: attrs.id ? `//*[@id="${attrs.id}"]` : attrs.name ? `//${attrs.tag}[@name="${attrs.name}"]` : `//${attrs.tag}`,
      nameSelector: attrs.name ? `${attrs.tag}[name="${escaped(attrs.name)}"]` : null,
      roleTextSelector,
      selectors,
      bbox,
      options,
    };
  }

  _buildPageContext(elements) {
    return elements.map((el) => {
      const opts = el.options?.length ? ` options=[${el.options.slice(0, 6).map((o) => `${o.text}:${o.value}`).join(', ')}]` : '';
      return `#${el.elementId} ${el.tag} label="${el.label || ''}" text="${(el.text || '').slice(0, 80)}" css="${el.css || ''}" bbox=${el.bbox.x},${el.bbox.y},${el.bbox.width},${el.bbox.height}${opts}`;
    }).join('\n');
  }

  _labelForElement(el) {
    return [el.label, el.text, el.tag].find((v) => v && String(v).trim()) || `element-${el.elementId}`;
  }

  async _annotateScreenshot(cleanPath, elements, stepLabel) {
    const label = String(stepLabel).padStart(3, '0');
    const annotatedPath = path.join(CONFIG.screenshotDir, `run_${this.testRunId}_step_${label}_annotated.png`);
    const image = sharp(cleanPath);
    const meta = await image.metadata();
    const width = meta.width || 1280;
    const height = meta.height || 720;
    const boxes = elements.map((el) => {
      const x = Math.max(0, Math.min(width - 1, el.bbox.x));
      const y = Math.max(0, Math.min(height - 1, el.bbox.y));
      const w = Math.max(1, Math.min(width - x, el.bbox.width));
      const h = Math.max(1, Math.min(height - y, el.bbox.height));
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#22c55e" stroke-width="2"/>
<rect x="${x}" y="${Math.max(0, y - 20)}" width="${24 + String(el.elementId).length * 8}" height="18" fill="#2563eb"/>
<text x="${x + 6}" y="${Math.max(12, y - 7)}" font-size="12" fill="#ffffff" font-family="Arial" font-weight="700">${el.elementId}</text>`;
    }).join('');
    const svg = Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${boxes}</svg>`);
    await image.composite([{ input: svg, top: 0, left: 0 }]).png().toFile(annotatedPath);
    return annotatedPath;
  }

  async _takeScreenshot(stepLabel) {
    const label = String(stepLabel).padStart(3, '0');
    const screenshotPath = path.join(CONFIG.screenshotDir, `run_${this.testRunId}_step_${label}.png`);
    await this.page.screenshot({ path: screenshotPath, fullPage: false });
    return screenshotPath;
  }

  _validateDecision(decision) {
    if (!decision || typeof decision !== 'object') return false;
    const valid = ['navigate', 'click', 'fill', 'select', 'type', 'press', 'wait', 'scroll', 'hover', 'verify'];
    if (!valid.includes(decision.action)) return false;
    if (['click', 'fill', 'select', 'type', 'hover'].includes(decision.action) && !decision.target && !decision.elementId) return false;
    if (['fill', 'type'].includes(decision.action) && decision.value == null) return false;
    if (typeof decision.confidence !== 'number') decision.confidence = 0.5;
    return true;
  }

  _resolveDecisionWithElement(decision, elements) {
    if (!decision.elementId) return decision;
    const matched = elements.find((el) => el.elementId === decision.elementId);
    if (!matched) return decision;
    const fallbackSelectors = [...new Set([...(matched.selectors || []), matched.xpath, ...(decision.alternativeSelectors || [])].filter(Boolean))];
    return { ...decision, target: decision.target || fallbackSelectors[0] || null, resolvedElement: matched, alternativeSelectors: fallbackSelectors };
  }

  _isSelectorAction(action) {
    return ['click', 'fill', 'select', 'type', 'hover'].includes(action);
  }

  /** Düşük güvende işlevsiz kesilmesin: scroll/wait/verify/hover/navigate/press serbest — belirsellik sırasında bunlar sık */
  _requiresConfidenceGate(action) {
    return ['click', 'fill', 'select', 'type'].includes(action);
  }

  /** window + PageDown + en büyük scrollable konteyner (SPA ürün listeleri için) */
  async _scrollViewport(value) {
    const parsed = parseInt(String(value ?? '').trim(), 10);
    const px = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 2000) : 520;
    await this.page.evaluate((y) => window.scrollBy(0, y), px).catch(() => {});
    await this.page.keyboard.press('PageDown').catch(() => {});
    await this.page.evaluate((y) => {
      let best = null;
      let score = -1;
      const walk = document.querySelectorAll('*');
      for (let i = 0; i < walk.length; i++) {
        const el = walk[i];
        const st = window.getComputedStyle(el);
        if (st.overflowY !== 'auto' && st.overflowY !== 'scroll') continue;
        if (el.scrollHeight <= el.clientHeight + 4) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width < 120 || rect.height < 160) continue;
        const overlap = rect.height * rect.width;
        if (overlap > score) {
          score = overlap;
          best = el;
        }
      }
      if (best) best.scrollBy(0, y);
    }, px).catch(() => {});
    await this._sleep(160);
  }

  async _executeAction(decision) {
    const startTime = Date.now();
    try {
      await this._executeByDecision(decision, decision.target);
      return { success: true, duration: Date.now() - startTime };
    } catch (error) {
      if (decision.alternativeSelectors?.length) {
        const fallback = await this._tryAlternatives(decision, startTime);
        if (fallback.success) return fallback;
      }
      if (decision.resolvedElement && decision.action === 'click') {
        const clickFallback = await this._clickByBoundingBox(decision.resolvedElement, startTime);
        if (clickFallback.success) return clickFallback;
      }
      return { success: false, duration: Date.now() - startTime, error: error.message };
    }
  }

  async _executeByDecision(decision, selector) {
    switch (decision.action) {
      case 'navigate':
        await this.page.goto(decision.target, { waitUntil: 'domcontentloaded', timeout: CONFIG.navigationTimeout });
        break;
      case 'click':
        await this._safeAction(selector, (l) => l.click());
        break;
      case 'fill':
        await this._safeAction(selector, (l) => l.fill(decision.value || ''));
        break;
      case 'select':
        await this._safeAction(selector, async (l) => {
          const raw = String(decision.value ?? '').trim();
          try { await l.selectOption({ label: raw }); } catch { try { await l.selectOption(raw); } catch { await l.selectOption({ value: raw }); } }
        });
        break;
      case 'type':
        await this._safeAction(selector, (l) => l.pressSequentially(decision.value || '', { delay: 30 }));
        break;
      case 'press':
        await this.page.keyboard.press(decision.value || decision.target);
        break;
      case 'wait':
        await this._sleep(Math.min(parseInt(decision.value, 10) || 1500, 5000));
        break;
      case 'scroll':
        await this._scrollViewport(decision.value);
        break;
      case 'hover':
        await this._safeAction(selector, (l) => l.hover());
        break;
      default:
        break;
    }
  }

  async _selfHealAction(decision, actionResult, userPrompt) {
    let latestResult = actionResult;
    for (let i = 0; i < CONFIG.selfHealingRetries; i++) {
      const retryArtifacts = await this._captureStepArtifacts(`heal_${Date.now()}_${i}`);
      try {
        const retryDecisionRaw = await aiService.analyzeScreenshot(
          retryArtifacts.annotatedPath,
          userPrompt,
          [...this.steps, { ...decision, success: false, errorMsg: latestResult.error }],
          this._buildPageContext(retryArtifacts.elements),
          retryArtifacts.elements.map((el) => ({
            elementId: el.elementId,
            label: this._labelForElement(el),
            selectorHints: [el.css, el.testId, el.nameSelector, el.roleTextSelector].filter(Boolean),
          }))
        );
        const retryDecision = this._resolveDecisionWithElement(retryDecisionRaw, retryArtifacts.elements);
        if (!this._validateDecision(retryDecision)) continue;
        latestResult = await this._executeAction(retryDecision);
        if (latestResult.success) return latestResult;
      } catch (e) {
        latestResult = { success: false, duration: 0, error: e.message };
      }
      if (decision.resolvedElement && decision.action === 'click') {
        const bbResult = await this._clickByBoundingBox(decision.resolvedElement, Date.now());
        if (bbResult.success) return bbResult;
      }
    }
    return latestResult;
  }

  async _safeAction(selector, actionFn) {
    if (!selector) throw new Error('Selector boş');
    const locator = this.page.locator(selector).first();
    await locator.waitFor({ state: 'visible', timeout: CONFIG.actionTimeout });
    await locator.scrollIntoViewIfNeeded();
    await actionFn(locator);
  }

  async _tryAlternatives(decision, startTime) {
    for (const alt of decision.alternativeSelectors) {
      try {
        await this._executeByDecision(decision, alt);
        return { success: true, duration: Date.now() - startTime };
      } catch {}
    }
    return { success: false, duration: Date.now() - startTime, error: 'Tüm selectorlar başarısız' };
  }

  async _clickByBoundingBox(element, startTime) {
    try {
      const centerX = element.bbox.x + Math.floor(element.bbox.width / 2);
      const centerY = element.bbox.y + Math.floor(element.bbox.height / 2);
      await this.page.mouse.click(centerX, centerY);
      return { success: true, duration: Date.now() - startTime };
    } catch (e) {
      return { success: false, duration: Date.now() - startTime, error: e.message };
    }
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
          target: decision.target || (decision.elementId ? `elementId:${decision.elementId}` : null),
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

  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

module.exports = new BrowserAgentAI();
