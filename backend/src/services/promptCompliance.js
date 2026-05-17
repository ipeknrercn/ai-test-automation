// src/services/promptCompliance.js
//
// Prompt'a göre deterministik uyumluluk kontrolü (AI "complete" dese bile).

/** SauceDemo inventory sort <select> value sırası */
const SAUCEDEMO_SORT_VALUES = ['az', 'za', 'lohi', 'hilo'];

const OPTION_LABELS = ['1.', '2.', '3.', '4.'];

/**
 * Sort dropdown + N seçenek senaryosu mu?
 * @returns {number|null} Zorunlu seçenek sayısı veya null (kontrol yok)
 */
function detectSortDropdownRequirement(userPrompt) {
  const p = String(userPrompt || '').toLowerCase();

  const hasSort = /sort|sıralama|product_sort/.test(p);
  const hasDropdown = /dropdown|açılır liste|seçenek/.test(p);
  const hasNumberedOptions = /1\.\s*seçenek|2\.\s*seçenek|3\.\s*seçenek/.test(p);

  if (!((hasSort && hasDropdown) || hasNumberedOptions)) {
    return null;
  }

  const explicitThree = /üç\s*seçenek|3\s*seçenek|three\s*option|only\s*3|yalnızca\s*3/.test(p);
  if (explicitThree) return 3;

  const numMatch = p.match(/(?:en fazla|yalnızca|sadece)\s*(\d+)\s*seçenek/);
  if (numMatch) return parseInt(numMatch[1], 10);

  const stepLines = (p.match(/\d\)\s*[^.\n]*seçenek/g) || []).length;
  if (stepLines >= 2) return Math.min(stepLines, 3);

  return 3;
}

/**
 * @param {string} userPrompt
 * @param {Array<{action:string,value?:string,success:boolean}>} history
 */
function checkPromptCompliance(userPrompt, history) {
  const requiredCount = detectSortDropdownRequirement(userPrompt);
  if (requiredCount == null) {
    return { ok: true };
  }

  const expected = SAUCEDEMO_SORT_VALUES.slice(0, requiredCount);
  const forbidden = SAUCEDEMO_SORT_VALUES.slice(requiredCount);

  const selects = history
    .filter((h) => h.success && h.action === 'select' && h.value != null && String(h.value).trim() !== '')
    .map((h) => String(h.value).trim().toLowerCase());

  if (selects.length === 0) {
    return {
      ok: false,
      message: `Prompt uyumsuz: ${requiredCount} sort seçimi gerekli; hiç select uygulanmadı.`
    };
  }

  for (const v of selects) {
    if (forbidden.includes(v)) {
      const idx = SAUCEDEMO_SORT_VALUES.indexOf(v);
      return {
        ok: false,
        message: `Prompt uyumsuz: yalnızca ${requiredCount} seçenek istendi; ${OPTION_LABELS[idx] || ''} seçenek ("${v}") uygulandı.`
      };
    }
  }

  if (selects.length > requiredCount) {
    return {
      ok: false,
      message: `Prompt uyumsuz: ${selects.length} sort seçimi yapıldı; tam ${requiredCount} olmalı (yapılan: ${selects.join(' → ')}).`
    };
  }

  for (let i = 0; i < expected.length; i++) {
    if (!selects.includes(expected[i])) {
      return {
        ok: false,
        message: `Prompt uyumsuz: ${OPTION_LABELS[i]} seçenek ("${expected[i]}") uygulanmadı — seçili olsa bile select ile seçilmeli.`
      };
    }
  }

  let expectedIdx = 0;
  for (const s of selects) {
    if (expectedIdx < expected.length && s === expected[expectedIdx]) {
      expectedIdx++;
      continue;
    }
    if (expected.includes(s)) {
      return {
        ok: false,
        message: `Prompt uyumsuz: seçim sırası hatalı. Beklenen: ${expected.join(' → ')}; yapılan: ${selects.join(' → ')}.`
      };
    }
  }

  if (expectedIdx < expected.length) {
    return {
      ok: false,
      message: `Prompt uyumsuz: ${expectedIdx}/${requiredCount} zorunlu seçenek sırayla tamamlandı (eksik: ${expected.slice(expectedIdx).join(', ')}).`
    };
  }

  if (selects.length < requiredCount) {
    return {
      ok: false,
      message: `Prompt uyumsuz: ${selects.length} sort seçimi; tam ${requiredCount} gerekli (eksik değerler: ${expected.filter((e) => !selects.includes(e)).join(', ')}).`
    };
  }

  return { ok: true };
}

module.exports = {
  detectSortDropdownRequirement,
  checkPromptCompliance,
  SAUCEDEMO_SORT_VALUES
};
