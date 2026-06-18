import React, { createContext, useContext, useReducer, useEffect, useCallback, useRef } from 'react';
import { initFirebase, isFirebaseReady } from '../services/firebase.js';
import { saveOfflineData, loadOfflineData, saveOfflinePhoto, loadOfflinePhoto } from '../services/offlineStorage.js';

function safeJsonParse(val, fallback = []) {
  if (!val) return fallback;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return fallback; }
}

const initialState = {
  auth: {
    user: null,
    token: null
  },
  currentPage: 'dashboard',
  ingredients: [],
  formulations: [],
  trials: [],
  organisations: [],
  projects: [],
  blocks: [],
  selectedTrials: [],
  photoQueue: [],
  croppedPhotosData: [],
  photoDeletionRequested: false,
  currentTrialIdForCamera: null,
  cameraMode: 'general',
  aiChatHistory: [],
  aiChatSessions: [],
  currentAiChatSessionId: null,
  aiAttachedImage: { fileData: null, mimeType: null },
  settings: {
    apiKeys: [],
    currentApiKeyIndex: 0,
    scriptUrl: '',
    sheetId: '',
    folderId: '',
    autoAnalyzePhotos: true,
    openWeatherMapKey: '',
    agAnalyticsKey: '',
    qrCodeFields: { FormulationName: true, InvestigatorName: true, Date: true, Dosage: true, Location: false, Result: false, WeedSpecies: false, Weather: false },
    qrOnlineFields: { showFormulationName: true, showInvestigator: true, showDate: true, showLocation: true, showDosage: true, showWeedSpecies: true, showResult: true, showReplication: false, showWeather: true, showIngredients: false, showObservations: false, showAISummary: false, showConclusion: true, showPhotos: true },
    // ── Firebase ────────────────────────────────────────────────────────────
    firebaseEnabled: false,
    firebaseConfig: {
      apiKey: '',
      authDomain: '',
      projectId: '',
      storageBucket: '',
      messagingSenderId: '',
      appId: '',
    },
    // ── Google Sheet mirror (Plan B) ─────────────────────────────────────────
    sheetMirrorEnabled: false,
  },
  charts: {},
  efficacyDataForModal: [],
  bulkAnalysisState: {
    isRunning: false,
    isPaused: false,
    lastProcessedIndex: -1,
    trialsToProcess: [],
    totalToProcess: 0
  },
  backgroundQueue: new Map(),
  syncQueue: [],
  aiQueue: [],
  isAiQueueRunning: false,
  filterState: {
    search: '',
    formulationText: '',
    formulation: '',
    startDate: '',
    endDate: '',
    sortBy: 'date'
  },
  userAdminFilters: {
    search: '',
    role: 'all',
    status: 'all',
    sortBy: 'updated-desc'
  },
  userAdminTestResults: {},
  pendingUserBackupImportUserId: null,
  users: [],
  hasLoadedInitialData: false,
  activeCategory: 'herbicide', // Current trial category
};

const AppStateContext = createContext();

function appReducer(state, action) {
  switch (action.type) {
    case 'SET_STATE':
      return { ...state, ...action.payload };
    case 'UPDATE_SETTINGS': {
      const newSettings = { ...state.settings, ...action.payload };
      localStorage.setItem('appSettings', JSON.stringify(newSettings));
      return { ...state, settings: newSettings };
    }
    case 'RESET_SETTINGS': {
      localStorage.removeItem('appSettings');
      localStorage.removeItem('appAuth');
      const emptySettings = {
        scriptUrl: '',
        sheetId: '',
        folderId: '',
        firebaseEnabled: false,
        firebaseConfig: {
          apiKey: '',
          authDomain: '',
          projectId: '',
          storageBucket: '',
          messagingSenderId: '',
          appId: '',
        },
        sheetMirrorEnabled: false,
      };
      return {
        ...state,
        settings: emptySettings,
        auth: { user: null, token: null },
        hasLoadedInitialData: false
      };
    }
    case 'SET_AUTH': {
      const authState = { ...state.auth, ...action.payload };
      localStorage.setItem('appAuth', JSON.stringify(authState));
      return { ...state, auth: authState };
    }
    case 'LOGOUT':
      localStorage.removeItem('appAuth');
      return { ...state, auth: { user: null, token: null }, hasLoadedInitialData: false };
    case 'SET_CATEGORY': {
      localStorage.setItem('activeCategory', action.payload);
      return { ...state, activeCategory: action.payload };
    }
    case 'SET_SYNC_QUEUE':
      localStorage.setItem('syncQueue', JSON.stringify(action.payload));
      return { ...state, syncQueue: action.payload };
    case 'ADD_SYNC_ITEM': {
      const newQueue = [...state.syncQueue, action.payload];
      localStorage.setItem('syncQueue', JSON.stringify(newQueue));
      return { ...state, syncQueue: newQueue };
    }
    default:
      return state;
  }
}

export function AppStateProvider({ children }) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    try {
      const savedSettings = localStorage.getItem('appSettings');
      if (savedSettings) {
        const parsed = JSON.parse(savedSettings);
        dispatch({ type: 'SET_STATE', payload: { settings: parsed } });
        // Auto-initialize Firebase if config is saved and enabled
        if (parsed.firebaseEnabled && parsed.firebaseConfig?.apiKey && parsed.firebaseConfig?.projectId) {
          try {
            initFirebase(parsed.firebaseConfig);
            console.log('[Firebase] Auto-initialized from saved settings.');
          } catch (fbErr) {
            console.error('[Firebase] Auto-init failed:', fbErr.message);
          }
        }
      } else {
        // NO LOCAL SETTINGS: Auto-initialize using environment variables if present
        const envApiKey = import.meta.env.VITE_FIREBASE_API_KEY;
        const envProjectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
        if (envApiKey && envProjectId) {
          const defaultSettings = {
            ...initialState.settings,
            firebaseEnabled: true,
            firebaseConfig: {
              apiKey: envApiKey,
              authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || `${envProjectId}.firebaseapp.com`,
              projectId: envProjectId,
              storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || `${envProjectId}.appspot.com`,
              messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
              appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
            },
            folderId: '14UTh_QWhCRoaQ0JvfKeg7LZvOGZRF_rT',
            sheetMirrorEnabled: true
          };
          localStorage.setItem('appSettings', JSON.stringify(defaultSettings));
          dispatch({ type: 'SET_STATE', payload: { settings: defaultSettings } });
          try {
            initFirebase(defaultSettings.firebaseConfig);
            console.log('[Firebase] Auto-initialized from Environment Variables.');
          } catch (fbErr) {
            console.error('[Firebase] Auto-init from Env failed:', fbErr.message);
          }
        }
      }

      const savedSyncQueue = localStorage.getItem('syncQueue');
      if (savedSyncQueue) {
        dispatch({ type: 'SET_STATE', payload: { syncQueue: JSON.parse(savedSyncQueue) } });
      }

      const savedAuth = localStorage.getItem('appAuth');
      if (savedAuth) {
        dispatch({ type: 'SET_STATE', payload: { auth: JSON.parse(savedAuth) } });
      }

      const savedCategory = localStorage.getItem('activeCategory');
      if (savedCategory) {
        dispatch({ type: 'SET_STATE', payload: { activeCategory: savedCategory } });
      }

      // Load cached datasets from IndexedDB
      Promise.all([
        loadOfflineData('trials'),
        loadOfflineData('projects'),
        loadOfflineData('formulations'),
        loadOfflineData('ingredients'),
        loadOfflineData('blocks')
      ]).then(async ([trials, projects, formulations, ingredients, blocks]) => {
        const payload = {};
        if (trials?.length) {
          // Rehydrate trials with cached photos
          const rehydratedTrials = await Promise.all(trials.map(async t => {
            if (t.PhotoURLs) {
              const photos = safeJsonParse(t.PhotoURLs, []);
              const rehydratedPhotos = await Promise.all(photos.map(async (p, idx) => {
                const src = typeof p === 'string' ? p : (p.fileData || p.url || p.src);
                if (src && src.startsWith('local-photo-id:')) {
                  const photoKey = src.substring('local-photo-id:'.length);
                  const cachedBase64 = await loadOfflinePhoto(photoKey);
                  if (cachedBase64) {
                    if (typeof p === 'string') return cachedBase64;
                    if (p.fileData) return { ...p, fileData: cachedBase64 };
                    if (p.url) return { ...p, url: cachedBase64 };
                    return { ...p, src: cachedBase64 };
                  }
                }
                return p;
              }));
              return { ...t, PhotoURLs: JSON.stringify(rehydratedPhotos) };
            }
            return t;
          }));
          payload.trials = rehydratedTrials;
        }
        if (projects?.length) payload.projects = projects;
        if (formulations?.length) payload.formulations = formulations;
        if (ingredients?.length) payload.ingredients = ingredients;
        if (blocks?.length) payload.blocks = blocks;
        if (Object.keys(payload).length > 0) {
          dispatch({ type: 'SET_STATE', payload });
        }
      }).catch(err => console.warn('Offline cache load failed:', err));
    } catch (e) {
      console.error('Failed to parse local storage data', e);
    }
  }, []);

  // Auto-persist datasets to IndexedDB when they change in state
  useEffect(() => {
    if (state.trials && state.trials.length > 0) {
      const processAndSaveTrialsOffline = async () => {
        const cleanTrials = await Promise.all(state.trials.map(async t => {
          if (!t.PhotoURLs) return t;
          const photos = safeJsonParse(t.PhotoURLs, []);
          let changed = false;
          const processedPhotos = await Promise.all(photos.map(async (p, idx) => {
            const src = typeof p === 'string' ? p : (p.fileData || p.url || p.src);
            if (src && src.startsWith('data:image/')) {
              const photoKey = `${t.ID}_${idx}`;
              await saveOfflinePhoto(photoKey, src);
              changed = true;
              const refString = `local-photo-id:${photoKey}`;
              if (typeof p === 'string') return refString;
              if (p.fileData) return { ...p, fileData: refString };
              if (p.url) return { ...p, url: refString };
              return { ...p, src: refString };
            }
            return p;
          }));
          return changed ? { ...t, PhotoURLs: JSON.stringify(processedPhotos) } : t;
        }));
        await saveOfflineData('trials', cleanTrials);
      };
      processAndSaveTrialsOffline().catch(err => console.error('Failed to save trials offline:', err));
    }
  }, [state.trials]);

  useEffect(() => {
    if (state.projects && state.projects.length > 0) {
      saveOfflineData('projects', state.projects);
    }
  }, [state.projects]);

  useEffect(() => {
    if (state.formulations && state.formulations.length > 0) {
      saveOfflineData('formulations', state.formulations);
    }
  }, [state.formulations]);

  useEffect(() => {
    if (state.ingredients && state.ingredients.length > 0) {
      saveOfflineData('ingredients', state.ingredients);
    }
  }, [state.ingredients]);

  useEffect(() => {
    if (state.blocks && state.blocks.length > 0) {
      saveOfflineData('blocks', state.blocks);
    }
  }, [state.blocks]);

  const updateState = useCallback((payload) => {
    dispatch({ type: 'SET_STATE', payload });
  }, []);

  const updateSettings = useCallback((payload) => {
    dispatch({ type: 'UPDATE_SETTINGS', payload });
  }, []);

  const getAppState = useCallback(() => stateRef.current, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.getAppState = getAppState;
      window.updateState = updateState;
    }
  }, [getAppState, updateState]);

  const value = {
    state,
    dispatch,
    updateState,
    updateSettings,
    getAppState
  };

  return (
    <AppStateContext.Provider value={value}>
      {children}
    </AppStateContext.Provider>
  );
}

export function useAppState() {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error('useAppState must be used within an AppStateProvider');
  }
  return context;
}
