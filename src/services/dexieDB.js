// src/services/dexieDB.js
import Dexie from 'dexie';

export const db = new Dexie('MiklensTrialManagerDexieDB');

// Define database schema
db.version(1).stores({
  trials: 'ID, ProjectID, Date, LastModified',
  projects: 'ID',
  formulations: 'ID',
  ingredients: 'ID',
  organisations: 'ID',
  blocks: 'ID',
  syncQueue: 'id, entityType, entityId, timestamp, status',
  trialPhotos: 'ID',
  conflicts: 'id, entityType, entityId, resolved',
  settings: 'ID'
});

/**
 * Migration helper to copy data from a raw legacy IndexedDB store into a Dexie table.
 */
async function migrateFromLegacyStore(legacyDbName, storeName, targetTable) {
  return new Promise((resolve) => {
    const request = indexedDB.open(legacyDbName);
    request.onupgradeneeded = (e) => {
      // If DB doesn't exist, don't create object stores, just cancel
      e.target.transaction.abort();
    };
    request.onerror = () => resolve();
    request.onsuccess = (e) => {
      const legacyDb = e.target.result;
      if (!legacyDb.objectStoreNames.contains(storeName)) {
        legacyDb.close();
        resolve();
        return;
      }
      try {
        const transaction = legacyDb.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const getAllRequest = store.getAll();
        
        getAllRequest.onerror = () => {
          legacyDb.close();
          resolve();
        };
        
        getAllRequest.onsuccess = async () => {
          const items = getAllRequest.result || [];
          if (items.length > 0) {
            console.log(`[DexieMigration] Migrating ${items.length} items from ${legacyDbName}.${storeName} to Dexie...`);
            
            // Normalize IDs to make sure they match keyPath requirements
            const normalizedItems = items.map(item => {
              if (item.ID !== undefined) item.ID = String(item.ID);
              if (item.id !== undefined) item.id = String(item.id);
              return item;
            });

            await targetTable.bulkPut(normalizedItems).catch(err => {
              console.error(`[DexieMigration] Error writing to ${targetTable.name}:`, err);
            });
          }
          legacyDb.close();
          resolve();
        };
      } catch (err) {
        console.error(`[DexieMigration] Failed transaction on ${legacyDbName}.${storeName}:`, err);
        legacyDb.close();
        resolve();
      }
    };
  });
}

/**
 * Automatically migrates existing user data from legacy IndexedDB databases
 * (MiklensTrialManagerDB and HerbicideTrialsDB) to the new Dexie.js database.
 */
export async function migrateLegacyDataIfNeeded() {
  if (typeof window === 'undefined') return;
  
  const migrationDoneKey = 'dexie_migration_done_v1';
  if (localStorage.getItem(migrationDoneKey) === 'true') {
    return;
  }

  console.log('[DexieMigration] Starting check for legacy databases...');

  try {
    // 1. Migrate from MiklensTrialManagerDB (version 2)
    const storesToMigrateMTM = [
      { name: 'trials', table: db.trials },
      { name: 'projects', table: db.projects },
      { name: 'formulations', table: db.formulations },
      { name: 'ingredients', table: db.ingredients },
      { name: 'blocks', table: db.blocks },
      { name: 'syncQueue', table: db.syncQueue },
      { name: 'trialPhotos', table: db.trialPhotos }
    ];

    for (const store of storesToMigrateMTM) {
      await migrateFromLegacyStore('MiklensTrialManagerDB', store.name, store.table);
    }

    // 2. Migrate from HerbicideTrialsDB (version 1)
    const storesToMigrateHT = [
      { name: 'trials', table: db.trials },
      { name: 'projects', table: db.projects },
      { name: 'formulations', table: db.formulations },
      { name: 'ingredients', table: db.ingredients },
      { name: 'syncQueue', table: db.syncQueue },
      { name: 'conflicts', table: db.conflicts }
    ];

    for (const store of storesToMigrateHT) {
      await migrateFromLegacyStore('HerbicideTrialsDB', store.name, store.table);
    }

    // Mark migration as successful
    localStorage.setItem(migrationDoneKey, 'true');
    console.log('[DexieMigration] Migration successfully completed.');
    
    // Optional: Trigger delete request for old databases after safety delay
    setTimeout(() => {
      try {
        indexedDB.deleteDatabase('MiklensTrialManagerDB');
        indexedDB.deleteDatabase('HerbicideTrialsDB');
        console.log('[DexieMigration] Cleaned up legacy databases.');
      } catch (e) {
        console.warn('[DexieMigration] Cleanup of legacy databases skipped:', e);
      }
    }, 5000);

  } catch (error) {
    console.error('[DexieMigration] Exception occurred during migration:', error);
  }
}

// Auto-run migration check on file load
migrateLegacyDataIfNeeded().catch(err => {
  console.error('[DexieMigration] Auto migration failed:', err);
});
