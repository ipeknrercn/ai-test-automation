// src/services/aiService.js
const Anthropic = require('@anthropic-ai/sdk');
const { readFile } = require('fs').promises;

const VALID_ACTIONS = [
  'navigate', 'click', 'fill', 'type', 'wait',
  'verify', 'press', 'scroll', 'hover', 'select',
];

// ═══════════════════════════════════════════════════════════════════════════
// SİSTEM PROMPT — PRODUCTION SEVİYESİ
// Amaç: AI'ı promptun kalitesinden BAĞIMSIZ olarak doğru çalıştırmak
// ═══════════════════════════════════════════════════════════════════════════
const SYSTEM_PROMPT = `Sen profesyonel bir QA Test Otomasyon ajanısın. Web uygulamalarını Playwright ile test ediyorsun.

═══ TEMEL DAVRANIŞ ═══
Kullanıcının test senaryosunu yorumlarken HER ZAMAN şu sırayla düşün:
1. Şu anda hangi sayfadayım? (Ekran görüntüsünden anla)
2. Senaryonun hangi noktasındayım? (Önceki adımlardan anla)
3. SONRAKİ TEK adım ne olmalı?
4. Bu adımı yapmak için sayfada hangi element var?
5. Mesajda "SAYFA YAPISI ÖZETİ" varsa: doğru input/select için name, id, label, placeholder ile eşleştirerek seçici yaz — böylece yanlış alana yazmayı azaltırsın.

═══ KRİTİK KURAL: SADECE GÖRDÜĞÜNE GÜVEN ═══
Kullanıcı promptunda gelecek adımlardan bahsetse bile:
- Şu anda ekranda görmediğin elementlere ASLA müdahale etme
- Henüz açılmamış formlardaki alanları doldurmaya kalkma
- Her adımda yalnızca o anda ekranda görünen ve hazır olan bir elementle etkileş
- Bir input alanını doldurduktan SONRA aynı alanı tekrar dolduruyorsan DUR — yanlış selector kullanıyorsun demektir

═══ JSON FORMATI (SADECE BU FORMAT, BAŞKA BİR ŞEY YAZMA) ═══
{
  "action": "navigate|click|fill|type|select|press|wait|scroll|hover|verify",
  "elementId": 12,
  "target": "Playwright selector veya URL",
  "value": "değer (fill/type/select/wait/press için)",
  "reasoning": "Neden bu adım, hangi elementi hedefliyorsun, neden bu selector",
  "confidence": 0.95,
  "testComplete": false,
  "bugDetected": false,
  "bugDescription": null,
  "alternativeSelectors": ["alt1", "alt2", "alt3"]
}

Notlar:
- Mümkünse action için target yerine elementId seç (Set-of-Mark numarası).
- navigate / press / wait / scroll / verify için elementId null olabilir.

═══ KAYDIRMA (scroll) — KATALOG / ÜRÜN LİSTESİ ═══
- Daha fazla ürün, fiyat veya buton için ekranın altındaki içeriği görmek istiyorsan: action "scroll" kullan (target=null, isteğe bağlı value = piksel, örn. 600).
- Belirsiz fiyat/tekrar yargı yazıp düşük confidence verme: önce bir kez scroll yap, sonra görünür ürünlerde seçim yap.
- scroll keşif adımıdır; scroll için bile confidence 0.88+ verebilirsin (yanlış tıklamadan güvenli).

═══ DROPDOWN KILAVUZU (ÇOK ÖNEMLİ) ═══
Kullanıcı "seç", "olarak seç", "seçeneğini seç" dediğinde:
1. Sayfada <select> elementi varsa → MUTLAKA "select" action, ASLA click kullanma
2. <select> için value = option'ın value attribute veya görünen metin
3. Custom dropdown (div/ul tabanlı) ise: önce container'a click, sonra option'a click
4. Native <select> dropdown'ı click ile açma — açılınca screenshot alınamaz, timeout olur

═══ TARİH ALANLARI İÇİN AYIRT ETME KURALLARI ═══
Bir formda birden fazla tarih input'u olduğunda (From Date, To Date gibi):
1. Etiket bazlı selector kullan: input yakınındaki label metnine göre seç
   - Doğru: input[placeholder='yyyy-dd-mm']:near(:text("From Date"))
   - Doğru: //label[contains(text(),'From Date')]/following::input[1]
   - Doğru: [data-testid="from-date"], #from-date
2. ASLA :last-of-type, :first-of-type gibi pozisyon-bazlı selector kullanma — yanlış input'u hedefler
3. Bir input'u doldurduktan sonra doğrulama yap: ekran görüntüsünde o alanın gerçekten dolduğunu gör
4. Eğer From Date dolu ve To Date boşsa, To Date'e yaz; ASLA From Date'i tekrar yazma

═══ DOĞRULAMA (verify) ADIMI ═══
Kullanıcı "doğrula", "göründüğünü kontrol et", "olduğunu onayla" dediğinde:
- action: "verify" kullan
- target: null veya doğrulanacak elementin selector'u
- reasoning: Ekranda ne gördüğünü detaylı yaz
- testComplete: true (doğrulama başarılıysa)
- Beklenen metin/durum görünüyorsa BAŞARILI bir verify yaz, sonra testComplete: true
- Görünmüyorsa: önce wait (2000ms) dene, sonra tekrar verify

═══ TEST TAMAMLAMA KURALLARI ═══
testComplete: true yap SADECE:
- Kullanıcının istediği TÜM adımlar başarıyla yapıldıysa
- Doğrulama adımında beklenen durum görüldüyse
- Bug tespit edildiyse (bugDetected: true ile birlikte)
- Devam edilemez bir engelle karşılaşıldıysa

═══ BUG TESPİTİ ═══
bugDetected: true yap SADECE:
- Uygulama yanlış davranıyor (beklenmeyen hata mesajı, eksik element, yanlış sonuç)
- bugDescription'a hatayı açıkça yaz
DİKKAT: Selector bulunamaması BUG DEĞİLDİR. Bu agent hatasıdır, alternatif selector dene.

═══ SELECTOR ÖNCELİK SIRASI ═══
1. ID: #login-button
2. data-testid: [data-testid="username"]
3. Name: input[name="email"]
4. Role + text: button:has-text("Apply"), a:has-text("Login")
5. Placeholder: input[placeholder="Username"]
6. Yakın label ile: //label[text()="From Date"]/following::input[1]

ASLA:
- :nth-child, :nth-of-type, :last-of-type kullanma (kırılgan)
- div > div > div gibi yapısal yollar kullanma (kırılgan)
- Aynı başarısız selector'ı tekrar deneme

═══ BAŞARISIZ ADIM SONRASI ═══
Önceki adımda bir selector başarısız olduysa:
1. Aynı selector'ı KULLANMA
2. alternativeSelectors'a en az 3 farklı strateji koy
3. reasoning'de "önceki X başarısız oldu, şimdi Y deniyorum" yaz

═══ ACTION REFERANSI ═══
- click: butona/linke tıkla
- fill: input'u temizle ve doldur (form field için tercih et)
- type: harf harf yaz (özel karakterli alanlar için)
- select: native <select> dropdown'dan seç
- navigate: URL'ye git
- press: klavye tuşu (Enter, Tab, Escape)
- wait: bekle (max 5000ms)
- scroll: aşağı kaydır
- hover: üzerine gel
- verify: ekranı gözlemle, eylem yapma

═══ GENEL ═══
- Sadece JSON döndür, başka hiçbir şey yazma
- Markdown, açıklama, yorum YOK
- Her adım yalnızca BİR eylem
- confidence: gerçekten emin olduğun kadar (0.5+ için emin ol, 0.9+ için kesin)`;

// ═══════════════════════════════════════════════════════════════════════════
class AIService {
  constructor() {
    if (!process.env.CLAUDE_API_KEY) throw new Error('CLAUDE_API_KEY bulunamadı!');
    this.client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });
    this.model = 'claude-sonnet-4-20250514';
    this.maxRetries = 3;
  }

  /**
   * @param {string} screenshotPath
   * @param {string} userPrompt
   * @param {unknown[]} [previousSteps]
   * @param {string} [pageContext] — Playwright’tan gelen DOM / a11y özeti (model seçicileri doğrulasın diye)
   * @param {Array<{elementId:number,label:string,selectorHints:string[]}>} [elements]
   */
  async analyzeScreenshot(screenshotPath, userPrompt, previousSteps = [], pageContext = '', elements = []) {
    const base64Image = await this._loadScreenshot(screenshotPath);
    const prompt = this._buildPrompt(userPrompt, previousSteps, pageContext, elements);

    let lastError;
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.client.messages.create({
          model: this.model,
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: 'image/png', data: base64Image } },
              { type: 'text', text: prompt },
            ],
          }],
        });
        const rawText = response.content[0]?.text;
        if (!rawText) throw new Error('API boş yanıt döndürdü');
        return this._parseResponse(rawText);
      } catch (error) {
        lastError = error;
        console.error(`   ↳ AI hatası (${attempt}/${this.maxRetries}): ${error.message}`);
        if (attempt < this.maxRetries && this._isRetryable(error)) {
          await this._sleep(1000 * Math.pow(2, attempt - 1));
          continue;
        }
        break;
      }
    }
    throw new Error(`AI ${this.maxRetries} denemede başarısız: ${lastError.message}`);
  }

  async testConnection() {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 20,
        messages: [{ role: 'user', content: 'OK yaz.' }],
      });
      return { success: true, model: this.model, response: response.content[0]?.text };
    } catch (error) {
      return { success: false, model: this.model, error: error.message };
    }
  }

  async _loadScreenshot(filePath) {
    const buffer = await readFile(filePath);
    const sizeMB = buffer.length / (1024 * 1024);
    if (sizeMB > 20) throw new Error(`Screenshot çok büyük: ${sizeMB.toFixed(1)}MB`);
    return buffer.toString('base64');
  }

  // ───────────────────────────────────────────────────────────────────────
  // GELİŞTİRİLMİŞ PROMPT BUILDER
  // - Önceki adımları çok daha açık formatla
  // - Hangi alanın doldurulduğunu net göster
  // - Tekrar eden hataları belirginleştir
  // ───────────────────────────────────────────────────────────────────────
  _buildPrompt(userPrompt, previousSteps, pageContext = '', elements = []) {
    const parts = [];
    parts.push(`══════ TEST SENARYOSU ══════\n${userPrompt}`);

    if (previousSteps.length > 0) {
      parts.push('\n══════ ŞİMDİYE KADAR YAPILANLAR ══════');
      const recent = previousSteps.slice(-10);

      // Form alanı dolum durumu özeti — AI'ın aynı alanı tekrar doldurmasını engellemek için
      const filledTargets = new Set();
      previousSteps.forEach(s => {
        if (s.success && (s.action === 'fill' || s.action === 'type' || s.action === 'select')) {
          if (s.target) filledTargets.add(`${s.target} = "${s.value}"`);
        }
      });

      if (filledTargets.size > 0) {
        parts.push('\n📋 ZATEN DOLDURULMUŞ ALANLAR (tekrar doldurma):');
        filledTargets.forEach(t => parts.push(`   ✓ ${t}`));
      }

      parts.push('\n📜 SON ADIMLAR:');
      recent.forEach((step, i) => {
        const stepNum = previousSteps.length - recent.length + i + 1;
        const status = step.success === false ? '❌' : '✓';
        const target = step.target ? ` → ${step.target}` : '';
        const value = step.value ? ` = "${step.value}"` : '';
        const error = step.errorMsg ? `\n      ⚠️ HATA: ${step.errorMsg}` : '';
        parts.push(`${stepNum}. ${status} ${step.action}${target}${value}${error}`);
      });

      // Son 3 adımda başarısız selector'ları belirginleştir
      const recentFails = recent.filter(s => s.success === false);
      if (recentFails.length > 0) {
        parts.push('\n⚠️  YENİ BAŞARISIZ OLAN SELECTOR\'LAR (bunları KULLANMA):');
        recentFails.forEach(s => {
          if (s.target) parts.push(`   ✗ ${s.target}`);
        });
      }
    }

    parts.push(`\n══════ ŞİMDİ NE YAP ══════
1. Ekran görüntüsünü dikkatlice incele
2. Yukarıdaki adımlara bak — hangi noktasındasın?
3. SADECE ekranda gördüğün ve henüz yapılmamış SONRAKİ TEK adım için JSON döndür
4. Aynı alanı tekrar doldurma, başarısız selector'ı tekrar kullanma`);

    if (pageContext && String(pageContext).trim()) {
      parts.push(`
══════ SAYFA YAPISI ÖZETİ (DOM / erişilebilirlik — seçiciyi doğrula) ══════
Bu metin Playwright ile sayfadan çıkarıldı. Hedef alanı seçerken:
- Özellikle label, name, id, placeholder ve <select> seçenekleri ile eşleştir.
- Görüntü ile çelişki olursa önce görünür metni/etiketi esas al; selector'ı DOM’daki name/id ile netleştir.
${String(pageContext).trim()}`);
    }

    if (elements.length > 0) {
      parts.push('\n══════ NUMARALI ETKİLEŞİM ELEMANLARI (Set-of-Mark) ══════');
      for (const el of elements.slice(0, 80)) {
        const hints = Array.isArray(el.selectorHints) ? el.selectorHints.filter(Boolean).slice(0, 3).join(' | ') : '';
        parts.push(`#${el.elementId}: ${el.label}${hints ? ` | ${hints}` : ''}`);
      }
      parts.push('ÖNEMLİ: Ekrandaki kutu numarasını görüyorsan elementId doldur.');
    }

    return parts.join('\n');
  }

  _parseResponse(text) {
    const clean = text.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '').trim();
    const jsonStart = clean.indexOf('{');
    const jsonEnd = clean.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1) throw new Error(`JSON bulunamadı: "${text.substring(0, 200)}"`);

    let parsed;
    try {
      parsed = JSON.parse(clean.substring(jsonStart, jsonEnd + 1));
    } catch (e) {
      throw new Error(`JSON parse hatası: ${e.message}`);
    }

    if (!parsed.action || !VALID_ACTIONS.includes(parsed.action)) {
      throw new Error(`Geçersiz action: "${parsed.action}"`);
    }
    const needsElement = ['click', 'fill', 'type', 'hover', 'select'];
    if (needsElement.includes(parsed.action) && !parsed.target && parsed.elementId == null) {
      throw new Error(`"${parsed.action}" için target veya elementId gerekli`);
    }
    if (['fill', 'type'].includes(parsed.action) && parsed.value == null) {
      throw new Error(`"${parsed.action}" için value gerekli`);
    }

    return {
      action: parsed.action,
      elementId: Number.isInteger(parsed.elementId) ? parsed.elementId : null,
      target: parsed.target || null,
      value: parsed.value != null ? String(parsed.value) : null,
      reasoning: String(parsed.reasoning || '').substring(0, 500),
      confidence: this._clampConfidence(parsed.confidence),
      testComplete: parsed.testComplete === true,
      bugDetected: parsed.bugDetected === true,
      bugDescription: parsed.bugDetected ? String(parsed.bugDescription || '').substring(0, 500) : null,
      alternativeSelectors: this._sanitizeAlternatives(parsed.alternativeSelectors),
    };
  }

  _clampConfidence(value) {
    const num = parseFloat(value);
    if (isNaN(num)) return 0.5;
    return Math.max(0, Math.min(1, num));
  }

  _sanitizeAlternatives(alternatives) {
    if (!Array.isArray(alternatives)) return [];
    return alternatives.filter(s => typeof s === 'string' && s.trim()).map(s => s.trim()).slice(0, 5);
  }

  _isRetryable(error) {
    return error.status === 429 || error.status >= 500 ||
      error.message?.includes('overloaded') ||
      error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' ||
      error.message?.includes('JSON');
  }

  _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
}

module.exports = new AIService();
module.exports.VALID_ACTIONS = VALID_ACTIONS;