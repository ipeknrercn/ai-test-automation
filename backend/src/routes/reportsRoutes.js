// src/routes/reportsRoutes.js
const express = require('express');
const router = express.Router();
const reportsController = require('../controllers/reportsController');

router.get('/', reportsController.getAll);
router.get('/health', reportsController.getHealth);
router.get('/timeline', reportsController.getTimeline);

module.exports = router;