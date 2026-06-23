// src/services/dataLayer.js
// Unified data access layer.
// Routes every read/write through Firebase (primary) or Google Sheets (legacy fallback).
// When Firebase is enabled, writes are additionally mirrored to Sheets if sheetMirrorEnabled=true.

import * as fbDB from './firebaseDB.js';
import * as sheetDB from './db.js';
import { mirrorWrite } from './sheetMirror.js';
import { fbGetAllUsers, fbUpdateUserProfile } from './firebaseAuth.js';

// ─── helper ──────────────────────────────────────────────────────────────────

function getConfig(getAppState) {
  const s = getAppState ? getAppState().settings : {};
  return {
    useFirebase: !!s?.firebaseEnabled,
    sheetMirror: !!s?.sheetMirrorEnabled,
  };
}

function getCategory(getAppState) {
  const state = getAppState ? getAppState() : {};
  return state.activeCategory || 'herbicide';
}

function getRecordCategory(collectionType, payload, getAppState) {
  if (payload?.Category) return payload.Category;
  if (payload?.category) return payload.category;

  const state = getAppState ? getAppState() : {};
  const list = state[collectionType] || [];
  const record = list.find(r => r.ID === (payload?.id || payload?.ID) || r.id === (payload?.id || payload?.ID));
  return record?.Category || record?.category || getCategory(getAppState);
}

function getUserId(getAppState) {
  const state = getAppState ? getAppState() : {};
  return state.auth?.uid || state.auth?.user?.ID || state.auth?.user?.uid || null;
}

function isAdmin(getAppState) {
  const state = getAppState ? getAppState() : {};
  const role = String(state.auth?.user?.Role || state.auth?.user?.role || '').toLowerCase();
  return role === 'admin';
}

function getAllowedUids(getAppState) {
  const state = getAppState ? getAppState() : {};
  const user = state.auth?.user;
  if (!user) return ['__empty_sandbox__'];

  const role = String(user.Role || user.role || '').toLowerCase();
  const uid = state.auth?.uid || user.ID || user.uid || null;

  if (role === 'admin') {
    return null; // admin sees all
  }

  if (role === 'developer') {
    // developer can see everything (all data) ONLY if allowDataAccess is explicitly true
    const allowData = !!user.allowDataAccess || !!user.AllowDataAccess;
    return allowData ? null : [uid]; // returns own uid so they see only their own test data
  }

  // Regular user (scientist/viewer)
  // Retrieve their own UID and any viewableUsers (cross-user sharing)
  const viewable = user.viewableUsers || user.ViewableUsers || [];
  const allowed = [uid];
  if (Array.isArray(viewable)) {
    for (const val of viewable) {
      if (val && typeof val === 'string' && !allowed.includes(val)) {
        allowed.push(val);
      }
    }
  }
  return allowed;
}

function getSharedWithUid(getAppState) {
  const state = getAppState ? getAppState() : {};
  const user = state.auth?.user;
  if (!user) return null;

  const role = String(user.Role || user.role || '').toLowerCase();
  if (role === 'admin') {
    return null; // Admin sees all data already
  }

  if (role === 'developer') {
    // developer can see shared data ONLY if allowDataAccess is true
    const allowData = !!user.allowDataAccess || !!user.AllowDataAccess;
    return allowData ? (state.auth?.uid || user.ID || user.uid) : null;
  }

  return state.auth?.uid || user.ID || user.uid || null;
}

function checkOwnership(collectionType, recordId, getAppState, action = 'edit') {
  const state = getAppState ? getAppState() : {};
  const user = state.auth?.user;
  if (!user) return false;

  const role = String(user.Role || user.role || '').toLowerCase();
  if (role === 'admin') return true; // admin bypass

  const ownUid = state.auth?.uid || user.ID || user.uid;
  if (!ownUid) return false;

  const list = state[collectionType] || [];
  const record = list.find(r => r.ID === recordId || r.id === recordId);
  if (!record) return true; // new record or not in state

  const isOwner = !record.CreatedBy || record.CreatedBy === ownUid;
  if (isOwner) return true;

  if (action === 'edit') {
    // Allow editing if the user is in the SharedWithEdit array
    const sharedWithEdit = record.SharedWithEdit || [];
    return Array.isArray(sharedWithEdit) && sharedWithEdit.includes(ownUid);
  }

  // Deletions are strictly restricted to the creator
  return false;
}

function mirror(action, payload, getAppState) {
  const { sheetMirror } = getConfig(getAppState);
  if (sheetMirror) mirrorWrite(action, payload, getAppState);
}

// ─── getAllData ───────────────────────────────────────────────────────────────

export async function getAllData(payload, getAppState) {
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    const allowedUids = getAllowedUids(getAppState);
    const sharedWithUid = getSharedWithUid(getAppState);
    const category = getCategory(getAppState);
    return fbDB.fbGetAllData(allowedUids, category, sharedWithUid);
  }
  return sheetDB.getAllData(payload, getAppState);
}

// ─── Trials ──────────────────────────────────────────────────────────────────

export async function getTrials(payload, getAppState) {
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    const allowedUids = getAllowedUids(getAppState);
    const sharedWithUid = getSharedWithUid(getAppState);
    const category = getCategory(getAppState);
    return fbDB.fbCatGetTrials(category, allowedUids, sharedWithUid);
  }
  return sheetDB.getTrials(payload, getAppState);
}

export async function addTrial(payload, getAppState) {
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    const uid = getUserId(getAppState);
    const category = getCategory(getAppState);
    const result = await fbDB.fbCatAddTrial(category, payload, uid);
    mirror('addTrial', payload, getAppState);
    return result;
  }
  return sheetDB.addTrial(payload, getAppState);
}

export async function updateTrial(payload, getAppState) {
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    if (!checkOwnership('trials', payload.id || payload.ID, getAppState)) {
      throw new Error("Permission Denied: You cannot modify another user's trial.");
    }
    const category = getRecordCategory('trials', payload, getAppState);
    const result = await fbDB.fbCatUpdateTrial(category, payload);
    mirror('updateTrialRecord', payload, getAppState);
    return result;
  }
  return sheetDB.updateTrial(payload, getAppState);
}

export async function deleteTrial(payload, getAppState, showOverlay = true) {
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    if (!checkOwnership('trials', payload.id || payload.ID, getAppState, 'delete')) {
      throw new Error("Permission Denied: You cannot delete another user's trial.");
    }
    const category = getRecordCategory('trials', payload, getAppState);
    const result = await fbDB.fbCatDeleteTrial(category, payload.id || payload.ID);
    mirror('deleteTrialRecord', payload, getAppState);
    return result;
  }
  return sheetDB.deleteTrial(payload, getAppState, showOverlay);
}

export async function addBatchTrials(payload, getAppState, showOverlay = true) {
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    const uid = getUserId(getAppState);
    const category = getCategory(getAppState);
    const trials = payload.trials || [];
    const result = await fbDB.fbCatBatchWrite(category, 'trials', trials, uid);
    mirror('addBatchTrials', payload, getAppState);
    return result;
  }
  return sheetDB.addBatchTrials(payload, getAppState, showOverlay);
}

export async function finalizeTrial(payload, getAppState) {
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    if (!checkOwnership('trials', payload.id || payload.ID, getAppState)) {
      throw new Error("Permission Denied: You cannot modify another user's trial.");
    }
    const category = getRecordCategory('trials', payload, getAppState);
    const result = await fbDB.fbCatUpdateTrial(category, { ...payload, ControlFinalized: true, FinalizationDate: new Date().toISOString() });
    mirror('finalizeTrial', payload, getAppState);
    return result;
  }
  return sheetDB.finalizeTrial(payload, getAppState);
}

export async function updateTrialStatus(payload, getAppState) {
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    if (!checkOwnership('trials', payload.id || payload.ID, getAppState)) {
      throw new Error("Permission Denied: You cannot modify another user's trial.");
    }
    const category = getRecordCategory('trials', payload, getAppState);
    const result = await fbDB.fbCatUpdateTrial(category, payload);
    mirror('updateTrialStatus', payload, getAppState);
    return result;
  }
  return sheetDB.updateTrialStatus(payload, getAppState);
}

// ─── Formulations ────────────────────────────────────────────────────────────

export async function getFormulations(payload, getAppState) {
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    const allowedUids = getAllowedUids(getAppState);
    const sharedWithUid = getSharedWithUid(getAppState);
    const category = getCategory(getAppState);
    return fbDB.fbCatGetFormulations(category, allowedUids, sharedWithUid);
  }
  return sheetDB.getFormulations(payload, getAppState);
}

export async function addFormulation(payload, getAppState) {
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    const uid = getUserId(getAppState);
    const category = getCategory(getAppState);
    const result = await fbDB.fbCatAddFormulation(category, payload, uid);
    mirror('addFormulation', payload, getAppState);
    return result;
  }
  return sheetDB.addFormulation(payload, getAppState);
}

export async function updateFormulation(payload, getAppState) {
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    if (!checkOwnership('formulations', payload.id || payload.ID, getAppState)) {
      throw new Error("Permission Denied: You cannot modify another user's formulation.");
    }
    const category = getRecordCategory('formulations', payload, getAppState);
    const result = await fbDB.fbCatUpdateFormulation(category, payload);
    mirror('updateFormulation', payload, getAppState);
    return result;
  }
  return sheetDB.apiCall('updateFormulation', payload, true, getAppState);
}

export async function deleteFormulation(payload, getAppState) {
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    if (!checkOwnership('formulations', payload.id || payload.ID, getAppState, 'delete')) {
      throw new Error("Permission Denied: You cannot delete another user's formulation.");
    }
    const category = getRecordCategory('formulations', payload, getAppState);
    const result = await fbDB.fbCatDeleteFormulation(category, payload.id || payload.ID);
    mirror('deleteFormulation', payload, getAppState);
    return result;
  }
  return sheetDB.deleteFormulation(payload, getAppState);
}

// ─── Ingredients ─────────────────────────────────────────────────────────────

export async function getIngredients(payload, getAppState) {
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    const allowedUids = getAllowedUids(getAppState);
    return fbDB.fbGetIngredients(allowedUids);
  }
  return sheetDB.getIngredients(payload, getAppState);
}

export async function addIngredient(payload, getAppState) {
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    const uid = getUserId(getAppState);
    const result = await fbDB.fbAddIngredient(payload, uid);
    mirror('addIngredient', payload, getAppState);
    return result;
  }
  return sheetDB.addIngredient(payload, getAppState);
}

export async function deleteIngredient(payload, getAppState) {
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    if (!checkOwnership('ingredients', payload.id || payload.ID, getAppState)) {
      throw new Error("Permission Denied: You cannot delete another user's ingredient.");
    }
    const result = await fbDB.fbDeleteIngredient(payload.id || payload.ID);
    mirror('deleteIngredient', payload, getAppState);
    return result;
  }
  return sheetDB.deleteIngredient(payload, getAppState);
}

// ─── Projects ────────────────────────────────────────────────────────────────

export async function getProjects(payload, getAppState) {
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    const allowedUids = getAllowedUids(getAppState);
    const sharedWithUid = getSharedWithUid(getAppState);
    const category = getCategory(getAppState);
    return fbDB.fbCatGetProjects(category, allowedUids, sharedWithUid);
  }
  return sheetDB.getProjects(payload, getAppState);
}

export async function addProject(payload, getAppState) {
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    const uid = getUserId(getAppState);
    const category = getCategory(getAppState);
    const result = await fbDB.fbCatAddProject(category, payload, uid);
    mirror('addProject', payload, getAppState);
    return result;
  }
  return sheetDB.addProject(payload, getAppState);
}

export async function updateProject(payload, getAppState) {
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    if (!checkOwnership('projects', payload.id || payload.ID, getAppState)) {
      throw new Error("Permission Denied: You cannot modify another user's project.");
    }
    const category = getRecordCategory('projects', payload, getAppState);
    const result = await fbDB.fbCatUpdateProject(category, payload);
    mirror('updateProject', payload, getAppState);
    return result;
  }
  return sheetDB.updateProject(payload, getAppState);
}

export async function deleteProject(payload, getAppState) {
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    if (!checkOwnership('projects', payload.id || payload.ID, getAppState, 'delete')) {
      throw new Error("Permission Denied: You cannot delete another user's project.");
    }
    const category = getRecordCategory('projects', payload, getAppState);
    const result = await fbDB.fbCatDeleteProject(category, payload.id || payload.ID);
    mirror('deleteProject', payload, getAppState);
    return result;
  }
  return sheetDB.deleteProject(payload, getAppState);
}

// ─── Blocks ──────────────────────────────────────────────────────────────────

export async function addBlock(payload, getAppState, showOverlay = true) {
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    const uid = getUserId(getAppState);
    const category = getCategory(getAppState);
    const result = await fbDB.fbCatAddBlock(category, payload, uid);
    mirror('addBlock', payload, getAppState);
    return result;
  }
  return sheetDB.addBlock(payload, getAppState, showOverlay);
}

export async function deleteBlock(payload, getAppState, showOverlay = true) {
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    if (!checkOwnership('blocks', payload.id || payload.ID, getAppState)) {
      throw new Error("Permission Denied: You cannot delete another user's block.");
    }
    const category = getRecordCategory('blocks', payload, getAppState);
    const result = await fbDB.fbCatDeleteBlock(category, payload.id || payload.ID);
    mirror('deleteBlock', payload, getAppState);
    return result;
  }
  return sheetDB.apiCall('deleteBlock', payload, showOverlay, getAppState);
}

// ─── Organisations ───────────────────────────────────────────────────────────

export async function getOrganisations(payload, getAppState) {
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    const allowedUids = getAllowedUids(getAppState);
    return fbDB.fbGetOrganisations(allowedUids);
  }
  return sheetDB.getOrganisations(payload, getAppState);
}

export async function addOrganisation(payload, getAppState) {
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    const uid = getUserId(getAppState);
    const result = await fbDB.fbAddOrganisation(payload, uid);
    mirror('addOrganisation', payload, getAppState);
    return result;
  }
  return sheetDB.addOrganisation(payload, getAppState);
}

export async function deleteOrganisation(payload, getAppState) {
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    if (!checkOwnership('organisations', payload.id || payload.ID, getAppState)) {
      throw new Error("Permission Denied: You cannot delete another user's organisation.");
    }
    const result = await fbDB.fbDeleteOrganisation(payload.id || payload.ID);
    mirror('deleteOrganisation', payload, getAppState);
    return result;
  }
  return sheetDB.deleteOrganisation(payload, getAppState);
}

// ─── Users (admin) ────────────────────────────────────────────────────────────

export async function getUsers(payload, getAppState) {
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    // fbGetAllUsers is statically imported at the top
    return fbGetAllUsers();
  }
  return sheetDB.getUsers(payload, getAppState);
}

export async function updateUser(payload, getAppState) {
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    // fbUpdateUserProfile is statically imported at the top
    const uid = payload.uid || payload.ID || payload.id;
    return fbUpdateUserProfile(uid, payload);
  }
  return sheetDB.updateUser(payload, getAppState);
}

// ─── Embeddings (pass-through — stored in Firestore same way) ────────────────

export async function upsertEmbedding(payload, getAppState) {
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    const uid = getUserId(getAppState);
    return fbDB.fbAdd('embeddingsAll', payload, uid);
  }
  return sheetDB.upsertEmbedding(payload, getAppState);
}

export async function loadSmartIndex(payload, getAppState) {
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    const allowedUids = getAllowedUids(getAppState);
    return fbDB.fbGetAll('embeddingsAll', allowedUids);
  }
  return sheetDB.loadSmartIndex(payload, getAppState);
}

export async function clearSmartEmbeddings(payload, getAppState) {
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    return { success: true, message: 'Use Firebase console to clear embeddings.' };
  }
  return sheetDB.clearSmartEmbeddings(payload, getAppState);
}

// ─── Photo Upload ─────────────────────────────────────────────────────────────
// Photos MUST go to Google Drive. The Apps Script is the only server-side proxy
// that can authenticate with Drive from the browser.
// This works regardless of whether Firebase or Sheet mode is active —
// Firebase stores trial metadata, Drive stores the photo files.
// Without a scriptUrl there is no path to Drive: return a clear error.

export async function uploadPhoto(payload, getAppState) {
  const state = getAppState ? getAppState() : {};
  const hasScript = !!(state?.settings?.scriptUrl?.trim());

  if (!hasScript) {
    return {
      _errType: 'config',
      message: 'Google Drive upload requires the Apps Script URL to be set in Settings → Script URL. Photos cannot be saved without it.',
    };
  }

  return sheetDB.apiCall('uploadPhoto', payload, false, getAppState);
}

// ─── Re-export apiCall for anything that still needs raw access ───────────────
export { apiCall } from './db.js';

// ─── AI Chat Sessions ────────────────────────────────────────────────────────
export async function getAiChatSessions(payload, getAppState) {
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    const uid = getUserId(getAppState);
    return fbDB.fbGetAiChatSessions(uid);
  }
  return []; // Not supported in sheets for now
}

export async function saveAiChatSession(payload, getAppState) {
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    const uid = getUserId(getAppState);
    return fbDB.fbSaveAiChatSession(payload, uid);
  }
  return payload; // Fallback to local storage for sheets
}

export async function deleteAiChatSession(payload, getAppState) {
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    return fbDB.fbDeleteAiChatSession(payload.id);
  }
  return { success: true };
}
