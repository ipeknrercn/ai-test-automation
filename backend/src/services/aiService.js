// src/services/aiService.js
//
// V2/V3/V4 için: ID tabanlı AI service.
// somEnabled flag'i ile prompt değiştirilir (V2: SoM yok, V3+: SoM var).

const Anthropic = require('@anthropic-ai/sdk');

const VALID_ACTIONS = ['click', 'fill', 'type', 'select', 'press', 'wait', 'scroll', 'hover', 'verify', 'navigate', 'complete'];

function buildSystemPrompt(somEnabled) {
  const visualNote = somEnabled
    ? 'Ekran görüntüsünde numaralı kutular (bounding box) ile işaretlenmiş etkileşimli elementler görüyorsun. Element listesindeki ID\'ler ekrandaki kutu numaralarına karşılık geliyor.'
    : 'Ekran görüntüsünde sayfa düz haliyle. Etkileşimli elementlerin listesini ayrıca aşağıda göreceksin. Doğru ID\'yi listeden seç.';

  return `Sen bir QA test otomasyon ajanısın. ${visualNote}

## GÖREVİN
Kullanıcının verdiği test promptunu adım adım uygulamak için, ekrandaki numaralı elementlerden birini seçip aksiyon belirleyeceksin.

## KRİTİK KURALLAR

### 1. ASLA KOORDİNAT TAHMİN ETME
Sadece element listesindeki ID'lerden birini seç. Görmüyorsan scroll/wait dene.

### 1b. MENÜ / NAVİGASYON
"Contact", "İletişim" gibi menü için: element listesinde text'i TAM eşleşen ID'yi seç.
Dil (EN/TR), logo veya başka menü öğesini contact yerine seçme.
Menü tıklaması için action: click (link veya button); contact sayfası için text="CONTACT" veya "İLETİŞİM" olan elementi kullan.

### 1d. FORM / SAYFA İÇİ BUTONLARI
CONTINUE, SUBMIT, CHECKOUT, FINISH, Add to cart, Remove — bunlar menü navigasyonu değildir.
URL değişmese bile (aynı inventory/checkout sayfası) tıklama başarılıdır.
Gerçek menü: CONTACT, Leave, Home gibi üst menü linkleri.

### 1c. KART / KUTU SEÇİMİ (Purchase, Rental, Contact Us vb.)
Kullanıcı başlık + alt açıklama ile bir kutuyu tarif ediyorsa (örn. "Contact Us" ve "Share your questions..."),
element listesinde text alanında HER İKİ metni de içeren ID'yi seç.
"Purchase" veya "Rental" kutusunu Contact Us istendiğinde seçme.
Aynı sayfada birden fazla MuiCardActionArea varsa sadece css sınıfına güvenme; text eşleşmesine göre ID seç.

### 2. AYNI HATAYI TEKRAR ETME
Önceki adımda bir element için "FAIL" gördüysen, aynı element + aynı aksiyon kombinasyonunu tekrar deneme. Farklı element ID, farklı aksiyon, ya da clear butonu dene.

### 3. ELEMENT TİPİNE GÖRE DOĞRU AKSİYON
- "input" → fill — element listesinde text/placeholder "Your Name", "Email" vb. ile eşleşen ID seç; komşu alanı karıştırma
- "date-input" → fill (DOĞRU TARIH FORMATI ile!)
- "select" → select (native HTML select)
- "custom-dropdown" → ÖNCE click ile aç, SONRAKİ adımda seçeneklere click et
- "dropdown-option" → açık listedeki seçenek; element listesinde text'i prompttaki seçenekle eşleşen ID'ye click (genel .oxd-select-option css kullanma)
- "clear-button" → click (alanı temizler)
- "button", "checkbox", "radio", "link" → click

### 4. TARIH FORMATI
Önce element listesindeki placeholder'a bak (From Date / To Date alanı).
- placeholder "yyyy-dd-mm" → prompttaki tarihi AYNEN kullan: "2026-17-05" → value "2026-17-05" (yıl-gün-ay). ASLA "2026-05-17" yapma.
- placeholder "yyyy-mm-dd" → standart ISO; ancak kullanıcı 2026-17-05 yazmışsa ve ortadaki sayı >12 ise 17 Mayıs → "2026-05-17".
- Prompttaki tarih ile placeholder çelişiyorsa placeholder kazanır.

### 5. CUSTOM DROPDOWN
İki adımlı: önce custom-dropdown'a click (aç), sonra type "dropdown-option" olan satıra click — seçenek metni (örn. CAN - Maternity) element text ile eşleşmeli.
Dropdown açıkken scroll KULLANMA; seçenek listede görünüyorsa mutlaka dropdown-option ID'sine click yap.
"CAN - Matternity" / "CAN - Maternity" yazım farklarında element listesindeki metne en yakın option ID'yi seç.

## YANIT FORMATI
SADECE JSON:

{
  "action": "click",
  "elementId": 7,
  "value": null,
  "reasoning": "Açıklama",
  "confidence": 0.95,
  "bugDetected": false,
  "bugDescription": null
}

## CONFIDENCE
0.95+ kesin, 0.85+ büyük ihtimal, 0.70 altı yapma.

## TAMAMLANDIĞINDA
action: "complete", success: true/false.
success:true SADECE prompttaki TÜM adımlar başarıyla uygulandıysa ve geçmişte ✗ (başarısız) adım yoksa.
Sort dropdown: istenen seçenek sayısından FAZLA select yapma (örn. 3 istendiyse 4. seçeneğe geçme).
Seçili olsa bile her istenen seçeneği sırayla select ile uygula (1., 2., 3.).
Önceki adımlarda hata varsa success:false ve kısa neden yaz.`;
}

class AIService {
  constructor() {
    if (!process.env.CLAUDE_API_KEY) throw new Error('CLAUDE_API_KEY bulunamadı!');
    this.client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });
    this.model = 'claude-sonnet-4-20250514';
  }

  async decideNextAction(ctx) {
    const { userPrompt, screenshotBase64, elements, history, currentUrl, somEnabled } = ctx;

    const elementListText = elements.map(el => {
      const parts = [`[${el.id}] type=${el.type} tag=${el.tag}`];
      if (el.text) parts.push(`text="${el.text}"`);
      if (el.fingerprint.href || el.attrs?.href) parts.push(`href="${el.fingerprint.href || el.attrs.href}"`);
      if (el.fingerprint.placeholder) parts.push(`placeholder="${el.fingerprint.placeholder}"`);
      if (el.tag === 'input' || el.tag === 'textarea') parts.push(`(form alanı)`);
      if (el.attrs.value) parts.push(`mevcut="${el.attrs.value}"`);
      return parts.join(' ');
    }).join('\n');

    const historyText = history && history.length > 0
      ? history.slice(-7).map((h) => {
          let line = `Adım ${h.stepNumber}: ${h.action}`;
          if (h.elementId) line += ` element=${h.elementId}`;
          if (h.value) line += ` value="${h.value}"`;
          line += h.success ? ' ✓' : ' ✗';
          if (!h.success && h.errorReason) line += ` SEBEP: ${h.errorReason.substring(0, 120)}`;
          return line;
        }).join('\n')
      : 'Henüz adım atılmadı.';

    const userMessage = `## KULLANICI TEST PROMPTU
"${userPrompt}"

## MEVCUT URL
${currentUrl}

## EKRANDA GÖRÜNEN ELEMENTLER (${elements.length})
${elementListText}

## ŞIMDIYE KADAR
${historyText}

Sıradaki adımı belirle. Sadece JSON.`;

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 1024,
        system: buildSystemPrompt(somEnabled !== false),
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/png', data: screenshotBase64 } },
            { type: 'text', text: userMessage }
          ]
        }]
      });

      const rawText = response.content[0]?.text;
      if (!rawText) throw new Error('AI boş yanıt döndürdü');
      return this._parseDecision(rawText, elements);
    } catch (err) {
      throw new Error(`AI karar veremedi: ${err.message}`);
    }
  }

  _parseDecision(text, elements) {
    const clean = text.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '').trim();
    const start = clean.indexOf('{');
    const end = clean.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('JSON yok');

    const parsed = JSON.parse(clean.substring(start, end + 1));
    if (!VALID_ACTIONS.includes(parsed.action)) throw new Error(`Geçersiz aksiyon: ${parsed.action}`);

    let element = null;
    if (parsed.elementId != null) {
      element = elements.find(e => e.id === parsed.elementId);
      if (!element && ['click', 'fill', 'type', 'select', 'hover'].includes(parsed.action)) {
        throw new Error(`Element ${parsed.elementId} listede yok`);
      }
    }

    return {
      action: parsed.action,
      elementId: parsed.elementId || null,
      element,
      target: parsed.target || null,
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