// src/services/promptVersionService.js
const prisma = require('../config/database');

/**
 * Prompt Versiyonlama Servisi (v2)
 *
 * YENİ MANTIK:
 * - Aynı testName + targetUrl kombinasyonu = aynı senaryo
 * - Bu senaryoda aynı prompt → mevcut versiyonu kullan, istatistik güncelle
 * - Bu senaryoda yeni prompt → yeni versiyon (v1.1, v1.2...)
 * - Farklı testName veya farklı URL → tamamen yeni senaryo, yeni v1.0 zinciri
 *
 * Bu sayede kullanıcı aynı testi farklı promptlarla deneyince gerçek bir
 * iyileştirme döngüsü oluşur.
 */
class PromptVersionService {

  // ───────────────────────────────────────────────────────────────────────
  // Bir test için kullanılacak prompt versiyonunu bul veya oluştur
  // testName + targetUrl üzerinden gruplama yapar
  // ───────────────────────────────────────────────────────────────────────
  async findOrCreateVersion(testName, targetUrl, promptText) {
    // 1. Aynı senaryo (testName + URL) için mevcut tüm versiyonları bul
    const existingVersionsForScenario = await prisma.promptVersion.findMany({
      where: {
        test: {
          testName,
          targetUrl: targetUrl || null
        }
      },
      include: { test: true },
      orderBy: { createdAt: 'desc' }
    });

    // 2. Bu senaryo için aynı prompt daha önce kullanıldı mı?
    const samePromptVersion = existingVersionsForScenario.find(
      v => v.promptText.trim() === promptText.trim()
    );

    if (samePromptVersion) {
      console.log(`📌 Mevcut versiyon: ${samePromptVersion.version} (testId: ${samePromptVersion.testId})`);
      return samePromptVersion;
    }

    // 3. Senaryo için yeni versiyon oluşturuyoruz
    // Yeni Test kaydı oluştur (her test çalıştırması yeni TestRun yapar,
    // ama PromptVersion için ayrı bir Test kaydı kullanmamız gerekiyor)
    const newTest = await prisma.test.create({
      data: { testName, targetUrl: targetUrl || null, userPrompt: promptText }
    });

    // 4. Versiyon numarasını hesapla
    const versionNumber = existingVersionsForScenario.length;
    const newVersionStr = `v1.${versionNumber}`;

    // 5. Önceki aktif versiyonu pasif yap
    if (existingVersionsForScenario.length > 0) {
      const activeVersionIds = existingVersionsForScenario
        .filter(v => v.isActive)
        .map(v => v.id);

      if (activeVersionIds.length > 0) {
        await prisma.promptVersion.updateMany({
          where: { id: { in: activeVersionIds } },
          data: { isActive: false }
        });
      }
    }

    // 6. Parent versiyon = en son oluşturulan versiyon
    const parentVersion = existingVersionsForScenario[0] || null;

    const created = await prisma.promptVersion.create({
      data: {
        testId: newTest.id,
        version: newVersionStr,
        promptText,
        parentVersionId: parentVersion?.id || null,
        isActive: true,
        improvementReason: parentVersion
          ? `${parentVersion.version} versiyonundan farklı prompt denemesi`
          : 'Bu senaryonun ilk versiyonu'
      },
      include: { test: true }
    });

    console.log(`✨ Yeni versiyon: ${newVersionStr} (senaryo: "${testName}" @ ${targetUrl || 'no-url'})`);
    return created;
  }

  // ───────────────────────────────────────────────────────────────────────
  // Bir versiyonun istatistiklerini güncelle (test bittikten sonra)
  // ───────────────────────────────────────────────────────────────────────
  async updateStats(versionId, runStatus, durationMs) {
    const version = await prisma.promptVersion.findUnique({ where: { id: versionId } });
    if (!version) return;

    const isSuccess = runStatus === 'SUCCESS';
    const isBug = runStatus === 'BUG_FOUND';
    const isFail = runStatus === 'FAIL' || runStatus === 'ERROR';

    const newTotal = version.totalRuns + 1;
    const newSuccess = version.successCount + (isSuccess ? 1 : 0);
    const newFail = version.failCount + (isFail ? 1 : 0);
    const newBug = version.bugCount + (isBug ? 1 : 0);
    const newRate = newTotal > 0 ? (newSuccess / newTotal) * 100 : 0;

    const oldAvg = version.avgDurationMs || 0;
    const newAvg = Math.round(((oldAvg * version.totalRuns) + (durationMs || 0)) / newTotal);

    return await prisma.promptVersion.update({
      where: { id: versionId },
      data: {
        totalRuns: newTotal,
        successCount: newSuccess,
        failCount: newFail,
        bugCount: newBug,
        successRate: parseFloat(newRate.toFixed(2)),
        avgDurationMs: newAvg
      }
    });
  }

  // ───────────────────────────────────────────────────────────────────────
  // Tüm versiyonları getir — senaryo bazlı gruplandırma için
  // ───────────────────────────────────────────────────────────────────────
  async getAllVersions() {
    return await prisma.promptVersion.findMany({
      orderBy: [{ createdAt: 'desc' }],
      include: {
        test: { select: { id: true, testName: true, targetUrl: true } },
        _count: { select: { testRuns: true } }
      }
    });
  }

  // ───────────────────────────────────────────────────────────────────────
  // Genel istatistikler
  // ───────────────────────────────────────────────────────────────────────
  async getOverallStats() {
    const totalVersions = await prisma.promptVersion.count();
    const activeVersions = await prisma.promptVersion.count({ where: { isActive: true } });

    const versions = await prisma.promptVersion.findMany({
      where: { totalRuns: { gt: 0 } },
      include: { test: true }
    });

    const avgSuccessRate = versions.length > 0
      ? versions.reduce((sum, v) => sum + v.successRate, 0) / versions.length
      : 0;

    const bestVersion = versions.length > 0
      ? versions.reduce((best, v) => v.successRate > best.successRate ? v : best, versions[0])
      : null;

    return {
      totalVersions,
      activeVersions,
      avgSuccessRate: parseFloat(avgSuccessRate.toFixed(2)),
      bestVersion
    };
  }
}

module.exports = new PromptVersionService();