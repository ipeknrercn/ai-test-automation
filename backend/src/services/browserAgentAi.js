// src/services/browserAgentAI.js
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs').promises;
const prisma = require('../config/database');
const aiService = require('./aiService');

// ═══════════════════════════════════════════════════════════════════════════
// YAPILANDIRMA
// ═══════════════════════════════════════════════════════════════════════════
const CONFIG = {
  maxSteps: 20,          // Sonsuz döngüye karşı güvenlik sınırı
  minConfidence: 0.5,    // Bu skorun altındaysa adım yine de denenir ama uyarı verilir
  stepDelayMs: 1000,     // Her adım arasında bekleme (sayfa yüklenmesi için)
  screenshotDir: path.join(__dirname, '../../test-results/screenshots'),
  headless: false,       // true yapılırsa tarayıcı görünmez (CI/CD için)
  slowMo: 300,           // Adımları gözle takip edebilmek için yavaşlatma (ms)
  viewport: { width: 1280, height: 800 },
};

// ═══════════════════════════════════════════════════════════════════════════
// BROWSER AGENT AI
// ═══════════════════════════════════════════════════════════════════════════
class BrowserAgentAI {

  constructor() {
    this.browser = null;
    this.page = null;
    this.testRunId = null;
    this.steps = []; // O ana kadar atılan adımların hafızası (AI'a context olarak gönderilir)
  }

  // ───────────────────────────────────────────────────────────────────────
  // ANA METOD: Dışarıdan çağrılan tek giriş noktası
  // ───────────────────────────────────────────────────────────────────────
  async executeTest(testRunId, userPrompt, targetUrl) {
    this.testRunId = testRunId;
    this.steps = [];
    const startTime = Date.now();

    try {
      // 1. Tarayıcıyı başlat
      await this._initBrowser();

      // 2. Screenshot klasörünün varlığından emin ol
      await fs.mkdir(CONFIG.screenshotDir, { recursive: true });

      // 3. Hedef URL'ye git (döngü başlamadan ilk navigasyon)
      if (targetUrl) {
        await this.page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
        console.log(`🌐 Hedef URL'ye gidildi: ${targetUrl}`);
      }

      // 4. Ana AI döngüsü
      let stepCount = 0;
      let testComplete = false;

      while (!testComplete && stepCount < CONFIG.maxSteps) {
        stepCount++;
        console.log(`\n${'─'.repeat(50)}`);
        console.log(`📍 ADIM ${stepCount} / ${CONFIG.maxSteps}`);
        console.log(`${'─'.repeat(50)}`);

        // 4.1 Ekran görüntüsü al
        const screenshotPath = await this._takeScreenshot(stepCount);

        // 4.2 AI'a gönder, karar al
        const decision = await aiService.analyzeScreenshot(
          screenshotPath,
          userPrompt,
          this.steps  // Önceki adımlar context olarak gönderiliyor
        );

        console.log(`🤖 AI Kararı:`);
        console.log(`   Action    : ${decision.action}`);
        console.log(`   Target    : ${decision.target || '-'}`);
        console.log(`   Value     : ${decision.value || '-'}`);
        console.log(`   Confidence: ${(decision.confidence * 100).toFixed(0)}%`);
        console.log(`   Reasoning : ${decision.reasoning}`);

        if (decision.confidence < CONFIG.minConfidence) {
          console.log(`⚠️  Düşük güven skoru (${(decision.confidence * 100).toFixed(0)}%), devam ediliyor...`);
        }

        // 4.3 Eylemi gerçekleştir
        const actionResult = await this._executeAction(decision);

        // 4.4 Adımı veritabanına kaydet (Screenshot tablosu + TestStep tablosu)
        const savedStep = await this._saveStep(decision, actionResult, screenshotPath, stepCount);
        this.steps.push(savedStep);

        // 4.5 AI testi tamamlandı mı?
        testComplete = decision.testComplete;
        if (testComplete) {
          console.log(`\n✅ AI testi tamamlandı olarak işaretledi.`);
        }

        // 4.6 Sayfa yüklenmesi için kısa bekleme
        await this._sleep(CONFIG.stepDelayMs);
      }

      // 5. Maksimum adıma ulaşıldı ama tamamlanmadı
      if (stepCount >= CONFIG.maxSteps && !testComplete) {
        console.log(`\n⚠️  Maksimum adım sayısına ulaşıldı (${CONFIG.maxSteps}). Test durduruldu.`);
      }

      const duration = Date.now() - startTime;
      console.log(`\n🏁 Test tamamlandı — Süre: ${(duration / 1000).toFixed(1)}s, Adım: ${stepCount}`);

      return {
        success: testComplete,
        totalSteps: stepCount,
        duration,
      };

    } catch (error) {
      console.error(`\n❌ Test sırasında kritik hata: ${error.message}`);
      return {
        success: false,
        totalSteps: this.steps.length,
        duration: Date.now() - startTime,
        error: error.message,
      };

    } finally {
      // Her koşulda tarayıcıyı kapat, kaynak sızdırma
      await this._closeBrowser();
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  // PRIVATE: Tarayıcıyı başlat
  // ───────────────────────────────────────────────────────────────────────
  async _initBrowser() {
    this.browser = await chromium.launch({
      headless: CONFIG.headless,
      slowMo: CONFIG.slowMo,
    });

    this.page = await this.browser.newPage();
    await this.page.setViewportSize(CONFIG.viewport);

    console.log('✅ Tarayıcı başlatıldı');
  }

  // ───────────────────────────────────────────────────────────────────────
  // PRIVATE: Ekran görüntüsü al ve dosyaya kaydet
  // ───────────────────────────────────────────────────────────────────────
  async _takeScreenshot(stepNumber) {
    const filename = `run_${this.testRunId}_step_${String(stepNumber).padStart(3, '0')}.png`;
    const screenshotPath = path.join(CONFIG.screenshotDir, filename);
    await this.page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`📸 Screenshot alındı: ${filename}`);
    return screenshotPath;
  }

  // ───────────────────────────────────────────────────────────────────────
  // PRIVATE: AI kararını Playwright eylemine çevir
  // ───────────────────────────────────────────────────────────────────────
  async _executeAction(decision) {
    const startTime = Date.now();

    try {
      switch (decision.action) {

        case 'navigate':
          await this.page.goto(decision.target, { waitUntil: 'domcontentloaded' });
          console.log(`   ↳ Sayfaya gidildi: ${decision.target}`);
          break;

        case 'click':
          await this._smartClick(decision);
          console.log(`   ↳ Tıklandı: ${decision.target}`);
          break;

        case 'fill':
          await this.page.fill(decision.target, decision.value || '');
          console.log(`   ↳ Dolduruldu: ${decision.target} = "${decision.value}"`);
          break;

        case 'type':
          await this.page.type(decision.target, decision.value || '', { delay: 50 });
          console.log(`   ↳ Yazıldı: ${decision.target} = "${decision.value}"`);
          break;

        case 'press':
          await this.page.keyboard.press(decision.value || decision.target);
          console.log(`   ↳ Tuşa basıldı: ${decision.value || decision.target}`);
          break;

        case 'wait':
          const waitMs = parseInt(decision.value) || 2000;
          await this._sleep(waitMs);
          console.log(`   ↳ Beklendi: ${waitMs}ms`);
          break;

        case 'scroll':
          await this.page.evaluate(() => window.scrollBy(0, 400));
          console.log(`   ↳ Kaydırıldı`);
          break;

        case 'hover':
          await this.page.hover(decision.target);
          console.log(`   ↳ Üzerine gidildi: ${decision.target}`);
          break;

        case 'verify':
          // verify adımında Playwright bir eylem yapmaz,
          // AI sadece ekrana bakıp doğrulama yapar
          console.log(`   ↳ Doğrulama adımı: ${decision.reasoning}`);
          break;

        default:
          console.log(`   ↳ Bilinmeyen action: ${decision.action}`);
      }

      return { success: true, duration: Date.now() - startTime };

    } catch (error) {
      // Birincil selector başarısız olduysa alternatifleri dene
      if (decision.alternativeSelectors?.length) {
        const fallbackResult = await this._tryAlternativeSelectors(decision, startTime);
        if (fallbackResult.success) return fallbackResult;
      }

      console.error(`   ↳ ❌ Eylem başarısız: ${error.message}`);
      return { success: false, duration: Date.now() - startTime, error: error.message };
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  // PRIVATE: Akıllı tıklama — element görünür olana kadar bekle
  // ───────────────────────────────────────────────────────────────────────
  async _smartClick(decision) {
    const locator = this.page.locator(decision.target).first();
    await locator.waitFor({ state: 'visible', timeout: 5000 });
    await locator.click();
  }

  // ───────────────────────────────────────────────────────────────────────
  // PRIVATE: Alternatif selectorları sırayla dene
  // ───────────────────────────────────────────────────────────────────────
  async _tryAlternativeSelectors(decision, startTime) {
    for (const altSelector of decision.alternativeSelectors) {
      try {
        console.log(`   ↳ Alternatif selector deneniyor: ${altSelector}`);
        const altDecision = { ...decision, target: altSelector };
        await this._executeAction(altDecision);
        return { success: true, duration: Date.now() - startTime };
      } catch {
        // Bu da tutmadı, sıradakini dene
      }
    }
    return { success: false, duration: Date.now() - startTime, error: 'Tüm selectorlar başarısız' };
  }

  // ───────────────────────────────────────────────────────────────────────
  // PRIVATE: Adımı veritabanına kaydet
  // Şemana göre: önce Screenshot tablosuna kayıt, sonra TestStep
  // ───────────────────────────────────────────────────────────────────────
  async _saveStep(decision, actionResult, screenshotPath, stepNumber) {
    // 1. Screenshot dosya bilgilerini al
    let screenshotId = null;
    try {
      const stats = await fs.stat(screenshotPath);
      const screenshot = await prisma.screenshot.create({
        data: {
          filePath: screenshotPath,
          fileSize: stats.size,
          format: 'png',
        }
      });
      screenshotId = screenshot.id;
    } catch (err) {
      console.error(`   ↳ Screenshot kaydedilemedi: ${err.message}`);
    }

    // 2. TestStep kaydı oluştur
    const step = await prisma.testStep.create({
      data: {
        testRunId: this.testRunId,
        stepNumber,
        timestamp: new Date(),
        action: decision.action,
        target: decision.target,
        value: decision.value,
        screenshotId,
        aiReasoning: decision.reasoning,
        aiConfidence: decision.confidence,
        success: actionResult.success,
        errorMsg: actionResult.error || null,
        durationMs: actionResult.duration,
      }
    });

    return step;
  }

  // ───────────────────────────────────────────────────────────────────────
  // PRIVATE: Tarayıcıyı kapat
  // ───────────────────────────────────────────────────────────────────────
  async _closeBrowser() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
      console.log('👋 Tarayıcı kapatıldı');
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  // PRIVATE: Bekleme yardımcısı
  // ───────────────────────────────────────────────────────────────────────
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new BrowserAgentAI();