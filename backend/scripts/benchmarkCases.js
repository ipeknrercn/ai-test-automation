/**
 * Tüm manuel / benchmark senaryoları — tek kaynak.
 *
 * testManual*.js ve runBenchmark.js buradan okur.
 */

const MANUAL_CASES = {
  'saucedemo-sort': {
    id: 'MANUAL-SORT',
    name: 'SauceDemo Sort Dropdown',
    sourceScript: 'testManual.js',
    difficulty: 'medium',
    testName: 'MANUAL-Saucedemo-Sort-Dropdown',
    targetUrl: 'https://www.saucedemo.com',
    userPrompt: [
      'SauceDemo sitesinde test et.',
      '',
      '1) Login: kullanıcı adı "standard_user", şifre "secret_sauce". Login butonuna tıkla.',
      '2) Inventory sayfasının (/inventory.html) açıldığını doğrula; "Products" ve ürün listesi görünmeli.',
      '3) Inventory sayfasında sağ üstteki sıralama (sort) dropdown kutusunu bul.',
      '4) Dropdown\'u aç. 1. seçeneği select ile uygula (zaten seçili olsa bile). Sayfa hatasız yüklendiğini doğrula.',
      '5) Dropdown\'u tekrar aç. 2. seçeneği select ile uygula. Sayfa hatasız yüklendiğini doğrula.',
      '6) Dropdown\'u tekrar aç. 3. seçeneği select ile uygula. Sayfa hatasız yüklendiğini doğrula.',
      '7) Yalnızca bu 3 seçenek (1., 2., 3.) uygulanmalı; 4. seçeneğe (Price high to low) geçme. Üçü de sorunsuzsa complete success:true. Aksi halde success:false.'
    ].join('\n'),
    expectedOutcome: { urlContains: '/inventory.html', visibleText: 'Products' }
  },

  'saucedemo-cart': {
    id: 'MANUAL-CART',
    name: 'SauceDemo Cart Checkout',
    sourceScript: 'testManualCartCheckout.js',
    difficulty: 'medium',
    testName: 'MANUAL-Saucedemo-Cart-Checkout',
    targetUrl: 'https://www.saucedemo.com',
    userPrompt: [
      "SauceDemo'ya git, kullanıcı adı alanına standard_user, şifre alanına secret_sauce yaz. Login butonuna tıkla.",
      'sepete 29.98 dolardan az fiyata sahip ürünleri bul ve hepsini sepete ekle.',
      'sepete git ve sepetteki ürünleri satın almak için checkout butonuna tıkla.',
      'satın alma sırasında isim kısmına İpek soyisim kısmına Ercan posta kodu kısmına 34112 yaz. continue butonuna tıkla.',
      'tamamlandı ekranını doğrula.',
      'testi bitir.'
    ].join(' '),
    expectedOutcome: { urlContains: 'checkout-complete', visibleText: 'Thank you' }
  },

  'remora-contact': {
    id: 'MANUAL-REMORA',
    name: 'Remora Contact Form',
    sourceScript: 'testManualRemoraContact.js',
    difficulty: 'hard',
    testName: 'MANUAL-Remora-Contact-Form',
    targetUrl: 'https://remora.com.tr/',
    userPrompt: [
      'https://remora.com.tr/ bu siteyi aç, menülerden contact sekmesini seç.',
      'açılan sayfadan büyük harflerle yazılı olan contact us ve altında share your questions and feedback with us yazan kutucuğuna tıkla.',
      'sonra continue butonuna tıkla.',
      "açılan sayfada your name kutucuğuna: 'ben bir botum3' yaz.",
      "email kısmına 'info@remora.com.tr' yaz.",
      "subject kısmına: 'siteniz botlara açık ve koruma içermiyor'. yaz",
      "your message butonuna da 'ben bir botum ve size mail atabiliyorum. güvenlik açıklarınızı kapatmalısınız!' yaz.",
      'sonra continue butonuna tıkla.',
      'testi bitir.'
    ].join(' '),
    expectedOutcome: { urlContains: 'contact', visibleText: 'Contact' }
  }
};

/** Eski runBenchmark senaryoları (isteğe bağlı tam set) */
const LEGACY_SCENARIOS = [
  {
    id: 'S1',
    name: 'SauceDemo Basit Login',
    difficulty: 'easy',
    targetUrl: 'https://www.saucedemo.com',
    userPrompt:
      'Kullanıcı adı alanına "standard_user" yaz. Şifre alanına "secret_sauce" yaz. Login butonuna tıkla. Inventory sayfasının açıldığını doğrula.',
    expectedOutcome: { urlContains: '/inventory.html', visibleText: 'Products' }
  },
  {
    id: 'S2',
    name: 'SauceDemo Sepet ve Checkout',
    difficulty: 'easy-medium',
    targetUrl: 'https://www.saucedemo.com',
    userPrompt:
      'standard_user / secret_sauce ile login ol. Sauce Labs Backpack ürününü sepete ekle. Sepet ikonuna tıkla. Checkout butonuna tıkla.',
    expectedOutcome: { urlContains: '/checkout', visibleText: 'Checkout' }
  },
  {
    id: 'S3',
    name: 'OrangeHRM Login + Dashboard',
    difficulty: 'medium',
    targetUrl: 'https://opensource-demo.orangehrmlive.com/web/index.php/auth/login',
    userPrompt:
      'Username alanına "Admin" yaz. Password alanına "admin123" yaz. Login butonuna tıkla. Dashboard sayfasının açıldığını doğrula.',
    expectedOutcome: { urlContains: '/dashboard', visibleText: 'Dashboard' }
  },
  {
    id: 'S4',
    name: 'OrangeHRM Leave Navigasyonu',
    difficulty: 'medium-hard',
    targetUrl: 'https://opensource-demo.orangehrmlive.com/web/index.php/auth/login',
    userPrompt:
      'Admin/admin123 ile login ol. Sol menüden Leave sekmesine tıkla. Üst menüden My Leave seçeneğine tıkla. My Leave List sayfasının açıldığını doğrula.',
    expectedOutcome: { urlContains: '/leave', visibleText: 'My Leave List' }
  },
  {
    id: 'S5',
    name: 'The Internet Form Authentication',
    difficulty: 'hard',
    targetUrl: 'https://the-internet.herokuapp.com/login',
    userPrompt:
      'Username alanına "tomsmith" yaz. Password alanına "SuperSecretPassword!" yaz. Login butonuna tıkla. Secure Area\'ya başarılı giriş yapıldığını doğrula.',
    expectedOutcome: { urlContains: '/secure', visibleText: 'You logged into a secure area' }
  }
];

const CASE_ALIASES = {
  testmanual: 'saucedemo-sort',
  'testmanual.js': 'saucedemo-sort',
  sort: 'saucedemo-sort',
  testmanualcartcheckout: 'saucedemo-cart',
  'testmanualcartcheckout.js': 'saucedemo-cart',
  cart: 'saucedemo-cart',
  testmanualremoracontact: 'remora-contact',
  'testmanualremoracontact.js': 'remora-contact',
  remora: 'remora-contact',
  legacy: 'legacy-all',
  'legacy-all': 'legacy-all',
  'manual-all': 'manual-all'
};

function normalizeCaseId(raw) {
  if (!raw) return null;
  const key = String(raw).trim().toLowerCase().replace(/\.js$/i, '');
  if (CASE_ALIASES[key]) return CASE_ALIASES[key];
  if (MANUAL_CASES[key]) return key;
  return null;
}

function manualCaseToScenario(manual) {
  return {
    id: manual.id,
    name: manual.name,
    difficulty: manual.difficulty,
    targetUrl: manual.targetUrl,
    userPrompt: manual.userPrompt,
    expectedOutcome: manual.expectedOutcome || {},
    testName: manual.testName,
    sourceScript: manual.sourceScript
  };
}

function getManualCase(caseId) {
  const id = normalizeCaseId(caseId);
  if (!id || id === 'legacy-all' || id === 'manual-all') {
    throw new Error(`Geçersiz manuel case: ${caseId}`);
  }
  const manual = MANUAL_CASES[id];
  if (!manual) throw new Error(`Bilinmeyen case: ${caseId}`);
  return { ...manual };
}

function resolveBenchmarkScenarios(caseId) {
  const id = normalizeCaseId(caseId);
  if (!id) return null;
  if (id === 'legacy-all') return [...LEGACY_SCENARIOS];
  if (id === 'manual-all') {
    return Object.values(MANUAL_CASES).map(manualCaseToScenario);
  }
  return [manualCaseToScenario(MANUAL_CASES[id])];
}

function listCases() {
  const manual = Object.entries(MANUAL_CASES).map(([key, c]) => ({
    caseId: key,
    script: c.sourceScript,
    name: c.name,
    difficulty: c.difficulty
  }));
  return { manual, legacy: LEGACY_SCENARIOS.map((s) => ({ caseId: 'legacy-all', id: s.id, name: s.name })) };
}

function printCaseList() {
  const { manual, legacy } = listCases();
  console.log('\nManuel senaryolar (runBenchmark --case <id>):\n');
  for (const c of manual) {
    console.log(`  ${c.caseId.padEnd(18)}  ${c.script.padEnd(28)}  ${c.name} (${c.difficulty})`);
  }
  console.log('\n  manual-all          Tüm manuel senaryolar (sırayla)');
  console.log('  legacy-all          Eski S1–S5 seti\n');
  console.log('Örnekler:');
  console.log('  node scripts/runBenchmark.js --case saucedemo-sort');
  console.log('  node scripts/runBenchmark.js --case remora-contact --runs 2');
  console.log('  $env:BENCHMARK_CASE="saucedemo-cart"; node scripts/runBenchmark.js\n');
}

module.exports = {
  MANUAL_CASES,
  LEGACY_SCENARIOS,
  getManualCase,
  resolveBenchmarkScenarios,
  normalizeCaseId,
  listCases,
  printCaseList
};
