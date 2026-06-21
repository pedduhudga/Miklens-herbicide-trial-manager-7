// src/services/offlineStorage.js
// Native IndexedDB storage wrapper for offline data caching.

const DB_NAME = 'MiklensTrialManagerDB';
const DB_VERSION = 2;
const STORES = ['trials', 'projects', 'formulations', 'ingredients', 'blocks', 'syncQueue', 'trialPhotos'];

function getDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      STORES.forEach(storeName => {
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, { keyPath: 'ID' });
        }
      });
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

export async function saveOfflinePhoto(id, base64Data) {
  try {
    const db = await getDB();
    const transaction = db.transaction('trialPhotos', 'readwrite');
    const store = transaction.objectStore('trialPhotos');
    store.put({ ID: String(id), dataUrl: base64Data });
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => reject(transaction.error);
    });
  } catch (err) {
    console.error(`Failed to save offline photo ${id}:`, err);
  }
}

export async function loadOfflinePhoto(id) {
  try {
    const db = await getDB();
    const transaction = db.transaction('trialPhotos', 'readonly');
    const store = transaction.objectStore('trialPhotos');
    const request = store.get(String(id));
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result?.dataUrl || null);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error(`Failed to load offline photo ${id}:`, err);
    return null;
  }
}

export async function saveOfflineData(storeName, data) {
  if (!STORES.includes(storeName)) return;
  try {
    const db = await getDB();
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);

    // Clear existing data in the store
    store.clear();

    // Add new data
    const items = Array.isArray(data) ? data : [data];
    items.forEach(item => {
      if (item && (item.ID !== undefined || item.id !== undefined)) {
        // Enforce ID as keyPath
        const key = item.ID !== undefined ? item.ID : item.id;
        store.put({ ...item, ID: String(key) });
      }
    });

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => reject(transaction.error);
    });
  } catch (err) {
    console.error(`Failed to save offline data for store ${storeName}:`, err);
  }
}

export async function loadOfflineData(storeName) {
  if (!STORES.includes(storeName)) return [];
  try {
    const db = await getDB();
    const transaction = db.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.getAll();

    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error(`Failed to load offline data for store ${storeName}:`, err);
    return [];
  }
}

export async function clearOfflineCache() {
  try {
    const db = await getDB();
    const transaction = db.transaction(STORES, 'readwrite');
    STORES.forEach(storeName => {
      transaction.objectStore(storeName).clear();
    });
    return new Promise((resolve) => {
      transaction.oncomplete = () => resolve(true);
    });
  } catch (err) {
    console.error('Failed to clear offline cache:', err);
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
    const db = await getDB();
    const transaction = db.transaction('syncQueue', 'readwrite');
    const store = transaction.objectStore('syncQueue');
    store.clear();
    queue.forEach(item => {
      const id = String(item.id || item.ID);
      const itemCopy = { ...item, ID: id };
      if (itemCopy.photo && typeof itemCopy.photo.fileData === 'string' && itemCopy.photo.fileData.startsWith('data:')) {
        itemCopy.photo.fileData = dataURLtoBlob(itemCopy.photo.fileData);
      }
      store.put(itemCopy);
    });
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => reject(transaction.error);
    });
  } catch (err) {
    console.error('Failed to save sync queue offline:', err);
  }
}

export async function loadSyncQueueOffline() {
  try {
    const db = await getDB();
    const transaction = db.transaction('syncQueue', 'readonly');
    const store = transaction.objectStore('syncQueue');
    const request = store.getAll();
    return new Promise((resolve, reject) => {
      request.onsuccess = async () => {
        const results = request.result || [];
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
        resolve(queue);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('Failed to load sync queue offline:', err);
    return [];
  }
}
