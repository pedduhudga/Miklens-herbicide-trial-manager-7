// src/services/firebase.js
// Firebase initialization — config is loaded from app settings at runtime.

import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

let _app = null;
let _db = null;
let _auth = null;

/**
 * Initialize (or re-initialize) Firebase with the supplied config object.
 * Safe to call multiple times — re-uses the existing app unless the config changes.
 */
export function initFirebase(config) {
  if (!config || !config.apiKey || !config.projectId) {
    throw new Error('Firebase config is incomplete. Provide apiKey and projectId at minimum.');
  }

  // If an app already exists with the same projectId, reuse it.
  const existing = getApps().find(a => a.options.projectId === config.projectId);
  if (existing) {
    _app = existing;
  } else {
    // Delete any stale default app first
    if (getApps().length > 0 && getApps()[0].name === '[DEFAULT]') {
      // Can't delete in Firebase v9 modular, so we just re-grab
      _app = getApps()[0];
    } else {
      _app = initializeApp(config);
    }
  }

  _db = getFirestore(_app);
  _auth = getAuth(_app);

  if (typeof window !== 'undefined') {
    enableIndexedDbPersistence(_db).catch((err) => {
      if (err.code === 'failed-precondition') {
        console.warn('[Firebase] Persistence failed-precondition: Multiple tabs open.');
      } else if (err.code === 'unimplemented') {
        console.warn('[Firebase] Persistence unimplemented by browser.');
      }
    });
  }

  return { app: _app, db: _db, auth: _auth };
}

export function getFirebaseDB() {
  if (!_db) throw new Error('Firebase not initialized. Call initFirebase(config) first.');
  return _db;
}

export function getFirebaseAuth() {
  if (!_auth) throw new Error('Firebase not initialized. Call initFirebase(config) first.');
  return _auth;
}

export function isFirebaseReady() {
  return !!_db && !!_auth;
}

/**
 * Firestore collection names — legacy (backward-compatible, map to herbicide).
 */
export const COLLECTIONS = {
  // Legacy names → point to original collections to preserve existing data
  trials: 'trials',
  formulations: 'formulations',
  ingredients: 'ingredients',
  organisations: 'organisations',
  projects: 'projects',
  blocks: 'blocks',
  users: 'users',
  settings: 'settings',
  analysisLog: 'analysisLog',
  syncConflicts: 'syncConflicts',
  aiChatSessions: 'aiChatSessions',
  sprayLogs: 'sprayLogs',
};

/**
 * Get the collection name for a specific category.
 * @param {string} categoryId - 'herbicide' | 'fungicide' | 'pesticide' | 'nutrition' | 'biostimulant'
 * @param {string} collectionType - 'trials' | 'projects' | 'formulations' | 'ingredients' | 'blocks'
 * @returns {string} Firestore collection name
 */
export function getCategoryCollection(categoryId, collectionType) {
  // Shared collections (not category-specific)
  const sharedCollections = ['users', 'settings', 'analysisLog', 'syncConflicts', 'aiChatSessions', 'sprayLogs', 'organisations'];
  if (sharedCollections.includes(collectionType)) {
    return collectionType;
  }
  // Category-specific collections
  const validCategories = ['herbicide', 'fungicide', 'pesticide', 'nutrition', 'biostimulant'];
  const cat = validCategories.includes(categoryId) ? categoryId : 'herbicide';
  
  // Use legacy non-prefixed collection names for Herbicide category to keep existing user data
  if (cat === 'herbicide') {
    return collectionType;
  }
  return `${cat}_${collectionType}`;
}
