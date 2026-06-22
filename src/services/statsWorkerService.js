/**
 * Stats Worker Service
 * Manages communication with the stats Web Worker
 */

let worker = null;
let messageId = 0;
const pendingCallbacks = new Map();
let isReady = false;
let readyPromise = null;
let resolveReady = null;

/**
 * Initialize the worker
 */
function initWorker() {
  if (worker) return readyPromise;
  
  readyPromise = new Promise((resolve) => {
    resolveReady = resolve;
  });
  
  try {
    worker = new Worker(
      new URL('../workers/statsWorker.js', import.meta.url),
      { type: 'module' }
    );
    
    worker.onmessage = (e) => {
      const { type, id, result, progress, error } = e.data;
      
      switch (type) {
        case 'READY':
          isReady = true;
          console.log('[StatsWorker] Ready');
          if (resolveReady) resolveReady();
          break;
          
        case 'PROGRESS':
          const progressCallback = pendingCallbacks.get(`progress_${id}`);
          if (progressCallback) {
            progressCallback(progress);
          }
          break;
          
        case 'RESULT':
          const successCallback = pendingCallbacks.get(id);
          if (successCallback) {
            successCallback(null, result);
            pendingCallbacks.delete(id);
          }
          break;
          
        case 'ERROR':
          const errorCallback = pendingCallbacks.get(id);
          if (errorCallback) {
            errorCallback(error);
            pendingCallbacks.delete(id);
          }
          break;
      }
    };
    
    worker.onerror = (e) => {
      console.error('[StatsWorker] Error:', e);
      isReady = false;
    };
    
  } catch (e) {
    console.error('[StatsWorker] Failed to initialize:', e);
    readyPromise = Promise.reject(e);
  }
  
  return readyPromise;
}

/**
 * Ensure worker is ready
 */
async function ensureReady() {
  if (!worker) {
    initWorker();
  }
  await readyPromise;
}

/**
 * Run ANOVA in the worker
 */
export async function runAnovaInWorker(data, metricKey, onProgress = null) {
  await ensureReady();
  
  const id = ++messageId;
  
  if (onProgress) {
    pendingCallbacks.set(`progress_${id}`, onProgress);
  }
  
  return new Promise((resolve, reject) => {
    pendingCallbacks.set(id, (error, result) => {
      if (error) {
        reject(new Error(error.message));
      } else {
        resolve(result);
      }
    });
    
    worker.postMessage({
      type: 'ANOVA',
      id,
      payload: { data, metricKey }
    });
  });
}

/**
 * Run batch ANOVA calculations
 */
export async function runBatchAnovaInWorker(datasets, onProgress = null) {
  await ensureReady();
  
  const id = ++messageId;
  
  if (onProgress) {
    pendingCallbacks.set(`progress_${id}`, onProgress);
  }
  
  return new Promise((resolve, reject) => {
    pendingCallbacks.set(id, (error, result) => {
      if (error) {
        reject(new Error(error.message));
      } else {
        resolve(result);
      }
    });
    
    worker.postMessage({
      type: 'BATCH_ANOVA',
      id,
      payload: { datasets }
    });
  });
}

/**
 * Run Tukey HSD test in the worker
 */
export async function runTukeyHSDInWorker(data, metricKey, onProgress = null) {
  await ensureReady();
  
  const id = ++messageId;
  
  if (onProgress) {
    pendingCallbacks.set(`progress_${id}`, onProgress);
  }
  
  return new Promise((resolve, reject) => {
    pendingCallbacks.set(id, (error, result) => {
      if (error) {
        reject(new Error(error.message));
      } else {
        resolve(result);
      }
    });
    
    worker.postMessage({
      type: 'TUKEY_HSD',
      id,
      payload: { data, metricKey }
    });
  });
}

/**
 * Terminate the worker
 */
export function terminateWorker() {
  if (worker) {
    worker.terminate();
    worker = null;
    isReady = false;
    readyPromise = null;
    pendingCallbacks.clear();
  }
}

/**
 * Check if worker is available
 */
export function isWorkerReady() {
  return isReady;
}

/**
 * Get worker status
 */
export function getWorkerStatus() {
  return {
    isReady,
    pendingCallbacks: pendingCallbacks.size
  };
}

// Auto-initialize on module load
if (typeof window !== 'undefined') {
  // Defer initialization
  setTimeout(() => {
    initWorker().catch(e => console.warn('[StatsWorker] Auto-init failed:', e));
  }, 1000);
}