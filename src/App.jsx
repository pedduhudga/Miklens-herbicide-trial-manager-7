import React, { useEffect, useState, lazy, Suspense } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AppStateProvider } from './hooks/useAppState.jsx';
import Sidebar from './components/Sidebar.jsx';
import BottomNav from './components/BottomNav.jsx';
import Toast from './components/Toast.jsx';
import LoadingOverlay from './components/LoadingOverlay.jsx';
import ConflictResolverModal from './components/ConflictResolverModal.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import PermissionGuard from './components/PermissionGuard.jsx';
import PWAStatus from './components/PWAStatus.jsx';
import { useAuth } from './hooks/useAuth.js';
import { useAppState } from './hooks/useAppState.jsx';
import { useSync } from './hooks/useSync.js';
import { getAllData } from './services/dataLayer.js';
import { initAI } from './services/ai.js';
import { getCategoryConfig } from './utils/categoryConfig.js';

// A safe wrapper around React.lazy that catches chunk load errors (e.g. from app updates)
// and triggers a full page reload to fetch the latest assets from the server.
function safeLazy(importFn) {
  return lazy(() => {
    return importFn().catch(error => {
      console.error('[safeLazy] Failed to load chunk:', error);
      const errorMsg = error?.message || '';
      const isChunkError = 
        error.name === 'ChunkLoadError' || 
        /failed to fetch dynamically imported module/i.test(errorMsg) ||
        /loading chunk/i.test(errorMsg);
        
      if (isChunkError) {
        const reloadKey = 'chunk_reload_attempts';
        const attempts = parseInt(sessionStorage.getItem(reloadKey) || '0', 10);
        if (attempts < 2) {
          sessionStorage.setItem(reloadKey, String(attempts + 1));
          window.location.reload();
          // Return a pending promise so the UI stays in loading state while reloading
          return new Promise(() => {});
        }
      }
      throw error;
    });
  });
}

// Lazy-loaded page components for code splitting - enables route-based code splitting
// Each page is loaded on-demand when the user navigates to that route
const Dashboard = safeLazy(() => import('./pages/Dashboard.jsx'));
const PlotScanner = safeLazy(() => import('./pages/PlotScanner.jsx'));
const DataManagement = safeLazy(() => import('./pages/DataManagement.jsx'));
const Settings = safeLazy(() => import('./pages/Settings.jsx'));
const UserManagement = safeLazy(() => import('./pages/UserManagement.jsx'));
const AIAssistant = safeLazy(() => import('./pages/AIAssistant.jsx'));
const SmartSearch = safeLazy(() => import('./pages/SmartSearch.jsx'));
const Analytics = safeLazy(() => import('./pages/Analytics.jsx'));
const Reports = safeLazy(() => import('./pages/Reports.jsx'));
const Statistics = safeLazy(() => import('./pages/Statistics.jsx'));
const Alerts = safeLazy(() => import('./pages/Alerts.jsx'));
const DoseResponse = safeLazy(() => import('./pages/DoseResponse.jsx'));
const ResistanceTracker = safeLazy(() => import('./pages/ResistanceTracker.jsx'));
const FieldMap = safeLazy(() => import('./pages/FieldMap.jsx'));
const Trials = safeLazy(() => import('./pages/Trials.jsx'));
const Projects = safeLazy(() => import('./pages/Projects.jsx'));
const LargeScaleTrials = safeLazy(() => import('./pages/LargeScaleTrials.jsx'));
const Ingredients = safeLazy(() => import('./pages/Ingredients.jsx'));
const Organisations = safeLazy(() => import('./pages/Organisations.jsx'));
const Formulations = safeLazy(() => import('./pages/Formulations.jsx'));
const CompareTrials = safeLazy(() => import('./pages/CompareTrials.jsx'));
const CategorySelector = safeLazy(() => import('./pages/CategorySelector.jsx'));
const Setup = safeLazy(() => import('./pages/Setup.jsx'));
const Login = safeLazy(() => import('./pages/Login.jsx'));
const MigrationTool = safeLazy(() => import('./pages/MigrationTool.jsx'));
const LiveTrialPage = safeLazy(() => import('./pages/LiveTrialPage.jsx'));

// Import skeleton loaders for better UX
import { 
  DashboardSkeleton, 
  TrialsSkeleton, 
  AnalyticsSkeleton, 
  ReportsSkeleton, 
  AIAssistantSkeleton 
} from './components/SkeletonLoaders.jsx';

// Loading fallback component for Suspense - shown while lazy-loaded chunks are fetched
function PageLoader() {
  return (
    <div className="flex items-center justify-center h-full min-h-[400px]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
        <span className="text-slate-500 text-sm">Loading...</span>
      </div>
    </div>
  );
}

// Specific skeleton fallbacks for major pages
function DashboardLoader() {
  return <DashboardSkeleton />;
}

function TrialsLoader() {
  return <TrialsSkeleton />;
}

function AnalyticsLoader() {
  return <AnalyticsSkeleton />;
}

function ReportsLoader() {
  return <ReportsSkeleton />;
}

function AILoader() {
  return <AIAssistantSkeleton />;
}

function AppLayout() {
  const location = useLocation(); // Subscribe to location changes to force update of nested routes
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const toggleSidebar = () => setSidebarOpen(!sidebarOpen);

  const { state, updateState, getAppState } = useAppState();
  const { isAuthenticated, isViewer, isAdmin, user } = useAuth();

  const handleResolveConflict = (resolvedItem) => {
    updateState({
      trials: state.trials.map(t => String(t.ID) === String(resolvedItem.ID) ? resolvedItem : t)
    });
    const syncItem = state.activeConflict?.syncItem;
    if (syncItem) {
      const updatedQueue = state.syncQueue.map(item => {
        if (item.id === syncItem.id) {
          return {
            ...item,
            status: 'pending',
            attempts: 0,
            payload: {
              ...item.payload,
              EfficacyDataJSON: resolvedItem.EfficacyDataJSON,
              IsLive: resolvedItem.IsLive
            }
          };
        }
        return item;
      });
      updateState({ syncQueue: updatedQueue });
      localStorage.setItem('syncQueue', JSON.stringify(updatedQueue));
    }
    updateState({ activeConflict: null });
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('app:sync-status-update'));
    }, 100);
  };

  // Mount the sync loop hook
  useSync();

  const firebaseEnabled = !!state.settings?.firebaseEnabled;
  const isConfigured = firebaseEnabled
    ? (!!state.settings?.firebaseConfig?.apiKey && !!state.settings?.firebaseConfig?.projectId)
    : (!!state.settings?.scriptUrl && !!state.settings?.sheetId && !!state.settings?.folderId);
  const hasLoadedData = state.hasLoadedInitialData;
  const hasCredentials = firebaseEnabled
    ? !!state.auth?.uid
    : (!!state.auth?.username && !!state.auth?.password);

  useEffect(() => {
    if (!isAuthenticated) {
      if (hasLoadedData) {
        updateState({ hasLoadedInitialData: false });
      }
      return;
    }

    if (!isConfigured || hasLoadedData || !hasCredentials) return;

    let cancelled = false;
    const loadAppData = async () => {
      window.dispatchEvent(new CustomEvent('app:loading', { detail: { show: true } }));

      // Initialize AI Service
      initAI(getAppState);

      try {
        const result = await getAllData({}, getAppState);

        if (cancelled) return;

        if (result && result._errType) {
          window.dispatchEvent(new CustomEvent('app:toast', {
            detail: { msg: `Failed to load data: ${result.message || result._errType}`, type: 'error' }
          }));
          return;
        }

        updateState({
          trials: Array.isArray(result?.trials) ? result.trials : [],
          projects: Array.isArray(result?.projects) ? result.projects : [],
          formulations: Array.isArray(result?.formulations) ? result.formulations : [],
          ingredients: Array.isArray(result?.ingredients) ? result.ingredients : [],
          organisations: Array.isArray(result?.organisations) ? result.organisations : [],
          blocks: Array.isArray(result?.blocks) ? result.blocks : [],
          hasLoadedInitialData: true
        });
      } catch (error) {
        if (!cancelled) {
          const source = firebaseEnabled ? 'Firebase' : 'Google Sheet';
          window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: `Failed to load ${source} data: ${error?.message || 'Unknown error'}`, type: 'error' } }));
        }
      } finally {
        if (!cancelled) {
          window.dispatchEvent(new CustomEvent('app:loading', { detail: { show: false } }));
        }
      }
    };

    loadAppData();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isConfigured, hasLoadedData, hasCredentials, updateState, getAppState]);

  // ── Reload data when category changes ────────────────────────────────────
  const activeCategory = state.activeCategory || 'herbicide';
  const prevCategoryRef = React.useRef(activeCategory);

  useEffect(() => {
    if (!isAuthenticated || !isConfigured || !hasCredentials) return;
    if (prevCategoryRef.current === activeCategory) return;
    prevCategoryRef.current = activeCategory;

    let cancelled = false;
    const reloadForCategory = async () => {
      window.dispatchEvent(new CustomEvent('app:loading', { detail: { show: true } }));
      try {
        const result = await getAllData({}, getAppState);
        if (cancelled) return;
        if (result && result._errType) return;
        updateState({
          trials: Array.isArray(result?.trials) ? result.trials : [],
          projects: Array.isArray(result?.projects) ? result.projects : [],
          formulations: Array.isArray(result?.formulations) ? result.formulations : [],
          ingredients: Array.isArray(result?.ingredients) ? result.ingredients : [],
          organisations: Array.isArray(result?.organisations) ? result.organisations : [],
          blocks: Array.isArray(result?.blocks) ? result.blocks : [],
        });
      } catch (error) {
        console.error('Category reload failed:', error);
      } finally {
        if (!cancelled) {
          window.dispatchEvent(new CustomEvent('app:loading', { detail: { show: false } }));
        }
      }
    };
    reloadForCategory();
    return () => { cancelled = true; };
  }, [activeCategory, isAuthenticated, isConfigured, hasCredentials, updateState, getAppState]);

  // ── Category-specific Dynamic Theme Synchronization ─────────────────────
  useEffect(() => {
    const config = getCategoryConfig(activeCategory);
    if (config && config.color) {
      const root = document.documentElement;
      root.style.setProperty('--primary-color', config.color.hex);
      root.style.setProperty('--primary-light', config.color.hexLight);
      
      const hovers = {
        herbicide: '#047857',
        fungicide: '#4338ca',
        pesticide: '#b91c1c',
        nutrition: '#b45309',
        biostimulant: '#0f766e'
      };
      root.style.setProperty('--primary-hover-color', hovers[activeCategory] || config.color.hex);

      // Category-specific radial gradient values for body background
      const gradients = {
        herbicide: [
          'hsla(160, 100%, 96%, 1)',
          'hsla(190, 100%, 96%, 1)',
          'hsla(160, 100%, 96%, 1)',
          'hsla(210, 100%, 96%, 1)'
        ],
        fungicide: [
          'hsla(240, 100%, 96%, 1)',
          'hsla(280, 100%, 96%, 1)',
          'hsla(240, 100%, 96%, 1)',
          'hsla(220, 100%, 96%, 1)'
        ],
        pesticide: [
          'hsla(0, 100%, 96%, 1)',
          'hsla(25, 100%, 96%, 1)',
          'hsla(0, 100%, 96%, 1)',
          'hsla(15, 100%, 96%, 1)'
        ],
        nutrition: [
          'hsla(35, 100%, 96%, 1)',
          'hsla(48, 100%, 96%, 1)',
          'hsla(35, 100%, 96%, 1)',
          'hsla(20, 100%, 96%, 1)'
        ],
        biostimulant: [
          'hsla(170, 100%, 96%, 1)',
          'hsla(195, 100%, 96%, 1)',
          'hsla(170, 100%, 96%, 1)',
          'hsla(185, 100%, 96%, 1)'
        ]
      };
      const gradColors = gradients[activeCategory] || gradients.herbicide;
      root.style.setProperty('--bg-gradient-1', gradColors[0]);
      root.style.setProperty('--bg-gradient-2', gradColors[1]);
      root.style.setProperty('--bg-gradient-3', gradColors[2]);
      root.style.setProperty('--bg-gradient-4', gradColors[3]);
    }
  }, [activeCategory]);

  if (!isConfigured) {
    return (
      <Suspense fallback={<PageLoader />}>
        <Setup />
      </Suspense>
    );
  }

  if (!isAuthenticated) {
    return (
      <Suspense fallback={<PageLoader />}>
        <Login />
      </Suspense>
    );
  }

  return (
    <div className="flex h-screen h-[100dvh] bg-slate-100 font-sans pt-[env(safe-area-inset-top)]">

      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-transparent md:pb-0">
        <Routes>
          <Route path="/categories" element={
            <ErrorBoundary inline>
              <PermissionGuard tabName="All Categories" onMenuClick={toggleSidebar}>
                <Suspense fallback={<PageLoader />}>
                  <CategorySelector />
                </Suspense>
              </PermissionGuard>
            </ErrorBoundary>
          } />
          <Route path="/" element={
            <ErrorBoundary inline>
              <PermissionGuard tabName="Dashboard" onMenuClick={toggleSidebar}>
                <Suspense fallback={<DashboardLoader />}>
                  <Dashboard onMenuClick={toggleSidebar} />
                </Suspense>
              </PermissionGuard>
            </ErrorBoundary>
          } />
          <Route path="/large-scale-trials" element={
            <ErrorBoundary inline>
              <PermissionGuard tabName="Large Field Trials" onMenuClick={toggleSidebar}>
                <Suspense fallback={<PageLoader />}>
                  <LargeScaleTrials onMenuClick={toggleSidebar} />
                </Suspense>
              </PermissionGuard>
            </ErrorBoundary>
          } />
          <Route path="/projects" element={
            <ErrorBoundary inline>
              <PermissionGuard tabName="Projects (Grouped)" onMenuClick={toggleSidebar}>
                <Suspense fallback={<PageLoader />}>
                  <Projects onMenuClick={toggleSidebar} />
                </Suspense>
              </PermissionGuard>
            </ErrorBoundary>
          } />
          <Route path="/scanner" element={
            <ErrorBoundary inline>
              <PermissionGuard tabName="Plot Scanner" onMenuClick={toggleSidebar}>
                <Suspense fallback={<PageLoader />}>
                  <PlotScanner onMenuClick={toggleSidebar} />
                </Suspense>
              </PermissionGuard>
            </ErrorBoundary>
          } />
          <Route path="/formulations" element={
            <ErrorBoundary inline>
              <PermissionGuard tabName="Formulations" onMenuClick={toggleSidebar}>
                <Suspense fallback={<PageLoader />}>
                  <Formulations onMenuClick={toggleSidebar} />
                </Suspense>
              </PermissionGuard>
            </ErrorBoundary>
          } />
          <Route path="/trials" element={
            <ErrorBoundary inline>
              <PermissionGuard tabName="Trials" onMenuClick={toggleSidebar}>
                <Suspense fallback={<TrialsLoader />}>
                  <Trials onMenuClick={toggleSidebar} />
                </Suspense>
              </PermissionGuard>
            </ErrorBoundary>
          } />
          <Route path="/reports" element={
            <ErrorBoundary inline>
              <PermissionGuard tabName="Reports & Cards" onMenuClick={toggleSidebar}>
                <Suspense fallback={<ReportsLoader />}>
                  <Reports onMenuClick={toggleSidebar} />
                </Suspense>
              </PermissionGuard>
            </ErrorBoundary>
          } />
          <Route path="/organisations" element={
            <ErrorBoundary inline>
              <PermissionGuard tabName="Organisations" onMenuClick={toggleSidebar}>
                <Suspense fallback={<PageLoader />}>
                  <Organisations onMenuClick={toggleSidebar} />
                </Suspense>
              </PermissionGuard>
            </ErrorBoundary>
          } />
          <Route path="/ingredients" element={
            <ErrorBoundary inline>
              <PermissionGuard tabName="Ingredient Costs" onMenuClick={toggleSidebar}>
                <Suspense fallback={<PageLoader />}>
                  <Ingredients onMenuClick={toggleSidebar} />
                </Suspense>
              </PermissionGuard>
            </ErrorBoundary>
          } />
          <Route path="/ai-assistant" element={
            <ErrorBoundary inline>
              <PermissionGuard tabName="AI Assistant" onMenuClick={toggleSidebar}>
                <Suspense fallback={<AILoader />}>
                  <AIAssistant onMenuClick={toggleSidebar} />
                </Suspense>
              </PermissionGuard>
            </ErrorBoundary>
          } />
          <Route path="/analytics" element={
            <ErrorBoundary inline>
              <PermissionGuard tabName="Analytics" onMenuClick={toggleSidebar}>
                <Suspense fallback={<AnalyticsLoader />}>
                  <Analytics onMenuClick={toggleSidebar} />
                </Suspense>
              </PermissionGuard>
            </ErrorBoundary>
          } />
          <Route path="/statistics" element={
            <ErrorBoundary inline>
              <PermissionGuard tabName="Statistics" onMenuClick={toggleSidebar}>
                <Suspense fallback={<PageLoader />}>
                  <Statistics onMenuClick={toggleSidebar} />
                </Suspense>
              </PermissionGuard>
            </ErrorBoundary>
          } />
          <Route path="/alerts" element={
            <ErrorBoundary inline>
              <PermissionGuard tabName="Smart Alerts" onMenuClick={toggleSidebar}>
                <Suspense fallback={<PageLoader />}>
                  <Alerts onMenuClick={toggleSidebar} />
                </Suspense>
              </PermissionGuard>
            </ErrorBoundary>
          } />
          <Route path="/dose-response" element={
            <ErrorBoundary inline>
              <PermissionGuard tabName="Dose-Response (ED50)" onMenuClick={toggleSidebar}>
                <Suspense fallback={<PageLoader />}>
                  <DoseResponse onMenuClick={toggleSidebar} />
                </Suspense>
              </PermissionGuard>
            </ErrorBoundary>
          } />
          <Route path="/resistance" element={
            <ErrorBoundary inline>
              <PermissionGuard tabName="Resistance Tracker" onMenuClick={toggleSidebar}>
                <Suspense fallback={<PageLoader />}>
                  <ResistanceTracker onMenuClick={toggleSidebar} />
                </Suspense>
              </PermissionGuard>
            </ErrorBoundary>
          } />
          <Route path="/map" element={
            <PermissionGuard tabName="Field Map" onMenuClick={toggleSidebar}>
              <Suspense fallback={<PageLoader />}>
                <FieldMap onMenuClick={toggleSidebar} />
              </Suspense>
            </PermissionGuard>
          } />
          <Route path="/search" element={
            <PermissionGuard tabName="Smart Search" onMenuClick={toggleSidebar}>
              <Suspense fallback={<PageLoader />}>
                <SmartSearch onMenuClick={toggleSidebar} />
              </Suspense>
            </PermissionGuard>
          } />
          <Route path="/data" element={
            <PermissionGuard tabName="Data Management" onMenuClick={toggleSidebar}>
              <Suspense fallback={<PageLoader />}>
                <DataManagement onMenuClick={toggleSidebar} />
              </Suspense>
            </PermissionGuard>
          } />
          <Route path="/settings" element={
            <PermissionGuard tabName="Settings" onMenuClick={toggleSidebar}>
              <Suspense fallback={<PageLoader />}>
                <Settings onMenuClick={toggleSidebar} />
              </Suspense>
            </PermissionGuard>
          } />
          <Route path="/users" element={
            <PermissionGuard tabName="User Management" onMenuClick={toggleSidebar}>
              <Suspense fallback={<PageLoader />}>
                <UserManagement onMenuClick={toggleSidebar} />
              </Suspense>
            </PermissionGuard>
          } />
          <Route path="/compare" element={
            <PermissionGuard tabName="Compare Trials" onMenuClick={toggleSidebar}>
              <Suspense fallback={<PageLoader />}>
                <CompareTrials onMenuClick={toggleSidebar} />
              </Suspense>
            </PermissionGuard>
          } />
          <Route path="/migration" element={
            <PermissionGuard tabName="Firebase Migration" onMenuClick={toggleSidebar}>
              <Suspense fallback={<PageLoader />}>
                <MigrationTool onMenuClick={toggleSidebar} />
              </Suspense>
            </PermissionGuard>
          } />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>

      </main>

      <BottomNav onMoreClick={toggleSidebar} />
      <Toast />
      <LoadingOverlay />
      <PWAStatus />
      
      {state.activeConflict && (
        <ConflictResolverModal
          isOpen={!!state.activeConflict}
          onClose={() => updateState({ activeConflict: null })}
          conflict={state.activeConflict}
          onResolve={handleResolveConflict}
        />
      )}
    </div>
  );
}


// Platform adapter for Web (React DOM)
function WebPlatformAdapter({ children }) {
  const { updateState } = useAppState();

  React.useEffect(() => {
    // Clear chunk reload attempts counter upon successful load of the main wrapper
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem('chunk_reload_attempts');
    }

    // Setup the platform adapter methods in global state for hooks/services to use
    // NOTE: online/offline listeners are handled exclusively by useSync to avoid duplicate toasts
    updateState({
      isOnline: navigator.onLine,
      platformAdapter: {
        showToast: (msg, type) => window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg, type } })),
        showLoading: (show) => window.dispatchEvent(new CustomEvent('app:loading', { detail: { show } })),
        renderSyncStatus: () => window.dispatchEvent(new CustomEvent('app:sync-status-update'))
      }
    });
  }, [updateState]);

  return children;
}

function App() {
  return (
    <ErrorBoundary>
      <AppStateProvider>
        <HashRouter>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* Public live QR page — no auth required */}
              <Route path="/live/:id" element={<LiveTrialPage />} />
              {/* All authenticated app routes */}
              <Route path="/*" element={<WebPlatformAdapter><AppLayout /></WebPlatformAdapter>} />
            </Routes>
          </Suspense>
        </HashRouter>
      </AppStateProvider>
    </ErrorBoundary>
  );
}

export default App;
