// src/config/logger.js

const AXIOM_DATASET = process.env.AXIOM_DATASET;
const AXIOM_TOKEN = process.env.AXIOM_TOKEN;

const originalConsoleError = console.error;

async function sendToAxiom(level, message, extraData = {}) {
  // Eğer .env içinde Axiom bilgileri tanımlı değilse göndermeyi atla (yerelde development yaparken patlamaması için)
  if (!AXIOM_TOKEN || !AXIOM_DATASET) return;

  try {
    const payload = [{
      _time: new Date().toISOString(),
      level: level,
      message: message,
      service: 'ai-test-automation-backend',
      environment: process.env.NODE_ENV || 'development',
      ...extraData
    }];

    await fetch(`https://api.axiom.co/v1/datasets/${AXIOM_DATASET}/ingest`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AXIOM_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
  } catch (e) {
    originalConsoleError('Axiom log gönderim hatası:', e.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// GLOBAL CONSOLE.ERROR OVERRIDE
// Tüm kod tabanındaki console.error çağrılarını otomatik olarak yakalar.
// Projede kod değişikliği yapmadan tüm mevcut hatalar (Agent hataları vb.) Axiom'a gider.
// ═══════════════════════════════════════════════════════════════════════════
console.error = function (...args) {
  // 1. Terminale/Docker loglarına normal şekilde yazdır
  originalConsoleError.apply(console, args);

  // 2. Gelen argümanları birleştirip tek bir string (mesaj) haline getir
  const message = args.map(arg => {
    if (arg instanceof Error) return arg.stack || arg.message; // Hata nesnesiyse stack trace'i al
    if (typeof arg === 'object') return JSON.stringify(arg);   // Obje ise string'e çevir
    return String(arg);
  }).join(' ');

  // 3. Axiom'a fırlat
  sendToAxiom('error', message);
};

// ═══════════════════════════════════════════════════════════════════════════
// API REQUEST LOGGER MIDDLEWARE
// Express.js'den geçen tüm API isteklerinin statü kodlarını ve sürelerini loglar.
// ═══════════════════════════════════════════════════════════════════════════
function requestLogger(req, res, next) {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const message = `${req.method} ${req.originalUrl} - ${res.statusCode} (${duration}ms)`;
    
    // Opsiyonel: Sadece "/api" ile başlayan istekleri veya belli bir threshold'u loglayabilirsiniz.
    // Şimdilik her isteği info olarak Axiom'a atıyoruz.
    sendToAxiom('info', message, {
      http_method: req.method,
      http_url: req.originalUrl,
      http_status: res.statusCode,
      duration_ms: duration
    });
  });
  
  next();
}

module.exports = {
  originalConsoleError,
  requestLogger
};
