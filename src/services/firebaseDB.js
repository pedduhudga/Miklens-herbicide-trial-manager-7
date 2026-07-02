// src/services/firebaseDB.js
// All Firestore CRUD operations.  Mirrors the shape of src/services/db.js so
// the rest of the app can call these with minimal changes.

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  writeBatch,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { getFirebaseDB, COLLECTIONS, getCategoryCollection } from "./firebase.js";

// ─── helpers ────────────────────────────────────────────────────────────────

function cleanForFirestore(obj) {
  if (obj === null || obj === undefined) return obj;
  if (obj instanceof Date) return obj;
  if (Array.isArray(obj)) {
    return obj.map(cleanForFirestore);
  }
  if (typeof obj !== "object") return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    // Strip raw base64 image data strings (these should be in Google Drive, not Firestore)
    // Exempt logoBase64 since the company logo needs to be stored in settings.
    if (k !== 'logoBase64' && typeof v === 'string' && v.startsWith('data:image')) {
      out[k] = '[base64-removed]';
      continue;
    }
    // For JSON string fields that may contain embedded fileData (PhotoURLs, WeedPhotosJSON, etc.)
    if (typeof v === 'string' && v.length > 50000) {
      try {
        const parsed = JSON.parse(v);
        if (Array.isArray(parsed)) {
          const stripped = parsed.map(item => {
            if (item && typeof item === 'object' && item.fileData) {
              const { fileData, ...rest } = item;
              return rest;
            }
            return item;
          });
          out[k] = JSON.stringify(stripped);
          continue;
        }
      } catch { /* not JSON, keep as-is */ }
    }
    out[k] = cleanForFirestore(v);
  }
  return out;
}

function snapToRecord(snap) {
  return snap.exists() ? { ID: snap.id, ...snap.data() } : null;
}

function snapsToArray(snapshot) {
  return snapshot.docs.map((d) => ({ ID: d.id, ...d.data() }));
}

// ─── generic CRUD ───────────────────────────────────────────────────────────

export async function fbGetAll(collectionName, userId = null, sharedWithUid = null) {
  const db = getFirebaseDB();
  const baseCol = collection(db, collectionName);

  if (!userId) {
    const snap = await getDocs(baseCol);
    return snapsToArray(snap);
  }

  const allowedUids = Array.isArray(userId) ? userId : [userId];

  // Chunk allowedUids into arrays of maximum 30 elements (Firestore limits 'in' queries to 30)
  const chunks = [];
  for (let i = 0; i < allowedUids.length; i += 30) {
    chunks.push(allowedUids.slice(i, i + 30));
  }

  const promises = chunks.map(async (chunk) => {
    const q = query(baseCol, where("CreatedBy", "in", chunk));
    const snap = await getDocs(q);
    return snapsToArray(snap);
  });

  if (sharedWithUid) {
    const qShared = query(baseCol, where("SharedWith", "array-contains", sharedWithUid));
    promises.push((async () => {
      const snap = await getDocs(qShared);
      return snapsToArray(snap);
    })());
  }

  const results = await Promise.all(promises);
  // Flatten and deduplicate by ID
  const merged = [];
  const seen = new Set();
  for (const arr of results) {
    for (const item of arr) {
      if (!seen.has(item.ID)) {
        seen.add(item.ID);
        merged.push(item);
      }
    }
  }
  return merged;
}

export async function fbGetById(collectionName, id) {
  const db = getFirebaseDB();
  const snap = await getDoc(doc(db, collectionName, id));
  return snapToRecord(snap);
}

export async function fbAdd(collectionName, data, userId) {
  const db = getFirebaseDB();
  const id = data.ID || data.id || crypto.randomUUID();
  const record = cleanForFirestore({
    ...data,
    ID: id,
    CreatedBy: userId || data.CreatedBy || "",
    _createdAt: serverTimestamp(),
    _updatedAt: serverTimestamp(),
  });
  await setDoc(doc(db, collectionName, id), record);
  return { success: true, ID: id, ...record };
}

export async function fbUpdate(collectionName, data) {
  const db = getFirebaseDB();
  const id = data.ID || data.id;
  if (!id) throw new Error(`fbUpdate: ID required for ${collectionName}`);
  const record = cleanForFirestore({ ...data, _updatedAt: serverTimestamp() });
  delete record.ID;
  delete record.id;
  await updateDoc(doc(db, collectionName, id), record);
  return { success: true, ID: id };
}

export async function fbDelete(collectionName, id) {
  const db = getFirebaseDB();
  if (!id) throw new Error(`fbDelete: ID required for ${collectionName}`);
  await deleteDoc(doc(db, collectionName, id));
  return { success: true, ID: id };
}

export async function fbBatchWrite(collectionName, records, userId) {
  const db = getFirebaseDB();
  const batch = writeBatch(db);
  const ids = [];
  for (const data of records) {
    const id = data.ID || data.id || crypto.randomUUID();
    const record = cleanForFirestore({
      ...data,
      ID: id,
      CreatedBy: userId || data.CreatedBy || "",
      _createdAt: serverTimestamp(),
      _updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, collectionName, id), record);
    ids.push(id);
  }
  await batch.commit();
  return { success: true, count: ids.length, ids };
}

// ─── Trials ─────────────────────────────────────────────────────────────────

export async function fbGetTrials(userId) {
  return fbGetAll(COLLECTIONS.trials, userId);
}

export async function fbAddTrial(data, userId) {
  return fbAdd(COLLECTIONS.trials, data, userId);
}

export async function fbUpdateTrial(data) {
  return fbUpdate(COLLECTIONS.trials, data);
}

export async function fbDeleteTrial(id) {
  return fbDelete(COLLECTIONS.trials, id);
}

// ─── Formulations ────────────────────────────────────────────────────────────

export async function fbGetFormulations(userId) {
  return fbGetAll(COLLECTIONS.formulations, userId);
}

export async function fbAddFormulation(data, userId) {
  return fbAdd(COLLECTIONS.formulations, data, userId);
}

export async function fbUpdateFormulation(data) {
  return fbUpdate(COLLECTIONS.formulations, data);
}

export async function fbDeleteFormulation(id) {
  return fbDelete(COLLECTIONS.formulations, id);
}

// ─── Ingredients ─────────────────────────────────────────────────────────────

export async function fbGetIngredients(userId) {
  return fbGetAll(COLLECTIONS.ingredients, userId);
}

export async function fbAddIngredient(data, userId) {
  return fbAdd(COLLECTIONS.ingredients, data, userId);
}

export async function fbUpdateIngredient(data) {
  return fbUpdate(COLLECTIONS.ingredients, data);
}

export async function fbDeleteIngredient(id) {
  return fbDelete(COLLECTIONS.ingredients, id);
}

// ─── Projects ────────────────────────────────────────────────────────────────

export async function fbGetProjects(userId) {
  return fbGetAll(COLLECTIONS.projects, userId);
}

export async function fbAddProject(data, userId) {
  return fbAdd(COLLECTIONS.projects, data, userId);
}

export async function fbUpdateProject(data) {
  return fbUpdate(COLLECTIONS.projects, data);
}

export async function fbDeleteProject(id) {
  return fbDelete(COLLECTIONS.projects, id);
}

// ─── Blocks ──────────────────────────────────────────────────────────────────

export async function fbGetBlocks(userId) {
  return fbGetAll(COLLECTIONS.blocks, userId);
}

export async function fbAddBlock(data, userId) {
  return fbAdd(COLLECTIONS.blocks, data, userId);
}

// ─── Organisations ───────────────────────────────────────────────────────────

export async function fbGetOrganisations(userId) {
  return fbGetAll(COLLECTIONS.organisations, userId);
}

export async function fbAddOrganisation(data, userId) {
  return fbAdd(COLLECTIONS.organisations, data, userId);
}

export async function fbDeleteOrganisation(id) {
  return fbDelete(COLLECTIONS.organisations, id);
}

// ─── Settings ────────────────────────────────────────────────────────────────

export async function fbGetUserSettings(userId) {
  if (!userId) return null;
  const db = getFirebaseDB();
  const userSnap = await getDoc(doc(db, COLLECTIONS.settings, userId));
  const userData = userSnap.exists() ? userSnap.data() : {};

  // Fetch admin keys configuration if available
  try {
    const adminSnap = await getDoc(doc(db, COLLECTIONS.settings, "adminKeys"));
    if (adminSnap.exists()) {
      const adminData = adminSnap.data();
      // If user doesn't have custom keys set, fall back to admin keys
      const mergedKeys = (userData.apiKeys && userData.apiKeys.length > 0) ? userData.apiKeys : (adminData.apiKeys || []);
      const mergedGroqKeys = (userData.groqApiKeys && userData.groqApiKeys.length > 0) ? userData.groqApiKeys : (adminData.groqApiKeys || []);
      return {
        ...adminData,
        ...userData,
        apiKeys: mergedKeys,
        groqApiKeys: mergedGroqKeys,
        geminiApiKey: userData.geminiApiKey || adminData.geminiApiKey || '',
        groqApiKey: userData.groqApiKey || adminData.groqApiKey || '',
        mistralApiKey: userData.mistralApiKey || adminData.mistralApiKey || '',
        openWeatherApiKey: userData.openWeatherApiKey || adminData.openWeatherApiKey || '',
        folderId: userData.folderId || adminData.folderId || '',
        sheetId: userData.sheetId || adminData.sheetId || '',
        scriptUrl: userData.scriptUrl || adminData.scriptUrl || '',
        appSecretToken: userData.appSecretToken || adminData.appSecretToken || ''
      };
    }
  } catch (err) {
    console.warn("Failed to retrieve admin keys fallback settings:", err);
  }

  return userSnap.exists() ? userData : null;
}

export async function fbSaveUserSettings(userId, settings, isAdmin = false) {
  const db = getFirebaseDB();
  await setDoc(
    doc(db, COLLECTIONS.settings, userId),
    {
      ...cleanForFirestore(settings),
      _updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  // If saved by an admin, mirror the admin's API keys to a global 'adminKeys' document
  if (isAdmin) {
    const apiKeys = Array.isArray(settings.apiKeys) ? settings.apiKeys : [];
    const groqApiKeys = Array.isArray(settings.groqApiKeys) ? settings.groqApiKeys : [];
    await setDoc(
      doc(db, COLLECTIONS.settings, "adminKeys"),
      {
        apiKeys,
        groqApiKeys,
        geminiApiKey: settings.geminiApiKey || '',
        groqApiKey: settings.groqApiKey || '',
        mistralApiKey: settings.mistralApiKey || '',
        openWeatherApiKey: settings.openWeatherApiKey || '',
        folderId: settings.folderId || '',
        sheetId: settings.sheetId || '',
        scriptUrl: settings.scriptUrl || '',
        appSecretToken: settings.appSecretToken || '',
        _updatedAt: serverTimestamp()
      },
      { merge: true }
    );
  }

  return { success: true };
}

// ─── Global QR settings (publicly readable — controls LiveTrialPage) ─────────
// Stored at settings/globalQR so any device scanning a QR code can read it
// without authentication. Firestore rules must allow:
//   match /settings/globalQR { allow read: if true; }

export async function fbSaveGlobalQRSettings(qrOnlineFields) {
  const db = getFirebaseDB();
  await setDoc(
    doc(db, COLLECTIONS.settings, "globalQR"),
    { qrOnlineFields, _updatedAt: serverTimestamp() },
    { merge: true },
  );
  return { success: true };
}

export async function fbGetGlobalQRSettings() {
  try {
    const db = getFirebaseDB();
    const snap = await getDoc(doc(db, COLLECTIONS.settings, "globalQR"));
    return snap.exists() ? snap.data() : null;
  } catch {
    return null;
  }
}

// ─── Analysis Log ────────────────────────────────────────────────────────────

export async function fbAddAnalysisLog(data, userId) {
  return fbAdd(COLLECTIONS.analysisLog, data, userId);
}

// ─── Spray Logs ──────────────────────────────────────────────────────────────

export async function fbGetSprayLogs(userId, projectId = null, trialId = null, sharedWithUid = null) {
  const db = getFirebaseDB();
  const baseCol = collection(db, COLLECTIONS.sprayLogs);
  let conditions = [];
  if (projectId) conditions.push(where("ProjectID", "==", projectId));
  if (trialId) conditions.push(where("TrialID", "==", trialId));

  if (!userId) {
    const q = conditions.length ? query(baseCol, ...conditions) : baseCol;
    const snap = await getDocs(q);
    return snapsToArray(snap);
  }

  const allowedUids = Array.isArray(userId) ? userId : [userId];
  const chunks = [];
  for (let i = 0; i < allowedUids.length; i += 30) {
    chunks.push(allowedUids.slice(i, i + 30));
  }

  const promises = chunks.map(async (chunk) => {
    const q = query(baseCol, ...conditions, where("CreatedBy", "in", chunk));
    const snap = await getDocs(q);
    return snapsToArray(snap);
  });

  if (sharedWithUid) {
    const qShared = query(baseCol, ...conditions, where("SharedWith", "array-contains", sharedWithUid));
    promises.push((async () => {
      const snap = await getDocs(qShared);
      return snapsToArray(snap);
    })());
  }

  const results = await Promise.all(promises);
  const merged = [];
  const seen = new Set();
  for (const arr of results) {
    for (const item of arr) {
      if (!seen.has(item.ID)) {
        seen.add(item.ID);
        merged.push(item);
      }
    }
  }
  return merged;
}

export async function fbAddSprayLog(data, userId) {
  return fbAdd(COLLECTIONS.sprayLogs, data, userId);
}

// ─── Batch import (migration) ─────────────────────────────────────────────────

/**
 * Imports an entire dataset exported from Google Sheets into Firestore.
 * dataMap shape: { trials: [...], formulations: [...], ... }
 */
export async function fbImportAll(dataMap, userId) {
  const results = {};
  const collectionMap = {
    trials: COLLECTIONS.trials,
    formulations: COLLECTIONS.formulations,
    ingredients: COLLECTIONS.ingredients,
    organisations: COLLECTIONS.organisations,
    projects: COLLECTIONS.projects,
    blocks: COLLECTIONS.blocks,
  };

  for (const [key, col] of Object.entries(collectionMap)) {
    const items = dataMap[key];
    if (!Array.isArray(items) || items.length === 0) {
      results[key] = { count: 0 };
      continue;
    }

    // Firestore batch limit = 500 ops
    const chunks = [];
    for (let i = 0; i < items.length; i += 400) {
      chunks.push(items.slice(i, i + 400));
    }

    let total = 0;
    for (const chunk of chunks) {
      const r = await fbBatchWrite(col, chunk, userId);
      total += r.count;
    }
    results[key] = { count: total };
  }
  return { success: true, results };
}

// ─── Category-aware data loading ─────────────────────────────────────────────

export async function fbGetAllData(allowedUids, category = 'herbicide', sharedWithUid = null) {
  const trialsCol = getCategoryCollection(category, 'trials');
  const formulationsCol = getCategoryCollection(category, 'formulations');
  const ingredientsCol = getCategoryCollection(category, 'ingredients');
  const projectsCol = getCategoryCollection(category, 'projects');
  const blocksCol = getCategoryCollection(category, 'blocks');

  const wrapPromise = async (name, promise) => {
    try {
      return await promise;
    } catch (e) {
      console.error(`[Firestore Load Error] Failed for ${name}:`, e);
      throw new Error(`"${name}" (${e.message})`);
    }
  };

  const [trials, formulations, ingredients, organisations, projects, blocks] =
    await Promise.all([
      wrapPromise(trialsCol, fbGetAll(trialsCol, allowedUids, sharedWithUid)),
      wrapPromise(formulationsCol, fbGetAll(formulationsCol, allowedUids, sharedWithUid)),
      wrapPromise(ingredientsCol, fbGetAll(ingredientsCol, allowedUids, sharedWithUid)),
      wrapPromise('organisations', fbGetOrganisations(allowedUids)),
      wrapPromise(projectsCol, fbGetAll(projectsCol, allowedUids, sharedWithUid)),
      wrapPromise(blocksCol, fbGetAll(blocksCol, allowedUids, sharedWithUid))
    ]);
  return { trials, formulations, ingredients, organisations, projects, blocks };
}

// ─── Category-aware CRUD helpers ─────────────────────────────────────────────

export async function fbCatGetTrials(category, userId, sharedWithUid = null) {
  return fbGetAll(getCategoryCollection(category, 'trials'), userId, sharedWithUid);
}
export async function fbCatAddTrial(category, data, userId) {
  return fbAdd(getCategoryCollection(category, 'trials'), data, userId);
}
export async function fbCatUpdateTrial(category, data) {
  return fbUpdate(getCategoryCollection(category, 'trials'), data);
}
export async function fbCatDeleteTrial(category, id) {
  return fbDelete(getCategoryCollection(category, 'trials'), id);
}

export async function fbCatGetFormulations(category, userId, sharedWithUid = null) {
  return fbGetAll(getCategoryCollection(category, 'formulations'), userId, sharedWithUid);
}
export async function fbCatAddFormulation(category, data, userId) {
  return fbAdd(getCategoryCollection(category, 'formulations'), data, userId);
}
export async function fbCatUpdateFormulation(category, data) {
  return fbUpdate(getCategoryCollection(category, 'formulations'), data);
}
export async function fbCatDeleteFormulation(category, id) {
  return fbDelete(getCategoryCollection(category, 'formulations'), id);
}

export async function fbCatGetIngredients(category, userId) {
  return fbGetAll(getCategoryCollection(category, 'ingredients'), userId);
}
export async function fbCatAddIngredient(category, data, userId) {
  return fbAdd(getCategoryCollection(category, 'ingredients'), data, userId);
}

export async function fbCatGetProjects(category, userId, sharedWithUid = null) {
  return fbGetAll(getCategoryCollection(category, 'projects'), userId, sharedWithUid);
}
export async function fbCatAddProject(category, data, userId) {
  return fbAdd(getCategoryCollection(category, 'projects'), data, userId);
}
export async function fbCatUpdateProject(category, data) {
  return fbUpdate(getCategoryCollection(category, 'projects'), data);
}
export async function fbCatDeleteProject(category, id) {
  return fbDelete(getCategoryCollection(category, 'projects'), id);
}

export async function fbCatGetBlocks(category, userId) {
  return fbGetAll(getCategoryCollection(category, 'blocks'), userId);
}
export async function fbCatAddBlock(category, data, userId) {
  return fbAdd(getCategoryCollection(category, 'blocks'), data, userId);
}
export async function fbCatUpdateBlock(category, data) {
  return fbUpdate(getCategoryCollection(category, 'blocks'), data);
}
export async function fbCatDeleteBlock(category, id) {
  return fbDelete(getCategoryCollection(category, 'blocks'), id);
}

export async function fbCatBatchWrite(category, collectionType, records, userId) {
  return fbBatchWrite(getCategoryCollection(category, collectionType), records, userId);
}

// Category-aware import
export async function fbCatImportAll(category, dataMap, userId) {
  const results = {};
  const collectionTypes = ['trials', 'formulations', 'ingredients', 'projects', 'blocks'];

  for (const key of collectionTypes) {
    const items = dataMap[key];
    if (!Array.isArray(items) || items.length === 0) {
      results[key] = { count: 0 };
      continue;
    }
    const colName = getCategoryCollection(category, key);
    const chunks = [];
    for (let i = 0; i < items.length; i += 400) {
      chunks.push(items.slice(i, i + 400));
    }
    let total = 0;
    for (const chunk of chunks) {
      const r = await fbBatchWrite(colName, chunk, userId);
      total += r.count;
    }
    results[key] = { count: total };
  }
  // Also import organisations (shared)
  if (Array.isArray(dataMap.organisations) && dataMap.organisations.length > 0) {
    const r = await fbBatchWrite(COLLECTIONS.organisations, dataMap.organisations, userId);
    results.organisations = { count: r.count };
  }
  return { success: true, results };
}

// ─── AI Chat Sessions ────────────────────────────────────────────────────────
export async function fbGetAiChatSessions(userId) {
  return fbGetAll(COLLECTIONS.aiChatSessions, userId);
}

export async function fbSaveAiChatSession(data, userId) {
  const db = getFirebaseDB();
  const id = data.id || Date.now().toString();
  const record = cleanForFirestore({
    ...data,
    ID: id,
    id: id,
    CreatedBy: userId,
    _updatedAt: serverTimestamp(),
  });
  await setDoc(doc(db, COLLECTIONS.aiChatSessions, id), record, { merge: true });
  return record;
}

export async function fbDeleteAiChatSession(id) {
  return fbDelete(COLLECTIONS.aiChatSessions, id);
}
