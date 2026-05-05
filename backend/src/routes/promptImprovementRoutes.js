// src/routes/promptImprovementRoutes.js
const express = require('express');
const router = express.Router();
const promptImprovementController = require('../controllers/promptImprovementController');

router.post('/improve', promptImprovementController.improve);

module.exports = router;