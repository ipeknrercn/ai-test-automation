// backend/manual-tests/test-complex.js - DÜZELTILMIŞ VERSIYON
const { chromium } = require('playwright');
const path = require('path');

async function complexEcommerceTest() {
  console.log('🚀 KARMAŞIK E-TİCARET TEST SENARYOSU\n');
  console.log('Senaryo: Login → Ürün Filtrele → Sepete Ekle → Checkout\n');
  
  const browser = await chromium.launch({ 
    headless: false,
    slowMo: 800,
    args: ['--disable-web-security', '--no-sandbox']  // Network sorunları için
  });
  
  const page = await browser.newPage();
  
  // Default timeout'u artır
  page.setDefaultTimeout(60000);  // 60 saniye
  
  const screenshots = [];
  
  try {
    // ============================================
    // 1. LOGIN
    // ============================================
    console.log('📍 [1/10] SauceDemo\'ya gidiliyor...');
    console.log('   (60 saniye timeout, lütfen bekleyin...)\n');
    
    await page.goto('https://www.saucedemo.com', {
      timeout: 60000,
      waitUntil: 'domcontentloaded'
    });
    
    screenshots.push(await takeScreenshot(page, 'step01-homepage'));
    console.log('✅ Anasayfa yüklendi\n');
    
    console.log('📍 [2/10] Login bilgileri giriliyor...');
    await page.fill('#user-name', 'standard_user');
    await page.fill('#password', 'secret_sauce');
    screenshots.push(await takeScreenshot(page, 'step02-credentials'));
    console.log('✅ Bilgiler girildi\n');
    
    console.log('📍 [3/10] Login butonuna tıklanıyor...');
    await page.click('#login-button');
    await page.waitForLoadState('networkidle', { timeout: 30000 });
    screenshots.push(await takeScreenshot(page, 'step03-logged-in'));
    console.log('✅ Login başarılı\n');
    
    // ============================================
    // 2. ÜRÜN FİLTRELEME
    // ============================================
    console.log('📍 [4/10] Ürünler fiyata göre sıralanıyor (Düşük → Yüksek)...');
    await page.selectOption('.product_sort_container', 'lohi');
    await page.waitForTimeout(1500);
    screenshots.push(await takeScreenshot(page, 'step04-sorted-low-high'));
    console.log('✅ Ürünler sıralandı\n');
    
    console.log('📍 [5/10] En ucuz ürün sepete ekleniyor...');
    const firstAddButton = await page.locator('button[id^="add-to-cart"]').first();
    await firstAddButton.click();
    await page.waitForTimeout(1000);
    screenshots.push(await takeScreenshot(page, 'step05-item-added'));
    console.log('✅ Ürün sepete eklendi\n');
    
    // ============================================
    // 3. FİLTREYİ DEĞİŞTİR - BAŞKA ÜRÜN EKLE
    // ============================================
    console.log('📍 [6/10] Sıralama değiştiriliyor (Yüksek → Düşük)...');
    await page.selectOption('.product_sort_container', 'hilo');
    await page.waitForTimeout(1500);
    screenshots.push(await takeScreenshot(page, 'step06-sorted-high-low'));
    console.log('✅ Sıralama değiştirildi\n');
    
    console.log('📍 [7/10] En pahalı ürün de sepete ekleniyor...');
    const secondAddButton = await page.locator('button[id^="add-to-cart"]').first();
    await secondAddButton.click();
    await page.waitForTimeout(1000);
    screenshots.push(await takeScreenshot(page, 'step07-second-item-added'));
    console.log('✅ İkinci ürün eklendi\n');
    
    // ============================================
    // 4. SEPETİ KONTROL ET
    // ============================================
    console.log('📍 [8/10] Sepete gidiliyor...');
    await page.click('.shopping_cart_link');
    await page.waitForLoadState('networkidle', { timeout: 30000 });
    
    const itemCount = await page.locator('.cart_item').count();
    console.log(`✅ Sepette ${itemCount} ürün var\n`);
    
    screenshots.push(await takeScreenshot(page, 'step08-cart-view'));
    
    if (itemCount !== 2) {
      throw new Error(`Beklenen: 2 ürün, Gerçek: ${itemCount} ürün`);
    }
    
    // ============================================
    // 5. CHECKOUT BAŞLAT
    // ============================================
    console.log('📍 [9/10] Checkout başlatılıyor...');
    await page.click('#checkout');
    await page.waitForLoadState('networkidle', { timeout: 30000 });
    
    await page.fill('#first-name', 'Test');
    await page.fill('#last-name', 'User');
    await page.fill('#postal-code', '34000');
    screenshots.push(await takeScreenshot(page, 'step09-checkout-info'));
    console.log('✅ Checkout bilgileri girildi\n');
    
    await page.click('#continue');
    await page.waitForLoadState('networkidle', { timeout: 30000 });
    
    // ============================================
    // 6. ÖDEMEYİ TAMAMLA
    // ============================================
    console.log('📍 [10/10] Sipariş özeti kontrol ediliyor...');
    screenshots.push(await takeScreenshot(page, 'step10-order-overview'));
    
    const totalText = await page.locator('.summary_total_label').textContent();
    console.log(`✅ Toplam Fiyat: ${totalText}\n`);
    
    await page.click('#finish');
    await page.waitForLoadState('networkidle', { timeout: 30000 });
    
    const successMessage = await page.locator('.complete-header').textContent();
    screenshots.push(await takeScreenshot(page, 'step11-order-complete'));
    
    if (successMessage.includes('Thank you')) {
      console.log('🎉 SİPARİŞ TAMAMLANDI!\n');
      console.log(`✅ Mesaj: "${successMessage}"\n`);
    } else {
      throw new Error('Sipariş tamamlama mesajı görüntülenemedi');
    }
    
    await page.waitForTimeout(3000);
    
  } catch (error) {
    console.error('❌ TEST BAŞARISIZ:', error.message);
    screenshots.push(await takeScreenshot(page, 'error-screenshot'));
    throw error;
  } finally {
    await browser.close();
  }
  
  // TEST RAPORU
  console.log('═══════════════════════════════════════');
  console.log('           TEST RAPORU                 ');
  console.log('═══════════════════════════════════════');
  console.log(`✅ Toplam Adım: 11`);
  console.log(`📸 Screenshot Sayısı: ${screenshots.length}`);
  console.log(`📂 Klasör: backend/test-results/screenshots/\n`);
  console.log('Screenshot\'lar:');
  screenshots.forEach((ss, i) => {
    console.log(`   ${i + 1}. ${ss}`);
  });
  console.log('\n🎉 KARMAŞIK TEST SENARYOSU BAŞARIYLA TAMAMLANDI!\n');
}

async function takeScreenshot(page, fileName) {
  const screenshotPath = path.join(
    __dirname, 
    `../test-results/screenshots/${fileName}.png`
  );
  await page.screenshot({ path: screenshotPath });
  return `${fileName}.png`;
}

complexEcommerceTest().catch(error => {
  console.error('\n❌ KRİTİK HATA:', error.message);
  console.error('\n💡 Olası Çözümler:');
  console.error('   1. İnternet bağlantınızı kontrol edin');
  console.error('   2. VPN varsa kapatın');
  console.error('   3. Birkaç saniye bekleyip tekrar deneyin');
  console.error('   4. Tarayıcıda https://www.saucedemo.com açılıyor mu kontrol edin\n');
  process.exit(1);
});