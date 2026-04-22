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
  maxSteps: 20,                // Sonsuz döngüye karşı güvenlik sınırı
  minConfidence: 0.5,          // Bu skorun altındaysa uyarı verilir
  stepDelayMs: 1000,           // Her adım arasında bekleme (sayfa yüklenmesi için)
  screenshotDir: path.join(__dirname, '../../test-results/screenshots'),
  headless: false,             // true yapılırsa tarayıcı görünmez (CI/CD için)
  slowMo: 300,                 // Adımları gözle takip edebilmek için yavaşlatma (ms)
  viewport: { width: 1280, height: 800 },

  // ─── Yeni eklenen ayarlar ───
  navigationTimeout: 15000,    // Sayfa yükleme timeout (ms)
  actionTimeout: 8000,         // Element bekleme timeout (ms)
  maxConsecutiveFailures: 3,   // Ardışık başarısız adım limiti — aşılırsa test durur
  retryOnSelectorFailure: true,// Selector bulunamazsa AI'dan yeni analiz iste
};

// ═══════════════════════════════════════════════════════════════════════════
// BROWSER AGENT AI
// ═══════════════════════════════════════════════════════════════════════════
class BrowserAgentAI {

  constructor() {
    this.browser = null;
    this.page = null;
    this.context = null;
    this.testRunId = null;
    this.steps = [];               // AI'a context olarak gönderilen adım geçmişi
    this.consecutiveFailures = 0;  // Ardışık başarısızlık sayacı
  }

  // ───────────────────────────────────────────────────────────────────────
  // ANA METOD: Dışarıdan çağrılan tek giriş noktası
  // ───────────────────────────────────────────────────────────────────────
  async executeTest(testRunId, userPrompt, targetUrl) {
    this.testRunId = testRunId;
    this.steps = [];
    this.consecutiveFailures = 0;
    const startTime = Date.now();

    try {
      // 1. Tarayıcıyı başlat
      await this._initBrowser();

      // 2. Screenshot klasörünün varlığından emin ol
      await fs.mkdir(CONFIG.screenshotDir, { recursive: true });

      // 3. Hedef URL'ye git (döngü başlamadan ilk navigasyon)
      if (targetUrl) {
        await this.page.goto(targetUrl, {
          waitUntil: 'domcontentloaded',
          timeout: CONFIG.navigationTimeout,
        });
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

        // 4.1 Ardışık başarısızlık kontrolü
        if (this.consecutiveFailures >= CONFIG.maxConsecutiveFailures) {
          console.log(`\n🛑 ${CONFIG.maxConsecutiveFailures} ardışık başarısızlık — test durduruluyor.`);
          break;
        }

        // ──────────────────────────────────────────────────────────
        // SCREENSHOT AKIŞI:
        //   1. Eylem ÖNCE screenshot al → AI'a gönder (analiz için)
        //   2. AI karar verir, eylemi yap
        //   3. Eylem SONRA screenshot al → DB'ye kaydet (kullanıcı bunu görür)
        // ──────────────────────────────────────────────────────────

        // 4.2 Eylem ÖNCESİ screenshot — AI analiz için kullanacak
        const preScreenshotPath = await this._takeScreenshot(`${stepCount}_pre`);

        // 4.3 AI'a gönder, karar al
        let decision;
        try {
          decision = await aiService.analyzeScreenshot(
            preScreenshotPath,
            userPrompt,
            this.steps
          );
        } catch (aiError) {
          console.error(`❌ AI servisinden yanıt alınamadı: ${aiError.message}`);
          this.consecutiveFailures++;
          continue;
        }

        // 4.4 AI kararını doğrula
        if (!this._validateDecision(decision)) {
          console.error(`❌ AI geçersiz karar döndürdü, adım atlanıyor.`);
          this.consecutiveFailures++;
          continue;
        }

        console.log(`🤖 AI Kararı:`);
        console.log(`   Action    : ${decision.action}`);
        console.log(`   Target    : ${decision.target || '-'}`);
        console.log(`   Value     : ${decision.value || '-'}`);
        console.log(`   Confidence: ${(decision.confidence * 100).toFixed(0)}%`);
        console.log(`   Reasoning : ${decision.reasoning}`);

        if (decision.confidence < CONFIG.minConfidence) {
          console.log(`⚠️  Düşük güven skoru (${(decision.confidence * 100).toFixed(0)}%)`);
        }

        // 4.5 Eylemi gerçekleştir
        let actionResult = await this._executeAction(decision);

        // 4.6 Selector hatası + retry mekanizması
        if (!actionResult.success && CONFIG.retryOnSelectorFailure && this._isSelectorAction(decision.action)) {
          console.log(`🔄 Selector başarısız oldu, AI'dan yeniden analiz isteniyor...`);
          const retryScreenshot = await this._takeScreenshot(`${stepCount}_retry`);
          try {
            const retryDecision = await aiService.analyzeScreenshot(
              retryScreenshot,
              userPrompt,
              [
                ...this.steps,
                {
                  action: decision.action,
                  target: decision.target,
                  success: false,
                  errorMsg: actionResult.error,
                  note: 'Bu selector çalışmadı, lütfen alternatif bir selector belirle.',
                },
              ]
            );
            if (this._validateDecision(retryDecision)) {
              console.log(`🔄 Retry kararı: ${retryDecision.action} → ${retryDecision.target}`);
              actionResult = await this._executeAction(retryDecision);
              if (actionResult.success) {
                decision = retryDecision;
              }
            }
          } catch (retryError) {
            console.error(`   ↳ Retry analizi başarısız: ${retryError.message}`);
          }
        }

        // 4.7 Eylem SONRASI screenshot — kullanıcının göreceği asıl kanıt
        let resultScreenshotPath = preScreenshotPath; // Fallback: eylem öncesi
        if (actionResult.success && decision.action !== 'verify' && decision.action !== 'wait') {
          try {
            await this._sleep(400); // Sayfanın değişikliği render etmesini bekle
            resultScreenshotPath = await this._takeScreenshot(stepCount);
            console.log(`📸 Eylem sonrası screenshot alındı.`);
          } catch (err) {
            console.error(`📸 Post-action screenshot alınamadı, pre-action kullanılacak: ${err.message}`);
          }
        } else {
          // Başarısız eylem veya verify/wait → pre-action screenshot'ı kaydet
          // (sayfa değişmemiş, pre = post)
        }

        // 4.8 Ardışık başarısızlık sayacını güncelle
        if (actionResult.success) {
          this.consecutiveFailures = 0;
        } else {
          this.consecutiveFailures++;
          console.log(`   ↳ Ardışık başarısızlık: ${this.consecutiveFailures}/${CONFIG.maxConsecutiveFailures}`);
        }

        // 4.9 Adımı veritabanına kaydet — resultScreenshotPath eylem SONRASINI gösterir
        const savedStep = await this._saveStep(decision, actionResult, resultScreenshotPath, stepCount);
        this.steps.push(savedStep);

        // 4.10 AI testi tamamlandı mı?
        testComplete = decision.testComplete === true;
        if (testComplete) {
          console.log(`\n✅ AI testi tamamlandı olarak işaretledi.`);
        }

        // 4.11 Sayfa yüklenmesi için kısa bekleme
        await this._sleep(CONFIG.stepDelayMs);
      }

      // 5. Son durum screenshot'ı — testin nasıl bittiğinden bağımsız olarak her zaman al
      try {
        await this._sleep(500); // Sayfanın son durumunun tamamen yüklenmesini bekle
        const finalScreenshotPath = await this._takeScreenshot('final');
        
        // Son screenshot'ı da veritabanına kaydet
        const finalStats = await fs.stat(finalScreenshotPath);
        await prisma.screenshot.create({
          data: {
            filePath: finalScreenshotPath,
            fileSize: finalStats.size,
            format: 'png',
          },
        });
        console.log(`📸 Son durum screenshot'ı kaydedildi.`);
      } catch (err) {
        console.error(`📸 Son screenshot alınamadı: ${err.message}`);
      }

      // 6. Sonuç değerlendirmesi
      if (stepCount >= CONFIG.maxSteps && !testComplete) {
        console.log(`\n⚠️  Maksimum adım sayısına ulaşıldı (${CONFIG.maxSteps}). Test durduruldu.`);
      }

      const duration = Date.now() - startTime;
      const failedSteps = this.steps.filter(s => !s.success).length;

      console.log(`\n🏁 Test tamamlandı — Süre: ${(duration / 1000).toFixed(1)}s, Adım: ${stepCount}, Başarısız: ${failedSteps}`);

      return {
        success: testComplete,
        totalSteps: stepCount,
        failedSteps,
        duration,
      };

    } catch (error) {
      console.error(`\n❌ Test sırasında kritik hata: ${error.message}`);
      return {
        success: false,
        totalSteps: this.steps.length,
        failedSteps: this.steps.filter(s => !s.success).length,
        duration: Date.now() - startTime,
        error: error.message,
      };

    } finally {
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
      args: ['--start-maximized'],
    });

    this.context = await this.browser.newContext({
      viewport: null, // Pencere boyutunu takip eder
    });

    this.page = await this.context.newPage();

    // Global timeout — herhangi bir locator.click/fill/vb. bu sürede bulamazsa hata verir
    this.page.setDefaultTimeout(CONFIG.actionTimeout);

    await this.page.bringToFront();
    console.log('✅ Tarayıcı başlatıldı');
  }

  // ───────────────────────────────────────────────────────────────────────
  // PRIVATE: Ekran görüntüsü al ve dosyaya kaydet
  // ───────────────────────────────────────────────────────────────────────
  async _takeScreenshot(stepLabel) {
    const label = String(stepLabel).padStart(3, '0');
    const filename = `run_${this.testRunId}_step_${label}.png`;
    const screenshotPath = path.join(CONFIG.screenshotDir, filename);

    try {
      await this.page.screenshot({ path: screenshotPath, fullPage: false });
      console.log(`📸 Screenshot alındı: ${filename}`);
    } catch (err) {
      console.error(`📸 Screenshot alınamadı: ${err.message}`);
    }

    return screenshotPath;
  }

  // ───────────────────────────────────────────────────────────────────────
  // PRIVATE: AI kararını doğrula — geçersiz kararlarla çökmesini engeller
  // ───────────────────────────────────────────────────────────────────────
  _validateDecision(decision) {
    if (!decision || typeof decision !== 'object') {
      console.error('   ↳ Doğrulama hatası: decision null veya object değil');
      return false;
    }

    const validActions = [
      'navigate', 'click', 'fill', 'select', 'type',
      'press', 'wait', 'scroll', 'hover', 'verify',
    ];

    if (!validActions.includes(decision.action)) {
      console.error(`   ↳ Doğrulama hatası: bilinmeyen action "${decision.action}"`);
      return false;
    }

    // Selector gerektiren action'larda target zorunlu
    const needsTarget = ['click', 'fill', 'select', 'type', 'hover', 'navigate'];
    if (needsTarget.includes(decision.action) && !decision.target) {
      console.error(`   ↳ Doğrulama hatası: "${decision.action}" için target gerekli ama boş`);
      return false;
    }

    // fill ve type action'larında value zorunlu
    if (['fill', 'type'].includes(decision.action) && decision.value == null) {
      console.error(`   ↳ Doğrulama hatası: "${decision.action}" için value gerekli ama boş`);
      return false;
    }

    // confidence sayısal olmalı
    if (typeof decision.confidence !== 'number' || decision.confidence < 0 || decision.confidence > 1) {
      console.warn(`   ↳ Uyarı: confidence geçersiz (${decision.confidence}), 0.5 olarak ayarlandı`);
      decision.confidence = 0.5;
    }

    return true;
  }

  // ───────────────────────────────────────────────────────────────────────
  // PRIVATE: Bir action'ın selector'a bağımlı olup olmadığını kontrol et
  // ───────────────────────────────────────────────────────────────────────
  _isSelectorAction(action) {
    return ['click', 'fill', 'select', 'type', 'hover'].includes(action);
  }

  // ───────────────────────────────────────────────────────────────────────
  // PRIVATE: AI kararını Playwright eylemine çevir
  // ───────────────────────────────────────────────────────────────────────
  async _executeAction(decision) {
    const startTime = Date.now();

    try {
      switch (decision.action) {

        case 'navigate':
          await this.page.goto(decision.target, {
            waitUntil: 'domcontentloaded',
            timeout: CONFIG.navigationTimeout,
          });
          console.log(`   ↳ Sayfaya gidildi: ${decision.target}`);
          break;

        case 'click':
          await this._safeLocatorAction(decision.target, async (locator) => {
            await locator.click();
          });
          console.log(`   ↳ Tıklandı: ${decision.target}`);
          break;

        case 'fill':
          await this._safeLocatorAction(decision.target, async (locator) => {
            await locator.fill(decision.value || '');
          });
          console.log(`   ↳ Dolduruldu: ${decision.target} = "${decision.value}"`);
          break;

        case 'select':
          await this._safeLocatorAction(decision.target, async (locator) => {
            await locator.selectOption(decision.value || '');
          });
          console.log(`   ↳ Seçildi: ${decision.target} = "${decision.value}"`);
          break;

        case 'type':
          await this._safeLocatorAction(decision.target, async (locator) => {
            await locator.pressSequentially(decision.value || '', { delay: 50 });
          });
          console.log(`   ↳ Yazıldı: ${decision.target} = "${decision.value}"`);
          break;

        case 'press':
          await this.page.keyboard.press(decision.value || decision.target);
          console.log(`   ↳ Tuşa basıldı: ${decision.value || decision.target}`);
          break;

        case 'wait': {
          const waitMs = Math.min(parseInt(decision.value) || 2000, 10000); // Max 10s güvenlik
          await this._sleep(waitMs);
          console.log(`   ↳ Beklendi: ${waitMs}ms`);
          break;
        }

        case 'scroll':
          await this.page.evaluate(() => window.scrollBy(0, 400));
          console.log(`   ↳ Kaydırıldı`);
          break;

        case 'hover':
          await this._safeLocatorAction(decision.target, async (locator) => {
            await locator.hover();
          });
          console.log(`   ↳ Üzerine gidildi: ${decision.target}`);
          break;

        case 'verify':
          console.log(`   ↳ Doğrulama adımı: ${decision.reasoning}`);
          break;

        default:
          // _validateDecision bunu zaten yakalar ama savunmacı olarak burada da var
          console.log(`   ↳ Bilinmeyen action: ${decision.action}`);
      }

      return { success: true, duration: Date.now() - startTime };

    } catch (error) {
      // Alternatif selectorları dene (recursive olmadan)
      if (decision.alternativeSelectors?.length) {
        const fallbackResult = await this._tryAlternativeSelectors(decision, startTime);
        if (fallbackResult.success) return fallbackResult;
      }

      console.error(`   ↳ ❌ Eylem başarısız: ${error.message}`);
      return { success: false, duration: Date.now() - startTime, error: error.message };
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  // PRIVATE: Element üzerinde güvenli işlem — görünür olana kadar bekler
  //          Tüm selector-bağımlı action'lar bu metodu kullanır
  // ───────────────────────────────────────────────────────────────────────
  async _safeLocatorAction(selector, actionFn) {
    const locator = this.page.locator(selector).first();

    // Elementin DOM'da ve görünür olmasını bekle
    await locator.waitFor({ state: 'visible', timeout: CONFIG.actionTimeout });

    // Eylemi gerçekleştir
    await actionFn(locator);
  }

  // ───────────────────────────────────────────────────────────────────────
  // PRIVATE: Alternatif selectorları sırayla dene (RECURSIVE OLMADAN)
  //          alternativeSelectors kaldırılarak _executeAction'a gönderilir
  // ───────────────────────────────────────────────────────────────────────
  async _tryAlternativeSelectors(decision, startTime) {
    for (const altSelector of decision.alternativeSelectors) {
      try {
        console.log(`   ↳ Alternatif selector deneniyor: ${altSelector}`);

        // ÖNEMLİ: alternativeSelectors'ı kaldırıyoruz ki recursive çağrı olmasın
        const altDecision = {
          ...decision,
          target: altSelector,
          alternativeSelectors: [], // ← Sonsuz döngüyü engelleyen kritik satır
        };

        const result = await this._executeAction(altDecision);
        if (result.success) {
          console.log(`   ↳ ✅ Alternatif selector başarılı: ${altSelector}`);
          return { success: true, duration: Date.now() - startTime };
        }
      } catch {
        // Bu selector da tutmadı, sıradakini dene
      }
    }

    return { success: false, duration: Date.now() - startTime, error: 'Tüm selectorlar başarısız' };
  }

  // ───────────────────────────────────────────────────────────────────────
  // PRIVATE: Adımı veritabanına kaydet
  //          screenshotPath = eylem SONRASI screenshot (eylemin sonucunu gösterir)
  // ───────────────────────────────────────────────────────────────────────
  async _saveStep(decision, actionResult, screenshotPath, stepNumber) {
    // 1. Screenshot kaydı
    let screenshotId = null;
    try {
      const stats = await fs.stat(screenshotPath);
      const screenshot = await prisma.screenshot.create({
        data: {
          filePath: screenshotPath,
          fileSize: stats.size,
          format: 'png',
        },
      });
      screenshotId = screenshot.id;
    } catch (err) {
      console.error(`   ↳ Screenshot DB kaydı başarısız: ${err.message}`);
    }

    // 2. TestStep kaydı
    let step;
    try {
      step = await prisma.testStep.create({
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
      console.error(`   ↳ TestStep DB kaydı başarısız: ${err.message}`);
      step = {
        action: decision.action,
        target: decision.target,
        value: decision.value,
        success: actionResult.success,
        errorMsg: actionResult.error || null,
        aiReasoning: decision.reasoning,
        aiConfidence: decision.confidence,
      };
    }

    return step;
  }

  // ───────────────────────────────────────────────────────────────────────
  // PRIVATE: Tarayıcıyı kapat
  // ───────────────────────────────────────────────────────────────────────
  async _closeBrowser() {
    try {
      if (this.context) {
        await this.context.close();
        this.context = null;
      }
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }
      this.page = null;
      console.log('👋 Tarayıcı kapatıldı');
    } catch (err) {
      console.error(`👋 Tarayıcı kapatılırken hata: ${err.message}`);
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