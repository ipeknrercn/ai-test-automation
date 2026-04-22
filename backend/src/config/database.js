// src/config/database.js
const { PrismaClient } = require('@prisma/client');

// ═══════════════════════════════════════════════════════════════════════════
// ORTAM BAZLI LOG SEVİYESİ
// Production'da query logları kapatılır (performans + güvenlik)
// ═══════════════════════════════════════════════════════════════════════════
const isProduction = process.env.NODE_ENV === 'production';

const prisma = new PrismaClient({
  log: isProduction
    ? ['warn', 'error']
    : ['query', 'info', 'warn', 'error'],

  // Connection pool ayarları
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// GRACEFUL SHUTDOWN
// Uygulama kapanırken veritabanı bağlantısını düzgünce kapat.
// Bağlantı havuzunda açık kalan bağlantılar kaynak sızıntısı yapar.
// ═══════════════════════════════════════════════════════════════════════════
async function gracefulShutdown(signal) {
  console.log(`\n📦 ${signal} alındı — veritabanı bağlantısı kapatılıyor...`);
  await prisma.$disconnect();
  console.log('📦 Veritabanı bağlantısı kapatıldı.');
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// ═══════════════════════════════════════════════════════════════════════════
// BAĞLANTI SAĞLIK KONTROLÜ
// Uygulama başlarken veya health-check endpoint'inde çağrılabilir.
// ═══════════════════════════════════════════════════════════════════════════
async function checkConnection() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { connected: true };
  } catch (error) {
    return { connected: false, error: error.message };
  }
}

module.exports = prisma;
module.exports.checkConnection = checkConnection;