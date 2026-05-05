// src/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const testRoutes = require('./routes/testRoutes');
const promptVersionRoutes = require('./routes/promptVersionRoutes');
const promptImprovementRoutes = require('./routes/promptImprovementRoutes');
const testService = require('./services/testService');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
app.use('/screenshots', express.static(path.join(__dirname, '../test-results/screenshots')));

// Routes
app.use('/api/tests', testRoutes);
app.use('/api/prompt-versions', promptVersionRoutes);
app.use('/api/prompts', promptImprovementRoutes);  // YENİ

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`📸 Screenshots: http://localhost:${PORT}/screenshots`);
  console.log(`📝 Prompt versions: http://localhost:${PORT}/api/prompt-versions`);
  console.log(`✨ Prompt improvement: http://localhost:${PORT}/api/prompts/improve`);

  testService.cleanupStaleRuns().catch(err =>
    console.error('Cleanup hatası:', err.message)
  );
});