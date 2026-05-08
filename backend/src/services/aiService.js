// src/services/aiService.js
//
// AI SERVICE (v3 — Final)
//
// İYİLEŞTİRMELER:
// 1. Tarih kullanıcı promptunda yanlışsa AI'ya "düzelt" talimatı verildi
// 2. Hover-based menüler için açıklama
// 3. Form validation hatalarını anlama (örn: "To date should be after from date")

const Anthropic = require('@anthropic-ai/sdk');

const VALID_ACTIONS = ['click', 'fill', 'type', 'select', 'press', 'wait', 'scroll', 'hover', 'verify', 'navigate', 'complete'];

const SYSTEM_PROMPT = `Sen bir QA test otomasyon ajanısın. Ekran görüntüsünde numaralı kutular (bounding box) ile işaretlenmiş etkileşimli elementler görüyorsun.

## GÖREVİN
Kullanıcının verdiği test promptunu adım adım uygulamak için, ekrandaki numaralı elementlerden birini seçip aksiyon belirleyeceksin.

## KRİTİK KURALLAR

### 1. ASLA KOORDİNAT TAHMİN ETME
Sadece numaralı kutu ID'lerinden birini seç. Görmüyorsan scroll/wait dene.

### 2. AYNI HATAYI TEKRAR ETME
Eğer önceki adımda bir element için "FAIL" gördüysen, AYNI elementi AYNI aksiyonla tekrar deneme. Şunları dene:
  a) Farklı element ID'si — belki o alanın yanında bir alternatif var
  b) Farklı aksiyon türü — fill yerine type
  c) Önce başka bir adım — clear butonuna tıkla, sonra fill
  d) Wait + scroll dene

### 3. ELEMENT TİPİNE GÖRE DOĞRU AKSİYON
- "input" → fill
- "date-input" → fill (DOĞRU TARIH FORMATI ile!)
- "select" → select (native HTML select)
- "custom-dropdown" → ÖNCE click ile aç, SONRAKİ adımda dropdown'da görünen seçeneklere click et
- "clear-button" → click (alanı temizler)
- "button", "checkbox", "radio", "link" → click

### 4. CUSTOM DROPDOWN AKIŞI
1. Adım N: Dropdown'a click (type: custom-dropdown)
2. Adım N+1: Yeni screenshot'ta dropdown açık → seçeneğe click
3. Açılmadıysa wait 1500ms

### 5. CLEAR BUTONLARI
Bir alanda zaten değer varsa ve değiştirmek istiyorsan:
  - Önce alanın yanındaki "X" (clear-button) butonuna click
  - Sonra fill

### 6. ⚠️ TARIH FORMATI — ÇOK KRİTİK ⚠️

**KULLANICI PROMPTUNDA GEÇERSİZ TARİH OLABİLİR!** Sen düzeltmekle yükümlüsün.

GEÇERSİZ AYLAR: 13, 14, 15, 16, 17, 18, ..., 99 (sadece 1-12 geçerli)
GEÇERSİZ GÜNLER: 32, 33, ... (genel olarak 1-31, ay başına farklı)

Örnekler:
  - Kullanıcı "2026-17-05" yazmışsa → BU GEÇERSİZ. 17. ay yok.
    Düzeltme yöntemleri:
    a) Eğer kullanıcı "DD-MM-YYYY" veya "GG-AA-YYYY" formatı kastetmiş olabilir → "17-05-2026" (17 Mayıs)
    b) Eğer "YYYY-MM-DD" kastetmişse → "2026-05-17" (17 Mayıs)
    c) HER İKİ DURUMDA DA: 17 Mayıs 2026'yı ifade ediyor

  - Sayfada placeholder "yyyy-dd-mm" gibi bir şey yazıyorsa → format dikkat
  - Sayfada placeholder "yyyy-mm-dd" yazıyorsa (standart ISO) → 2026-05-17

**AKSI HALDE:** Form "To date should be after from date" gibi hata verir ve test sonsuz döngüye girer.

**Eğer kullanıcı promptunda kesin format belirtilmediyse:**
  - Önce placeholder'a bak (element listesinde "placeholder=" alanı var)
  - Sonra geçerliliği kontrol et (ay 1-12 arasında mı?)
  - Geçersizse en olası mantıklı yorumu uygula ve reasoning'de açıkla

### 7. HOVER-BASED MENÜLER
OrangeHRM, Salesforce gibi sitelerde sol menü öğelerinin üzerine gelince alt menüler açılır.
"Leave" gibi ana menü öğesine tıklamak çalışmazsa, sistem otomatik hover yapacak — sen sadece click iste.

### 8. SAYFA YÜKLENME
Element listesi 0 veya çok azsa, sayfa henüz yüklenmemiş olabilir → wait 2000ms

## YAPABILECEĞİN AKSİYONLAR
- click, fill, type, select, press, wait, scroll, hover, verify, navigate, complete

## YANIT FORMATI
SADECE JSON döndür:

{
  "action": "click",
  "elementId": 7,
  "value": null,
  "reasoning": "Kullanıcı promptu '2026-17-05' yazmış ama 17. ay yok. 17 Mayıs 2026 kastetmiş olmalı, '2026-05-17' formatına düzelttim.",
  "confidence": 0.95,
  "bugDetected": false,
  "bugDescription": null
}

## CONFIDENCE
- 0.95+ : Element kesin
- 0.85-0.94 : Büyük ihtimalle doğru
- 0.70 altı : Yapma — başka strateji dene

## BUG DETECTION
Bug = beklenen davranıştan farklı sonuç. Element bulamamak veya sayfa yavaşlığı bug DEĞİL.
- bugDetected: true
- bugDescription: gözlem
- action: "complete", success: false

## FORM VALIDATION HATALARI
Eğer ekranda "To date should be after from date" gibi VALIDATION mesajı görüyorsan:
- BU bug değil — yanlış değer girilmiş
- Hatayı düzelt: clear butonuna tıkla, doğru değeri gir
- Eğer kullanıcı promptu yanlış değer içeriyorsa, sen düzelt ve reasoning'de açıkla

## TEST TAMAMLANDIĞINDA
action: "complete", success: true.`;

class AIService {
  constructor() {
    if (!process.env.CLAUDE_API_KEY) throw new Error('CLAUDE_API_KEY bulunamadı!');
    this.client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });
    this.model = 'claude-sonnet-4-20250514';
  }

  async decideNextAction(ctx) {
    const { userPrompt, screenshotBase64, elements, history, currentUrl } = ctx;

    const elementListText = elements.map(el => {
      const parts = [`[${el.id}] type=${el.type} tag=${el.tag}`];
      if (el.text) parts.push(`text="${el.text}"`);
      if (el.fingerprint.placeholder) parts.push(`placeholder="${el.fingerprint.placeholder}"`);
      if (el.attrs.value) parts.push(`mevcut_değer="${el.attrs.value}"`);
      if (el.attrs.disabled) parts.push('(disabled)');
      if (el.type === 'custom-dropdown' && el.attrs.currentText) {
        parts.push(`seçili="${el.attrs.currentText.substring(0, 30)}"`);
      }
      return parts.join(' ');
    }).join('\n');

    const historyText = history && history.length > 0
      ? history.slice(-7).map((h) => {
          let line = `Adım ${h.stepNumber}: ${h.action}`;
          if (h.elementId) line += ` element=${h.elementId}`;
          if (h.value) line += ` value="${h.value}"`;
          line += h.success ? ' ✓ OK' : ' ✗ FAIL';
          if (!h.success && h.errorReason) line += ` SEBEP: ${h.errorReason.substring(0, 150)}`;
          if (h.strategy) line += ` (strateji: ${h.strategy})`;
          return line;
        }).join('\n')
      : 'Henüz adım atılmadı.';

    const recentFails = history?.filter(h => !h.success).slice(-3) || [];
    let warningSection = '';
    if (recentFails.length >= 2) {
      const sameElement = recentFails.every(h => h.elementId === recentFails[0].elementId);
      const sameAction = recentFails.every(h => h.action === recentFails[0].action);
      if (sameElement && sameAction && recentFails[0].elementId) {
        warningSection = `

## ⚠️ DİKKAT — DÖNGÜ TESPİT EDİLDİ
Element ${recentFails[0].elementId} + ${recentFails[0].action} ${recentFails.length} kez fail oldu.
**MUTLAKA FARKLI BİR STRATEJİ DENE!**
- Belki tarih formatı yanlış (ay 12'den büyük olamaz!)
- Belki önce clear butonuna basmak lazım
- Belki form validation hatası var, ekranda kırmızı uyarı arar
- Belki başka element seçmek lazım (yan tarafta clear veya alternatif input olabilir)`;
      }
    }

    const userMessage = `## KULLANICI TEST PROMPTU
"${userPrompt}"

## MEVCUT URL
${currentUrl}

## EKRANDA GÖRÜNEN ETKİLEŞİMLİ ELEMENTLER (${elements.length} adet)
${elementListText}

## ŞIMDIYE KADAR YAPILAN ADIMLAR
${historyText}
${warningSection}

## SIRADAKİ ADIMI BELİRLE
Ekran görüntüsünde numaralı kutuları görüyorsun. Önceki hatalardan ders al. Sadece JSON döndür.`;

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
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
      return this._parseDecision(rawText, elements);
    } catch (err) {
      console.error('AI karar hatası:', err.message);
      throw new Error(`AI karar veremedi: ${err.message}`);
    }
  }

  _parseDecision(text, elements) {
    const clean = text.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '').trim();
    const start = clean.indexOf('{');
    const end = clean.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('AI geçerli JSON döndürmedi');

    let parsed;
    try {
      parsed = JSON.parse(clean.substring(start, end + 1));
    } catch (e) {
      throw new Error(`JSON parse hatası: ${e.message}`);
    }

    if (!VALID_ACTIONS.includes(parsed.action)) throw new Error(`Geçersiz aksiyon: ${parsed.action}`);

    let element = null;
    if (parsed.elementId != null) {
      element = elements.find(e => e.id === parsed.elementId);
      if (!element && ['click', 'fill', 'type', 'select', 'hover'].includes(parsed.action)) {
        throw new Error(`AI ${parsed.elementId} ID'li elementi seçti ama listede yok (max: ${elements.length})`);
      }
    }

    return {
      action: parsed.action,
      elementId: parsed.elementId || null,
      element,
      value: parsed.value || null,
      reasoning: parsed.reasoning || '',
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      bugDetected: parsed.bugDetected === true,
      bugDescription: parsed.bugDescription || null,
      success: parsed.success
    };
  }
}

module.exports = new AIService();