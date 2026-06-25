/**
 * auditLogService.js
 * Persists and retrieves the report audit log from IndexedDB.
 *
 * Uses the app's existing MiklensTrialManagerDB database (same DB as
 * offlineStorage.js) and adds a dedicated `appMeta` key-value object
 * store to hold app-level records such as the report audit log.
 *
 * Audit log entry shape:
 * {
 *   reportUUID       : string,   // v4 UUID
 *   generatedOn      : string,   // ISO 8601 with timezone offset
 *   generatedBy      : { name: string, email: string },
 *   appVersion       : string,
 *   statsEngineVersion: string,
 *   reportTemplate   : string,
 *   projectName      : string,
 *   projectId        : string,
 * }
 *
 * Requirements: 16.7
 */

const DB_NAME = 'MiklensTrialManagerDB';

// Bump the version so onupgradeneeded fires and we can add the appMeta store.
// offlineStorage.js opened version 2; we open version 3 here.
const DB_VERSION = 3;

const AUDIT_KEY = 'reportAuditLog';
const META_STORE = 'appMeta';

// ── DB helpers ────────────────────────────────────────────────────────────────

/**
 * Open (or upgrade) the database.
 * Carries forward the two existing stores from version 2, then adds `appMeta`.
 *
 * @returns {Promise<IDBDatabase>}
 */
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Preserve existing stores created by offlineStorage.js (version 2)
      const existingStores = [
        'trials',
        'projects',
        'formulations',
        'ingredients',
        'blocks',
        'syncQueue',
        'trialPhotos',
      ];
      existingStores.forEach((name) => {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: 'ID' });
        }
      });

      // New generic key-value store for app-level metadata
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'key' });
      }
    };

    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Read a value from the appMeta store.
 *
 * @param {IDBDatabase} db
 * @param {string} key
 * @returns {Promise<any>}
 */
function readMeta(db, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, 'readonly');
    const store = tx.objectStore(META_STORE);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result ? req.result.value : undefined);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Write a value to the appMeta store.
 *
 * @param {IDBDatabase} db
 * @param {string} key
 * @param {any} value
 * @returns {Promise<void>}
 */
function writeMeta(db, key, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, 'readwrite');
    const store = tx.objectStore(META_STORE);
    store.put({ key, value });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Append a new audit trail record to the log stored under `reportAuditLog`.
 *
 * The value stored at that key is always an array; this function pushes the
 * new record onto the end of the array and writes the updated array back.
 *
 * @param {Object} record - Audit trail record to append.
 * @param {string} record.reportUUID
 * @param {string} record.generatedOn
 * @param {{ name: string, email: string }} record.generatedBy
 * @param {string} record.appVersion
 * @param {string} record.statsEngineVersion
 * @param {string} record.reportTemplate
 * @param {string} record.projectName
 * @param {string} record.projectId
 * @returns {Promise<void>}
 */
export async function appendAuditEntry(record) {
  try {
    const db = await openDB();
    const existing = await readMeta(db, AUDIT_KEY);
    const log = Array.isArray(existing) ? existing : [];
    log.push(record);
    await writeMeta(db, AUDIT_KEY, log);
  } catch (err) {
    console.error('[AuditLog] Failed to append audit entry:', err);
    throw err;
  }
}

/**
 * Retrieve the full audit log array.
 *
 * @returns {Promise<Object[]>} Array of audit trail records, or empty array if
 *   the key has never been written.
 */
export async function getAuditLog() {
  try {
    const db = await openDB();
    const log = await readMeta(db, AUDIT_KEY);
    return Array.isArray(log) ? log : [];
  } catch (err) {
    console.error('[AuditLog] Failed to read audit log:', err);
    return [];
  }
}
