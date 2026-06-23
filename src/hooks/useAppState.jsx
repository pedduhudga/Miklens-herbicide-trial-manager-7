import React, { createContext, useContext, useReducer, useEffect, useCallback, useRef, useState, useMemo } from 'react';
import { initFirebase } from '../services/firebase.js';
import { saveOfflineData, loadOfflineData, saveOfflinePhoto, loadOfflinePhoto, saveSyncQueueOffline, loadSyncQueueOffline } from '../services/offlineStorage.js';
import { fbGetUserSettings } from '../services/firebaseDB.js';

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

// ================================================================
// SPLIT CONTEXTS - Each context only re-renders when its value changes
// ================================================================

// Core context for dispatch, updateState, getAppState (rarely changes)
const AppCoreContext = createContext();

// Data contexts - each only re-renders when specific data changes
const AuthContext = createContext();
const TrialsContext = createContext();
const ProjectsContext = createContext();
const FormulationsContext = createContext();
const IngredientsContext = createContext();
const BlocksContext = createContext();
const SettingsContext = createContext();
const SyncQueueContext = createContext();
const FilterStateContext = createContext();
const CategoryContext = createContext();
const PageContext = createContext();
const LoadedContext = createContext();

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
      saveSyncQueueOffline(action.payload);
      localStorage.setItem('syncQueue', JSON.stringify(action.payload));
      return { ...state, syncQueue: action.payload };
    case 'ADD_SYNC_ITEM': {
      const newQueue = [...state.syncQueue, action.payload];
      saveSyncQueueOffline(newQueue);
      localStorage.setItem('syncQueue', JSON.stringify(newQueue));
      return { ...state, syncQueue: newQueue };
    }
    default:
      return state;
  }
}

// Helper component that re-renders only when specific state slices change
function StateProvider({ children, state }) {
  // Memoize each context value - only creates new object when that specific slice changes
  const coreValue = useMemo(() => ({
    dispatch: state._dispatch,
    updateState: state._updateState,
    updateSettings: state._updateSettings,
    getAppState: state._getAppState
  }), [state._dispatch, state._updateState, state._updateSettings, state._getAppState]);

  const authValue = useMemo(() => state.auth, [state.auth]);
  const trialsValue = useMemo(() => state.trials, [state.trials]);
  const projectsValue = useMemo(() => state.projects, [state.projects]);
  const formulationsValue = useMemo(() => state.formulations, [state.formulations]);
  const ingredientsValue = useMemo(() => state.ingredients, [state.ingredients]);
  const blocksValue = useMemo(() => state.blocks, [state.blocks]);
  const settingsValue = useMemo(() => state.settings, [state.settings]);
  const syncQueueValue = useMemo(() => state.syncQueue, [state.syncQueue]);
  const filterStateValue = useMemo(() => state.filterState, [state.filterState]);
  const categoryValue = useMemo(() => state.activeCategory, [state.activeCategory]);
  const pageValue = useMemo(() => state.currentPage, [state.currentPage]);
  const loadedValue = useMemo(() => state.hasLoadedInitialData, [state.hasLoadedInitialData]);

  return (
    <AppCoreContext.Provider value={coreValue}>
      <AuthContext.Provider value={authValue}>
        <TrialsContext.Provider value={trialsValue}>
          <ProjectsContext.Provider value={projectsValue}>
            <FormulationsContext.Provider value={formulationsValue}>
              <IngredientsContext.Provider value={ingredientsValue}>
                <BlocksContext.Provider value={blocksValue}>
                  <SettingsContext.Provider value={settingsValue}>
                    <SyncQueueContext.Provider value={syncQueueValue}>
                      <FilterStateContext.Provider value={filterStateValue}>
                        <CategoryContext.Provider value={categoryValue}>
                          <PageContext.Provider value={pageValue}>
                            <LoadedContext.Provider value={loadedValue}>
                              {children}
                            </LoadedContext.Provider>
                          </PageContext.Provider>
                        </CategoryContext.Provider>
                      </FilterStateContext.Provider>
                    </SyncQueueContext.Provider>
                  </SettingsContext.Provider>
                </BlocksContext.Provider>
              </IngredientsContext.Provider>
            </FormulationsContext.Provider>
          </ProjectsContext.Provider>
        </TrialsContext.Provider>
      </AuthContext.Provider>
    </AppCoreContext.Provider>
  );
}

// Custom hooks for each context slice - components can import only what they need
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within AppStateProvider');
  }
  return context;
}

export function useTrials() {
  const context = useContext(TrialsContext);
  if (context === undefined) {
    throw new Error('useTrials must be used within AppStateProvider');
  }
  return context;
}

export function useProjects() {
  const context = useContext(ProjectsContext);
  if (context === undefined) {
    throw new Error('useProjects must be used within AppStateProvider');
  }
  return context;
}

export function useFormulations() {
  const context = useContext(FormulationsContext);
  if (context === undefined) {
    throw new Error('useFormulations must be used within AppStateProvider');
  }
  return context;
}

export function useIngredients() {
  const context = useContext(IngredientsContext);
  if (context === undefined) {
    throw new Error('useIngredients must be used within AppStateProvider');
  }
  return context;
}

export function useBlocks() {
  const context = useContext(BlocksContext);
  if (context === undefined) {
    throw new Error('useBlocks must be used within AppStateProvider');
  }
  return context;
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within AppStateProvider');
  }
  return context;
}

export function useSyncQueue() {
  const context = useContext(SyncQueueContext);
  if (context === undefined) {
    throw new Error('useSyncQueue must be used within AppStateProvider');
  }
  return context;
}

export function useFilterState() {
  const context = useContext(FilterStateContext);
  if (context === undefined) {
    throw new Error('useFilterState must be used within AppStateProvider');
  }
  return context;
}

export function useActiveCategory() {
  const context = useContext(CategoryContext);
  if (context === undefined) {
    throw new Error('useActiveCategory must be used within AppStateProvider');
  }
  return context;
}

export function useCurrentPage() {
  const context = useContext(PageContext);
  if (context === undefined) {
    throw new Error('useCurrentPage must be used within AppStateProvider');
  }
  return context;
}

export function useHasLoadedInitialData() {
  const context = useContext(LoadedContext);
  if (context === undefined) {
    throw new Error('useHasLoadedInitialData must be used within AppStateProvider');
  }
  return context;
}

// Core app methods (dispatch, etc)
export function useAppCore() {
  const context = useContext(AppCoreContext);
  if (context === undefined) {
    throw new Error('useAppCore must be used within AppStateProvider');
  }
  return context;
}

// Legacy hook - provides full state and methods (for backward compatibility)
// NOTE: Components using this will re-render on ANY state change
// Prefer using individual hooks above for better performance
export function useAppState() {
  const core = useContext(AppCoreContext);
  const auth = useContext(AuthContext);
  const trials = useContext(TrialsContext);
  const projects = useContext(ProjectsContext);
  const formulations = useContext(FormulationsContext);
  const ingredients = useContext(IngredientsContext);
  const blocks = useContext(BlocksContext);
  const settings = useContext(SettingsContext);
  const syncQueue = useContext(SyncQueueContext);
  const filterState = useContext(FilterStateContext);
  const activeCategory = useContext(CategoryContext);
  const currentPage = useContext(PageContext);
  const hasLoadedInitialData = useContext(LoadedContext);

  if (core === undefined) {
    throw new Error('useAppState must be used within an AppStateProvider');
  }

  return {
    state: {
      auth,
      trials,
      projects,
      formulations,
      ingredients,
      blocks,
      settings,
      syncQueue,
      filterState,
      activeCategory,
      currentPage,
      hasLoadedInitialData
    },
    ...core
  };
}

export function AppStateProvider({ children }) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const [isHydrated, setIsHydrated] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Wrap dispatch to include in state for providers
  const wrappedDispatch = useCallback((action) => {
    dispatch(action);
  }, []);

  const wrappedUpdateState = useCallback((payload) => {
    dispatch({ type: 'SET_STATE', payload });
  }, []);

  const wrappedUpdateSettings = useCallback((payload) => {
    dispatch({ type: 'UPDATE_SETTINGS', payload });
  }, []);

  const wrappedGetAppState = useCallback(() => stateRef.current, []);

  // Pre-process state for providers
  const processedState = useMemo(() => ({
    _dispatch: wrappedDispatch,
    _updateState: wrappedUpdateState,
    _updateSettings: wrappedUpdateSettings,
    _getAppState: wrappedGetAppState,
    auth: state.auth,
    trials: state.trials,
    projects: state.projects,
    formulations: state.formulations,
    ingredients: state.ingredients,
    blocks: state.blocks,
    settings: state.settings,
    syncQueue: state.syncQueue,
    filterState: state.filterState,
    activeCategory: state.activeCategory,
    currentPage: state.currentPage,
    hasLoadedInitialData: state.hasLoadedInitialData
  }), [wrappedDispatch, wrappedUpdateState, wrappedUpdateSettings, wrappedGetAppState, 
      state.auth, state.trials, state.projects, state.formulations, state.ingredients, 
      state.blocks, state.settings, state.syncQueue, state.filterState, 
      state.activeCategory, state.currentPage, state.hasLoadedInitialData]);

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

      loadSyncQueueOffline().then(savedSyncQueue => {
        if (savedSyncQueue && savedSyncQueue.length > 0) {
          dispatch({ type: 'SET_STATE', payload: { syncQueue: savedSyncQueue } });
        } else {
          const savedSyncQueueLS = localStorage.getItem('syncQueue');
          if (savedSyncQueueLS) {
            dispatch({ type: 'SET_STATE', payload: { syncQueue: JSON.parse(savedSyncQueueLS) } });
          }
        }
      }).catch(err => console.error('Failed to load sync queue from IndexedDB:', err));

      const savedAuth = localStorage.getItem('appAuth');
      if (savedAuth) {
        const parsedAuth = JSON.parse(savedAuth);
        dispatch({ type: 'SET_STATE', payload: { auth: parsedAuth } });
        
        // Proactively fetch global/user settings from Firestore if Firebase Auth is active
        const uid = parsedAuth.uid || parsedAuth.user?.uid || parsedAuth.user?.ID;
        if (uid && parsedAuth.authProvider === 'firebase') {
          (async () => {
            try {
              const fbSettings = await fbGetUserSettings(uid);
              if (fbSettings) {
                // Merge Firestore settings over localStorage settings
                dispatch({ 
                  type: 'UPDATE_SETTINGS', 
                  payload: {
                    ...fbSettings,
                    firebaseEnabled: true, // Safeguard config
                    firebaseConfig: parsedAuth.firebaseConfig || (savedSettings ? JSON.parse(savedSettings).firebaseConfig : null) // Preserve auth config
                  } 
                });
                console.log('[Firestore] User settings synchronized successfully.');
              }
            } catch (err) {
              console.warn('[Firestore] Failed to synchronize settings:', err.message);
            }
          })();
        }
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
        setIsHydrated(true);
      }).catch(err => {
        console.warn('Offline cache load failed:', err);
        setIsHydrated(true);
      });
    } catch (e) {
      console.error('Failed to parse local storage data', e);
    }
  }, []);

  // Auto-persist datasets to IndexedDB when they change in state
  useEffect(() => {
    if (!isHydrated) return;
    if (state.trials) {
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
  }, [isHydrated, state.trials]);

  useEffect(() => {
    if (!isHydrated) return;
    saveOfflineData('projects', state.projects || []);
  }, [isHydrated, state.projects]);

  useEffect(() => {
    if (!isHydrated) return;
    saveOfflineData('formulations', state.formulations || []);
  }, [isHydrated, state.formulations]);

  useEffect(() => {
    if (!isHydrated) return;
    saveOfflineData('ingredients', state.ingredients || []);
  }, [isHydrated, state.ingredients]);

  useEffect(() => {
    if (!isHydrated) return;
    saveOfflineData('blocks', state.blocks || []);
  }, [isHydrated, state.blocks]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.getAppState = wrappedGetAppState;
      window.updateState = wrappedUpdateState;
    }
  }, [wrappedGetAppState, wrappedUpdateState]);

  return (
    <StateProvider state={processedState}>
      {children}
    </StateProvider>
  );
}