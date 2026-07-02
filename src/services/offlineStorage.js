// src/services/offlineStorage.js
// Dexie IndexedDB storage wrapper for offline data caching.

import { db } from './dexieDB.js';
import { 
  getIndexedDBUsage, 
  getIndexedDBUsagePercent, 
  checkIndexedDBRisk,
  cleanupOldPhotos as quotaCleanupOldPhotos,
  cleanupCompletedSyncItems as quotaCleanupCompletedSyncItems,
  getStorageStats
} from './storageQuotaManager.js';

const STORES = ['trials', 'projects', 'formulations', 'ingredients', 'blocks', 'syncQueue', 'trialPhotos'];

async function initOfflineDB() {
  if (!db.isOpen()) {
    await db.open();
  }
  return db;
}

export async function saveOfflinePhoto(id, base64Data) {
  try {
    await initOfflineDB();
    await db.trialPhotos.put({ ID: String(id), dataUrl: base64Data });
    return true;
  } catch (err) {
    console.error(`Failed to save offline photo ${id}:`, err);
    return false;
  }
}

export async function loadOfflinePhoto(id) {
  try {
    await initOfflineDB();
    const result = await db.trialPhotos.get(String(id));
    return result?.dataUrl || null;
  } catch (err) {
    console.error(`Failed to load offline photo ${id}:`, err);
    return null;
  }
}

export async function saveOfflineData(storeName, data) {
  if (!STORES.includes(storeName)) return;
  try {
    await initOfflineDB();
    const table = db[storeName];
    if (!table) return;

    // Clear existing data in the store
    await table.clear();

    // Add new data
    const items = Array.isArray(data) ? data : [data];
    const normalizedItems = [];
    items.forEach(item => {
      if (item && (item.ID !== undefined || item.id !== undefined)) {
        // Enforce ID as keyPath
        const key = item.ID !== undefined ? item.ID : item.id;
        normalizedItems.push({ ...item, ID: String(key) });
      }
    });

    if (normalizedItems.length > 0) {
      await table.bulkPut(normalizedItems);
    }
    return true;
  } catch (err) {
    console.error(`Failed to save offline data for store ${storeName}:`, err);
    return false;
  }
}

export async function loadOfflineData(storeName) {
  if (!STORES.includes(storeName)) return [];
  try {
    await initOfflineDB();
    const table = db[storeName];
    if (!table) return [];
    
    const results = await table.toArray();
    
    // Fix #20: Filter trials by activeCategory to prevent cross-contamination
    if (storeName === 'trials' && typeof window !== 'undefined') {
      const activeCategory = localStorage.getItem('activeCategory') || 'herbicide';
      return results.filter(t => (t.Category || 'herbicide') === activeCategory);
    }
    
    return results;
  } catch (err) {
    console.error(`Failed to load offline data for store ${storeName}:`, err);
    return [];
  }
}

export async function clearOfflineCache() {
  try {
    await initOfflineDB();
    const tables = [db.trials, db.projects, db.formulations, db.ingredients, db.blocks, db.syncQueue, db.trialPhotos];
    await Promise.all(tables.map(table => table.clear()));
    return true;
  } catch (err) {
    console.error('Failed to clear offline cache:', err);
    return false;
  }
}

function dataURLtoBlob(dataurl) {
  const arr = dataurl.split(',');
  const mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while(n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

export async function saveSyncQueueOffline(queue) {
  try {
    await initOfflineDB();
    await db.syncQueue.clear();
    const normalizedQueue = queue.map(item => {
      const id = String(item.id || item.ID);
      const itemCopy = { ...item, ID: id };
      if (itemCopy.photo && typeof itemCopy.photo.fileData === 'string' && itemCopy.photo.fileData.startsWith('data:')) {
        itemCopy.photo.fileData = dataURLtoBlob(itemCopy.photo.fileData);
      }
      return itemCopy;
    });

    if (normalizedQueue.length > 0) {
      await db.syncQueue.bulkPut(normalizedQueue);
    }
    return true;
  } catch (err) {
    console.error('Failed to save sync queue offline:', err);
    return false;
  }
}

export async function loadSyncQueueOffline() {
  try {
    await initOfflineDB();
    const results = await db.syncQueue.toArray();
    const queue = await Promise.all(results.map(async item => {
      if (item.photo && item.photo.fileData instanceof Blob) {
        const base64 = await new Promise((res, rej) => {
          const reader = new FileReader();
          reader.onloadend = () => res(reader.result);
          reader.onerror = rej;
          reader.readAsDataURL(item.photo.fileData);
        });
        item.photo.fileData = base64;
      }
      return item;
    }));
    return queue;
  } catch (err) {
    console.error('Failed to load sync queue offline:', err);
    return [];
  }
}

/**
 * Cleanup old photos from IndexedDB
 * @param {number} olderThanDays - Remove photos older than N days (default 90)
 * @returns {Promise<number>} Number of photos removed
 */
export async function cleanupOldPhotos(olderThanDays = 90) {
  return quotaCleanupOldPhotos(olderThanDays);
}

/**
 * Cleanup completed sync items older than N days
 * @param {number} olderThanDays - Remove items older than N days (default 30)
 * @returns {Promise<number>} Number of items removed
 */
export async function cleanupCompletedSyncItems(olderThanDays = 30) {
  return quotaCleanupCompletedSyncItems(olderThanDays);
}

/**
 * Run automatic cleanup when storage is at risk
 * @returns {Promise<boolean>} True if cleanup was performed
 */
export async function runAutomaticCleanup() {
  try {
    const isAtRisk = await checkIndexedDBRisk();
    
    if (isAtRisk) {
      console.log('[OfflineStorage] Storage at risk, running cleanup...');
      
      // Clean up old photos (90+ days)
      const photosRemoved = await cleanupOldPhotos(90);
      
      // Clean up old sync items (30+ days)
      const syncRemoved = await cleanupCompletedSyncItems(30);
      
      console.log(`[OfflineStorage] Cleanup complete: ${photosRemoved} photos, ${syncRemoved} sync items removed`);
      
      return true;
    }
    
    return false;
  } catch (err) {
    console.error('[OfflineStorage] Automatic cleanup failed:', err);
    return false;
  }
}

/**
 * Get storage statistics
 * @returns {Promise<Object>} Storage stats
 */
export async function getOfflineStorageStats() {
  return getStorageStats();
}

// Run automatic cleanup on module load (delayed)
if (typeof window !== 'undefined') {
  setTimeout(() => {
    runAutomaticCleanup().catch(console.error);
  }, 30000); // Run after 30 seconds
}