/**
 * Offline-First Database Service
 * Uses Dexie.js for robust local storage with sync capabilities
 */
import { db } from './dexieDB.js';

// Store names mapping for backwards compatibility
const STORES = {
  TRIALS: 'trials',
  PROJECTS: 'projects',
  FORMULATIONS: 'formulations',
  INGREDIENTS: 'ingredients',
  SYNC_QUEUE: 'syncQueue',
  CONFLICTS: 'conflicts'
};

/**
 * Initialize Dexie IndexedDB
 */
export async function initOfflineDB() {
  if (!db.isOpen()) {
    await db.open();
  }
  return db;
}

/**
 * Get all items from a store
 */
export async function getAllFromStore(storeName) {
  await initOfflineDB();
  const table = db[storeName];
  if (!table) throw new Error(`Table ${storeName} does not exist on Dexie db.`);
  return await table.toArray();
}

/**
 * Get single item from store
 */
export async function getFromStore(storeName, id) {
  await initOfflineDB();
  const table = db[storeName];
  if (!table) throw new Error(`Table ${storeName} does not exist on Dexie db.`);
  return await table.get(String(id));
}

/**
 * Save item to store
 */
export async function saveToStore(storeName, item) {
  await initOfflineDB();
  const table = db[storeName];
  if (!table) throw new Error(`Table ${storeName} does not exist on Dexie db.`);
  
  const keyPath = table.schema.primKey.name; // ID or id
  const normalizedKey = keyPath === 'ID' 
    ? (item.ID !== undefined ? String(item.ID) : undefined)
    : (item.id !== undefined ? String(item.id) : undefined);

  const itemWithTimestamp = {
    ...item,
    [keyPath]: normalizedKey || item[keyPath],
    LastModified: new Date().toISOString()
  };
  
  await table.put(itemWithTimestamp);
  return itemWithTimestamp;
}

/**
 * Delete item from store
 */
export async function deleteFromStore(storeName, id) {
  await initOfflineDB();
  const table = db[storeName];
  if (!table) throw new Error(`Table ${storeName} does not exist on Dexie db.`);
  await table.delete(String(id));
}

/**
 * Add operation to sync queue
 */
export async function queueForSync(entityType, entityId, operation, data = null) {
  await initOfflineDB();
  
  const syncItem = {
    entityType,
    entityId: String(entityId),
    operation, // 'create', 'update', 'delete'
    data,
    timestamp: new Date().toISOString(),
    status: 'pending',
    retryCount: 0
  };
  
  const id = await db.syncQueue.add(syncItem);
  
  // Register service worker background sync if available
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.sync.register('background-sync-trials');
      console.log('[BackgroundSync] Registered background-sync-trials tag');
    } catch (err) {
      console.warn('[BackgroundSync] SW registration failed, falling back to app sync loop:', err);
    }
  }

  return id;
}

/**
 * Get pending sync items
 */
export async function getPendingSyncItems() {
  await initOfflineDB();
  return await db.syncQueue.where('status').equals('pending').toArray();
}

/**
 * Update sync item status
 */
export async function updateSyncStatus(id, status, error = null) {
  await initOfflineDB();
  
  await db.transaction('readwrite', db.syncQueue, async () => {
    const item = await db.syncQueue.get(Number(id));
    if (item) {
      item.status = status;
      item.lastAttempt = new Date().toISOString();
      if (error) item.lastError = error;
      if (status === 'failed') item.retryCount = (item.retryCount || 0) + 1;
      
      await db.syncQueue.put(item);
    }
  });
}

/**
 * Remove synced item from queue
 */
export async function removeFromSyncQueue(id) {
  await initOfflineDB();
  await db.syncQueue.delete(Number(id));
}

/**
 * Create conflict record
 */
export async function createConflict(entityType, entityId, localData, serverData) {
  await initOfflineDB();
  
  const conflict = {
    entityType,
    entityId: String(entityId),
    localData,
    serverData,
    detectedAt: new Date().toISOString(),
    resolved: 0,
    resolution: null
  };
  
  return await db.conflicts.add(conflict);
}

/**
 * Get unresolved conflicts
 */
export async function getUnresolvedConflicts() {
  await initOfflineDB();
  return await db.conflicts.where('resolved').equals(0).toArray();
}

/**
 * Resolve conflict
 */
export async function resolveConflict(id, resolution, mergedData = null) {
  await initOfflineDB();
  
  await db.transaction('readwrite', db.conflicts, async () => {
    const conflict = await db.conflicts.get(Number(id));
    if (conflict) {
      conflict.resolved = 1;
      conflict.resolution = resolution; // 'local', 'server', 'merge'
      conflict.resolvedAt = new Date().toISOString();
      conflict.mergedData = mergedData;
      await db.conflicts.put(conflict);
    }
  });
}

/**
 * Bulk save data (for initial sync)
 */
export async function bulkSaveToStore(storeName, items) {
  await initOfflineDB();
  const table = db[storeName];
  if (!table) throw new Error(`Table ${storeName} does not exist on Dexie db.`);

  const keyPath = table.schema.primKey.name; // ID or id
  
  const normalizedItems = items.map(item => {
    const normalizedKey = keyPath === 'ID' 
      ? (item.ID !== undefined ? String(item.ID) : undefined)
      : (item.id !== undefined ? String(item.id) : undefined);
      
    return {
      ...item,
      [keyPath]: normalizedKey || item[keyPath],
      LastModified: new Date().toISOString()
    };
  });
  
  await table.bulkPut(normalizedItems);
  return { success: items.length, errors: [] };
}

/**
 * Clear all stores (for logout/data reset)
 */
export async function clearAllStores() {
  await initOfflineDB();
  const tables = [db.trials, db.projects, db.formulations, db.ingredients, db.organisations, db.blocks, db.syncQueue, db.conflicts, db.trialPhotos];
  await Promise.all(tables.map(table => table.clear()));
}

/**
 * Get database stats
 */
export async function getDBStats() {
  await initOfflineDB();
  
  const stats = {
    TRIALS: await db.trials.count(),
    PROJECTS: await db.projects.count(),
    FORMULATIONS: await db.formulations.count(),
    INGREDIENTS: await db.ingredients.count(),
    SYNC_QUEUE: await db.syncQueue.count(),
    CONFLICTS: await db.conflicts.count()
  };
  
  return stats;
}

// Window exports
if (typeof window !== 'undefined') {
  window.initOfflineDB = initOfflineDB;
  window.getAllFromStore = getAllFromStore;
  window.saveToStore = saveToStore;
  window.queueForSync = queueForSync;
  window.getPendingSyncItems = getPendingSyncItems;
  window.getUnresolvedConflicts = getUnresolvedConflicts;
  window.getDBStats = getDBStats;
}

export default {
  STORES,
  initOfflineDB,
  getAllFromStore,
  getFromStore,
  saveToStore,
  deleteFromStore,
  queueForSync,
  getPendingSyncItems,
  updateSyncStatus,
  removeFromSyncQueue,
  createConflict,
  getUnresolvedConflicts,
  resolveConflict,
  bulkSaveToStore,
  clearAllStores,
  getDBStats
};
