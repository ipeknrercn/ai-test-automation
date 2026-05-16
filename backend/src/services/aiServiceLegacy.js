// src/services/aiServiceLegacy.js
//
// V1 BASELINE AI SERVICE
//
// Eski sürümün mantığı: AI'a sadece screenshot gönder, doğrudan CSS selector istesin.
// Element listesi yok, bounding box yok, self-healing yok.

const Anthropic = require('@anthropic-ai/sdk');

const VALID_ACTIONS = ['click', 'fill', 'type', 'select', 'press', 'wait', 'scroll', 'hover', 'verify', 'navigate', 'complete'];

const LEGACY_SYSTEM_PROMPT = `Sen bir QA test otomasyon ajanısın. Ekran görüntüsüne bakarak test promptunu adım adım uygulayacaksın.

## GÖREVİN
Her adımda hangi aksiyonu hangi elemente uygulayacağına karar ver.

## AKSİYONLAR
- click: Bir elemente tıkla
- fill: Input alanını doldur
- type: Karakter karakter yaz
- select: Dropdown'dan seç
- press: Klavye tuşu (Enter, Tab vb.)
- wait: Bekle (ms)
- scroll: Sayfayı kaydır (down/up/top/bottom)
- hover: Üzerine gel
- verify: Görsel doğrulama
- navigate: URL'ye git
- complete: Test tamamlandı

## YANIT FORMATI
SADECE JSON döndür:

{
  "action": "click",
  "target": "#login-button",
  "value": null,
  "reasoning": "Login butonuna tıklıyorum",
  "confidence": 0.9,
  "bugDetected": false,
  "bugDescription": null
}

target alanı:
- click/fill/type/select/press/hover için: CSS selector (örn: "#login-button", "input[name='username']", ".btn-primary")
- scroll/wait için: yön veya ms değeri
- navigate için: URL
- complete için: null

## CONFIDENCE
0-1 arası güven skoru. 0.9+ kesin, 0.7- belirsiz.

## BUG DETECTION
Beklenmedik hata ekranı varsa bugDetected: true.

## TAMAMLANDIĞINDA
action: "complete", success: true/false.
success:true SADECE prompttaki tüm adımlar başarılıysa; geçmişte başarısız adım varsa success:false.`;

class AIServiceLegacy {
  constructor() {
    if (!process.env.CLAUDE_API_KEY) throw new Error('CLAUDE_API_KEY bulunamadı!');
    this.client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });
    this.model = 'claude-sonnet-4-20250514';
  }

  async decideNextAction(ctx) {
    const { userPrompt, screenshotBase64, history, currentUrl } = ctx;

    const historyText = history && history.length > 0
      ? history.slice(-5).map((h) => {
          let line = `Adım ${h.stepNumber}: ${h.action}`;
          if (h.target) line += ` target="${h.target}"`;
          if (h.value) line += ` value="${h.value}"`;
          line += h.success ? ' ✓' : ' ✗';
          return line;
        }).join('\n')
      : 'Henüz adım atılmadı.';

    const userMessage = `## TEST PROMPTU
"${userPrompt}"

## MEVCUT URL
${currentUrl}

## ŞIMDIYE KADAR
${historyText}

Sıradaki adımı belirle. Sadece JSON döndür.`;

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 1024,
        system: LEGACY_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: 'image/png', data: screenshotBase64 } },
              { type: 'text', text: userMessage }
            ]
          }
        ]
      });

      const rawText = response.content[0]?.text;
      if (!rawText) throw new Error('AI boş yanıt döndürdü');
      return this._parseDecision(rawText);
    } catch (err) {
      throw new Error(`AI karar veremedi: ${err.message}`);
    }
  }

  _parseDecision(text) {
    const clean = text.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '').trim();
    const start = clean.indexOf('{');
    const end = clean.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('Geçerli JSON yok');

    const parsed = JSON.parse(clean.substring(start, end + 1));
    if (!VALID_ACTIONS.includes(parsed.action)) throw new Error(`Geçersiz aksiyon: ${parsed.action}`);

    return {
      action: parsed.action,
      target: parsed.target || null,
      element: null, // V1'de element yok
      elementId: null,
      value: parsed.value || null,
      reasoning: parsed.reasoning || '',
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      bugDetected: parsed.bugDetected === true,
      bugDescription: parsed.bugDescription || null,
      success: parsed.success
    };
  }
}

module.exports = new AIServiceLegacy();