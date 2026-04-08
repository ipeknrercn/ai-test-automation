// src/routes/testRoutes.js
const express = require('express');
const router = express.Router();
const testController = require('../controllers/testController');

// Test çalıştır
router.post('/run', testController.runTest);

// Test geçmişi
router.get('/history', testController.getHistory);

// Test istatistikleri
router.get('/stats', testController.getStats);

// Belirli test
router.get('/:id', testController.getTestById);

module.exports = router;