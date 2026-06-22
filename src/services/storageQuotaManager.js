/**
 * Storage quota management utilities
 * Monitors localStorage and IndexedDB usage, manages cleanup
 */

const LOCAL_STORAGE_QUOTA = 5 * 1024 * 1024; // ~5MB typical
const WARNING_THRESHOLD = 0.7; // 70%
const CRITICAL_THRESHOLD = 0.8; // 80%

/**
 * Estimate bytes used in localStorage
 * @returns {number} Estimated bytes used
 */
export function estimateLocalStorageUsed() {
  let total = 0;
  
  try {
    for (const key in localStorage) {
      if (localStorage.hasOwnProperty(key)) {
        const value = localStorage[key];
        total += key.length + value.length;
      }
    }
  } catch (e) {
    console.warn('[StorageQuota] Error estimating localStorage:', e);
  }
  
  return total;
}

/**
 * Get localStorage quota (estimate)
 * @returns {number} Quota in bytes
 */
export function getLocalStorageQuota() {
  return LOCAL_STORAGE_QUOTA;
}

/**
 * Check if storage is at risk
 * @returns {boolean} True if storage > 70% full
 */
export function checkQuotaRisk() {
  const used = estimateLocalStorageUsed();
  const quota = getLocalStorageQuota();
  return (used / quota) > WARNING_THRESHOLD;
}

/**
 * Get storage usage percentage
 * @returns {number} Usage percentage (0-100)
 */
export function getStorageUsagePercent() {
  const used = estimateLocalStorageUsed();
  const quota = getLocalStorageQuota();
  return Math.round((used / quota) * 100);
}

/**
 * Prune completed items from sync queue
 * @param {Array} queue - Sync queue array
 * @param {number} keepCount - Number of completed items to keep
 * @returns {Array} Pruned queue
 */
export function pruneSyncQueue(queue = [], keepCount = 10) {
  if (!Array.isArray(queue)) return [];
  
  const completed = queue.filter(item => item.status === 'completed');
  const pending = queue.filter(item => item.status === 'pending' || item.status === 'failed');
  const other = queue.filter(item => !['completed', 'pending', 'failed'].includes(item.status));
  
  // Keep only recent completed items
  const prunedCompleted = completed.slice(-keepCount);
  
  return [...pending, ...prunedCompleted, ...other];
}

/**
 * Prune localStorage when quota is at risk
 * @param {Array} syncQueue - Current sync queue
 * @returns {boolean} True if pruning was performed
 */
export async function pruneLocalStorageIfNeeded(syncQueue = []) {
  if (!checkQuotaRisk()) return false;
  
  try {
    // Prune sync queue
    const prunedQueue = pruneSyncQueue(syncQueue);
    
    // Try to save space by clearing non-essential localStorage items
    const nonEssential = [
      'lastSyncTimestamp',
      'uiPreferences',
      'recentSearches'
    ];
    
    nonEssential.forEach(key => {
      try {
        if (localStorage.getItem(key)) {
          localStorage.removeItem(key);
        }
      } catch (e) {
        // Ignore errors
      }
    });
    
    console.log('[StorageQuota] Pruned localStorage, usage now at', getStorageUsagePercent() + '%');
    return true;
  } catch (e) {
    console.error('[StorageQuota] Prune failed:', e);
    return false;
  }
}

/**
 * Get IndexedDB storage usage
 * @returns {Promise<{used: number, quota: number}>}
 */
export async function getIndexedDBUsage() {
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
    const estimate = await navigator.storage.estimate();
    return {
      used: estimate.usage || 0,
      quota: estimate.quota || 0
    };
  }
  return { used: 0, quota: 0 };
}

/**
 * Check if IndexedDB is at risk
 * @returns {Promise<boolean>}
 */
export async function checkIndexedDBRisk() {
  const { used, quota } = await getIndexedDBUsage();
  if (quota === 0) return false;
  return (used / quota) > WARNING_THRESHOLD;
}

/**
 * Get IndexedDB storage usage percentage
 * @returns {Promise<number>}
 */
export async function getIndexedDBUsagePercent() {
  const { used, quota } = await getIndexedDBUsage();
  if (quota === 0) return 0;
  return Math.round((used / quota) * 100);
}

/**
 * Clean up old photos from IndexedDB
 * @param {number} olderThanDays - Remove photos older than N days
 * @returns {Promise<number>} Number of photos removed
 */
export async function cleanupOldPhotos(olderThanDays = 90) {
  try {
    const db = await getDB();
    const transaction = db.transaction('trialPhotos', 'readwrite');
    const store = transaction.objectStore('trialPhotos');
    const request = store.getAll();
    
    return new Promise((resolve) => {
      request.onsuccess = async () => {
        const photos = request.result || [];
        const cutoffTime = Date.now() - (olderThanDays * 24 * 60 * 60 * 1000);
        
        let removedCount = 0;
        
        for (const photo of photos) {
          const photoTime = photo.timestamp || 0;
          if (photoTime < cutoffTime) {
            await new Promise((res) => {
              const delRequest = store.delete(photo.ID);
              delRequest.onsuccess = () => res();
              delRequest.onerror = () => res();
            });
            removedCount++;
          }
        }
        
        console.log(`[StorageQuota] Cleaned up ${removedCount} old photos`);
        resolve(removedCount);
      };
    });
  } catch (e) {
    console.error('[StorageQuota] Photo cleanup failed:', e);
    return 0;
  }
}

/**
 * Clean up completed sync items older than N days
 * @param {number} olderThanDays - Remove items older than N days
 * @returns {Promise<number>} Number of items removed
 */
export async function cleanupCompletedSyncItems(olderThanDays = 30) {
  try {
    const db = await getDB();
    const transaction = db.transaction('syncQueue', 'readwrite');
    const store = transaction.objectStore('syncQueue');
    const request = store.getAll();
    
    return new Promise((resolve) => {
      request.onsuccess = async () => {
        const items = request.result || [];
        const cutoffTime = Date.now() - (olderThanDays * 24 * 60 * 60 * 1000);
        
        let removedCount = 0;
        
        for (const item of items) {
          if (item.status === 'completed' && item.completedAt && item.completedAt < cutoffTime) {
            await new Promise((res) => {
              const delRequest = store.delete(item.ID);
              delRequest.onsuccess = () => res();
              delRequest.onerror = () => res();
            });
            removedCount++;
          }
        }
        
        console.log(`[StorageQuota] Cleaned up ${removedCount} old sync items`);
        resolve(removedCount);
      };
    });
  } catch (e) {
    console.error('[StorageQuota] Sync cleanup failed:', e);
    return 0;
  }
}

/**
 * Get storage usage statistics
 * @returns {Promise<Object>} Storage stats
 */
export async function getStorageStats() {
  const localStorageUsed = estimateLocalStorageUsed();
  const localStorageQuota = getLocalStorageQuota();
  const { used: indexedDBUsed, quota: indexedDBQuota } = await getIndexedDBUsage();
  
  return {
    localStorage: {
      used: localStorageUsed,
      quota: localStorageQuota,
      percent: Math.round((localStorageUsed / localStorageQuota) * 100),
      atRisk: (localStorageUsed / localStorageQuota) > WARNING_THRESHOLD
    },
    indexedDB: {
      used: indexedDBUsed,
      quota: indexedDBQuota,
      percent: indexedDBQuota > 0 ? Math.round((indexedDBUsed / indexedDBQuota) * 100) : 0,
      atRisk: indexedDBQuota > 0 && (indexedDBUsed / indexedDBQuota) > WARNING_THRESHOLD
    }
  };
}

/**
 * Emit warning event when quota is high
 */
export function emitQuotaWarning() {
  if (typeof window !== 'undefined') {
    const event = new CustomEvent('storageQuotaWarning', {
      detail: getStorageStats()
    });
    window.dispatchEvent(event);
  }
}

// Helper to get IndexedDB
function getDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('MiklensTrialManagerDB');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Check quota on module load and warn if needed
if (typeof window !== 'undefined') {
  setTimeout(() => {
    if (checkQuotaRisk()) {
      console.warn('[StorageQuota] Warning: localStorage usage is high');
      emitQuotaWarning();
    }
  }, 5000);
}