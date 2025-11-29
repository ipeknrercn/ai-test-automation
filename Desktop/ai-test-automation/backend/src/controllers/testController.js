// src/controllers/testController.js
const testService = require('../services/testService');

class TestController {
  // POST /api/tests/run
  async runTest(req, res) {
    try {
      const { testName, userPrompt, targetUrl } = req.body;

      // Validation
      if (!testName || !userPrompt) {
        return res.status(400).json({
          success: false,
          error: 'testName and userPrompt are required'
        });
      }

      // Test çalıştır
      const result = await testService.runTest({
        testName,
        userPrompt,
        targetUrl
      });

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // GET /api/tests/history
  async getHistory(req, res) {
    try {
      const limit = parseInt(req.query.limit) || 10;
      const history = await testService.getTestHistory(limit);

      res.json({
        success: true,
        count: history.length,
        data: history
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // GET /api/tests/:id
  async getTestById(req, res) {
    try {
      const test = await testService.getTestById(req.params.id);

      if (!test) {
        return res.status(404).json({
          success: false,
          error: 'Test not found'
        });
      }

      res.json({
        success: true,
        data: test
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // GET /api/tests/stats
  async getStats(req, res) {
    try {
      const stats = await testService.getStats();

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
}

module.exports = new TestController();