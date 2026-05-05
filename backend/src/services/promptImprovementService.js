// src/services/promptImprovementService.js
const Anthropic = require('@anthropic-ai/sdk');

// ═══════════════════════════════════════════════════════════════════════════
// PROMPT İYİLEŞTİRME SERVİSİ
//
// Kullanıcının yazdığı doğal dil test promptunu Claude'a gönderir,
// AI test otomasyonu için optimize edilmiş bir versiyonunu üretir.
// ═══════════════════════════════════════════════════════════════════════════

const SYSTEM_PROMPT = `Sen bir QA test mühendisi ve prompt mühendisliği uzmanısın.
Kullanıcı, AI tabanlı bir test otomasyon aracına vermek üzere doğal dil
test promptu yazıyor. Senin görevin bu promptu, AI ajanının daha doğru
ve tutarlı kararlar verebilmesi için iyileştirmek.

═══ İYİLEŞTİRME KURALLARI ═══

1. AÇIK ADIMLAR: Her adımı net ve numaralandırılmış halde belirt.
   Belirsiz ifadeleri ("biraz bekle", "uygun yere tıkla") somut hale getir.

2. ELEMENT TANIMLAMASI: Hangi butona/alana etkileşim yapılacağını net belirt.
   "giriş yap" yerine "Login butonuna tıkla" gibi.

3. DOĞRULAMA ADIMLARI: Eğer eksikse, kritik noktalara doğrulama ekle.
   "Login butonuna tıkla" → "Login butonuna tıkla. Inventory sayfasının açıldığını doğrula."

4. DROPDOWN/SELECT: Eğer kullanıcı seç, seçeneğini seç gibi ifadeler kullanmışsa,
   bunu native <select> elementi için "X seçeneğini seç" formuna çevir.

5. KISA VE NET: Promptu uzatma. Sadece belirsiz veya eksik kısımları düzelt.
   Kullanıcının niyetini koruyarak yeniden ifade et.

6. SİLME: Asla yeni adım ekleme veya çıkarma. Sadece var olanları netleştir.

═══ ÇIKTI FORMATI ═══

SADECE aşağıdaki JSON formatında yanıt ver, başka HİÇBİR ŞEY yazma:

{
  "improvedPrompt": "iyileştirilmiş prompt metni",
  "changes": [
    "Değişiklik 1: kısa açıklama",
    "Değişiklik 2: kısa açıklama"
  ],
  "wasImproved": true
}

Eğer promptu zaten yeterince iyiyse:
{
  "improvedPrompt": "orijinal prompt aynen",
  "changes": [],
  "wasImproved": false
}

═══ ÖRNEKLER ═══

KULLANICI: "saucedemo'ya gir kullanıcı adı standard_user şifre secret_sauce ile login ol"

İYİLEŞTİRİLMİŞ:
"https://www.saucedemo.com adresine git. Kullanıcı adı alanına 'standard_user' yaz. Şifre alanına 'secret_sauce' yaz. Login butonuna tıkla. Inventory sayfasının açıldığını doğrula."

DEĞİŞİKLİKLER:
- Tam URL eklendi
- Her adım ayrı cümle haline getirildi
- Doğrulama adımı eklendi`;

class PromptImprovementService {
  constructor() {
    if (!process.env.CLAUDE_API_KEY) {
      throw new Error('CLAUDE_API_KEY bulunamadı!');
    }
    this.client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });
    this.model = 'claude-sonnet-4-20250514';
  }

  async improvePrompt(originalPrompt, context = {}) {
    if (!originalPrompt || originalPrompt.trim().length === 0) {
      throw new Error('Prompt boş olamaz');
    }

    // Context'i prompt'a dahil et
    const userMessage = this._buildUserMessage(originalPrompt, context);

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }]
      });

      const rawText = response.content[0]?.text;
      if (!rawText) throw new Error('AI boş yanıt döndürdü');

      return this._parseResponse(rawText, originalPrompt);
    } catch (error) {
      console.error(`Prompt iyileştirme hatası: ${error.message}`);
      throw new Error(`Prompt iyileştirilemedi: ${error.message}`);
    }
  }

  _buildUserMessage(originalPrompt, context) {
    const parts = [];

    if (context.testName) {
      parts.push(`Test adı: ${context.testName}`);
    }
    if (context.targetUrl) {
      parts.push(`Hedef URL: ${context.targetUrl}`);
    }

    parts.push(`\nOrijinal prompt:\n"${originalPrompt}"`);
    parts.push(`\nLütfen bu promptu AI test otomasyon ajanı için iyileştir ve sadece JSON döndür.`);

    return parts.join('\n');
  }

  _parseResponse(text, originalPrompt) {
    // JSON'u temizle
    const clean = text.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '').trim();
    const jsonStart = clean.indexOf('{');
    const jsonEnd = clean.lastIndexOf('}');

    if (jsonStart === -1 || jsonEnd === -1) {
      throw new Error('AI geçerli JSON döndürmedi');
    }

    let parsed;
    try {
      parsed = JSON.parse(clean.substring(jsonStart, jsonEnd + 1));
    } catch (e) {
      throw new Error(`JSON parse hatası: ${e.message}`);
    }

    // Doğrulama
    if (!parsed.improvedPrompt || typeof parsed.improvedPrompt !== 'string') {
      throw new Error('Geçersiz yanıt: improvedPrompt eksik');
    }

    return {
      originalPrompt,
      improvedPrompt: parsed.improvedPrompt.trim(),
      changes: Array.isArray(parsed.changes) ? parsed.changes.slice(0, 10) : [],
      wasImproved: parsed.wasImproved !== false &&
                   parsed.improvedPrompt.trim() !== originalPrompt.trim()
    };
  }
}

module.exports = new PromptImprovementService();