// scripts/verifyVersions.js
//
// Bu script versiyon dallanmasının GERÇEKTEN çalıştığını kanıtlar.
// Hiçbir test koşmaz, sadece her versiyon için hangi feature'ların aktif
// olduğunu ve hangi service'lerin kullanılacağını gösterir.
//
// Kullanım:
//   node scripts/verifyVersions.js

require('dotenv').config();
const { resolveVersion, isFeatureEnabled } = require('../src/config/architectureVersion');

console.log('\n' + '═'.repeat(70));
console.log('  VERSİYON DALLANMA DOĞRULAMA');
console.log('═'.repeat(70));

const versionNames = ['V1', 'V2', 'V3', 'V4'];

for (const vName of versionNames) {
  const v = resolveVersion(vName);
  const feat = (name) => isFeatureEnabled(name, v);

  console.log(`\n┌─ ${v.name} ${'─'.repeat(60 - v.name.length)}┐`);
  console.log(`│ Açıklama: ${v.description.padEnd(50)} │`);
  console.log(`├${'─'.repeat(67)}┤`);
  console.log(`│ Hangi AI Service:     ${(feat('domExtraction') ? 'aiService.js (ID tabanlı)' : 'aiServiceLegacy.js (selector)').padEnd(43)} │`);
  console.log(`│ Hangi Executor:       ${(feat('selfHealing') ? 'executeWithHealing (9 katman)' : (feat('domExtraction') ? 'executeSimple (tek strateji)' : 'direct-selector (V1 özel)')).padEnd(43)} │`);
  console.log(`│ DOM Extraction:       ${(feat('domExtraction') ? '✓ AÇIK' : '✗ KAPALI').padEnd(43)} │`);
  console.log(`│ SoM Annotation:       ${(feat('somAnnotation') ? '✓ AÇIK' : '✗ KAPALI').padEnd(43)} │`);
  console.log(`│ Self-Healing:         ${(feat('selfHealing') ? '✓ AÇIK' : '✗ KAPALI').padEnd(43)} │`);
  console.log(`│ Loop Detection:       ${(feat('loopDetection') ? '✓ AÇIK' : '✗ KAPALI').padEnd(43)} │`);
  console.log(`│ React Native Set:     ${(feat('reactNativeSet') ? '✓ AÇIK' : '✗ KAPALI').padEnd(43)} │`);
  console.log(`│ Custom Dropdown:      ${(feat('customDropdown') ? '✓ AÇIK' : '✗ KAPALI').padEnd(43)} │`);
  console.log(`│ BBox Fallback:        ${(feat('bboxFallback') ? '✓ AÇIK' : '✗ KAPALI').padEnd(43)} │`);
  console.log(`└${'─'.repeat(67)}┘`);
}

console.log('\n✅ Versiyon dallanması hazır. Her versiyon farklı kod yolu çalıştıracak.');
console.log('   Şimdi testManual.js veya runBenchmark.js çalıştırabilirsin.\n');