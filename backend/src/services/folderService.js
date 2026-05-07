// src/services/folderService.js
const prisma = require('../config/database');

class FolderService {

  /**
   * Tüm klasörleri test sayısı ile birlikte getir
   */
  async getAllFolders() {
    const folders = await prisma.folder.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        _count: { select: { testRunLinks: true } }
      }
    });

    // Hiçbir klasöre eklenmemiş test sayısı
    // (en az bir folder linki olmayan testRun'lar)
    const totalCount = await prisma.testRun.count();
    const linkedCount = await prisma.testRun.count({
      where: { folderLinks: { some: {} } }
    });
    const unfiledCount = totalCount - linkedCount;

    return {
      folders: folders.map(f => ({
        ...f,
        _count: { testRuns: f._count.testRunLinks }
      })),
      unfiledCount,
      totalCount
    };
  }

  async createFolder(data) {
    if (!data.name || !data.name.trim()) {
      throw new Error('Klasör adı boş olamaz');
    }
    return await prisma.folder.create({
      data: {
        name: data.name.trim(),
        color: data.color || '#3b82f6',
        icon: data.icon || null
      }
    });
  }

  async updateFolder(id, data) {
    return await prisma.folder.update({
      where: { id: parseInt(id) },
      data: {
        ...(data.name && { name: data.name.trim() }),
        ...(data.color && { color: data.color }),
        ...(data.icon !== undefined && { icon: data.icon })
      }
    });
  }

  async deleteFolder(id) {
    // TestRunFolder cascade ile silinir
    return await prisma.folder.delete({
      where: { id: parseInt(id) }
    });
  }

  /**
   * YENİ: Bir testi bir klasöre EKLE (kopyala)
   * Test zaten o klasördeyse hiçbir şey yapmaz
   */
  async addTestToFolder(testRunId, folderId) {
    const tId = parseInt(testRunId);
    const fId = parseInt(folderId);

    // Zaten ekli mi kontrol et
    const existing = await prisma.testRunFolder.findUnique({
      where: { testRunId_folderId: { testRunId: tId, folderId: fId } }
    });

    if (existing) {
      return { alreadyExists: true, link: existing };
    }

    const link = await prisma.testRunFolder.create({
      data: { testRunId: tId, folderId: fId }
    });

    return { alreadyExists: false, link };
  }

  /**
   * YENİ: Bir testi bir klasörden ÇIKAR
   */
  async removeTestFromFolder(testRunId, folderId) {
    const tId = parseInt(testRunId);
    const fId = parseInt(folderId);

    try {
      await prisma.testRunFolder.delete({
        where: { testRunId_folderId: { testRunId: tId, folderId: fId } }
      });
      return { removed: true };
    } catch (err) {
      // Zaten yok
      return { removed: false };
    }
  }

  /**
   * YENİ: Bir testin klasörlerini topluca güncelle (replace)
   * folderIds: int[] — bu liste yeni durumdur, fark hesaplanır
   */
  async setTestFolders(testRunId, folderIds) {
    const tId = parseInt(testRunId);
    const newFolderIds = (folderIds || []).map(Number).filter(n => !isNaN(n));

    // Mevcut klasörleri al
    const existing = await prisma.testRunFolder.findMany({
      where: { testRunId: tId },
      select: { folderId: true }
    });
    const existingIds = existing.map(e => e.folderId);

    // Eklenecekler ve silinecekler
    const toAdd = newFolderIds.filter(id => !existingIds.includes(id));
    const toRemove = existingIds.filter(id => !newFolderIds.includes(id));

    // Sırayla uygula
    if (toRemove.length > 0) {
      await prisma.testRunFolder.deleteMany({
        where: {
          testRunId: tId,
          folderId: { in: toRemove }
        }
      });
    }

    if (toAdd.length > 0) {
      await prisma.testRunFolder.createMany({
        data: toAdd.map(fId => ({ testRunId: tId, folderId: fId })),
        skipDuplicates: true
      });
    }

    return { added: toAdd.length, removed: toRemove.length };
  }
}

module.exports = new FolderService();