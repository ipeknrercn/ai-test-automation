// src/services/actionExecutor.js
//
// SELF-HEALING ACTION EXECUTOR (v3 — Final)
//
// KRİTİK İYİLEŞTİRMELER:
// 1. React inputs için native value setter pattern (Object.getOwnPropertyDescriptor)
//    Bu, React 16+ için bilinen tek güvenilir bypass yöntemi.
// 2. Fill sonrası validation: input.value === beklenen value mı?
// 3. Hover-based menu desteği (OrangeHRM gibi)
// 4. Date input format detection: placeholder'a göre format belirleme
// 5. Custom dropdown click sonrası option arama daha geniş

const CONFIDENCE_THRESHOLD = 0.85;
const ACTION_TIMEOUT = 8000;

function buildLocatorStrategies(fingerprint) {
  const strategies = [];
  if (fingerprint.dataTest) strategies.push({ name: 'data-test', build: (page) => page.locator(`[data-test="${fingerprint.dataTest}"], [data-testid="${fingerprint.dataTest}"], [data-cy="${fingerprint.dataTest}"]`).first() });
  if (fingerprint.id) strategies.push({ name: 'id', build: (page) => page.locator(`#${cssEscape(fingerprint.id)}`).first() });
  if (fingerprint.name) strategies.push({ name: 'name', build: (page) => page.locator(`[name="${fingerprint.name}"]`).first() });
  if (fingerprint.ariaLabel) strategies.push({ name: 'aria-label', build: (page) => page.locator(`[aria-label="${fingerprint.ariaLabel}"]`).first() });
  if (fingerprint.cssSelector) strategies.push({ name: 'css', build: (page) => page.locator(fingerprint.cssSelector).first() });
  if (fingerprint.xpath) strategies.push({ name: 'xpath', build: (page) => page.locator(`xpath=${fingerprint.xpath}`).first() });
  if (fingerprint.placeholder) strategies.push({ name: 'placeholder', build: (page) => page.locator(`[placeholder="${fingerprint.placeholder}"]`).first() });
  if (fingerprint.text && fingerprint.text.length > 0 && fingerprint.text.length < 50) {
    strategies.push({ name: 'text', build: (page) => page.getByText(fingerprint.text, { exact: false }).first() });
  }
  return strategies;
}

function cssEscape(str) {
  if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(str);
  return String(str).replace(/([!"#$%&'()*+,./:;<=>?@[\]^`{|}~])/g, '\\$1');
}

/**
 * REACT NATIVE VALUE SETTER (KRİTİK)
 *
 * React 16+'da `input.value = "..."` çalışmaz çünkü React kendi event sistemine
 * bağlı bir prototype getter/setter kullanır. Bunu bypass etmek için:
 * 1. Native HTMLInputElement prototype'undan setter'ı al
 * 2. Element'e bu setter ile yaz
 * 3. 'input' event'ini bubbling ile dispatch et
 *
 * Bu yöntem Facebook'un React deposunda önerilen tek doğru çözümdür.
 */
async function reactNativeSet(page, locator, value) {
  await locator.evaluate((el, v) => {
    const tag = el.tagName.toLowerCase();
    let nativeSetter;

    if (tag === 'textarea') {
      nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    } else {
      nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    }

    nativeSetter.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

/**
 * SUPER FILL — Birden fazla yöntem ile dener, sonucu doğrular
 *
 * Akış:
 * 1. Yöntem A: React native value setter (en güvenilir)
 * 2. Yöntem B: Yöntem A başarısız olursa pressSequentially (gerçek klavye)
 * 3. Yöntem C: Hala olmazsa Playwright fill (fallback)
 *
 * Her denemeden sonra input.value değerini KONTROL eder.
 * Beklenen değerle eşleşmiyorsa fail döner (false positive önler).
 */
async function superFill(page, locator, value) {
  await locator.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
  await locator.click({ timeout: ACTION_TIMEOUT });

  // Mevcut değeri temizle (React-aware)
  await page.keyboard.press('Control+A').catch(() => {});
  await page.keyboard.press('Delete').catch(() => {});
  await page.waitForTimeout(100);

  const expectedValue = String(value);

  // ─── Yöntem A: React Native Setter ───
  try {
    await reactNativeSet(page, locator, expectedValue);
    await page.waitForTimeout(150);

    const actual = await locator.inputValue().catch(() => null);
    if (actual === expectedValue) {
      // Blur ile commit
      await page.keyboard.press('Tab').catch(() => {});
      await page.waitForTimeout(200);
      return { success: true, method: 'react-native-setter' };
    }
  } catch (e) {
    // Yöntem A başarısız, B'yi dene
  }

  // ─── Yöntem B: pressSequentially (karakter karakter) ───
  try {
    // Önce tekrar temizle
    await locator.click({ clickCount: 3 }).catch(() => {});
    await page.keyboard.press('Backspace').catch(() => {});
    const currentVal = await locator.inputValue().catch(() => '');
    for (let i = 0; i < currentVal.length + 2; i++) {
      await page.keyboard.press('Backspace');
    }

    await locator.pressSequentially(expectedValue, { delay: 30, timeout: ACTION_TIMEOUT });
    await page.waitForTimeout(150);

    const actual = await locator.inputValue().catch(() => null);
    if (actual === expectedValue) {
      await page.keyboard.press('Tab').catch(() => {});
      await page.waitForTimeout(200);
      return { success: true, method: 'press-sequentially' };
    }
  } catch (e) {
    // Yöntem B başarısız
  }

  // ─── Yöntem C: Playwright fill (fallback) ───
  try {
    await locator.fill(expectedValue, { timeout: ACTION_TIMEOUT });
    await page.waitForTimeout(150);

    const actual = await locator.inputValue().catch(() => null);
    if (actual === expectedValue) {
      await page.keyboard.press('Tab').catch(() => {});
      return { success: true, method: 'playwright-fill' };
    }

    return {
      success: false,
      error: `Fill yapıldı ama değer doğrulanamadı. Beklenen: "${expectedValue}", Gerçek: "${actual}". Form değeri reddetmiş olabilir (örn: geçersiz tarih).`
    };
  } catch (e) {
    return { success: false, error: `Tüm fill yöntemleri başarısız: ${e.message}` };
  }
}

/**
 * CUSTOM DROPDOWN SELECT
 */
async function customDropdownSelect(page, locator, value) {
  await locator.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
  await locator.click({ timeout: ACTION_TIMEOUT });
  await page.waitForTimeout(700);

  const optionSelectors = [
    `[role="option"]:has-text("${value}")`,
    `[role="listbox"] >> text="${value}"`,
    `[role="menuitem"]:has-text("${value}")`,
    `.oxd-select-option:has-text("${value}")`,
    `.oxd-select-dropdown >> text="${value}"`,
    `.ant-select-item:has-text("${value}")`,
    `.MuiMenuItem-root:has-text("${value}")`,
    `li:has-text("${value}"):visible`
  ];

  for (const sel of optionSelectors) {
    try {
      const opt = page.locator(sel).first();
      const visible = await opt.isVisible({ timeout: 1000 }).catch(() => false);
      if (visible) {
        await opt.click({ timeout: 3000 });
        return { success: true, optionStrategy: sel };
      }
    } catch (e) { /* try next */ }
  }

  try {
    await page.getByText(value, { exact: true }).first().click({ timeout: 3000 });
    return { success: true, optionStrategy: 'getByText-exact' };
  } catch (e) {
    return { success: false, error: `Dropdown açıldı ama "${value}" seçeneği bulunamadı` };
  }
}

/**
 * HOVER-BASED MENU CLICK
 *
 * OrangeHRM gibi siteler hover ile alt menü açar. Direkt click çalışmaz.
 * Çözüm: Önce hover, sonra biraz bekle, sonra click.
 */
async function hoverThenClick(page, locator) {
  await locator.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
  await locator.hover({ timeout: ACTION_TIMEOUT });
  await page.waitForTimeout(500);
  await locator.click({ timeout: ACTION_TIMEOUT });
}

/**
 * ANA EXECUTOR
 */
async function executeWithHealing(page, element, action, value = null) {
  if (!element) {
    return { success: false, error: 'Element bulunamadı', fallbackChain: [] };
  }

  const strategies = buildLocatorStrategies(element.fingerprint);
  const fallbackChain = [];

  for (const strategy of strategies) {
    try {
      const locator = strategy.build(page);
      await locator.waitFor({ state: 'visible', timeout: 2000 }).catch(() => {});
      const isVisible = await locator.isVisible().catch(() => false);
      if (!isVisible) {
        fallbackChain.push({ strategy: strategy.name, status: 'not_visible' });
        continue;
      }

      switch (action) {
        case 'click': {
          // Menü öğesi mi? (a.oxd-main-menu-item gibi) — hover gerektirebilir
          const className = element.fingerprint.cssSelector || '';
          if (className.includes('main-menu-item') || className.includes('nav-item') || className.includes('menu-item')) {
            await hoverThenClick(page, locator);
          } else {
            await locator.click({ timeout: ACTION_TIMEOUT });
          }
          break;
        }

        case 'fill': {
          const fillResult = await superFill(page, locator, value || '');
          if (!fillResult.success) {
            throw new Error(fillResult.error);
          }
          fallbackChain.push({ strategy: strategy.name, status: 'success', method: fillResult.method });
          return {
            success: true,
            strategyUsed: `${strategy.name} → ${fillResult.method}`,
            fallbackChain,
            error: null
          };
        }

        case 'type':
          await locator.click();
          await locator.pressSequentially(String(value || ''), { delay: 50, timeout: ACTION_TIMEOUT });
          break;

        case 'select': {
          const tag = element.tag;
          if (tag === 'select') {
            try {
              await locator.selectOption(value, { timeout: 3000 });
              break;
            } catch (e) {
              const result = await customDropdownSelect(page, locator, value);
              if (!result.success) throw new Error(result.error);
              break;
            }
          } else {
            const result = await customDropdownSelect(page, locator, value);
            if (!result.success) throw new Error(result.error);
            break;
          }
        }

        case 'press':
          await locator.press(value || 'Enter', { timeout: ACTION_TIMEOUT });
          break;

        case 'hover':
          await locator.hover({ timeout: ACTION_TIMEOUT });
          break;

        default:
          throw new Error(`Bilinmeyen aksiyon: ${action}`);
      }

      fallbackChain.push({ strategy: strategy.name, status: 'success' });
      return { success: true, strategyUsed: strategy.name, fallbackChain, error: null };
    } catch (err) {
      fallbackChain.push({
        strategy: strategy.name,
        status: 'failed',
        error: err.message.substring(0, 200)
      });
    }
  }

  // BBox fallback (sadece click/hover)
  if (element.bbox && (action === 'click' || action === 'hover')) {
    try {
      const cx = element.bbox.x + element.bbox.width / 2;
      const cy = element.bbox.y + element.bbox.height / 2;
      if (action === 'click') {
        await page.mouse.move(cx, cy);
        await page.waitForTimeout(300); // hover effect için
        await page.mouse.click(cx, cy);
      } else {
        await page.mouse.move(cx, cy);
      }
      fallbackChain.push({ strategy: 'bbox-coordinate', status: 'success' });
      return {
        success: true,
        strategyUsed: 'bbox-coordinate',
        fallbackChain,
        error: null,
        warning: 'Tüm DOM stratejileri başarısız, koordinat fallback kullanıldı'
      };
    } catch (err) {
      fallbackChain.push({ strategy: 'bbox-coordinate', status: 'failed', error: err.message });
    }
  }

  const failedStrategies = fallbackChain
    .filter(f => f.status === 'failed')
    .map(f => `${f.strategy}: ${f.error}`)
    .join(' | ');

  return {
    success: false,
    strategyUsed: null,
    fallbackChain,
    error: `${strategies.length} strateji denendi, hepsi başarısız. ${failedStrategies}`
  };
}

function evaluateConfidence(aiConfidence) {
  if (aiConfidence == null) return { passed: true, manual: false };
  if (aiConfidence < CONFIDENCE_THRESHOLD) {
    return {
      passed: false,
      manual: true,
      message: `Düşük güven (%${(aiConfidence * 100).toFixed(0)}) — manuel kontrol önerilir`
    };
  }
  return { passed: true, manual: false };
}

module.exports = {
  executeWithHealing,
  evaluateConfidence,
  buildLocatorStrategies,
  superFill,
  customDropdownSelect,
  hoverThenClick,
  CONFIDENCE_THRESHOLD
};