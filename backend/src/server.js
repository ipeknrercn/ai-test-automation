// src/server.js
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

const testRoutes = require('./routes/testRoutes');
const promptVersionRoutes = require('./routes/promptVersionRoutes');
const promptImprovementRoutes = require('./routes/promptImprovementRoutes');
const folderRoutes = require('./routes/folderRoutes');
const reportsRoutes = require('./routes/reportsRoutes');
const testService = require('./services/testService');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  '/screenshots',
  express.static(path.join(__dirname, '../test-results/screenshots'))
);

// Routes
app.use('/api/tests', testRoutes);
app.use('/api/prompt-versions', promptVersionRoutes);
app.use('/api/prompts', promptImprovementRoutes);
app.use('/api/folders', folderRoutes);
app.use('/api/reports', reportsRoutes);

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'Server is running',
  });
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
  });
});

app.use((err, req, res, next) => {
  console.error('Server Error:', err.stack);

  res.status(500).json({
    success: false,
    error: 'Internal server error',
  });
});

app.listen(PORT, '0.0.0.0', async () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Health check available at /health`);
  console.log(`Screenshots: /screenshots`);
  console.log(`Folders: /api/folders`);
  console.log(`Reports: /api/reports`);

  try {
    await testService.cleanupStaleRuns();
    console.log('🧹 Stale test runs cleaned successfully');
  } catch (err) {
    console.error('Cleanup error:', err.message);
  }
});
