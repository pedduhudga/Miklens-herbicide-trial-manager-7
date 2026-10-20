/**
 * Sync Manager
 * Handles online/offline detection, sync operations, and conflict resolution
 */

import { 
  queueForSync, 
  getPendingSyncItems, 
  updateSyncStatus, 
  removeFromSyncQueue,
  createConflict,
  getUnresolvedConflicts,
  resolveConflict,
  saveToStore,
  getFromStore
} from './offlineDB.js';

// Sync status
export const SYNC_STATUS = {
  ONLINE: 'online',
  OFFLINE: 'offline',
  SYNCING: 'syncing',
  SYNCED: 'synced',
  ERROR: 'error',
  CONFLICTS: 'conflicts'
};

// Event listeners
const listeners = new Set();

let currentStatus = SYNC_STATUS.ONLINE;
let isInitialized = false;

/**
 * Subscribe to sync status changes
 */
export function onSyncStatusChange(callback) {
  listeners.add(callback);
  
  // Return unsubscribe function
  return () => listeners.delete(callback);
}

/**
 * Notify all listeners of status change
 */
function notifyStatusChange(status, details = null) {
  currentStatus = status;
  listeners.forEach(cb => {
    try {
      cb(status, details);
    } catch (err) {
      console.error('Sync status listener error:', err);
    }
  });
}

/**
 * Get current sync status
 */
export function getSyncStatus() {
  return currentStatus;
}

/**
 * Check if online
 */
export function isOnline() {
  return navigator.onLine;
}

/**
 * Initialize sync manager
 */
export function initSyncManager() {
  if (isInitialized) return;
  
  // Listen for online/offline events
  window.addEventListener('online', () => {
    notifyStatusChange(SYNC_STATUS.ONLINE);
    // Try to sync when back online
    processSyncQueue();
  });
  
  window.addEventListener('offline', () => {
    notifyStatusChange(SYNC_STATUS.OFFLINE);
  });
  
  // Check for conflicts on init
  checkForConflicts();
  
  // Try to sync on init if online
  if (isOnline()) {
    processSyncQueue();
  }
  
  isInitialized = true;
}

/**
 * Check for unresolved conflicts
 */
export async function checkForConflicts() {
  const conflicts = await getUnresolvedConflicts();
  if (conflicts.length > 0) {
    notifyStatusChange(SYNC_STATUS.CONFLICTS, { conflictCount: conflicts.length });
  }
  return conflicts;
}

/**
 * Resolve a conflict with chosen strategy
 */
export async function resolveConflictWithStrategy(conflictId, strategy, mergedData = null) {
  const conflicts = await getUnresolvedConflicts();
  const conflict = conflicts.find(c => c.id === conflictId);
  
  if (!conflict) throw new Error('Conflict not found');
  
  let resolvedData;
  
  switch (strategy) {
    case 'local':
      resolvedData = conflict.localData;
      await saveToStore(conflict.entityType, resolvedData);
      await queueForSync(conflict.entityType, conflict.entityId, 'update', resolvedData);
      break;
      
    case 'server':
      resolvedData = conflict.serverData;
      await saveToStore(conflict.entityType, resolvedData);
      break;
      
    case 'merge':
      if (!mergedData) throw new Error('Merged data required for merge strategy');
      resolvedData = mergedData;
      await saveToStore(conflict.entityType, resolvedData);
      await queueForSync(conflict.entityType, conflict.entityId, 'update', resolvedData);
      break;
      
    default:
      throw new Error('Invalid resolution strategy');
  }
  
  await resolveConflict(conflictId, strategy, resolvedData);
  
  // Re-check conflicts
  const remaining = await getUnresolvedConflicts();
  if (remaining.length === 0) {
    notifyStatusChange(isOnline() ? SYNC_STATUS.ONLINE : SYNC_STATUS.OFFLINE);
  }
  
  return resolvedData;
}

function normalizeJsonArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && Array.isArray(parsed.observations)) return parsed.observations;
      if (parsed && Array.isArray(parsed.photos)) return parsed.photos;
      return [];
    } catch {
      return [];
    }
  }
  if (typeof val === 'object') {
    if (Array.isArray(val.observations)) return val.observations;
    if (Array.isArray(val.photos)) return val.photos;
  }
  return [];
}

function mergeObservations(localObs, serverObs, preferLocal = true) {
  const normLocal = normalizeJsonArray(localObs);
  const normServer = normalizeJsonArray(serverObs);
  if (normLocal.length === 0) return normServer;
  if (normServer.length === 0) return normLocal;

  const obsMap = new Map();
  const getKey = (o) => String(o.id || o.ID || (o.daa !== undefined ? `daa-${o.daa}` : null) || (o.daysAfterApplication !== undefined ? `daa-${o.daysAfterApplication}` : null) || o.date || Math.random());

  // First insert server observations
  normServer.forEach(o => {
    obsMap.set(getKey(o), { ...o });
  });

  // Then merge local observations
  normLocal.forEach(o => {
    const key = getKey(o);
    if (obsMap.has(key)) {
      const existing = obsMap.get(key);
      const primary = preferLocal ? o : existing;
      const secondary = preferLocal ? existing : o;
      // Merge properties so photos, notes, metrics aren't lost
      obsMap.set(key, { ...secondary, ...primary });
    } else {
      obsMap.set(key, { ...o });
    }
  });

  return Array.from(obsMap.values()).sort((a, b) => {
    const daaA = parseFloat(a.daa ?? a.daysAfterApplication ?? 0);
    const daaB = parseFloat(b.daa ?? b.daysAfterApplication ?? 0);
    if (!isNaN(daaA) && !isNaN(daaB) && daaA !== daaB) return daaA - daaB;
    return new Date(a.date || 0) - new Date(b.date || 0);
  });
}

function mergePhotos(localPhotos, serverPhotos) {
  const normLocal = normalizeJsonArray(localPhotos);
  const normServer = normalizeJsonArray(serverPhotos);
  if (normLocal.length === 0) return normServer;
  if (normServer.length === 0) return normLocal;

  const photoMap = new Map();
  const getPhotoKey = (p) => String(p.id || p.ID || p.url || p.photoUrl || p.fileName || p.date || Math.random());

  normServer.forEach(p => photoMap.set(getPhotoKey(p), p));
  normLocal.forEach(p => photoMap.set(getPhotoKey(p), p));

  return Array.from(photoMap.values());
}

/**
 * Auto-merge conflict data
 */
export function autoMergeConflict(localData, serverData) {
  if (!localData && !serverData) return null;
  if (!localData) return { ...serverData };
  if (!serverData) return { ...localData };

  const localTime = new Date(localData.LastModified || localData.UpdatedAt || 0).getTime();
  const serverTime = new Date(serverData.LastModified || serverData.UpdatedAt || 0).getTime();
  const isServerNewer = serverTime >= localTime;

  // Base is the newer version, merged with non-conflicting fields from the other
  const base = isServerNewer ? serverData : localData;
  const secondary = isServerNewer ? localData : serverData;
  const merged = { ...base };

  // Preserve non-empty fields from secondary that are missing or null in base
  Object.keys(secondary).forEach(key => {
    if ((merged[key] === undefined || merged[key] === null || merged[key] === '') &&
        secondary[key] !== undefined && secondary[key] !== null) {
      merged[key] = secondary[key];
    }
  });

  // 1. Intelligently merge Efficacy observation timeline
  if (localData.EfficacyDataJSON || serverData.EfficacyDataJSON) {
    try {
      const mergedObservations = mergeObservations(
        localData.EfficacyDataJSON, 
        serverData.EfficacyDataJSON, 
        !isServerNewer // prefer local if local is newer
      );
      merged.EfficacyDataJSON = JSON.stringify(mergedObservations);
    } catch (err) {
      console.warn('[SyncManager] Failed to merge efficacy observations:', err);
    }
  }

  // 2. Intelligently merge photo gallery without dropping captures
  if (localData.PhotosJSON || serverData.PhotosJSON) {
    try {
      const mergedPhotos = mergePhotos(localData.PhotosJSON, serverData.PhotosJSON);
      merged.PhotosJSON = JSON.stringify(mergedPhotos);
    } catch (err) {
      console.warn('[SyncManager] Failed to merge photos:', err);
    }
  }

  merged.LastModified = new Date().toISOString();
  return merged;
}

/**
 * Process sync queue
 */
export async function processSyncQueue() {
  if (!isOnline()) {
    notifyStatusChange(SYNC_STATUS.OFFLINE);
    return { processed: 0, failed: 0 };
  }
  
  notifyStatusChange(SYNC_STATUS.SYNCING);
  
  const pending = await getPendingSyncItems();
  
  if (pending.length === 0) {
    notifyStatusChange(SYNC_STATUS.SYNCED);
    return { processed: 0, failed: 0 };
  }
  
  let processed = 0;
  let failed = 0;
  const conflicts = [];
  
  for (const item of pending) {
    // Skip items that have been retried too many times
    if (item.retryCount >= 5) {
      await updateSyncStatus(item.id, 'failed', 'Max retries exceeded');
      failed++;
      continue;
    }
    
    try {
      // Simulate API call (replace with actual API)
      const result = await syncToServer(item);
      
      if (result.success) {
        await removeFromSyncQueue(item.id);
        processed++;
      } else if (result.conflict) {
        // Conflict detected
        await createConflict(
          item.entityType,
          item.entityId,
          item.data,
          result.serverData
        );
        await updateSyncStatus(item.id, 'conflict', 'Data conflict with server');
        conflicts.push({ item, serverData: result.serverData });
      } else {
        await updateSyncStatus(item.id, 'failed', result.error);
        failed++;
      }
    } catch (err) {
      await updateSyncStatus(item.id, 'failed', err.message);
      failed++;
    }
  }
  
  if (conflicts.length > 0) {
    notifyStatusChange(SYNC_STATUS.CONFLICTS, { 
      conflictCount: conflicts.length,
      processed,
      failed 
    });
  } else if (failed > 0) {
    notifyStatusChange(SYNC_STATUS.ERROR, { processed, failed });
  } else {
    notifyStatusChange(SYNC_STATUS.SYNCED, { processed });
  }
  
  return { processed, failed, conflicts: conflicts.length };
}

/**
 * Server sync implementation for queued offline operations
 */
async function syncToServer(syncItem) {
  if (!syncItem) return { success: false, error: 'No sync item provided' };
  const { entityType, entityId, operation, data } = syncItem;
  
  try {
    const fbDB = await import('./firebaseDB.js');
    const entity = (entityType || '').toLowerCase();
    const op = (operation || '').toLowerCase();
    const category = String(data?.Category || 'herbicide').toLowerCase().trim();
    const userId = data?.CreatedBy || data?.UpdatedBy || null;

    if (entity.includes('trial')) {
      if (op.includes('add') || op.includes('create')) {
        await fbDB.fbCatAddTrial(category, data, userId);
      } else if (op.includes('delete') || op.includes('remove')) {
        await fbDB.fbCatDeleteTrial(category, entityId);
      } else {
        await fbDB.fbCatUpdateTrial(category, { ID: entityId, ...(data || {}) });
      }
    } else if (entity.includes('project')) {
      if (op.includes('add') || op.includes('create')) {
        await fbDB.fbCatAddProject(category, data, userId);
      } else if (op.includes('delete') || op.includes('remove')) {
        await fbDB.fbCatDeleteProject(category, entityId);
      } else {
        await fbDB.fbCatUpdateProject(category, { ID: entityId, ...(data || {}) });
      }
    } else if (entity.includes('formulation')) {
      if (op.includes('add') || op.includes('create')) {
        await fbDB.fbCatAddFormulation(category, data, userId);
      } else if (op.includes('delete') || op.includes('remove')) {
        await fbDB.fbCatDeleteFormulation(category, entityId);
      } else {
        await fbDB.fbCatUpdateFormulation(category, { ID: entityId, ...(data || {}) });
      }
    } else if (entity.includes('ingredient')) {
      if (op.includes('add') || op.includes('create')) {
        await fbDB.fbCatAddIngredient(category, data, userId);
      } else if (op.includes('delete') || op.includes('remove')) {
        await fbDB.fbCatDeleteIngredient(category, entityId);
      } else {
        await fbDB.fbCatUpdateIngredient(category, { ID: entityId, ...(data || {}) });
      }
    }

    return { success: true };
  } catch (err) {
    console.warn('[SyncManager] Sync failed:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Queue an operation for sync
 */
export async function queueOperation(entityType, entityId, operation, data) {
  if (!isOnline()) {
    // Queue for later sync
    await queueForSync(entityType, entityId, operation, data);
    notifyStatusChange(SYNC_STATUS.OFFLINE, { pendingCount: 1 });
    return { queued: true, synced: false };
  }
  
  // Online - try immediate sync
  try {
    const result = await syncToServer({
      entityType,
      entityId,
      operation,
      data
    });
    
    if (result.success) {
      return { queued: false, synced: true };
    } else if (result.conflict) {
      await createConflict(entityType, entityId, data, result.serverData);
      notifyStatusChange(SYNC_STATUS.CONFLICTS, { conflictCount: 1 });
      return { queued: false, synced: false, conflict: true };
    } else {
      // Failed, queue for retry
      await queueForSync(entityType, entityId, operation, data);
      return { queued: true, synced: false, error: result.error };
    }
  } catch (err) {
    // Error, queue for retry
    await queueForSync(entityType, entityId, operation, data);
    return { queued: true, synced: false, error: err.message };
  }
}

/**
 * Force sync now
 */
export async function forceSync() {
  return processSyncQueue();
}

/**
 * Get sync stats
 */
export async function getSyncStats() {
  const pending = await getPendingSyncItems();
  const conflicts = await getUnresolvedConflicts();
  
  return {
    status: currentStatus,
    isOnline: isOnline(),
    pendingCount: pending.length,
    conflictCount: conflicts.length,
    lastSync: pending.length > 0 
      ? Math.min(...pending.map(p => new Date(p.timestamp).getTime()))
      : null
  };
}

/**
 * Clear all pending sync items (use with caution)
 */
export async function clearSyncQueue() {
  const pending = await getPendingSyncItems();
  for (const item of pending) {
    await removeFromSyncQueue(item.id);
  }
  notifyStatusChange(isOnline() ? SYNC_STATUS.ONLINE : SYNC_STATUS.OFFLINE);
}

// Window exports
if (typeof window !== 'undefined') {
  window.initSyncManager = initSyncManager;
  window.getSyncStatus = getSyncStatus;
  window.isOnline = isOnline;
  window.processSyncQueue = processSyncQueue;
  window.forceSync = forceSync;
  window.getSyncStats = getSyncStats;
  window.checkForConflicts = checkForConflicts;
  window.resolveConflictWithStrategy = resolveConflictWithStrategy;
  window.autoMergeConflict = autoMergeConflict;
  window.onSyncStatusChange = onSyncStatusChange;
}

export default {
  SYNC_STATUS,
  initSyncManager,
  getSyncStatus,
  isOnline,
  processSyncQueue,
  forceSync,
  getSyncStats,
  queueOperation,
  checkForConflicts,
  resolveConflictWithStrategy,
  autoMergeConflict,
  clearSyncQueue,
  onSyncStatusChange
};
