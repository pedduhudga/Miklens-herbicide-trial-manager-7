// src/services/firebaseAuth.js
// Firebase Authentication — email/password.
// Also syncs the user profile record in Firestore (COLLECTIONS.users).

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updatePassword,
  sendPasswordResetEmail,
  getAuth as getFirebaseAuthInstance,
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, collection, getDocs, query, where } from 'firebase/firestore';
import { initializeApp, getApps } from 'firebase/app';
import { getFirebaseAuth, getFirebaseDB, COLLECTIONS } from './firebase.js';
import { DEFAULT_CATEGORY_ACCESS } from '../utils/categoryConfig.js';
import { fbReclaimOrphanedUserData } from './firebaseDB.js';

// ─── helpers ────────────────────────────────────────────────────────────────

async function getUserProfile(uid) {
  const db = getFirebaseDB();
  const snap = await getDoc(doc(db, COLLECTIONS.users, uid));
  if (snap.exists()) {
    const data = { ...snap.data() };
    delete data.Password;
    delete data.password;
    return { uid, ...data };
  }
  return null;
}

async function createUserProfile(uid, profileData) {
  const db = getFirebaseDB();

  // Auto-promote first user or admin emails to Admin
  let isFirstUser = false;
  let previousUids = [];
  try {
    const snap = await getDocs(collection(db, COLLECTIONS.users));
    if (snap.empty) {
      isFirstUser = true;
    } else if (profileData.email) {
      // Find old user profiles that matched this email (e.g. deleted or re-created)
      const emailLower = profileData.email.toLowerCase().trim();
      snap.docs.forEach(d => {
        const u = d.data();
        if (d.id !== uid && (u.Username?.toLowerCase() === emailLower || u.email?.toLowerCase() === emailLower)) {
          previousUids.push(d.id);
          if (Array.isArray(u.previousUids)) {
            previousUids.push(...u.previousUids);
          }
        }
      });
      previousUids = [...new Set(previousUids)];
    }
  } catch (e) {
    // If rules block listing users, we assume not first
  }

  const autoAdmin = isFirstUser;

  const record = {
    ID: uid,
    Username: profileData.email,
    Name: profileData.name || profileData.displayName || profileData.email,
    Role: profileData.role || (autoAdmin ? 'Admin' : 'User'),
    IsActive: true,
    DriveFolderId: profileData.DriveFolderId || '',
    ApiKeysJSON: '[]',
    categoryAccess: profileData.categoryAccess || { ...DEFAULT_CATEGORY_ACCESS },
    tabPermissions: profileData.tabPermissions || {},
    previousUids,
    CreatedAt: new Date().toISOString(),
    UpdatedAt: new Date().toISOString(),
    _createdAt: serverTimestamp(),
  };
  await setDoc(doc(db, COLLECTIONS.users, uid), record);

  // Trigger background data recovery/re-linking for this user
  try {
    fbReclaimOrphanedUserData(profileData.email, uid, previousUids);
  } catch (reclaimErr) {
    console.warn('[Firebase] Data auto-reclaim warning:', reclaimErr);
  }

  return record;
}

// ─── Auth actions ────────────────────────────────────────────────────────────

/**
 * Sign in with email + password.
 * Returns { success, user, uid, token } or { success: false, message }.
 */
export async function fbLogin(email, password) {
  try {
    const auth = getFirebaseAuth();
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const token = await cred.user.getIdToken();
    let profile = await getUserProfile(cred.user.uid);
    if (!profile) {
      try {
        profile = await createUserProfile(cred.user.uid, { email });
      } catch (profileErr) {
        console.error('[Firebase] Failed to create user profile in Firestore:', profileErr);
        profile = { uid: cred.user.uid, Username: email, Role: 'User', IsActive: true };
      }
    }
    if (profile.IsActive === false) {
      await signOut(auth);
      throw new Error('Account is disabled. Contact administrator.');
    }

    // Auto-reclaim any orphaned data for this user asynchronously upon login
    try {
      fbReclaimOrphanedUserData(email, cred.user.uid, profile.previousUids || []);
    } catch (recErr) {
      console.warn('[Firebase] Login auto-reclaim warning:', recErr);
    }

    return { success: true, user: { ...profile, uid: cred.user.uid }, uid: cred.user.uid, token };
  } catch (err) {
    const map = {
      'auth/invalid-credential': 'Invalid email or password.',
      'auth/user-not-found': 'No account found with that email.',
      'auth/wrong-password': 'Incorrect password.',
      'auth/too-many-requests': 'Too many failed attempts. Please wait before retrying.',
      'auth/user-disabled': 'Account is disabled.',
    };
    return { success: false, message: map[err.code] || err.message };
  }
}

export async function fbRegisterUser(email, password, profileData = {}) {
  try {
    const apps = getApps();
    if (apps.length === 0) {
      throw new Error('Primary Firebase App not initialized.');
    }
    const config = apps[0].options;
    const tempAppName = `tempApp_${Date.now()}`;
    const tempApp = initializeApp(config, tempAppName);
    const tempAuth = getFirebaseAuthInstance(tempApp);

    const cred = await createUserWithEmailAndPassword(tempAuth, email, password);
    const profile = await createUserProfile(cred.user.uid, { email, ...profileData });
    
    try {
      await tempApp.delete();
    } catch (e) {
      console.warn('[Firebase] Temp App cleanup failed:', e);
    }

    return { success: true, uid: cred.user.uid, user: profile };
  } catch (err) {
    const map = {
      'auth/email-already-in-use': 'An account with this email already exists.',
      'auth/weak-password': 'Password must be at least 6 characters.',
      'auth/invalid-email': 'Invalid email address.',
    };
    return { success: false, message: map[err.code] || err.message };
  }
}

export async function fbLogout() {
  const auth = getFirebaseAuth();
  await signOut(auth);
  return { success: true };
}

export async function fbResetPassword(email) {
  try {
    const db = getFirebaseDB();
    const emailLower = email.toLowerCase().trim();
    let exists = false;
    try {
      const q = query(collection(db, COLLECTIONS.users), where("Username", "==", emailLower));
      const snap = await getDocs(q);
      if (!snap.empty) {
        exists = true;
      }
    } catch (fsErr) {
      console.warn('[Firebase] Firestore check failed (likely security rules):', fsErr);
      // Fallback: assume user exists and let Firebase Auth attempt sending reset link
      exists = true;
    }

    if (!exists) {
      return { success: false, message: 'No account found with that email address.' };
    }

    const auth = getFirebaseAuth();
    await sendPasswordResetEmail(auth, emailLower);
    return { success: true };
  } catch (err) {
    const map = {
      'auth/user-not-found': 'No account found with that email address.',
      'auth/invalid-email': 'Invalid email address.',
    };
    return { success: false, message: map[err.code] || err.message };
  }
}

/**
 * Get current Firebase Auth user token (refreshed).
 */
export async function fbGetCurrentToken() {
  const auth = getFirebaseAuth();
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken(true);
}

/**
 * Subscribe to auth state changes — returns an unsubscribe function.
 */
export function fbOnAuthStateChanged(callback) {
  const auth = getFirebaseAuth();
  return onAuthStateChanged(auth, async (fbUser) => {
    if (fbUser) {
      const profile = await getUserProfile(fbUser.uid);
      const token = await fbUser.getIdToken();
      callback({ fbUser, profile, token });
    } else {
      callback(null);
    }
  });
}

// ─── User management (admin) ─────────────────────────────────────────────────

export async function fbGetAllUsers() {
  const db = getFirebaseDB();
  const snap = await getDocs(collection(db, COLLECTIONS.users));
  return snap.docs.map(d => {
    const data = d.data();
    return { uid: d.id, ...data };
  });
}

export async function fbUpdateUserProfile(uid, updates) {
  const db = getFirebaseDB();
  await updateDoc(doc(db, COLLECTIONS.users, uid), {
    ...updates,
    UpdatedAt: new Date().toISOString(),
    _updatedAt: serverTimestamp(),
  });
  return { success: true, uid };
}

export async function fbGetUserProfile(uid) {
  return getUserProfile(uid);
}

export async function fbAdminUpdateUserPassword(email, currentPassword, newPassword) {
  try {
    const apps = getApps();
    if (apps.length === 0) throw new Error('Primary Firebase App not initialized.');
    const config = apps[0].options;
    const tempAppName = `tempApp_update_${Date.now()}`;
    const tempApp = initializeApp(config, tempAppName);
    const tempAuth = getFirebaseAuthInstance(tempApp);

    // Sign in as the target user using their current password
    await signInWithEmailAndPassword(tempAuth, email, currentPassword);
    
    // Update their password in Firebase Auth
    if (tempAuth.currentUser) {
      await updatePassword(tempAuth.currentUser, newPassword);
    } else {
      throw new Error('Authentication failed or user session not established.');
    }

    try {
      await tempApp.delete();
    } catch (e) {
      console.warn('[Firebase] Temp App cleanup failed:', e);
    }
    return { success: true };
  } catch (err) {
    const map = {
      'auth/wrong-password': 'Current password stored in Firestore is incorrect.',
      'auth/weak-password': 'New password must be at least 6 characters.',
    };
    return { success: false, message: map[err.code] || err.message };
  }
}

export { fbReclaimOrphanedUserData };

