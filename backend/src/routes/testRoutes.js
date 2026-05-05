// src/routes/testRoutes.js
const express = require('express');
const router = express.Router();
const testController = require('../controllers/testController');

// Test çalıştır
router.post('/run', testController.runTest);

// YENİ: Tekrar koş
router.post('/:id/rerun', testController.rerunTest);

// YENİ: Sil
router.delete('/:id', testController.deleteTest);

// Test geçmişi
router.get('/history', testController.getHistory);

// İstatistikler
router.get('/stats', testController.getStats);

// Belirli test
router.get('/:id', testController.getTestById);

module.exports = router;