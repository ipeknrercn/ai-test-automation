// src/routes/promptVersionRoutes.js
const express = require('express');
const router = express.Router();
const promptVersionController = require('../controllers/promptVersionController');

router.get('/stats', promptVersionController.getStats);
router.get('/test/:testId', promptVersionController.getByTestId);
router.get('/compare/:id1/:id2', promptVersionController.compare);
router.get('/', promptVersionController.getAll);

module.exports = router;