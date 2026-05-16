// src/services/actionExecutor.js
//
// VERSION-AWARE ACTION EXECUTOR
//
// executeSimple() - V2/V3 için: tek strateji, fallback yok
// executeWithHealing() - V4 için: çok katmanlı self-healing
//
// Navigasyon iyileştirmesi: MUI gibi sitelerde genel css yerine metin/href öncelikli
// locator + tıklama sonrası metin doğrulaması.

const CONFIDENCE_THRESHOLD = 0.85;
const ACTION_TIMEOUT = 8000;

function cssEscape(str) {
  if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(str);
  return String(str).replace(/([!"#$%&'()*+,./:;<=>?@[\]^`{|}~])/g, '\\$1');
}

function normalizeText(t) {
  return String(t || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Form / checkout / sepet — URL değişmese de başarılı sayılır */
function isFormActionElement(element) {
  if (!element) return false;
  const text = normalizeText(element.text || element.fingerprint?.text);
  if (!text || text.length > 30) return false;
  if (
    /^(continue|submit|next|back|send|confirm|save|apply|cancel|done|finish|checkout|tamam|devam|gönder|onayla|kaydet|iptal)$/i.test(
      text
    )
  ) {
    return true;
  }
  if (text.length <= 20 && /\b(continue|submit|next|checkout|devam|gönder|onayla)\b/i.test(text)) {
    return true;
  }
  return false;
}

/** Sepet, ürün, e-ticaret aksiyonları — menü navigasyonu değildir */
function isInPageActionElement(element) {
  if (!element) return false;
  if (isFormActionElement(element)) return true;
  const text = normalizeText(element.text || element.fingerprint?.text);
  const dt = String(element?.fingerprint?.dataTest || '').toLowerCase();
  if (/add-to-cart|add_to_cart|remove-from-cart|shopping[-_]?cart|cart[-_]?badge|checkout|addtocart/.test(dt)) {
    return true;
  }
  if (/add to cart|remove|shopping cart|checkout/i.test(text)) return true;
  return false;
}

function isNavigationElement(element) {
  if (!element) return false;
  if (isInPageActionElement(element)) return false;
  const navTypes = ['link', 'menuitem', 'tab'];
  if (navTypes.includes(element.type)) return true;
  const text = normalizeText(element.text || element.fingerprint?.text);
  if (!text || text.length > 50) return false;
  if (element.tag === 'a') return true;
  if (['button', 'link'].includes(element.tag) && element.type === 'button') {
    const href = element.attrs?.href || element.fingerprint?.href;
    if (href && href.length > 1 && !href.startsWith('javascript:')) return true;
    if (/^(home|about|contact|products|blog|news|leave|pim|admin|claim|buzz|iletişim|iletisim)$/i.test(text)) {
      return true;
    }
    if (text.length <= 12 && text === text.toUpperCase() && /^[A-Z][A-Z0-9\s-]+$/.test(text)) {
      return true;
    }
  }
  return false;
}

/** MuiButton-root gibi sayfada onlarca eşleşen selector */
function isFormInputElement(element) {
  if (!element) return false;
  return ['input', 'textarea', 'date-input'].includes(element.type) ||
    element.tag === 'input' || element.tag === 'textarea';
}

/** MUI/React geçici id — #:rj: CSS ile yanlış eşleşir */
function isUnstableReactId(id) {
  if (!id || typeof id !== 'string') return false;
  const s = id.trim();
  return /^:r[a-z0-9]+:$/i.test(s) || (s.startsWith(':') && s.endsWith(':') && s.length <= 8);
}

function buildIdLocator(page, id) {
  const safe = String(id).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  if (isUnstableReactId(id)) {
    return page.locator(`[id="${safe}"]`).first();
  }
  return page.locator(`#${cssEscape(id)}`).first();
}

function isDropdownOptionElement(element) {
  if (!element) return false;
  if (element.type === 'dropdown-option') return true;
  const css = String(element?.fingerprint?.cssSelector || '').toLowerCase();
  return (
    css.includes('oxd-select-option') ||
    css.includes('ant-select-item') ||
    css.includes('muimenuitem') ||
    css.includes('select-option')
  );
}

function buildOptionTextRegex(label) {
  const text = String(label || '').trim();
  if (!text) return null;
  const codeDash = text.match(/^([A-Z]{2,})\s*[-–]\s*(.+)$/i);
  if (codeDash) {
    const code = codeDash[1];
    const tail = codeDash[2].replace(/\s+/g, '').substring(0, 8);
    if (tail.length >= 4) {
      return new RegExp(`${escapeRegex(code)}\\s*[-–]?\\s*${escapeRegex(tail)}`, 'i');
    }
  }
  const snippet = text.length > 50 ? text.substring(0, 50) : text;
  return new RegExp(escapeRegex(snippet), 'i');
}

function getOpenDropdownPanel(page) {
  return page
    .locator(
      '.oxd-select-dropdown--active, .oxd-select-dropdown:not([style*="display: none"]), [role="listbox"]'
    )
    .filter({ has: page.locator('.oxd-select-option, [role="option"]') })
    .last();
}

function pushDropdownOptionStrategies(push, label) {
  if (!label || label.length < 2) return;
  const re = buildOptionTextRegex(label);
  if (!re) return;

  push('option-in-open-panel', (page) => {
    const panel = getOpenDropdownPanel(page);
    return panel.locator('.oxd-select-option, .oxd-select-option--option, [role="option"]').filter({ hasText: re }).first();
  });

  push('option-visible-only', (page) =>
    page.locator('.oxd-select-option:visible, [role="option"]:visible').filter({ hasText: re }).first()
  );

  push('option-role', (page) => page.getByRole('option', { name: re }).first());
}

function isCardLikeElement(element) {
  if (!element) return false;
  if (isNavigationElement(element)) return false;
  const css = String(element?.fingerprint?.cssSelector || '').toLowerCase();
  if (css.includes('cardactionarea') || css.includes('mui-card')) return true;
  const text = String(element?.text || '');
  if (element.type === 'button' && text.length > 40) return true;
  if (/share your questions/i.test(text)) return true;
  if (/\bpurchase\b|\brental\b/i.test(text) && text.length > 25) return true;
  if (/contact us/i.test(text) && text.length > 35) return true;
  return false;
}

function isTextFirstClickTarget(element) {
  return isNavigationElement(element) || isCardLikeElement(element);
}

function parseTextPhrases(text) {
  const raw = String(text || '').trim();
  if (!raw) return { primary: '', secondary: [], all: [] };
  let parts = raw.split(/\n+/).map((s) => s.trim()).filter((s) => s.length > 1);
  if (parts.length <= 1) {
    parts = raw.split(/\.\s+(?=[A-Za-z])/).map((s) => s.trim()).filter((s) => s.length > 1);
  }
  if (parts.length === 0) return { primary: raw, secondary: [], all: [raw] };
  return { primary: parts[0], secondary: parts.slice(1), all: parts };
}

function pushLabeledButtonStrategies(push, label, prefix) {
  if (!label || label.length < 1 || label.length > 50) return;
  const exactRe = new RegExp(`^\\s*${escapeRegex(label)}\\s*$`, 'i');
  push(`${prefix}-role-link`, (page) => page.getByRole('link', { name: exactRe }).first());
  push(`${prefix}-role-button`, (page) => page.getByRole('button', { name: exactRe }).first());
  push(`${prefix}-text-exact`, (page) => page.getByText(label, { exact: true }).first());
  push(`${prefix}-text`, (page) => page.getByText(label, { exact: false }).first());
}

function pushNavClickStrategies(push, label) {
  pushLabeledButtonStrategies(push, label, 'nav');
}

function pushFormButtonStrategies(push, label) {
  pushLabeledButtonStrategies(push, label, 'form');
}

function pushCardClickStrategies(push, label) {
  const phrases = parseTextPhrases(label);
  const primary = phrases.primary;
  if (!primary) return;

  push('card-by-phrases', (page) => {
    let loc = page.locator(
      '[class*="CardActionArea"], [class*="MuiCardActionArea"], button[class*="Card"], [class*="MuiCard-root"] button'
    ).filter({ hasText: new RegExp(escapeRegex(primary), 'i') });

    for (const sec of phrases.secondary.slice(0, 2)) {
      const snippet = sec.length > 45 ? sec.substring(0, 45) : sec;
      if (snippet.length > 5) {
        loc = loc.filter({ hasText: new RegExp(escapeRegex(snippet), 'i') });
      }
    }

    if (/contact\s*us/i.test(primary)) {
      loc = loc.filter({
        hasNotText: /for purchase|for rental|purchase operations|rental operations/i
      });
      if (phrases.secondary.length === 0) {
        loc = loc.filter({ hasText: /share your questions/i });
      }
    }

    return loc.first();
  });

  if (primary.length < 80) {
    const primaryRe = new RegExp(escapeRegex(primary), 'i');
    push('card-role-button', (page) => page.getByRole('button', { name: primaryRe }).first());
  }
}

function isGenericCssSelector(css) {
  if (!css) return true;
  const g = String(css).toLowerCase();
  if (g === 'a' || g === 'button') return true;
  if (g.includes('muibutton') || g.includes('muiiconbutton') || g.includes('mui-button')) return true;
  if (g.includes('cardactionarea') || g.includes('muicard')) return true;
  if (g.includes('oxd-select-option') || g.includes('ant-select-item')) return true;
  if (/^(a|button)\.mui[a-z]+/i.test(g) && !g.includes('#')) return true;
  if (g.startsWith('#') || g.includes('[data-test') || g.includes('[href')) return false;
  const dotCount = (g.match(/\./g) || []).length;
  if ((g.startsWith('a.') || g.startsWith('button.')) && dotCount <= 3) return true;
  return false;
}

function buildLocatorStrategies(element) {
  const fp = element?.fingerprint || element || {};
  const isTextClick = isTextFirstClickTarget(element);
  const isForm = isFormInputElement(element);
  const label = (fp.text || element?.text || fp.ariaLabel || '').trim();
  const placeholder = (fp.placeholder || '').trim();
  const strategies = [];

  const push = (name, build) => strategies.push({ name, build });

  if (fp.dataTest) {
    push('data-test', (page) =>
      page.locator(`[data-test="${fp.dataTest}"], [data-testid="${fp.dataTest}"], [data-cy="${fp.dataTest}"]`).first());
  }

  const isFormBtn = isFormActionElement(element);

  if (isFormBtn) {
    pushFormButtonStrategies(push, label);
    if (fp.cssSelector && !isGenericCssSelector(fp.cssSelector)) {
      push('css', (page) => page.locator(fp.cssSelector).first());
    }
  } else if (isDropdownOptionElement(element)) {
    pushDropdownOptionStrategies(push, label);
    if (fp.xpath) push('xpath', (page) => page.locator(`xpath=${fp.xpath}`).first());
  } else if (isTextClick) {
    const isNav = isNavigationElement(element);
    const isCard = isCardLikeElement(element);
    const isOption = isDropdownOptionElement(element);

    if (isNav) {
      const href = element?.attrs?.href || fp.href;
      if (href && href.length > 1 && !href.startsWith('javascript:')) {
        push('href', (page) => {
          if (label) {
            return page.locator('a[href]').filter({
              hasText: new RegExp(`^\\s*${escapeRegex(label)}\\s*$`, 'i')
            }).first();
          }
          return page.locator(`a[href="${href.replace(/"/g, '\\"')}"]`).first();
        });
      }
      pushNavClickStrategies(push, label);
    }
    if (isCard) {
      pushCardClickStrategies(push, label);
    }
    if (isOption) {
      pushDropdownOptionStrategies(push, label);
    }
    if (fp.ariaLabel) {
      push('aria-label', (page) => page.locator(`[aria-label="${fp.ariaLabel}"]`).first());
    }
    if (fp.name) {
      push('name', (page) => page.locator(`[name="${fp.name}"]`).first());
    }
    if (fp.xpath) {
      push('xpath', (page) => page.locator(`xpath=${fp.xpath}`).first());
    }
    if (fp.cssSelector && !isGenericCssSelector(fp.cssSelector)) {
      push('css', (page) => page.locator(fp.cssSelector).first());
    }
  } else if (isForm) {
    const labelCandidates = [...new Set([label, placeholder, fp.ariaLabel].filter(Boolean))];
    for (const lc of labelCandidates) {
      if (lc.length > 0 && lc.length < 80) {
        push('getByLabel', (page) => page.getByLabel(lc, { exact: false }).first());
        push('getByPlaceholder', (page) => page.getByPlaceholder(lc, { exact: false }).first());
      }
    }
    if (placeholder) {
      push('placeholder', (page) => page.locator(`[placeholder="${placeholder.replace(/"/g, '\\"')}"]`).first());
    }
    if (fp.name) push('name', (page) => page.locator(`[name="${fp.name}"]`).first());
    if (fp.ariaLabel && !labelCandidates.includes(fp.ariaLabel)) {
      push('aria-label', (page) => page.locator(`[aria-label="${fp.ariaLabel}"]`).first());
    }
    if (fp.xpath) push('xpath', (page) => page.locator(`xpath=${fp.xpath}`).first());
    if (fp.cssSelector && !isGenericCssSelector(fp.cssSelector)) {
      push('css', (page) => page.locator(fp.cssSelector).first());
    }
    if (fp.id) push('id', (page) => buildIdLocator(page, fp.id));
  } else {
    if (fp.id && !isUnstableReactId(fp.id)) push('id', (page) => buildIdLocator(page, fp.id));
    if (fp.name) push('name', (page) => page.locator(`[name="${fp.name}"]`).first());
    if (fp.ariaLabel) push('aria-label', (page) => page.locator(`[aria-label="${fp.ariaLabel}"]`).first());
    if (fp.cssSelector) push('css', (page) => page.locator(fp.cssSelector).first());
    if (fp.xpath) push('xpath', (page) => page.locator(`xpath=${fp.xpath}`).first());
    if (placeholder) push('placeholder', (page) => page.locator(`[placeholder="${placeholder}"]`).first());
    if (label && label.length > 0 && label.length < 50) {
      push('text', (page) => page.getByText(label, { exact: false }).first());
    }
    if (fp.id && isUnstableReactId(fp.id)) push('id', (page) => buildIdLocator(page, fp.id));
  }

  return strategies;
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function verifyLocatorMatchesElement(locator, element) {
  if (!isTextFirstClickTarget(element) && !isDropdownOptionElement(element)) return { ok: true };

  const phrases = parseTextPhrases(element.text || element.fingerprint?.text);
  const expectedPrimary = normalizeText(phrases.primary);
  if (!expectedPrimary || expectedPrimary.length < 2) return { ok: true };

  const isNav = isNavigationElement(element);
  const isCard = isCardLikeElement(element);
  const isOption = isDropdownOptionElement(element);

  const actual = await locator
    .evaluate((el) => {
      const root =
        el.closest('[class*="CardActionArea"], [class*="MuiCard"], .MuiPaper-root, a, button') || el;
      return (root.innerText || root.textContent || el.getAttribute('aria-label') || '').trim();
    })
    .catch(() => '');

  const actualNorm = normalizeText(actual);
  if (!actualNorm) return { ok: true };

  if (isNav) {
    if (actualNorm === expectedPrimary || actualNorm.includes(expectedPrimary)) {
      return { ok: true };
    }
    return {
      ok: false,
      reason: `Yanlış menü öğesi: beklenen "${phrases.primary}", bulunan "${actual.substring(0, 50)}"`
    };
  }

  if (!actualNorm.includes(expectedPrimary)) {
    return {
      ok: false,
      reason: `Yanlış öğe: beklenen "${phrases.primary}", bulunan "${actual.substring(0, 80)}"`
    };
  }

  if (isOption && label.length > 2) {
    const labelNorm = normalizeText(label);
    const key = labelNorm.substring(0, Math.min(12, labelNorm.length));
    if (key.length >= 4 && !actualNorm.includes(key)) {
      return {
        ok: false,
        reason: `Yanlış seçenek: beklenen "${label.substring(0, 50)}", bulunan "${actual.substring(0, 60)}"`
      };
    }
    return { ok: true };
  }

  if (isCard) {
    for (const sec of phrases.secondary) {
      const secNorm = normalizeText(sec);
      if (secNorm.length > 8 && !actualNorm.includes(secNorm)) {
        return {
          ok: false,
          reason: `Yanlış kutu: "${sec.substring(0, 55)}" metni yok (bulunan: "${actual.substring(0, 70)}")`
        };
      }
    }

    if (expectedPrimary.includes('contact us')) {
      const needsShare = phrases.secondary.some((s) => /share your/i.test(s));
      if (needsShare && !actualNorm.includes('share your')) {
        return {
          ok: false,
          reason: 'Purchase/Rental kutusu; "Share your questions..." içeren Contact Us kutusu bekleniyordu'
        };
      }
      if (
        (actualNorm.includes('purchase') || actualNorm.includes('rental')) &&
        !actualNorm.includes('share your')
      ) {
        return {
          ok: false,
          reason: 'Yanlış kategori kutusu (Purchase/Rental); büyük başlıklı Contact Us kutusu bekleniyordu'
        };
      }
    }
  }

  return { ok: true };
}

async function verifyLocatorMatchesFormField(locator, element, value) {
  if (!isFormInputElement(element)) return { ok: true };

  const meta = await locator.evaluate((el) => ({
    type: (el.type || '').toLowerCase(),
    name: (el.name || '').toLowerCase(),
    placeholder: (el.placeholder || '').toLowerCase(),
    ariaLabel: (el.getAttribute('aria-label') || '').toLowerCase(),
    autocomplete: (el.autocomplete || '').toLowerCase()
  })).catch(() => null);

  if (!meta) return { ok: true };

  const fieldHint = normalizeText(
    element.text || element.fingerprint?.placeholder || element.fingerprint?.text || ''
  );
  const val = String(value || '');
  const valNorm = val.toLowerCase();
  const hints = `${meta.name} ${meta.placeholder} ${meta.ariaLabel}`;

  const looksLikeEmail = valNorm.includes('@') || valNorm.includes('mail.');
  const fieldIsEmail =
    meta.type === 'email' ||
    hints.includes('email') ||
    hints.includes('e-mail') ||
    meta.autocomplete.includes('email');

  const fieldIsName =
    hints.includes('your name') ||
    hints.includes('name') && !fieldIsEmail ||
    fieldHint.includes('name') ||
    fieldHint.includes('adınız') ||
    fieldHint.includes('ad ');

  if (looksLikeEmail && fieldIsName && !fieldIsEmail) {
    return {
      ok: false,
      reason: `E-posta değeri isim alanına yazılamaz (alan: "${meta.placeholder || meta.ariaLabel || meta.name}")`
    };
  }

  if (!looksLikeEmail && fieldIsEmail && !fieldIsName) {
    return {
      ok: false,
      reason: `Metin değeri e-posta alanına uygun değil (alan tipi: ${meta.type || 'email'})`
    };
  }

  if (fieldHint.length > 2) {
    const hintTokens = fieldHint.split(/\s+/).filter((t) => t.length > 2);
    const tokenMatch = hintTokens.some((t) => hints.includes(t));
    if (!tokenMatch && meta.placeholder && meta.placeholder.length > 2) {
      const softMatch =
        (fieldHint.includes('name') && meta.placeholder.includes('name')) ||
        (fieldHint.includes('email') && meta.placeholder.includes('email')) ||
        (fieldHint.includes('subject') && meta.placeholder.includes('subject')) ||
        (fieldHint.includes('message') && (meta.placeholder.includes('message') || meta.name.includes('message')));
      if (!softMatch) {
        return {
          ok: false,
          reason: `Yanlış form alanı: beklenen "${element.text}", bulunan placeholder="${meta.placeholder}"`
        };
      }
    }
  }

  return { ok: true };
}

async function verifyLocatorForAction(locator, element, action, value) {
  if (action === 'click') return verifyLocatorMatchesElement(locator, element);
  if (action === 'fill' || action === 'type') {
    return verifyLocatorMatchesFormField(locator, element, value);
  }
  return { ok: true };
}

async function clickVisibleDropdownOption(page, label) {
  const text = String(label || '').trim();
  if (!text) return { success: false, error: 'Seçenek metni yok', fallbackChain: [] };

  const re = buildOptionTextRegex(text);
  if (!re) return { success: false, error: 'Seçenek regex üretilemedi', fallbackChain: [] };

  const attempts = [
    {
      name: 'dropdown-panel',
      build: (p) => {
        const panel = getOpenDropdownPanel(p);
        return panel.locator('.oxd-select-option, .oxd-select-option--option, [role="option"]').filter({ hasText: re }).first();
      }
    },
    {
      name: 'dropdown-visible',
      build: (p) => p.locator('.oxd-select-option:visible, [role="option"]:visible').filter({ hasText: re }).first()
    }
  ];

  const fallbackChain = [];
  for (const attempt of attempts) {
    try {
      const opt = attempt.build(page);
      await opt.waitFor({ state: 'visible', timeout: 2000 });
      await opt.click({ timeout: ACTION_TIMEOUT, force: true });
      fallbackChain.push({ strategy: attempt.name, status: 'success' });
      return { success: true, strategyUsed: `dropdown-${attempt.name}`, fallbackChain, error: null };
    } catch (err) {
      fallbackChain.push({ strategy: attempt.name, status: 'failed', error: err.message.substring(0, 120) });
    }
  }

  return {
    success: false,
    error: `"${text.substring(0, 40)}" açık dropdown panelinde bulunamadı`,
    fallbackChain
  };
}

async function performClick(page, locator, element) {
  if (isDropdownOptionElement(element)) {
    try {
      await locator.click({ timeout: ACTION_TIMEOUT, force: true });
    } catch {
      await locator.click({ timeout: ACTION_TIMEOUT });
    }
    return;
  }

  const fpClass = element.fingerprint?.cssSelector || '';
  const useHover =
    isTextFirstClickTarget(element) ||
    fpClass.includes('main-menu-item') ||
    fpClass.includes('nav-item') ||
    fpClass.includes('menu-item') ||
    fpClass.includes('MuiButton') ||
    fpClass.includes('CardActionArea');

  if (useHover) {
    await hoverThenClick(page, locator);
  } else {
    await locator.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
    await locator.click({ timeout: ACTION_TIMEOUT });
  }
}

async function executeSimple(page, element, action, value = null) {
  if (!element) return { success: false, error: 'Element yok', fallbackChain: [] };

  if (action === 'click' && isDropdownOptionElement(element)) {
    const label = element.text || element.fingerprint?.text || '';
    const direct = await clickVisibleDropdownOption(page, label);
    if (direct.success) return direct;
  }

  const strategies = buildLocatorStrategies(element);
  if (strategies.length === 0) return { success: false, error: 'Strateji üretilemedi', fallbackChain: [] };

  const strategy = strategies[0];
  try {
    const locator = strategy.build(page);
    await locator.waitFor({ state: 'visible', timeout: 3000 });

    const match = await verifyLocatorForAction(locator, element, action, value);
    if (!match.ok) throw new Error(match.reason);

    switch (action) {
      case 'click':
        await performClick(page, locator, element);
        break;
      case 'fill':
        await locator.fill(String(value || ''), { timeout: ACTION_TIMEOUT });
        break;
      case 'type':
        await locator.click();
        await locator.type(String(value || ''), { delay: 50 });
        break;
      case 'select':
        if (element.tag === 'select') {
          await locator.selectOption(value, { timeout: 5000 });
        } else {
          throw new Error('Custom dropdown V2/V3\'te desteklenmiyor');
        }
        break;
      case 'press':
        await locator.press(value || 'Enter');
        break;
      case 'hover':
        await locator.hover();
        break;
      default:
        throw new Error(`Bilinmeyen aksiyon: ${action}`);
    }

    return { success: true, strategyUsed: strategy.name, fallbackChain: [{ strategy: strategy.name, status: 'success' }] };
  } catch (err) {
    return {
      success: false,
      error: err.message.substring(0, 200),
      fallbackChain: [{ strategy: strategy.name, status: 'failed', error: err.message.substring(0, 150) }]
    };
  }
}

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

async function superFill(page, locator, value, features = null) {
  const useReactNative = !features || features.reactNativeSet === true;

  await locator.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
  await locator.click({ timeout: ACTION_TIMEOUT });
  await page.keyboard.press('Control+A').catch(() => {});
  await page.keyboard.press('Delete').catch(() => {});
  await page.waitForTimeout(100);

  const expectedValue = String(value);

  if (useReactNative) {
    try {
      await reactNativeSet(page, locator, expectedValue);
      await page.waitForTimeout(150);
      const actual = await locator.inputValue().catch(() => null);
      if (actual === expectedValue) {
        await page.keyboard.press('Tab').catch(() => {});
        return { success: true, method: 'react-native-setter' };
      }
    } catch (e) { /* next */ }
  }

  try {
    await locator.click({ clickCount: 3 }).catch(() => {});
    const currentVal = await locator.inputValue().catch(() => '');
    for (let i = 0; i < currentVal.length + 2; i++) await page.keyboard.press('Backspace');
    await locator.pressSequentially(expectedValue, { delay: 30, timeout: ACTION_TIMEOUT });
    await page.waitForTimeout(150);
    const actual = await locator.inputValue().catch(() => null);
    if (actual === expectedValue) {
      await page.keyboard.press('Tab').catch(() => {});
      return { success: true, method: 'press-sequentially' };
    }
  } catch (e) { /* next */ }

  try {
    await locator.fill(expectedValue, { timeout: ACTION_TIMEOUT });
    await page.waitForTimeout(150);
    const actual = await locator.inputValue().catch(() => null);
    if (actual === expectedValue) {
      await page.keyboard.press('Tab').catch(() => {});
      return { success: true, method: 'playwright-fill' };
    }
    return { success: false, error: `Değer doğrulanamadı. Beklenen "${expectedValue}", gerçek "${actual}".` };
  } catch (e) {
    return { success: false, error: `Tüm yöntemler başarısız: ${e.message}` };
  }
}

async function customDropdownSelect(page, locator, value) {
  await locator.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
  await locator.click({ timeout: ACTION_TIMEOUT });
  await page.waitForTimeout(700);

  const picked = await clickVisibleDropdownOption(page, value);
  if (picked.success) return { success: true };
  return { success: false, error: picked.error || `"${value}" seçeneği bulunamadı` };
}

async function hoverThenClick(page, locator) {
  await locator.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
  await locator.hover({ timeout: ACTION_TIMEOUT });
  await page.waitForTimeout(500);
  await locator.click({ timeout: ACTION_TIMEOUT });
}

async function executeWithHealing(page, element, action, value = null, features = null) {
  if (!element) return { success: false, error: 'Element yok', fallbackChain: [] };

  const feat = (name) => !features || features[name] === true;

  let fallbackChain = [];
  if (action === 'click' && isDropdownOptionElement(element)) {
    const label = element.text || element.fingerprint?.text || '';
    const direct = await clickVisibleDropdownOption(page, label);
    if (direct.success) return direct;
    fallbackChain = direct.fallbackChain || [];
  }

  const strategies = buildLocatorStrategies(element);
  const isTextClick = isTextFirstClickTarget(element);

  for (const strategy of strategies) {
    try {
      const locator = strategy.build(page);
      await locator.waitFor({ state: 'visible', timeout: 2000 }).catch(() => {});
      const isVisible = await locator.isVisible().catch(() => false);
      if (!isVisible) {
        fallbackChain.push({ strategy: strategy.name, status: 'not_visible' });
        continue;
      }

      if (['click', 'fill', 'type'].includes(action)) {
        const match = await verifyLocatorForAction(locator, element, action, value);
        if (!match.ok) {
          fallbackChain.push({ strategy: strategy.name, status: 'wrong_element', error: match.reason });
          continue;
        }
      }

      switch (action) {
        case 'click':
          await performClick(page, locator, element);
          break;
        case 'fill': {
          const fillResult = await superFill(page, locator, value || '', features);
          if (!fillResult.success) throw new Error(fillResult.error);
          fallbackChain.push({ strategy: strategy.name, status: 'success', method: fillResult.method });
          return { success: true, strategyUsed: `${strategy.name} → ${fillResult.method}`, fallbackChain, error: null };
        }
        case 'type':
          await locator.click();
          await locator.pressSequentially(String(value || ''), { delay: 50 });
          break;
        case 'select': {
          if (element.tag === 'select') {
            try {
              await locator.selectOption(value, { timeout: 3000 });
              break;
            } catch (e) {
              if (!feat('customDropdown')) throw e;
              const result = await customDropdownSelect(page, locator, value);
              if (!result.success) throw new Error(result.error);
              break;
            }
          } else {
            if (!feat('customDropdown')) {
              throw new Error('Custom dropdown bu mimari versiyonda kapalı');
            }
            const result = await customDropdownSelect(page, locator, value);
            if (!result.success) throw new Error(result.error);
            break;
          }
        }
        case 'press':
          await locator.press(value || 'Enter');
          break;
        case 'hover':
          await locator.hover();
          break;
        default:
          throw new Error(`Bilinmeyen aksiyon: ${action}`);
      }

      fallbackChain.push({ strategy: strategy.name, status: 'success' });
      return { success: true, strategyUsed: strategy.name, fallbackChain, error: null };
    } catch (err) {
      fallbackChain.push({ strategy: strategy.name, status: 'failed', error: err.message.substring(0, 150) });
    }
  }

  const blockBbox =
    isTextClick || isDropdownOptionElement(element) || isCardLikeElement(element);
  if (feat('bboxFallback') && !blockBbox && element.bbox && (action === 'click' || action === 'hover')) {
    try {
      const cx = element.bbox.x + element.bbox.width / 2;
      const cy = element.bbox.y + element.bbox.height / 2;
      if (action === 'click') {
        await page.mouse.move(cx, cy);
        await page.waitForTimeout(300);
        await page.mouse.click(cx, cy);
      } else {
        await page.mouse.move(cx, cy);
      }
      fallbackChain.push({ strategy: 'bbox-coordinate', status: 'success' });
      return {
        success: true,
        strategyUsed: 'bbox-coordinate',
        fallbackChain,
        warning: 'Koordinat fallback kullanıldı'
      };
    } catch (err) {
      fallbackChain.push({ strategy: 'bbox-coordinate', status: 'failed', error: err.message });
    }
  }

  const failedDetails = fallbackChain.filter((f) => f.status === 'failed' || f.status === 'wrong_element').map((f) => f.strategy).join(', ');
  const wrongEl = fallbackChain.find((f) => f.status === 'wrong_element');
  const errMsg = wrongEl?.error || `${strategies.length} strateji denendi (${failedDetails}), hepsi başarısız.`;

  return {
    success: false,
    strategyUsed: null,
    fallbackChain,
    error: errMsg.substring(0, 250)
  };
}

function evaluateConfidence(aiConfidence) {
  if (aiConfidence == null) return { passed: true, manual: false };
  if (aiConfidence < CONFIDENCE_THRESHOLD) {
    return { passed: false, manual: true, message: `Düşük güven (%${(aiConfidence * 100).toFixed(0)})` };
  }
  return { passed: true, manual: false };
}

module.exports = {
  executeWithHealing,
  executeSimple,
  evaluateConfidence,
  buildLocatorStrategies,
  isNavigationElement,
  isFormActionElement,
  isInPageActionElement,
  CONFIDENCE_THRESHOLD
};
