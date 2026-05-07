// src/controllers/reportsController.js
const reportsService = require('../services/reportsService');

class ReportsController {

  // GET /api/reports
  async getAll(req, res) {
    try {
      const data = await reportsService.getAllReports();
      res.json({ success: true, data });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // GET /api/reports/health
  async getHealth(req, res) {
    try {
      const data = await reportsService.calculateHealthScore();
      res.json({ success: true, data });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // GET /api/reports/timeline?days=30
  async getTimeline(req, res) {
    try {
      const days = parseInt(req.query.days) || 30;
      const data = await reportsService.getTimelineTrend(days);
      res.json({ success: true, data });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
}

module.exports = new ReportsController();