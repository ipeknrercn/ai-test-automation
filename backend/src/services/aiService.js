// src/services/aiService.js — İYİLEŞTİRİLMİŞ VERSİYON
const Anthropic = require('@anthropic-ai/sdk');
const { readFile } = require('fs').promises;

// ═══════════════════════════════════════════════════════════════════════════
// GEÇERLİ ACTIONLAR
// ═══════════════════════════════════════════════════════════════════════════
const VALID_ACTIONS = [
  'navigate', 'click', 'fill', 'type', 'wait',
  'verify', 'press', 'scroll', 'hover', 'select',
];

// ═══════════════════════════════════════════════════════════════════════════
// SYSTEM PROMPT — Detaylı ve Yapılandırılmış
// ═══════════════════════════════════════════════════════════════════════════
const SYSTEM_PROMPT = `Sen bir QA Test Otomasyon uzmanısın. Playwright ile web uygulamalarını test ediyorsun.
Ekran görüntüsüne ve test senaryosuna bakarak bir sonraki eylemi belirlersin.

─── GÖREV ───
1. Ekran görüntüsünü analiz et — sayfanın mevcut durumunu anla.
2. Test senaryosunu ve önceki adımları oku — nerede olduğunu ve neyin kaldığını belirle.
3. Sonraki TEK adımı JSON olarak döndür.

─── JSON FORMAT (SADECE BU FORMATTA CEVAP VER, BAŞKA YAZI YAZMA) ───
{
  "action": "click|fill|type|navigate|wait|verify|press|scroll|hover|select",
  "target": "Playwright selector veya URL",
  "value": "dolduracak değer (fill/type/select/wait/press için)",
  "reasoning": "Bu adımı neden seçtiğinin detaylı açıklaması",
  "confidence": 0.95,
  "testComplete": false,
  "alternativeSelectors": ["alternatif1", "alternatif2"]
}

─── SELECTOR KURALLARI (ÖNCELİK SIRASI) ───
1. ÖNCE role-based Playwright selector kullan:
   - role selector:      getByRole('button', { name: 'Giriş' }) → button:has-text("Giriş")
   - text selector:      text="Giriş Yap" veya :has-text("Giriş Yap")
2. SONRA attribute-based dene:
   - id:                 #login-button
   - data-testid:        [data-testid="login-btn"]
   - name:               input[name="email"]
   - placeholder:        input[placeholder="E-posta adresinizi girin"]
3. SON ÇARE olarak yapısal selector:
   - CSS combinator:     form.login-form >> input[type="email"]
   - nth:                .menu-item >> nth=2

─── SELECTOR HATALARI İÇİN ÖNEMLİ NOTLAR ───
- Önceki adımda bir selector başarısız olduysa, AYNI SELECTORU TEKRAR KULLANMA.
- Başarısız selector'ın hata mesajını oku — element bulunamamış mı, görünür değil mi, tıklanabilir değil mi?
- Alternatif selector stratejisine geç (örn: id yerine text-based dene).
- alternativeSelectors dizisine en az 2 alternatif ekle.

─── ACTION AÇIKLAMALARI ───
- click:    Bir butona, linke veya elemente tıkla. target = selector.
- fill:     Bir input alanını TEMİZLEYİP yeni değeri yaz. target = selector, value = metin.
- type:     Mevcut içeriğin üstüne karakter karakter yaz (fill'den farklı). target = selector, value = metin.
- select:   HTML <select> dropdown'dan seçim yap. target = selector, value = option'ın value VEYA label (görünen metin).
- navigate: Yeni bir URL'ye git. target = tam URL.
- press:    Klavye tuşuna bas. value = tuş adı (Enter, Tab, Escape, vb.).
- wait:     Belirli süre bekle. value = milisaniye (max 10000).
- scroll:   Sayfayı aşağı kaydır (400px).
- hover:    Elementin üzerine gel. target = selector.
- verify:   Ekrandaki bir durumu doğrula (eylem yapmaz, sadece gözlem). reasoning'e gözlemini yaz.

─── DROPDOWN / <select> KURALLARI (KRİTİK) ───
Bu kurallar çok önemli, her dropdown işleminde uygula:
1. Eğer ekranda bir dropdown (<select> elementi) varsa, click DEĞİL "select" action'ı kullan.
   - DOĞRU: { "action": "select", "target": ".product_sort_container", "value": "za" }
   - YANLIŞ: { "action": "click", "target": "option:has-text('Name (Z to A)')" }
2. <select> elementini TIKLAYARAK açmaya çalışma. Direkt "select" action'ı ile value seç.
3. Aynı dropdown'dan ardışık farklı seçimler yapılması isteniyorsa:
   - Her seçim ayrı bir adımdır.
   - Her adımda "select" action'ını tekrar kullan.
   - Arada dropdown'u "açmana" gerek yok — select action'ı bunu otomatik yapar.
4. value alanında option'ın value attribute'unu VEYA görünen metnini kullanabilirsin:
   - value attribute: "za", "az", "lohi", "hilo"
   - görünen metin:   "Name (Z to A)", "Name (A to Z)", "Price (low to high)"

─── ÇOKLU ADIM SENARYOLARI (KRİTİK) ───
Test senaryosunda birden fazla adım varsa (örn: "önce X yap, sonra Y yap, sonra Z yap"):
1. Senaryodaki HER adımı sırayla yap. Birini atla.
2. Önceki adımlara bak — hangi adımlar tamamlandı, hangileri kaldı?
3. Bir adım başarılı olduktan sonra, senaryodaki SIRADAKI adıma geç.
4. Tüm adımlar bitene kadar testComplete: false bırak.
5. Eğer senaryo "A yap, sonra B yap, sonra C yap" diyorsa ve sen A'yı yaptıysan, sıradaki B'dir.

─── TEST BİTİŞ KURALLARI ───
testComplete: true yap SADECE şu durumlarda:
- Test senaryosundaki TÜM adımlar başarıyla tamamlandı (sadece ilk adım değil, HEPSİ).
- Beklenen sonuç ekranda doğrulandı (verify ile).
- Emin değilsen testComplete: false bırak, verify adımı ekle.
- Senaryoda 5 adım varsa ve sadece 2'sini yaptıysan, testComplete KESİNLİKLE false olmalı.

─── GENEL KURALLAR ───
- Her zaman SADECE geçerli JSON döndür. JSON dışında hiçbir karakter, açıklama veya markdown yazma.
- Bir adımda sadece BİR eylem yap. Birden fazla eylemi tek JSON'a sığdırmaya çalışma.
- Sayfa yükleniyorsa veya değişiyorsa wait adımı kullan.
- confidence skoru: 0.9+ = kesin, 0.7-0.9 = muhtemelen doğru, 0.5-0.7 = belirsiz, <0.5 = çok belirsiz.`;

// ═══════════════════════════════════════════════════════════════════════════
// AI SERVICE
// ═══════════════════════════════════════════════════════════════════════════
class AIService {
  constructor() {
    if (!process.env.CLAUDE_API_KEY) {
      throw new Error('CLAUDE_API_KEY environment variable bulunamadı!');
    }
    this.client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });
    this.model = 'claude-sonnet-4-20250514';
    this.maxRetries = 3;
  }

  // ───────────────────────────────────────────────────────────────────────
  // SCREENSHOT ANALİZ (Retry + Exponential Backoff)
  // ───────────────────────────────────────────────────────────────────────
  async analyzeScreenshot(screenshotPath, userPrompt, previousSteps = []) {
    const base64Image = await this._loadScreenshot(screenshotPath);
    const prompt = this._buildPrompt(userPrompt, previousSteps);

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
              {
                type: 'image',
                source: { type: 'base64', media_type: 'image/png', data: base64Image },
              },
              { type: 'text', text: prompt },
            ],
          }],
        });

        const rawText = response.content[0]?.text;
        if (!rawText) {
          throw new Error('API boş yanıt döndürdü');
        }

        return this._parseResponse(rawText);

      } catch (error) {
        lastError = error;
        console.error(`   ↳ AI analiz hatası (deneme ${attempt}/${this.maxRetries}): ${error.message}`);

        if (attempt < this.maxRetries && this._isRetryable(error)) {
          const backoffMs = 1000 * Math.pow(2, attempt - 1); // 1s, 2s, 4s
          console.log(`   ↳ ${backoffMs}ms sonra tekrar denenecek...`);
          await this._sleep(backoffMs);
          continue;
        }
        break;
      }
    }

    throw new Error(`AI analizi ${this.maxRetries} denemede başarısız: ${lastError.message}`);
  }

  // ───────────────────────────────────────────────────────────────────────
  // BAĞLANTI TESTİ
  // ───────────────────────────────────────────────────────────────────────
  async testConnection() {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 20,
        messages: [{ role: 'user', content: 'Bağlantı testi. "OK" yaz.' }],
      });

      return {
        success: true,
        provider: 'Anthropic Claude',
        model: this.model,
        response: response.content[0]?.text || 'Yanıt alındı',
      };
    } catch (error) {
      return {
        success: false,
        provider: 'Anthropic Claude',
        model: this.model,
        error: error.message,
      };
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  // PRIVATE: Screenshot Yükle + Boyut Kontrolü
  // ───────────────────────────────────────────────────────────────────────
  async _loadScreenshot(filePath) {
    let buffer;
    try {
      buffer = await readFile(filePath);
    } catch (err) {
      throw new Error(`Screenshot dosyası okunamadı (${filePath}): ${err.message}`);
    }

    const sizeMB = buffer.length / (1024 * 1024);
    if (sizeMB > 20) {
      throw new Error(`Screenshot çok büyük: ${sizeMB.toFixed(1)}MB (max 20MB)`);
    }

    return buffer.toString('base64');
  }

  // ───────────────────────────────────────────────────────────────────────
  // PRIVATE: Prompt Oluştur — Zengin context ile
  // ───────────────────────────────────────────────────────────────────────
  _buildPrompt(userPrompt, previousSteps) {
    const parts = [];

    // 1. Test senaryosu
    parts.push(`── TEST SENARYOSU ──\n${userPrompt}`);

    // 2. Tamamlanan adım sayısı ve ilerleme durumu
    const successfulSteps = previousSteps.filter(s => s.success !== false);
    const totalSteps = previousSteps.length;
    parts.push(`\n── İLERLEME: ${successfulSteps.length} başarılı adım tamamlandı, toplam ${totalSteps} adım atıldı ──`);

    // 3. Önceki adımlar (son 10 adım, detaylı)
    if (previousSteps.length > 0) {
      parts.push('\n── ÖNCEKİ ADIMLAR ──');

      const recentSteps = previousSteps.slice(-10);
      recentSteps.forEach((step, i) => {
        const stepNum = previousSteps.length - recentSteps.length + i + 1;
        const status = step.success === false ? '❌ BAŞARISIZ' : '✅';
        const target = step.target ? ` → ${step.target}` : '';
        const value = step.value ? ` = "${step.value}"` : '';
        const error = step.errorMsg ? ` | Hata: ${step.errorMsg}` : '';
        const reasoning = step.aiReasoning ? ` | Sebep: ${step.aiReasoning}` : '';

        parts.push(`${stepNum}. ${status} ${step.action}${target}${value}${error}${reasoning}`);
      });

      // Başarısız adımlar varsa uyarı
      const failedSteps = recentSteps.filter(s => s.success === false);
      if (failedSteps.length > 0) {
        parts.push(`\n⚠️ Son ${recentSteps.length} adımda ${failedSteps.length} başarısızlık var.`);
        parts.push('Başarısız selector\'ları TEKRAR KULLANMA. Farklı bir strateji dene.');
      }
    }

    // 4. Açık yönlendirme
    parts.push(`\n── SONRAKİ ADIM ──
Yukarıdaki test senaryosunu ve tamamlanan adımları dikkatlice oku.
Senaryoda henüz YAPILMAMIŞ olan sıradaki adımı belirle ve onu yap.
Tüm senaryo adımları tamamlandıysa testComplete: true yap.
Sadece JSON döndür, başka bir şey yazma.`);

    return parts.join('\n');
  }

  // ───────────────────────────────────────────────────────────────────────
  // PRIVATE: Response Parse + Katmanlı Doğrulama
  // ───────────────────────────────────────────────────────────────────────
  _parseResponse(text) {
    // 1. JSON'u bul ve çıkar
    const clean = text.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '').trim();
    const jsonStart = clean.indexOf('{');
    const jsonEnd = clean.lastIndexOf('}');

    if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
      throw new Error(`Yanıtta geçerli JSON bulunamadı. Yanıt: "${text.substring(0, 200)}"`);
    }

    // 2. Parse
    let parsed;
    try {
      parsed = JSON.parse(clean.substring(jsonStart, jsonEnd + 1));
    } catch (parseErr) {
      throw new Error(`JSON parse hatası: ${parseErr.message}. Metin: "${clean.substring(jsonStart, jsonEnd + 1).substring(0, 200)}"`);
    }

    // 3. Action doğrulama
    if (!parsed.action || !VALID_ACTIONS.includes(parsed.action)) {
      throw new Error(`Geçersiz veya eksik action: "${parsed.action}". Geçerli: ${VALID_ACTIONS.join(', ')}`);
    }

    // 4. Action-specific doğrulama
    const needsTarget = ['navigate', 'click', 'fill', 'type', 'hover', 'select'];
    if (needsTarget.includes(parsed.action) && !parsed.target) {
      throw new Error(`"${parsed.action}" action'ı için target gerekli ama boş döndü`);
    }

    const needsValue = ['fill', 'type'];
    if (needsValue.includes(parsed.action) && parsed.value == null) {
      throw new Error(`"${parsed.action}" action'ı için value gerekli ama boş döndü`);
    }

    // 5. Temiz ve güvenli obje döndür
    return {
      action: parsed.action,
      target: parsed.target || null,
      value: parsed.value != null ? String(parsed.value) : null,
      reasoning: String(parsed.reasoning || 'Açıklama verilmedi').substring(0, 300),
      confidence: this._clampConfidence(parsed.confidence),
      testComplete: parsed.testComplete === true,
      alternativeSelectors: this._sanitizeAlternatives(parsed.alternativeSelectors),
    };
  }

  // ───────────────────────────────────────────────────────────────────────
  // PRIVATE: Confidence değerini 0–1 arasına sıkıştır
  // ───────────────────────────────────────────────────────────────────────
  _clampConfidence(value) {
    const num = parseFloat(value);
    if (isNaN(num)) return 0.5; // Geçersizse varsayılan
    return Math.max(0, Math.min(1, num));
  }

  // ───────────────────────────────────────────────────────────────────────
  // PRIVATE: alternativeSelectors dizisini temizle
  // ───────────────────────────────────────────────────────────────────────
  _sanitizeAlternatives(alternatives) {
    if (!Array.isArray(alternatives)) return [];
    return alternatives
      .filter(s => typeof s === 'string' && s.trim().length > 0)
      .map(s => s.trim())
      .slice(0, 5); // Max 5 alternatif
  }

  // ───────────────────────────────────────────────────────────────────────
  // PRIVATE: Hata retry edilebilir mi?
  // ───────────────────────────────────────────────────────────────────────
  _isRetryable(error) {
    // Rate limit
    if (error.status === 429) return true;
    // Server hataları
    if (error.status >= 500) return true;
    // Anthropic overload
    if (error.message?.includes('overloaded')) return true;
    // Ağ hataları
    if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') return true;
    // JSON parse hatası (AI garip bir şey döndürdüyse tekrar denemek mantıklı)
    if (error.message?.includes('JSON')) return true;

    return false;
  }

  // ───────────────────────────────────────────────────────────────────────
  // PRIVATE: Bekleme
  // ───────────────────────────────────────────────────────────────────────
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new AIService();
module.exports.VALID_ACTIONS = VALID_ACTIONS;