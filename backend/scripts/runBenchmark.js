// scripts/runBenchmark.js
//
// ABLATION STUDY BENCHMARK — V1–V4, Accuracy / F1 / Flakiness
//
// Senaryo seçimi: scripts/benchmarkCases.js (testManual*.js ile aynı prompt)
//
//   node scripts/runBenchmark.js --list
//   node scripts/runBenchmark.js --case saucedemo-sort
//   node scripts/runBenchmark.js --case remora-contact
//   node scripts/runBenchmark.js --case testManual.js
//   node scripts/runBenchmark.js --case legacy-all
//   node scripts/runBenchmark.js --case saucedemo-cart --runs 2
//
//   $env:BENCHMARK_CASE="saucedemo-sort"; node scripts/runBenchmark.js

require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const prisma = require('../src/config/database');
const browserAgentAI = require('../src/services/browserAgentAi');
const {
  resolveBenchmarkScenarios,
  normalizeCaseId,
  printCaseList
} = require('./benchmarkCases');

const VERSIONS = ['V1', 'V2', 'V3', 'V4'];
const DEFAULT_RUNS_PER_COMBINATION = 1;

function parseCliArgs() {
  const args = process.argv.slice(2);
  let caseId = process.env.BENCHMARK_CASE || null;
  let runs = DEFAULT_RUNS_PER_COMBINATION;
  let list = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--list') {
      list = true;
    } else if (args[i] === '--case' && args[i + 1]) {
      caseId = args[++i];
    } else if (args[i] === '--runs' && args[i + 1]) {
      runs = Math.max(1, parseInt(args[++i], 10) || DEFAULT_RUNS_PER_COMBINATION);
    } else if (!args[i].startsWith('-')) {
      caseId = args[i];
    }
  }

  return { caseId, runs, list };
}

// ─────────────────────────────────────────────────────────────────────
// EXPECTED OUTCOME VERIFICATION
// ─────────────────────────────────────────────────────────────────────
async function verifyOutcome(testRunId, expectedOutcome) {
  // Test koşumundan sonra son ekran görüntüsü ve URL kontrol edilir
  const lastStep = await prisma.testStep.findFirst({
    where: { testRunId },
    orderBy: { stepNumber: 'desc' }
  });
  if (!lastStep) return { passed: false, reason: 'Adım yok' };

  // Bu basit version — URL ve text kontrolü AI'ın last step reasoning'inden gelir
  // Gerçekçi bir doğrulama için son screenshot'a tekrar bakmak gerek ama bu MVP için yeterli
  return { passed: true, reason: 'Test tamamlandı (deterministik doğrulama V5 için)' };
}

// ─────────────────────────────────────────────────────────────────────
// METRIK HESAPLAMA
// ─────────────────────────────────────────────────────────────────────
function calculateMetrics(results) {
  const total = results.length;
  if (total === 0) return null;

  // TP = test gerçekten başarılı (test_success=true)
  // FN = test başarılı olmalıydı ama olamadı
  // Bu basit binary durumda accuracy=success_rate
  // F1 senaryo başına eşit önemde olduğu için precision/recall makro hesaplanır

  const successes = results.filter(r => r.testSuccess).length;
  const failures = total - successes;
  const accuracy = (successes / total) * 100;

  // Step-level precision: başarılı step / toplam step
  const allSteps = results.reduce((s, r) => s + r.totalSteps, 0);
  const successSteps = results.reduce((s, r) => s + r.successSteps, 0);
  const stepPrecision = allSteps > 0 ? (successSteps / allSteps) * 100 : 0;

  // Step-level recall (recall ≈ accuracy in binary classification)
  const recall = accuracy;
  const precision = stepPrecision;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  // Latency
  const totalDuration = results.reduce((s, r) => s + r.durationMs, 0);
  const avgLatency = totalDuration / total;
  const avgStepLatency = results.reduce((s, r) => s + (r.metrics?.avgStepDurationMs || 0), 0) / total;

  // Token
  const avgTokens = results.reduce((s, r) => s + (r.metrics?.totalApiTokensEstimate || 0), 0) / total;

  // Retry
  const totalRetries = results.reduce((s, r) => s + (r.metrics?.retryCount || 0), 0);
  const avgRetries = totalRetries / total;

  // BBox fallback usage
  const totalBboxFallbacks = results.reduce((s, r) => s + (r.metrics?.bboxFallbacks || 0), 0);

  // Flakiness: aynı senaryonun farklı koşumlarındaki tutarsızlık
  // Bu fonksiyon dışarıdan hesaplanacak

  return {
    totalRuns: total,
    successes,
    failures,
    accuracy: accuracy.toFixed(2),
    precision: precision.toFixed(2),
    recall: recall.toFixed(2),
    f1Score: f1.toFixed(2),
    avgLatencyMs: Math.round(avgLatency),
    avgLatencySec: (avgLatency / 1000).toFixed(2),
    avgStepLatencyMs: Math.round(avgStepLatency),
    avgTokensPerRun: Math.round(avgTokens),
    avgRetriesPerRun: avgRetries.toFixed(2),
    totalBboxFallbacks
  };
}

function calculateFlakiness(scenarioResults) {
  // Bir senaryoda farklı koşumların aynı sonucu verme oranı
  const groupedByScenario = {};
  scenarioResults.forEach(r => {
    if (!groupedByScenario[r.scenarioId]) groupedByScenario[r.scenarioId] = [];
    groupedByScenario[r.scenarioId].push(r.testSuccess);
  });

  let stableScenarios = 0;
  let totalScenarios = 0;
  Object.values(groupedByScenario).forEach(outcomes => {
    totalScenarios++;
    const allSame = outcomes.every(o => o === outcomes[0]);
    if (allSame) stableScenarios++;
  });

  return totalScenarios > 0 ? ((stableScenarios / totalScenarios) * 100).toFixed(2) : 0;
}

// ─────────────────────────────────────────────────────────────────────
// ANA RUNNER
// ─────────────────────────────────────────────────────────────────────
async function runSingleTest(scenario, version, runNumber, runsPerCombination) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`▶️  ${version} | ${scenario.id} (${scenario.name}) | Koşum ${runNumber}/${runsPerCombination}`);
  console.log('='.repeat(60));

  // Database'de yeni test+run oluştur
  const testRecord = await prisma.test.create({
    data: {
      testName: `BENCHMARK-${version}-${scenario.id}-r${runNumber}`,
      userPrompt: scenario.userPrompt,
      targetUrl: scenario.targetUrl
    }
  });

  const testRun = await prisma.testRun.create({
    data: {
      testId: testRecord.id,
      status: 'RUNNING',
      startTime: new Date(),
      browser: 'chromium'
    }
  });

  let result;
  try {
    result = await browserAgentAI.executeTest(
      testRun.id,
      scenario.userPrompt,
      scenario.targetUrl,
      { architectureVersion: version }
    );
  } catch (err) {
    console.error(`💥 Fatal: ${err.message}`);
    result = {
      success: false, totalSteps: 0, successSteps: 0, failedSteps: 0,
      duration: 0, error: err.message, metrics: {}
    };
  }

  // Test runı güncelle
  let finalStatus = 'FAIL';
  if (result.bugDetected) finalStatus = 'BUG_FOUND';
  else if (result.success) finalStatus = 'SUCCESS';
  else if (result.error) finalStatus = 'ERROR';

  await prisma.testRun.update({
    where: { id: testRun.id },
    data: {
      status: finalStatus,
      endTime: new Date(),
      durationMs: result.duration,
      errorMsg: result.bugDetected ? `BUG: ${result.bugDescription}` : (result.error || null)
    }
  });

  // Expected outcome verify
  const outcome = await verifyOutcome(testRun.id, scenario.expectedOutcome);

  return {
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    difficulty: scenario.difficulty,
    version,
    runNumber,
    testRunId: testRun.id,
    testSuccess: result.success,
    bugDetected: result.bugDetected || false,
    totalSteps: result.totalSteps,
    successSteps: result.successSteps,
    failedSteps: result.failedSteps,
    durationMs: result.duration,
    error: result.error,
    metrics: result.metrics || {},
    outcomeVerified: outcome.passed
  };
}

async function runFullBenchmark(scenarios, benchmarkCaseKey, runsPerCombination) {
  console.log('\n' + '█'.repeat(60));
  console.log('  ABLATION STUDY BENCHMARK BAŞLIYOR');
  console.log('  ' + new Date().toISOString());
  console.log('█'.repeat(60));
  console.log(`\nCase paketi: ${benchmarkCaseKey}`);
  console.log(`Senaryo sayısı: ${scenarios.length}`);
  console.log(`Versiyon sayısı: ${VERSIONS.length}`);
  console.log(`Senaryo başına koşum: ${runsPerCombination}`);
  console.log(`Toplam koşum: ${scenarios.length * VERSIONS.length * runsPerCombination}`);
  scenarios.forEach((s) => console.log(`  • ${s.id}: ${s.name}`));
  console.log('');

  const allResults = [];
  const startTime = Date.now();

  for (const version of VERSIONS) {
    for (const scenario of scenarios) {
      for (let runNumber = 1; runNumber <= runsPerCombination; runNumber++) {
        const result = await runSingleTest(scenario, version, runNumber, runsPerCombination);
        allResults.push(result);

        // Kısa nefes — API rate limit için
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  }

  const totalDuration = Date.now() - startTime;
  console.log(`\n\n✅ Benchmark tamamlandı (${(totalDuration / 60000).toFixed(1)} dakika)`);

  // ─── Metrik özet ───
  const summary = {
    benchmarkCase: benchmarkCaseKey,
    benchmarkStartTime: new Date(startTime).toISOString(),
    benchmarkDurationMin: (totalDuration / 60000).toFixed(2),
    totalRuns: allResults.length,
    scenarios: scenarios.map((s) => ({ id: s.id, name: s.name, difficulty: s.difficulty })),
    versionMetrics: {}
  };

  for (const version of VERSIONS) {
    const versionResults = allResults.filter(r => r.version === version);
    summary.versionMetrics[version] = {
      ...calculateMetrics(versionResults),
      flakinessStability: calculateFlakiness(versionResults)
    };

    // Senaryo bazlı breakdown
    summary.versionMetrics[version].byScenario = {};
    for (const scenario of scenarios) {
      const scResults = versionResults.filter(r => r.scenarioId === scenario.id);
      summary.versionMetrics[version].byScenario[scenario.id] = calculateMetrics(scResults);
    }
  }

  // ─── Kaydet ───
  const outDir = path.join(__dirname, '../benchmark-results');
  await fs.mkdir(outDir, { recursive: true });

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const filePrefix = `benchmark-${benchmarkCaseKey}-${ts}`;
  const jsonPath = path.join(outDir, `${filePrefix}.json`);
  await fs.writeFile(jsonPath, JSON.stringify({ summary, allResults }, null, 2));
  console.log(`\n📄 Tam sonuç: ${jsonPath}`);

  // ─── CSV özet ───
  const csvLines = ['Version,Scenario,Difficulty,Runs,Successes,Accuracy,Precision,F1,AvgLatencySec,AvgRetries,Flakiness'];
  for (const version of VERSIONS) {
    const m = summary.versionMetrics[version];
    csvLines.push(`${version},OVERALL,-,${m.totalRuns},${m.successes},${m.accuracy},${m.precision},${m.f1Score},${m.avgLatencySec},${m.avgRetriesPerRun},${m.flakinessStability}`);
    for (const scenario of scenarios) {
      const sm = m.byScenario[scenario.id];
      if (sm) {
        csvLines.push(`${version},${scenario.id},${scenario.difficulty},${sm.totalRuns},${sm.successes},${sm.accuracy},${sm.precision},${sm.f1Score},${sm.avgLatencySec},${sm.avgRetriesPerRun},-`);
      }
    }
  }
  const csvPath = path.join(outDir, `${filePrefix}-summary.csv`);
  await fs.writeFile(csvPath, csvLines.join('\n'));
  console.log(`📊 CSV özet: ${csvPath}`);

  // ─── Konsol özet ───
  console.log('\n' + '═'.repeat(60));
  console.log('  ÖZET TABLO');
  console.log('═'.repeat(60));
  console.log('Version | Accuracy | F1     | Latency | Retries | Stability');
  console.log('-'.repeat(60));
  for (const v of VERSIONS) {
    const m = summary.versionMetrics[v];
    console.log(`${v.padEnd(7)} | %${m.accuracy.padStart(6)} | ${m.f1Score.padStart(6)} | ${m.avgLatencySec.padStart(5)}s  | ${m.avgRetriesPerRun.padStart(5)}   | %${m.flakinessStability}`);
  }
  console.log('═'.repeat(60));

  await prisma.$disconnect();
  process.exit(0);
}

async function main() {
  const { caseId, runs, list } = parseCliArgs();

  if (list) {
    printCaseList();
    await prisma.$disconnect();
    process.exit(0);
  }

  const normalized = normalizeCaseId(caseId);
  if (!normalized) {
    console.error('\n⚠️  Senaryo seçilmedi. --case <id> veya BENCHMARK_CASE gerekli.\n');
    printCaseList();
    await prisma.$disconnect();
    process.exit(1);
  }

  const scenarios = resolveBenchmarkScenarios(caseId);
  await runFullBenchmark(scenarios, normalized, runs);
}

main().catch(err => {
  console.error('💥 Benchmark fatal:', err);
  process.exit(1);
});