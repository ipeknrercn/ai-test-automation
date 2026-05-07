// src/routes/folderRoutes.js
const express = require('express');
const router = express.Router();
const folderController = require('../controllers/folderController');

router.get('/', folderController.getAll);
router.post('/', folderController.create);
router.post('/add', folderController.addTest);
router.post('/remove', folderController.removeTest);
router.put('/set', folderController.setTestFolders);
router.patch('/:id', folderController.update);
router.delete('/:id', folderController.remove);

module.exports = router;