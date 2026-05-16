/**
 * Manuel test — tek koşum (tek mimari).
 *
 * Senaryo tanımı: benchmarkCases.js → saucedemo-sort
 * V1–V4 + F1 benchmark: node scripts/runBenchmark.js --case saucedemo-sort
 *
 * backend klasöründen:
 *   $env:ARCHITECTURE_VERSION = "V4"
 *   node scripts/testManual.js
 */
const path = require('path');

const backendRoot = path.basename(__dirname) === 'scripts'
  ? path.join(__dirname, '..')
  : __dirname;

require('dotenv').config({ path: path.join(backendRoot, '.env') });

const prisma = require(path.join(backendRoot, 'src/config/database'));
const agent = require(path.join(backendRoot, 'src/services/browserAgentAi'));
const { getManualCase } = require('./benchmarkCases');

const CASE_ID = 'saucedemo-sort';
const MANUAL_TEST_CASE = getManualCase(CASE_ID);

(async () => {
  const { testName, targetUrl, userPrompt } = MANUAL_TEST_CASE;

  const test = await prisma.test.create({
    data: { testName, userPrompt, targetUrl }
  });

  const run = await prisma.testRun.create({
    data: {
      testId: test.id,
      status: 'RUNNING',
      startTime: new Date(),
      browser: 'chromium'
    }
  });

  const archVersion = (process.env.ARCHITECTURE_VERSION || 'V4').toUpperCase();
  console.log('TestRun:', run.id, '| Mimari:', archVersion);
  console.log('Senaryo:', testName, `(${CASE_ID})`);

  const result = await agent.executeTest(run.id, userPrompt, targetUrl, {
    architectureVersion: archVersion
  });

  const finalStatus = result.bugDetected
    ? 'BUG_FOUND'
    : result.success
      ? 'SUCCESS'
      : 'FAIL';

  await prisma.testRun.update({
    where: { id: run.id },
    data: {
      status: finalStatus,
      endTime: new Date(),
      durationMs: result.duration || 0,
      errorMsg: result.failureSummary || result.error || null
    }
  });

  if (result.success) {
    console.log('SONUÇ: BAŞARILI');
  } else {
    console.log('SONUÇ: BAŞARISIZ');
    console.log('Neden:', result.failureSummary || result.error);
  }

  console.log(`\nBenchmark (V1–V4): node scripts/runBenchmark.js --case ${CASE_ID}`);

  await prisma.$disconnect();
})();
