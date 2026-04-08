// backend/manual-tests/test-login.js
const { chromium } = require('playwright');
const path = require('path');

async function loginTest() {
  console.log('🚀 Login Test Başlıyor...\n');
  
  const browser = await chromium.launch({ 
    headless: false,
    slowMo: 800
  });
  
  const page = await browser.newPage();
  
  // 1. Siteye git
  console.log('📍 [1/5] SauceDemo\'ya gidiliyor...');
  await page.goto('https://www.saucedemo.com');
  console.log('✅ Sayfa yüklendi\n');
  
  // 2. Username gir
  console.log('📍 [2/5] Username yazılıyor...');
  await page.fill('#user-name', 'standard_user');
  const ss1 = path.join(__dirname, '../test-results/screenshots/login-step1-username.png');
  await page.screenshot({ path: ss1 });
  console.log('✅ Username girildi\n');
  
  // 3. Password gir
  console.log('📍 [3/5] Password yazılıyor...');
  await page.fill('#password', 'secret_sauce');
  const ss2 = path.join(__dirname, '../test-results/screenshots/login-step2-password.png');
  await page.screenshot({ path: ss2 });
  console.log('✅ Password girildi\n');
  
  // 4. Login'e tıkla
  console.log('📍 [4/5] Login butonuna tıklanıyor...');
  await page.click('#login-button');
  await page.waitForLoadState('networkidle');
  console.log('✅ Login tamamlandı\n');
  
  // 5. Başarı kontrolü
  console.log('📍 [5/5] Başarı kontrol ediliyor...');
  const currentUrl = page.url();
  
  if (currentUrl.includes('inventory')) {
    console.log('✅ TEST BAŞARILI! Login olundu.\n');
    const ss3 = path.join(__dirname, '../test-results/screenshots/login-step3-success.png');
    await page.screenshot({ path: ss3 });
  } else {
    console.log('❌ TEST BAŞARISIZ! Login olunamadı.\n');
  }
  
  await page.waitForTimeout(3000);
  await browser.close();
  
  console.log('🎉 TEST TAMAMLANDI!\n');
  console.log('📸 3 screenshot kaydedildi:\n');
  console.log('   - login-step1-username.png');
  console.log('   - login-step2-password.png');
  console.log('   - login-step3-success.png\n');
}

loginTest().catch(error => {
  console.error('❌ HATA:', error.message);
  process.exit(1);
});