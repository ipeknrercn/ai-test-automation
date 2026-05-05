// src/controllers/promptVersionController.js
const promptVersionService = require('../services/promptVersionService');

class PromptVersionController {

  // GET /api/prompt-versions
  async getAll(req, res) {
    try {
      const versions = await promptVersionService.getAllVersions();
      res.json({ success: true, count: versions.length, data: versions });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // GET /api/prompt-versions/stats
  async getStats(req, res) {
    try {
      const stats = await promptVersionService.getOverallStats();
      res.json({ success: true, data: stats });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // GET /api/prompt-versions/test/:testId
  async getByTestId(req, res) {
    try {
      const versions = await promptVersionService.getVersionsForTest(parseInt(req.params.testId));
      res.json({ success: true, data: versions });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // GET /api/prompt-versions/compare/:id1/:id2
  async compare(req, res) {
    try {
      const result = await promptVersionService.compareVersions(
        parseInt(req.params.id1),
        parseInt(req.params.id2)
      );
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
}

module.exports = new PromptVersionController();