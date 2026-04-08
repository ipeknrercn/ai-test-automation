// backend/test-api.js
// AMAÇ: Backend API'nin çalışıp çalışmadığını test etmek

async function testAPI() {
  console.log('🧪 Backend API Test Başlıyor...\n');

  const BASE_URL = 'http://localhost:3001';

  try {
    // ============================================
    // 1. HEALTH CHECK
    // ============================================
    console.log('📍 [1/4] Health check testi...');
    const healthRes = await fetch(`${BASE_URL}/health`);
    const healthData = await healthRes.json();
    console.log('✅ Health:', healthData);
    console.log();

    // ============================================
    // 2. TEST ÇALIŞTIR
    // ============================================
    console.log('📍 [2/4] Test çalıştırma...');
    const runRes = await fetch(`${BASE_URL}/api/tests/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        testName: 'API Test',
        userPrompt: 'Login ol ve dashboard\'a git',
        targetUrl: 'https://www.saucedemo.com'
      })
    });
    const runData = await runRes.json();
    console.log('✅ Test çalıştırıldı:');
    console.log('   Test ID:', runData.data.id);
    console.log('   Status:', runData.data.status);
    console.log('   Duration:', runData.data.durationMs, 'ms');
    console.log();

    // ============================================
    // 3. TEST GEÇMİŞİNİ GETİR
    // ============================================
    console.log('📍 [3/4] Test geçmişi getiriliyor...');
    const historyRes = await fetch(`${BASE_URL}/api/tests/history?limit=5`);
    const historyData = await historyRes.json();
    console.log('✅ Geçmiş testler:', historyData.count, 'adet');
    console.log();

    // ============================================
    // 4. İSTATİSTİKLER
    // ============================================
    console.log('📍 [4/4] İstatistikler getiriliyor...');
    const statsRes = await fetch(`${BASE_URL}/api/tests/stats`);
    const statsData = await statsRes.json();
    console.log('✅ İstatistikler:');
    console.log('   Toplam test:', statsData.data.total);
    console.log('   Başarılı:', statsData.data.success);
    console.log('   Başarısız:', statsData.data.failed);
    console.log('   Başarı oranı:', statsData.data.successRate + '%');
    console.log();

    console.log('🎉 TÜM API TESTLERİ BAŞARILI!\n');

  } catch (error) {
    console.error('❌ HATA:', error.message);
  }
}

testAPI();