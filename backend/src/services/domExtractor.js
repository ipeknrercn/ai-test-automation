// src/services/domExtractor.js
//
// AKILLI DOM EXTRACTION (v2)
//
// İYİLEŞTİRMELER:
// 1. Custom dropdown selector'ları (oxd-select, ant-select, mui-select) eklendi
// 2. X (clear) butonları artık ayrı element olarak tespit ediliyor
// 3. Element type'a "custom-dropdown" eklendi (AI bunu görüp doğru aksiyonu seçer)
// 4. React input'larını tanıyor (data-react-input vb.)

const INTERACTIVE_SELECTORS = [
    // Standart HTML
    'a[href]',
    'button',
    'input:not([type="hidden"])',
    'select',
    'textarea',
    // ARIA roles
    '[role="button"]',
    '[role="link"]',
    '[role="menuitem"]',
    '[role="tab"]',
    '[role="checkbox"]',
    '[role="radio"]',
    '[role="combobox"]',
    '[role="textbox"]',
    '[role="option"]',
    '[role="listbox"]',
    // Custom widgets
    '[contenteditable="true"]',
    '[onclick]',
    '[tabindex]:not([tabindex="-1"])',
    'label',
    'summary',
    // Test attributes
    '[data-test]',
    '[data-testid]',
    '[data-cy]',
    // Custom dropdown'lar (OrangeHRM, Ant Design, MUI)
    '.oxd-select-text',
    '.oxd-select-text-input',
    '.oxd-select-option',
    '.ant-select-item',
    '.ant-select-item-option',
    '.ant-select',
    '.MuiSelect-select',
    '.MuiAutocomplete-root',
    '.select2-selection',
    // X-clear butonları
    '.oxd-icon.bi-x',
    '.ant-select-clear',
    '.MuiAutocomplete-clearIndicator'
  ].join(',');
  
  const MAX_ELEMENTS = 80;
  const VIEWPORT_BUFFER = 500;
  
  function buildExtractionScript() {
    return `
      (() => {
        const INTERACTIVE_SELECTORS = ${JSON.stringify(INTERACTIVE_SELECTORS)};
        const MAX_ELEMENTS = ${MAX_ELEMENTS};
        const VIEWPORT_BUFFER = ${VIEWPORT_BUFFER};
  
        function getXPath(el) {
          if (el.id) return '//*[@id="' + el.id + '"]';
          const parts = [];
          while (el && el.nodeType === Node.ELEMENT_NODE && parts.length < 10) {
            let nbOfPreviousSiblings = 0;
            let hasNextSiblings = false;
            let sibling = el.previousSibling;
            while (sibling) {
              if (sibling.nodeType !== Node.DOCUMENT_TYPE_NODE && sibling.nodeName === el.nodeName) {
                nbOfPreviousSiblings++;
              }
              sibling = sibling.previousSibling;
            }
            sibling = el.nextSibling;
            while (sibling) {
              if (sibling.nodeName === el.nodeName) { hasNextSiblings = true; break; }
              sibling = sibling.nextSibling;
            }
            const prefix = el.prefix ? el.prefix + ':' : '';
            const nth = (nbOfPreviousSiblings || hasNextSiblings) ? '[' + (nbOfPreviousSiblings + 1) + ']' : '';
            parts.unshift(prefix + el.localName + nth);
            el = el.parentNode;
          }
          return parts.length ? '/' + parts.join('/') : null;
        }
  
        function getCssSelector(el) {
          if (el.getAttribute('data-test')) return '[data-test="' + el.getAttribute('data-test') + '"]';
          if (el.getAttribute('data-testid')) return '[data-testid="' + el.getAttribute('data-testid') + '"]';
          if (el.getAttribute('data-cy')) return '[data-cy="' + el.getAttribute('data-cy') + '"]';
          if (el.id && /^[a-zA-Z][\\w-]*$/.test(el.id)) return '#' + el.id;
          if (el.name) return el.tagName.toLowerCase() + '[name="' + el.name + '"]';
  
          const stableClasses = (el.className || '').toString().split(/\\s+/).filter(c =>
            c && c.length > 1 && !/^css-/.test(c) && !/^\\d/.test(c)
          ).slice(0, 2);
          if (stableClasses.length > 0) {
            return el.tagName.toLowerCase() + '.' + stableClasses.join('.');
          }
          return el.tagName.toLowerCase();
        }
  
        function isVisible(el) {
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return false;
          return true;
        }
  
        function isNearViewport(el) {
          const rect = el.getBoundingClientRect();
          const vpHeight = window.innerHeight;
          const vpWidth = window.innerWidth;
          return rect.bottom > -VIEWPORT_BUFFER &&
                 rect.top < vpHeight + VIEWPORT_BUFFER &&
                 rect.right > -VIEWPORT_BUFFER &&
                 rect.left < vpWidth + VIEWPORT_BUFFER;
        }
  
        function getAssociatedLabelText(el) {
          if (el.id) {
            const safeId = String(el.id).replace(/"/g, '\\\\"');
            const byFor = document.querySelector('label[for="' + safeId + '"]');
            if (byFor && byFor.innerText) return byFor.innerText.trim();
          }
          const parentLabel = el.closest('label');
          if (parentLabel && parentLabel.innerText) {
            const t = parentLabel.innerText.trim();
            if (t.length > 0 && t.length < 80) return t;
          }
          return '';
        }

        function getElementText(el) {
          const tag = el.tagName.toLowerCase();
          if (tag === 'input' || tag === 'textarea') {
            const aria = (el.getAttribute('aria-label') || '').trim();
            const ph = (el.placeholder || '').trim();
            const assoc = getAssociatedLabelText(el);
            const name = (el.name || '').trim();
            const candidates = [aria, assoc, ph, name].filter(Boolean);
            let text = candidates[0] || (el.title || '').trim();
            if (!text && el.value) text = String(el.value).trim();
            if (text.length > 80) text = text.substring(0, 77) + '...';
            return text;
          }
          let text = (el.innerText || el.value || el.placeholder || el.getAttribute('aria-label') || el.getAttribute('alt') || el.title || '').trim();
          if (text.length > 80) text = text.substring(0, 77) + '...';
          return text;
        }
  
        // YENI: Element tipi tespiti — custom dropdown'ları ve clear butonlarını tanıyor
        function getElementType(el) {
          const tag = el.tagName.toLowerCase();
          const role = el.getAttribute('role');
          const className = (el.className || '').toString();
  
          // Clear (X) butonları
          if (className.includes('bi-x') || className.includes('clear-indicator') || className.includes('select-clear')) {
            return 'clear-button';
          }
  
          // Açık dropdown seçenekleri (OrangeHRM, Ant Design)
          if (className.includes('oxd-select-option') ||
              className.includes('ant-select-item') ||
              role === 'option') {
            return 'dropdown-option';
          }

          // Custom dropdown'lar
          if (className.includes('oxd-select-text') ||
              className.includes('ant-select') ||
              className.includes('MuiSelect') ||
              className.includes('MuiAutocomplete') ||
              className.includes('select2-selection')) {
            return 'custom-dropdown';
          }
  
          if (tag === 'a') return 'link';
          if (tag === 'button' || role === 'button') return 'button';
          if (tag === 'input') {
            const inputType = (el.type || 'text').toLowerCase();
            if (['checkbox', 'radio'].includes(inputType)) return inputType;
            if (['submit', 'button'].includes(inputType)) return 'button';
            if (inputType === 'date') return 'date-input';
            // Date input mu? (placeholder pattern)
            const placeholder = el.placeholder || '';
            if (/yyyy|dd|mm|tarih|date/i.test(placeholder)) return 'date-input';
            return 'input';
          }
          if (tag === 'textarea') return 'textarea';
          if (tag === 'select') return 'select';
          if (tag === 'label') return 'label';
          if (role) return role;
          return 'element';
        }
  
        // Ana extraction
        const all = Array.from(document.querySelectorAll(INTERACTIVE_SELECTORS));
        const filtered = all.filter(isVisible).filter(isNearViewport);
  
        // Duplicate'leri önle (aynı DOM node'u birden fazla selector eşleşebilir)
        const seen = new Set();
        const unique = filtered.filter(el => {
          if (seen.has(el)) return false;
          seen.add(el);
          return true;
        });
  
        // YENI: Çakışan elementleri filtrele (bir element diğerinin içindeyse, parent'ı atla)
        const final = unique.filter(el => {
          // Eğer bu element başka bir interactive elementi tamamen içeriyorsa, parent'ı atlayıp child'ı tut
          for (const other of unique) {
            if (other !== el && el.contains(other)) {
              // Bu element başkasını içeriyor — eğer içerikte aynı text yoksa tut
              const elText = getElementText(el);
              const otherText = getElementText(other);
              if (elText === otherText && elText.length > 0) {
                return false; // Bu duplicate, child'ı tutacağız
              }
            }
          }
          return true;
        });
  
        // Önceliğe göre sırala
        final.sort((a, b) => {
          const aPriority = (a.getAttribute('data-test') || a.getAttribute('data-testid')) ? 0 : (a.id ? 1 : 2);
          const bPriority = (b.getAttribute('data-test') || b.getAttribute('data-testid')) ? 0 : (b.id ? 1 : 2);
          if (aPriority !== bPriority) return aPriority - bPriority;
  
          const ar = a.getBoundingClientRect();
          const br = b.getBoundingClientRect();
          return ar.top - br.top;
        });
  
        const limited = final.slice(0, MAX_ELEMENTS);
  
        return limited.map((el, idx) => {
          const rect = el.getBoundingClientRect();
          return {
            id: idx + 1,
            tag: el.tagName.toLowerCase(),
            type: getElementType(el),
            text: getElementText(el),
            fingerprint: {
              cssSelector: getCssSelector(el),
              xpath: getXPath(el),
              id: el.id || null,
              name: el.name || null,
              dataTest: el.getAttribute('data-test') || el.getAttribute('data-testid') || el.getAttribute('data-cy') || null,
              ariaLabel: el.getAttribute('aria-label') || null,
              placeholder: el.placeholder || null,
              text: getElementText(el),
              href: el.href || el.getAttribute('href') || null
            },
            bbox: {
              x: Math.round(rect.left),
              y: Math.round(rect.top),
              width: Math.round(rect.width),
              height: Math.round(rect.height)
            },
            attrs: {
              disabled: el.disabled || false,
              checked: el.checked || false,
              value: el.value || null,
              href: el.href || null,
              // YENI: Şu anki dropdown değeri (custom dropdown'lar için)
              currentText: el.innerText ? el.innerText.substring(0, 50) : null
            }
          };
        });
      })()
    `;
  }
  
  async function extractInteractiveElements(page) {
    try {
      const script = buildExtractionScript();
      const elements = await page.evaluate(script);
      return elements || [];
    } catch (err) {
      console.error('DOM extraction hatası:', err.message);
      return [];
    }
  }
  
  module.exports = {
    extractInteractiveElements,
    MAX_ELEMENTS,
    VIEWPORT_BUFFER
  };