// src/services/aiService.js - OPTİMİZE EDİLMİŞ VERSİYON
const Anthropic = require('@anthropic-ai/sdk');
const { readFile } = require('fs').promises;

// ═══════════════════════════════════════════════════════════════════════════
// GEÇERLİ ACTIONLAR
// ═══════════════════════════════════════════════════════════════════════════
const VALID_ACTIONS = [
  'navigate', 'click', 'fill', 'type', 'wait', 
  'verify', 'press', 'scroll', 'hover'
];

// ═══════════════════════════════════════════════════════════════════════════
// SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════════════════
const SYSTEM_PROMPT = `Sen QA Test Otomasyon uzmanısın. Web testlerinde Playwright kullanıyorsun.

KURALLARI SIKI SIKI UYGULA:
1. SADECE geçerli JSON döndür, başka yazı yazma
2. Selector önceliği: id > data-testid > name > class > CSS
3. Test bittiğinde testComplete: true yap
4. Emin değilsen confidence'ı düşür

SELECTOR ÖRNEKLER:
- Button: button:has-text("Giriş"), #login-btn
- Input: input[name="email"], #username
- Link: a:has-text("Kayıt"), a[href="/register"]`;

// ═══════════════════════════════════════════════════════════════════════════
// AI SERVICE
// ═══════════════════════════════════════════════════════════════════════════
class AIService {
  constructor() {
    if (!process.env.CLAUDE_API_KEY) {
      throw new Error('CLAUDE_API_KEY bulunamadı!');
    }
    this.client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });
    this.model = 'claude-sonnet-4-20250514';
    this.maxRetries = 3;
  }

  // ───────────────────────────────────────────────────────────────────────
  // SCREENSHOT ANALİZ (Retry ile)
  // ───────────────────────────────────────────────────────────────────────
  async analyzeScreenshot(screenshotPath, userPrompt, previousSteps = []) {
    const base64Image = await this._loadScreenshot(screenshotPath);
    const prompt = this._buildPrompt(userPrompt, previousSteps);

    // Retry ile API çağrısı
    let lastError;
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.client.messages.create({
          model: this.model,
          max_tokens: 512,
          system: SYSTEM_PROMPT,
          messages: [{
            role: 'user',
            content: [
              { 
                type: 'image', 
                source: { type: 'base64', media_type: 'image/png', data: base64Image } 
              },
              { type: 'text', text: prompt }
            ]
          }]
        });

        return this._parseResponse(response.content[0].text);

      } catch (error) {
        lastError = error;
        if (attempt < this.maxRetries && this._isRetryable(error)) {
          await this._sleep(1000 * attempt); // 1s, 2s, 3s
          continue;
        }
        throw error;
      }
    }
    throw lastError;
  }

  // ───────────────────────────────────────────────────────────────────────
  // BAĞLANTI TESTİ
  // ───────────────────────────────────────────────────────────────────────
  async testConnection() {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Test' }]
      });
      
      return { 
        success: true, 
        provider: 'Claude',
        model: this.model,
        response: response.content[0].text 
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  // PRIVATE: Screenshot Yükle
  // ───────────────────────────────────────────────────────────────────────
  async _loadScreenshot(path) {
    const buffer = await readFile(path);
    const sizeMB = buffer.length / (1024 * 1024);
    if (sizeMB > 20) throw new Error(`Screenshot çok büyük: ${sizeMB.toFixed(1)}MB`);
    return buffer.toString('base64');
  }

  // ───────────────────────────────────────────────────────────────────────
  // PRIVATE: Prompt Oluştur
  // ───────────────────────────────────────────────────────────────────────
  _buildPrompt(userPrompt, previousSteps) {
    let prompt = `Test: ${userPrompt}\n\n`;
    
    if (previousSteps.length) {
      prompt += 'Önceki adımlar:\n';
      previousSteps.slice(-5).forEach((s, i) => {
        const target = s.target ? ` → ${s.target}` : '';
        const status = s.success === false ? '❌' : '✅';
        prompt += `${status} ${i+1}. ${s.action}${target}\n`;
      });
      prompt += '\n';
    }

    prompt += `Sonraki adımı JSON döndür:
{
  "action": "${VALID_ACTIONS.join('|')}",
  "target": "CSS selector veya URL",
  "value": "değer (fill/type/wait için)",
  "reasoning": "kısa açıklama",
  "confidence": 0.95,
  "testComplete": false,
  "alternativeSelectors": ["alt1", "alt2"]
}`;

    return prompt;
  }

  // ───────────────────────────────────────────────────────────────────────
  // PRIVATE: Response Parse + Validate
  // ───────────────────────────────────────────────────────────────────────
  _parseResponse(text) {
    // JSON temizle
    const clean = text.replace(/```(?:json)?/g, '').trim();
    const jsonStart = clean.indexOf('{');
    const jsonEnd = clean.lastIndexOf('}');
    
    if (jsonStart === -1) {
      throw new Error('JSON bulunamadı');
    }
    
    const parsed = JSON.parse(clean.substring(jsonStart, jsonEnd + 1));

    // Action validation
    if (!VALID_ACTIONS.includes(parsed.action)) {
      throw new Error(`Geçersiz action: ${parsed.action}`);
    }

    // Action-specific validation
    if (parsed.action === 'navigate' && !parsed.target) {
      throw new Error('navigate için target (URL) gerekli');
    }
    if (['click', 'fill', 'type'].includes(parsed.action) && !parsed.target) {
      throw new Error(`${parsed.action} için target (selector) gerekli`);
    }

    return {
      action: parsed.action,
      target: parsed.target || null,
      value: parsed.value || null,
      reasoning: (parsed.reasoning || '').substring(0, 100),
      confidence: Math.max(0, Math.min(1, parseFloat(parsed.confidence) || 0.8)),
      testComplete: Boolean(parsed.testComplete),
      alternativeSelectors: (parsed.alternativeSelectors || []).slice(0, 3)
    };
  }

  // ───────────────────────────────────────────────────────────────────────
  // PRIVATE: Utilities
  // ───────────────────────────────────────────────────────────────────────
  _isRetryable(error) {
    return (
      error.status === 429 || // Rate limit
      error.status >= 500 ||  // Server error
      error.message?.includes('overloaded')
    );
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new AIService();
module.exports.VALID_ACTIONS = VALID_ACTIONS; 