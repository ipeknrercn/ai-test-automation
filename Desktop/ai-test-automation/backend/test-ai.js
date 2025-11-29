// test-ai.js
require('dotenv').config();
const aiService = require('./src/services/aiService');

(async () => {
  console.log('🤖 AI Test\n');

  const result = await aiService.testConnection();
  
  if (result.success) {
    console.log('✅ Başarılı!');
    console.log('Provider:', result.provider);
    console.log('Model:', result.model);
    console.log('Cevap:', result.response);
  } else {
    console.log('❌ Hata:', result.error);
  }
})();