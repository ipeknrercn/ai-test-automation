// src/services/screenshotAnnotator.js
//
// SET-OF-MARK ANNOTATION (Microsoft Research)
// - Temiz screenshot üzerine SVG ile bounding box ve numara çizer
// - AI'a annotated versiyonu, kullanıcıya temiz versiyonu gönderir

const sharp = require('sharp');

// Renk paleti — element tiplerine göre
const COLOR_BY_TYPE = {
  button: '#ef4444',     // kırmızı
  link: '#3b82f6',       // mavi
  input: '#10b981',      // yeşil
  textarea: '#10b981',
  select: '#f59e0b',     // turuncu
  checkbox: '#8b5cf6',   // mor
  radio: '#8b5cf6',
  label: '#6b7280',      // gri
  default: '#ec4899'     // pembe
};

function colorFor(type) {
  return COLOR_BY_TYPE[type] || COLOR_BY_TYPE.default;
}

/**
 * SVG overlay üret (bounding box'lar + numaralar)
 */
function buildSvgOverlay(elements, width, height) {
  const boxes = elements.map(el => {
    const { x, y, width: w, height: h } = el.bbox;
    const color = colorFor(el.type);

    // Numara label'ı için arka plan
    const labelW = el.id < 10 ? 22 : el.id < 100 ? 28 : 34;
    const labelH = 18;
    const labelX = x;
    const labelY = Math.max(0, y - labelH);

    return `
      <rect x="${x}" y="${y}" width="${w}" height="${h}"
            fill="none" stroke="${color}" stroke-width="2" opacity="0.9"/>
      <rect x="${labelX}" y="${labelY}" width="${labelW}" height="${labelH}"
            fill="${color}" opacity="0.95"/>
      <text x="${labelX + labelW / 2}" y="${labelY + 13}"
            font-family="Arial, sans-serif" font-size="12" font-weight="bold"
            fill="white" text-anchor="middle">${el.id}</text>
    `;
  }).join('\n');

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      ${boxes}
    </svg>
  `;
}

/**
 * Screenshot'a bounding box overlay'i ekle.
 * @param {Buffer} cleanScreenshotBuffer — temiz PNG
 * @param {Array} elements — domExtractor'dan gelen
 * @returns {Promise<Buffer>} — annotated PNG
 */
async function annotateScreenshot(cleanScreenshotBuffer, elements) {
  if (!elements || elements.length === 0) {
    return cleanScreenshotBuffer; // annotate edecek bir şey yok
  }

  try {
    const meta = await sharp(cleanScreenshotBuffer).metadata();
    const width = meta.width || 1280;
    const height = meta.height || 720;

    const svgOverlay = buildSvgOverlay(elements, width, height);
    const svgBuffer = Buffer.from(svgOverlay);

    const annotated = await sharp(cleanScreenshotBuffer)
      .composite([{ input: svgBuffer, top: 0, left: 0 }])
      .png()
      .toBuffer();

    return annotated;
  } catch (err) {
    console.error('Annotation hatası:', err.message);
    return cleanScreenshotBuffer; // hata olursa temizini döndür
  }
}

module.exports = {
  annotateScreenshot,
  colorFor
};