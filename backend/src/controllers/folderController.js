// src/controllers/folderController.js
const folderService = require('../services/folderService');

class FolderController {

  // GET /api/folders
  async getAll(req, res) {
    try {
      const data = await folderService.getAllFolders();
      res.json({ success: true, data });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // POST /api/folders
  async create(req, res) {
    try {
      const folder = await folderService.createFolder(req.body);
      res.status(201).json({ success: true, data: folder });
    } catch (error) {
      const status = error.code === 'P2002' ? 409 : 500;
      const msg = error.code === 'P2002' ? 'Bu isimde bir klasör zaten var' : error.message;
      res.status(status).json({ success: false, error: msg });
    }
  }

  // PATCH /api/folders/:id
  async update(req, res) {
    try {
      const folder = await folderService.updateFolder(req.params.id, req.body);
      res.json({ success: true, data: folder });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // DELETE /api/folders/:id
  async remove(req, res) {
    try {
      await folderService.deleteFolder(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // POST /api/folders/add
  // body: { testRunId, folderId }
  async addTest(req, res) {
    try {
      const { testRunId, folderId } = req.body;
      if (!testRunId || !folderId) {
        return res.status(400).json({ success: false, error: 'testRunId ve folderId zorunlu' });
      }
      const result = await folderService.addTestToFolder(testRunId, folderId);
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // POST /api/folders/remove
  // body: { testRunId, folderId }
  async removeTest(req, res) {
    try {
      const { testRunId, folderId } = req.body;
      if (!testRunId || !folderId) {
        return res.status(400).json({ success: false, error: 'testRunId ve folderId zorunlu' });
      }
      const result = await folderService.removeTestFromFolder(testRunId, folderId);
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // PUT /api/folders/set
  // body: { testRunId, folderIds: int[] }
  async setTestFolders(req, res) {
    try {
      const { testRunId, folderIds } = req.body;
      if (!testRunId) {
        return res.status(400).json({ success: false, error: 'testRunId zorunlu' });
      }
      const result = await folderService.setTestFolders(testRunId, folderIds);
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
}

module.exports = new FolderController();