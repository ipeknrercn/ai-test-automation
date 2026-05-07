// src/services/reportsService.js
const prisma = require('../config/database');

class ReportsService {

  /**
   * Tüm rapor verilerini tek bir endpoint'te döndür
   * (Frontend'de daha az API çağrısı için)
   */
  async getAllReports() {
    const [
      healthScore,
      timelineTrend,
      bugHotspots,
      promptPerformance,
      aiMetrics,
      yearlyHighlights
    ] = await Promise.all([
      this.calculateHealthScore(),
      this.getTimelineTrend(30),
      this.getBugHotspots(),
      this.getPromptPerformance(),
      this.getAIMetrics(),
      this.getYearlyHighlights()
    ]);

    return {
      healthScore,
      timelineTrend,
      bugHotspots,
      promptPerformance,
      aiMetrics,
      yearlyHighlights,
      generatedAt: new Date().toISOString()
    };
  }

  // ───────────────────────────────────────────────────────────────────────
  // 1. Sistem Sağlık Skoru (0-100)
  // Formül: başarı oranı (50%) + bug oranı tersi (30%) + retry verimi (20%)
  // ───────────────────────────────────────────────────────────────────────
  async calculateHealthScore() {
    const total = await prisma.testRun.count();
    if (total === 0) {
      return { score: 0, label: 'Veri yok', breakdown: {}, color: 'gray' };
    }

    const success = await prisma.testRun.count({ where: { status: 'SUCCESS' } });
    const bugs = await prisma.testRun.count({ where: { status: 'BUG_FOUND' } });
    const failed = await prisma.testRun.count({ where: { status: 'FAIL' } });

    const successRate = (success / total) * 100;
    const bugRate = (bugs / total) * 100;
    const failRate = (failed / total) * 100;

    // Sağlık formülü
    const healthScore = Math.round(
      (successRate * 0.6) +
      (Math.max(0, 100 - failRate * 2) * 0.25) +
      (Math.max(0, 100 - bugRate * 3) * 0.15)
    );

    let label = 'Mükemmel', color = 'emerald';
    if (healthScore < 30) { label = 'Kritik'; color = 'red'; }
    else if (healthScore < 50) { label = 'Zayıf'; color = 'orange'; }
    else if (healthScore < 70) { label = 'Orta'; color = 'amber'; }
    else if (healthScore < 85) { label = 'İyi'; color = 'blue'; }

    return {
      score: Math.max(0, Math.min(100, healthScore)),
      label,
      color,
      breakdown: {
        successRate: parseFloat(successRate.toFixed(1)),
        failRate: parseFloat(failRate.toFixed(1)),
        bugRate: parseFloat(bugRate.toFixed(1)),
        totalRuns: total
      }
    };
  }

  // ───────────────────────────────────────────────────────────────────────
  // 2. Zaman Bazlı Trend (Son N gün)
  // ───────────────────────────────────────────────────────────────────────
  async getTimelineTrend(days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const runs = await prisma.testRun.findMany({
      where: { startTime: { gte: startDate } },
      select: { status: true, startTime: true, durationMs: true }
    });

    // Günlere göre grupla
    const dayMap = {};
    for (let i = 0; i < days; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().split('T')[0];
      dayMap[key] = { date: key, success: 0, fail: 0, bug: 0, total: 0, avgDuration: 0, durations: [] };
    }

    runs.forEach(r => {
      const key = r.startTime.toISOString().split('T')[0];
      if (!dayMap[key]) return;
      dayMap[key].total++;
      if (r.status === 'SUCCESS') dayMap[key].success++;
      else if (r.status === 'BUG_FOUND') dayMap[key].bug++;
      else dayMap[key].fail++;
      if (r.durationMs) dayMap[key].durations.push(r.durationMs);
    });

    const series = Object.values(dayMap).map(d => ({
      date: d.date,
      success: d.success,
      fail: d.fail,
      bug: d.bug,
      total: d.total,
      avgDuration: d.durations.length > 0
        ? Math.round(d.durations.reduce((a, b) => a + b, 0) / d.durations.length / 1000)
        : 0
    }));

    // Karşılaştırma: son 7 gün vs önceki 7 gün
    const last7 = series.slice(-7);
    const prev7 = series.slice(-14, -7);
    const last7Success = last7.reduce((s, d) => s + d.success, 0);
    const prev7Success = prev7.reduce((s, d) => s + d.success, 0);
    const trend = prev7Success > 0
      ? Math.round(((last7Success - prev7Success) / prev7Success) * 100)
      : 0;

    return {
      series,
      summary: {
        last7DaysSuccess: last7Success,
        prev7DaysSuccess: prev7Success,
        trendPercent: trend
      }
    };
  }

  // ───────────────────────────────────────────────────────────────────────
  // 3. Bug Hotspot Haritası — Hangi URL/senaryo bug üretiyor
  // ───────────────────────────────────────────────────────────────────────
  async getBugHotspots() {
    const bugRuns = await prisma.testRun.findMany({
      where: { status: 'BUG_FOUND' },
      include: { test: true }
    });

    // URL bazlı bug sayısı
    const byUrl = {};
    const byTestName = {};

    bugRuns.forEach(r => {
      const url = r.test.targetUrl || 'no-url';
      const name = r.test.testName;
      byUrl[url] = (byUrl[url] || 0) + 1;
      byTestName[name] = (byTestName[name] || 0) + 1;
    });

    const topUrls = Object.entries(byUrl)
      .map(([url, count]) => ({ url, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const topTests = Object.entries(byTestName)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      totalBugs: bugRuns.length,
      topUrls,
      topTests
    };
  }

  // ───────────────────────────────────────────────────────────────────────
  // 4. En İyi ve En Kötü Promptlar
  // ───────────────────────────────────────────────────────────────────────
  async getPromptPerformance() {
    const allVersions = await prisma.promptVersion.findMany({
      where: { totalRuns: { gt: 0 } },
      include: { test: { select: { testName: true, targetUrl: true } } }
    });

    if (allVersions.length === 0) {
      return { best: [], worst: [], totalAnalyzed: 0 };
    }

    const sorted = [...allVersions].sort((a, b) => b.successRate - a.successRate);

    const best = sorted.slice(0, 5).map(v => ({
      id: v.id,
      version: v.version,
      testName: v.test?.testName || 'Bilinmeyen',
      promptText: v.promptText.substring(0, 120) + (v.promptText.length > 120 ? '...' : ''),
      successRate: v.successRate,
      totalRuns: v.totalRuns
    }));

    const worst = sorted
      .filter(v => v.successRate < 70)
      .slice(-5)
      .reverse()
      .map(v => ({
        id: v.id,
        version: v.version,
        testName: v.test?.testName || 'Bilinmeyen',
        promptText: v.promptText.substring(0, 120) + (v.promptText.length > 120 ? '...' : ''),
        successRate: v.successRate,
        totalRuns: v.totalRuns
      }));

    return { best, worst, totalAnalyzed: allVersions.length };
  }

  // ───────────────────────────────────────────────────────────────────────
  // 5. AI Verimlilik Metrikleri
  // ───────────────────────────────────────────────────────────────────────
  async getAIMetrics() {
    const allSteps = await prisma.testStep.findMany({
      select: { aiConfidence: true, durationMs: true, success: true, action: true }
    });

    const totalRuns = await prisma.testRun.count();
    const allRuns = await prisma.testRun.findMany({
      select: { durationMs: true, status: true }
    });

    const completedRuns = allRuns.filter(r => r.durationMs);
    const avgTestDuration = completedRuns.length > 0
      ? Math.round(completedRuns.reduce((s, r) => s + (r.durationMs || 0), 0) / completedRuns.length / 1000)
      : 0;

    const stepsWithDuration = allSteps.filter(s => s.durationMs);
    const avgStepDuration = stepsWithDuration.length > 0
      ? Math.round(stepsWithDuration.reduce((s, st) => s + (st.durationMs || 0), 0) / stepsWithDuration.length)
      : 0;

    const stepsWithConf = allSteps.filter(s => s.aiConfidence != null);
    const avgConfidence = stepsWithConf.length > 0
      ? parseFloat((stepsWithConf.reduce((s, st) => s + (st.aiConfidence || 0), 0) / stepsWithConf.length * 100).toFixed(1))
      : 0;

    const stepsByAction = {};
    allSteps.forEach(s => { stepsByAction[s.action] = (stepsByAction[s.action] || 0) + 1; });
    const topActions = Object.entries(stepsByAction)
      .map(([action, count]) => ({ action, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    // Tahmini API maliyeti (her step ~2500 input + 150 output token)
    const totalSteps = allSteps.length;
    const estimatedCost = (totalSteps * 0.01).toFixed(2); // ~1 cent / step

    return {
      avgTestDuration,
      avgStepDuration,
      avgConfidence,
      totalSteps,
      totalRuns,
      estimatedCost,
      topActions
    };
  }

  // ───────────────────────────────────────────────────────────────────────
  // 6. Yıllık Özet — Spotify Wrapped tarzı
  // ───────────────────────────────────────────────────────────────────────
  async getYearlyHighlights() {
    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1);

    const yearRuns = await prisma.testRun.findMany({
      where: { startTime: { gte: yearStart } },
      include: { test: true, steps: true }
    });

    const totalTestsThisYear = yearRuns.length;
    const successfulThisYear = yearRuns.filter(r => r.status === 'SUCCESS').length;
    const bugsFoundThisYear = yearRuns.filter(r => r.status === 'BUG_FOUND').length;
    const totalStepsThisYear = yearRuns.reduce((s, r) => s + r.steps.length, 0);

    // En aktif gün
    const dayCount = {};
    yearRuns.forEach(r => {
      const day = r.startTime.toISOString().split('T')[0];
      dayCount[day] = (dayCount[day] || 0) + 1;
    });
    const busiestDay = Object.entries(dayCount).sort((a, b) => b[1] - a[1])[0];

    // En çok kullanılan eylem
    const actionCount = {};
    yearRuns.forEach(r => r.steps.forEach(s => {
      actionCount[s.action] = (actionCount[s.action] || 0) + 1;
    }));
    const topAction = Object.entries(actionCount).sort((a, b) => b[1] - a[1])[0];

    // En sık test edilen platform
    const urlCount = {};
    yearRuns.forEach(r => {
      const url = r.test.targetUrl;
      if (url) {
        try {
          const domain = new URL(url).hostname;
          urlCount[domain] = (urlCount[domain] || 0) + 1;
        } catch {}
      }
    });
    const topPlatform = Object.entries(urlCount).sort((a, b) => b[1] - a[1])[0];

    return {
      year: now.getFullYear(),
      totalTests: totalTestsThisYear,
      successful: successfulThisYear,
      bugsFound: bugsFoundThisYear,
      totalSteps: totalStepsThisYear,
      busiestDay: busiestDay ? { date: busiestDay[0], count: busiestDay[1] } : null,
      topAction: topAction ? { action: topAction[0], count: topAction[1] } : null,
      topPlatform: topPlatform ? { domain: topPlatform[0], count: topPlatform[1] } : null
    };
  }
}

module.exports = new ReportsService();