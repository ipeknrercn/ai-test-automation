// src/controllers/promptImprovementController.js
const promptImprovementService = require('../services/promptImprovementService');

class PromptImprovementController {

  // POST /api/prompts/improve
  // body: { prompt: string, testName?: string, targetUrl?: string }
  async improve(req, res) {
    try {
      const { prompt, testName, targetUrl } = req.body;

      if (!prompt || prompt.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: 'prompt alanı zorunludur'
        });
      }

      const result = await promptImprovementService.improvePrompt(prompt, {
        testName,
        targetUrl
      });

      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
}

module.exports = new PromptImprovementController();