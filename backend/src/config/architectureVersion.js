// src/config/architectureVersion.js
//
// ABLATION STUDY KONFIGÜRASYONU
//
// 4 farklı mimari versiyonu çalıştırmak için anahtarlar.
// Test koşumu sırasında ARCHITECTURE_VERSION env değişkeni ile seçilir.
//
//   V1: Baseline (saf VLM + selector)         — eski mimari
//   V2: + DOM Extraction (element listesi)    — DOM ekleyince ne oluyor?
//   V3: + Set-of-Mark (bounding box çizimi)   — SoM ne kadar katkı veriyor?
//   V4: + Self-Healing (multi-strategy)       — tam hibrit mimari (final)

const VERSIONS = {
    V1: {
      name: 'V1-Baseline',
      description: 'Saf VLM + selector (Erken sürüm)',
      features: {
        domExtraction: false,      // Element listesi gönderilmez
        somAnnotation: false,      // Bounding box çizilmez
        selfHealing: false,        // Tek strateji denenir
        multiStrategy: false,
        bboxFallback: false,
        reactNativeSet: false,
        customDropdown: false,
        loopDetection: false       // Sonsuz döngü olabilir (limit hala var ama daha geç)
      }
    },
  
    V2: {
      name: 'V2-DOM-Only',
      description: 'DOM extraction ekli, görsel annotation yok',
      features: {
        domExtraction: true,       // Element listesi gönderilir
        somAnnotation: false,      // Ama screenshot'a çizim yok
        selfHealing: false,
        multiStrategy: false,
        bboxFallback: false,
        reactNativeSet: false,
        customDropdown: false,
        loopDetection: false
      }
    },
  
    V3: {
      name: 'V3-SoM',
      description: 'DOM + Set-of-Mark görsel annotation',
      features: {
        domExtraction: true,
        somAnnotation: true,       // Screenshot'a numaralı kutular çizilir
        selfHealing: false,        // Hala tek strateji
        multiStrategy: false,
        bboxFallback: false,
        reactNativeSet: false,
        customDropdown: false,
        loopDetection: true
      }
    },
  
    V4: {
      name: 'V4-Hybrid',
      description: 'Tam hibrit mimari (DOM + SoM + Self-Healing)',
      features: {
        domExtraction: true,
        somAnnotation: true,
        selfHealing: true,         // 9 strateji fallback
        multiStrategy: true,
        bboxFallback: true,        // Son çare koordinat fallback
        reactNativeSet: true,      // React native value setter
        customDropdown: true,      // Custom dropdown desteği
        loopDetection: true        // Döngü tespiti
      }
    }
  };
  
  function resolveVersion(explicitKey) {
    const v = (explicitKey || process.env.ARCHITECTURE_VERSION || 'V4').toUpperCase();
    if (!VERSIONS[v]) {
      console.warn(`⚠️ Bilinmeyen versiyon: ${v}, V4'e dönülüyor`);
      return VERSIONS.V4;
    }
    return VERSIONS[v];
  }

  function getCurrentVersion(explicitKey) {
    return resolveVersion(explicitKey);
  }

  /**
   * @param {string} featureName
   * @param {string|object} [versionOrKey] - V1/V2/... veya resolveVersion() çıktısı
   */
  function isFeatureEnabled(featureName, versionOrKey) {
    const version = typeof versionOrKey === 'object' && versionOrKey?.features
      ? versionOrKey
      : resolveVersion(versionOrKey);
    return version.features[featureName] === true;
  }

  /** Paralel koşumlarda process.env çakışmasını önler */
  async function runWithArchitectureVersion(versionKey, fn) {
    const prev = process.env.ARCHITECTURE_VERSION;
    if (versionKey) process.env.ARCHITECTURE_VERSION = String(versionKey).toUpperCase();
    try {
      return await fn(resolveVersion(versionKey));
    } finally {
      if (prev === undefined) delete process.env.ARCHITECTURE_VERSION;
      else process.env.ARCHITECTURE_VERSION = prev;
    }
  }

  module.exports = {
    VERSIONS,
    resolveVersion,
    getCurrentVersion,
    isFeatureEnabled,
    runWithArchitectureVersion
  };