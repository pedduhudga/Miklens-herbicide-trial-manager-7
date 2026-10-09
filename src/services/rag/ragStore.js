// src/services/rag/ragStore.js
// Client-Side Zero-Cost RAG Storage Layer using isolated IndexedDB (MiklensRAG_DB)
// Completely free, offline-capable, and incurs ZERO Firebase reads or writes.

const DB_NAME = 'MiklensRAG_DB';
const DB_VERSION = 1;

let dbInstance = null;

/**
 * Open or initialize the dedicated RAG IndexedDB database
 */
export function openRAGDB() {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      console.warn('[RAG Store] IndexedDB not available in current environment');
      resolve(null);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // 1. Chunks table: Stores text chunks with metadata & category index
      if (!db.objectStoreNames.contains('chunks')) {
        const chunkStore = db.createObjectStore('chunks', { keyPath: 'id' });
        chunkStore.createIndex('category', 'category', { unique: false });
        chunkStore.createIndex('entityType', 'entityType', { unique: false });
        chunkStore.createIndex('entityId', 'entityId', { unique: false });
        chunkStore.createIndex('category_entityType', ['category', 'entityType'], { unique: false });
      }

      // 2. Embeddings table: Stores dense vector embeddings keyed by chunk id
      if (!db.objectStoreNames.contains('embeddings')) {
        const embStore = db.createObjectStore('embeddings', { keyPath: 'id' });
        embStore.createIndex('category', 'category', { unique: false });
      }

      // 3. Metadata / Hash table: Tracks indexing hashes and timestamps
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      console.error('[RAG Store] Failed to open IndexedDB:', event.target.error);
      reject(event.target.error);
    };
  });
}

/**
 * Get all chunks for a specific category
 */
export async function getStoredChunks(category = 'herbicide') {
  const db = await openRAGDB();
  if (!db) return [];

  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction('chunks', 'readonly');
      const store = tx.objectStore('chunks');
      const index = store.index('category');
      const request = index.getAll(category);

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    } catch (err) {
      console.warn('[RAG Store] Error reading stored chunks:', err);
      resolve([]);
    }
  });
}

/**
 * Bulk store or update chunks in IndexedDB
 */
export async function putStoredChunks(chunks) {
  if (!chunks || chunks.length === 0) return true;
  const db = await openRAGDB();
  if (!db) return false;

  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction('chunks', 'readwrite');
      const store = tx.objectStore('chunks');

      for (const chunk of chunks) {
        store.put(chunk);
      }

      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    } catch (err) {
      console.error('[RAG Store] Error putting stored chunks:', err);
      resolve(false);
    }
  });
}

/**
 * Delete chunks belonging to specific entity IDs
 */
export async function deleteChunksForEntities(entityIds = []) {
  if (!entityIds || entityIds.length === 0) return true;
  const db = await openRAGDB();
  if (!db) return false;

  const idSet = new Set(entityIds.map(String));

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(['chunks', 'embeddings'], 'readwrite');
      const chunkStore = tx.objectStore('chunks');
      const embStore = tx.objectStore('embeddings');

      const request = chunkStore.openCursor();
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          if (idSet.has(String(cursor.value.entityId))) {
            const chunkId = cursor.value.id;
            cursor.delete();
            embStore.delete(chunkId);
          }
          cursor.continue();
        }
      };

      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch (e) {
      resolve(false);
    }
  });
}

/**
 * Clear all RAG data for a specific category
 */
export async function clearCategoryRAG(category = 'herbicide') {
  const db = await openRAGDB();
  if (!db) return false;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(['chunks', 'embeddings', 'meta'], 'readwrite');
      const chunkStore = tx.objectStore('chunks');
      const embStore = tx.objectStore('embeddings');
      const metaStore = tx.objectStore('meta');

      const chunkIndex = chunkStore.index('category');
      const req = chunkIndex.openCursor(category);

      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          const chunkId = cursor.value.id;
          cursor.delete();
          embStore.delete(chunkId);
          cursor.continue();
        }
      };

      metaStore.delete(`hash_${category}`);
      metaStore.delete(`ts_${category}`);

      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch (e) {
      resolve(false);
    }
  });
}

/**
 * Get or set indexing metadata
 */
export async function getRAGMeta(key) {
  const db = await openRAGDB();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction('meta', 'readonly');
      const store = tx.objectStore('meta');
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result ? req.result.value : null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function setRAGMeta(key, value) {
  const db = await openRAGDB();
  if (!db) return false;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction('meta', 'readwrite');
      const store = tx.objectStore('meta');
      store.put({ key, value, updatedAt: Date.now() });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}
