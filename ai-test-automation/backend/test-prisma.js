// backend/test-prisma.js - Database CRUD Testi
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testDatabase() {
  console.log('🗄️  PostgreSQL + Prisma CRUD Testi\n');
  
  try {
    // ============================================
    // 1. TEST OLUŞTUR
    // ============================================
    console.log('📍 [1/5] Test oluşturuluyor...');
    const test = await prisma.test.create({
      data: {
        testName: 'Login Test',
        description: 'SauceDemo login senaryosu',
        userPrompt: 'Login ol ve dashboard\'a git',
        targetUrl: 'https://www.saucedemo.com'
      }
    });
    console.log('✅ Test oluşturuldu:', test);
    console.log('   ID:', test.id);
    console.log('   İsim:', test.testName);
    console.log();
    
    // ============================================
    // 2. TEST RUN OLUŞTUR
    // ============================================
    console.log('📍 [2/5] Test çalıştırması oluşturuluyor...');
    const testRun = await prisma.testRun.create({
      data: {
        testId: test.id,
        status: 'SUCCESS',
        startTime: new Date(),
        endTime: new Date(),
        durationMs: 5000,
        browser: 'chromium'
      }
    });
    console.log('✅ Test run oluşturuldu:', testRun.id);
    console.log();
    
    // ============================================
    // 3. SCREENSHOT OLUŞTUR
    // ============================================
    console.log('📍 [3/5] Screenshot metadata oluşturuluyor...');
    const screenshot = await prisma.screenshot.create({
      data: {
        filePath: 'screenshots/test_001_step1.png',
        fileSize: 245678,
        width: 1920,
        height: 1080,
        format: 'png'
      }
    });
    console.log('✅ Screenshot oluşturuldu:', screenshot.id);
    console.log();
    
    // ============================================
    // 4. TEST STEP'LERİ OLUŞTUR
    // ============================================
    console.log('📍 [4/5] Test adımları oluşturuluyor...');
    const steps = await prisma.testStep.createMany({
      data: [
        {
          testRunId: testRun.id,
          stepNumber: 1,
          timestamp: new Date(),
          action: 'navigate',
          target: 'https://www.saucedemo.com',
          screenshotId: screenshot.id,
          success: true,
          durationMs: 2000
        },
        {
          testRunId: testRun.id,
          stepNumber: 2,
          timestamp: new Date(),
          action: 'fill',
          target: '#user-name',
          value: 'standard_user',
          success: true,
          durationMs: 500
        },
        {
          testRunId: testRun.id,
          stepNumber: 3,
          timestamp: new Date(),
          action: 'fill',
          target: '#password',
          value: 'secret_sauce',
          success: true,
          durationMs: 500
        },
        {
          testRunId: testRun.id,
          stepNumber: 4,
          timestamp: new Date(),
          action: 'click',
          target: '#login-button',
          success: true,
          durationMs: 2000
        }
      ]
    });
    console.log('✅', steps.count, 'adım oluşturuldu');
    console.log();
    
    // ============================================
    // 5. VERİLERİ GETİR (İLİŞKİLERLE)
    // ============================================
    console.log('📍 [5/5] Tüm veriler ilişkileriyle getiriliyor...');
    const fullTest = await prisma.test.findUnique({
      where: { id: test.id },
      include: {
        testRuns: {
          include: {
            steps: {
              include: {
                screenshot: true
              },
              orderBy: { stepNumber: 'asc' }
            }
          }
        }
      }
    });
    
    console.log('✅ Test verisi alındı:');
    console.log(JSON.stringify(fullTest, null, 2));
    console.log();
    
    // ============================================
    // 6. İSTATİSTİKLER
    // ============================================
    console.log('═══════════════════════════════════════');
    console.log('           DATABASE İSTATİSTİKLER     ');
    console.log('═══════════════════════════════════════');
    
    const testCount = await prisma.test.count();
    const testRunCount = await prisma.testRun.count();
    const stepCount = await prisma.testStep.count();
    const screenshotCount = await prisma.screenshot.count();
    
    console.log('📊 Tests:', testCount);
    console.log('📊 Test Runs:', testRunCount);
    console.log('📊 Test Steps:', stepCount);
    console.log('📊 Screenshots:', screenshotCount);
    console.log();
    
    console.log('🎉 CRUD TEST BAŞARIYLA TAMAMLANDI!\n');
    console.log('💡 Prisma Studio\'da verileri görebilirsin:');
    console.log('   npx prisma studio\n');
    
  } catch (error) {
    console.error('❌ HATA:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testDatabase();