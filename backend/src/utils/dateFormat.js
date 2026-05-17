/**
 * Tarih alanına yazılacak değeri element placeholder'ına ve prompttaki literal'e göre ayarlar.
 */

function parsePlaceholderFormat(placeholder) {
  const ph = String(placeholder || '').toLowerCase();
  if (/yyyy\s*[-/.]?\s*dd\s*[-/.]?\s*mm|yyyy-dd-mm/.test(ph)) return 'yyyy-dd-mm';
  if (/yyyy\s*[-/.]?\s*mm\s*[-/.]?\s*dd|yyyy-mm-dd/.test(ph)) return 'yyyy-mm-dd';
  if (/dd\s*[-/.]?\s*mm\s*[-/.]?\s*yyyy|dd-mm-yyyy/.test(ph)) return 'dd-mm-yyyy';
  return null;
}

function splitDateParts(value) {
  const m = String(value || '').trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (!m) return null;
  return { y: m[1], a: m[2].padStart(2, '0'), b: m[3].padStart(2, '0') };
}

function extractPromptDates(userPrompt) {
  return (String(userPrompt || '').match(/\d{4}-\d{1,2}-\d{1,2}/g) || []).map((d) => d.trim());
}

function pickPromptDateForField(userPrompt, element) {
  const dates = extractPromptDates(userPrompt);
  if (dates.length === 0) return null;
  const hint = String(element?.text || element?.fingerprint?.text || '').toLowerCase();
  if (dates.length > 1 && /\bto\b|to date|bitiş/.test(hint)) return dates[1];
  if (/\bfrom\b|from date|başlang/.test(hint)) return dates[0];
  return dates[0];
}

/**
 * @param {string} value - AI'nın gönderdiği değer
 * @param {object} element - DOM element kaydı
 * @param {string} [userPrompt] - Orijinal test promptu
 */
function normalizeDateForElement(value, element, userPrompt = '') {
  const placeholder = element?.fingerprint?.placeholder || element?.attrs?.placeholder || '';
  const formatHint = [
    placeholder,
    element?.text,
    element?.fingerprint?.text,
    element?.fingerprint?.ariaLabel
  ]
    .filter(Boolean)
    .join(' ');
  const format = parsePlaceholderFormat(formatHint) || parsePlaceholderFormat(placeholder);
  const promptLiteral = pickPromptDateForField(userPrompt, element);
  const promptDates = extractPromptDates(userPrompt);
  const parts = splitDateParts(value);
  const promptParts = promptLiteral ? splitDateParts(promptLiteral) : null;

  if (format === 'yyyy-dd-mm') {
    if (promptParts) {
      return `${promptParts.y}-${promptParts.a}-${promptParts.b}`;
    }
    if (parts) return `${parts.y}-${parts.a}-${parts.b}`;
    return value;
  }

  if (!format && promptParts) {
    const pm = parseInt(promptParts.a, 10);
    const pd = parseInt(promptParts.b, 10);
    if (pm > 12 && pd <= 12) {
      return `${promptParts.y}-${promptParts.a}-${promptParts.b}`;
    }
  }

  if (format === 'yyyy-mm-dd' && parts) {
    const month = parseInt(parts.a, 10);
    const day = parseInt(parts.b, 10);
    if (month > 12 && day <= 12) {
      return `${parts.y}-${parts.b}-${parts.a}`;
    }
    if (promptParts && promptDates[0] !== value) {
      const pm = parseInt(promptParts.a, 10);
      const pd = parseInt(promptParts.b, 10);
      if (pm > 12 && pd <= 12) {
        return `${promptParts.y}-${promptParts.b}-${promptParts.a}`;
      }
    }
    return `${parts.y}-${parts.a}-${parts.b}`;
  }

  if (format === 'yyyy-mm-dd' && promptParts) {
    const pm = parseInt(promptParts.a, 10);
    const pd = parseInt(promptParts.b, 10);
    if (pm > 12 && pd <= 12) {
      return `${promptParts.y}-${promptParts.b}-${promptParts.a}`;
    }
  }

  return value;
}

module.exports = { normalizeDateForElement, parsePlaceholderFormat };
