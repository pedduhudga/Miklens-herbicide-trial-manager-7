import React, { useEffect, useState } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import PlotScanner from './pages/PlotScanner.jsx';
import DataManagement from './pages/DataManagement.jsx';
import Settings from './pages/Settings.jsx';
import UserManagement from './pages/UserManagement.jsx';
import AIAssistant from './pages/AIAssistant.jsx';
import SmartSearch from './pages/SmartSearch.jsx';
import Analytics from './pages/Analytics.jsx';
import Reports from './pages/Reports.jsx';
import Statistics from './pages/Statistics.jsx';
import Alerts from './pages/Alerts.jsx';
import DoseResponse from './pages/DoseResponse.jsx';
import ResistanceTracker from './pages/ResistanceTracker.jsx';
import FieldMap from './pages/FieldMap.jsx';
import Trials from './pages/Trials.jsx';
import Projects from './pages/Projects.jsx';
import LargeScaleTrials from './pages/LargeScaleTrials.jsx';
import Ingredients from './pages/Ingredients.jsx';
import Organisations from './pages/Organisations.jsx';
import Formulations from './pages/Formulations.jsx';
import { AppStateProvider } from './hooks/useAppState.jsx';
import Sidebar from './components/Sidebar.jsx';
import BottomNav from './components/BottomNav.jsx';
import Toast from './components/Toast.jsx';
import LoadingOverlay from './components/LoadingOverlay.jsx';
import ConflictResolverModal from './components/ConflictResolverModal.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';


import Setup from './pages/Setup.jsx';
import Login from './pages/Login.jsx';
import MigrationTool from './pages/MigrationTool.jsx';
import { useAuth } from './hooks/useAuth.js';
import { useAppState } from './hooks/useAppState.jsx';
import { useSync } from './hooks/useSync.js';
import { getAllData } from './services/dataLayer.js';
import { initAI } from './services/ai.js';

import CompareTrials from './pages/CompareTrials.jsx';
import Dashboard from './pages/Dashboard.jsx';
import PlaceholderPage from './pages/PlaceholderPage.jsx';
import LiveTrialPage from './pages/LiveTrialPage.jsx';
import CategorySelector from './pages/CategorySelector.jsx';
import { getCategoryConfig } from './utils/categoryConfig.js';





import PermissionGuard from './components/PermissionGuard.jsx';

function AppLayout() {
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
    return <Setup />;
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  return (
    <div className="flex h-screen bg-slate-100 font-sans">

      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-transparent">
        <Routes>
          <Route path="/categories" element={<PermissionGuard tabName="All Categories" onMenuClick={toggleSidebar}><CategorySelector /></PermissionGuard>} />
          <Route path="/" element={<PermissionGuard tabName="Dashboard" onMenuClick={toggleSidebar}><Dashboard onMenuClick={toggleSidebar} /></PermissionGuard>} />
          <Route path="/large-scale-trials" element={<PermissionGuard tabName="Large Field Trials" onMenuClick={toggleSidebar}><LargeScaleTrials onMenuClick={toggleSidebar} /></PermissionGuard>} />
          <Route path="/projects" element={<PermissionGuard tabName="Projects (Grouped)" onMenuClick={toggleSidebar}><Projects onMenuClick={toggleSidebar} /></PermissionGuard>} />
          <Route path="/scanner" element={<PermissionGuard tabName="Plot Scanner" onMenuClick={toggleSidebar}><PlotScanner onMenuClick={toggleSidebar} /></PermissionGuard>} />
          <Route path="/formulations" element={<PermissionGuard tabName="Formulations" onMenuClick={toggleSidebar}><Formulations onMenuClick={toggleSidebar} /></PermissionGuard>} />
          <Route path="/trials" element={<PermissionGuard tabName="Trials" onMenuClick={toggleSidebar}><Trials onMenuClick={toggleSidebar} /></PermissionGuard>} />
          <Route path="/reports" element={<PermissionGuard tabName="Reports & Cards" onMenuClick={toggleSidebar}><Reports onMenuClick={toggleSidebar} /></PermissionGuard>} />
          <Route path="/organisations" element={<PermissionGuard tabName="Organisations" onMenuClick={toggleSidebar}><Organisations onMenuClick={toggleSidebar} /></PermissionGuard>} />
          <Route path="/ingredients" element={<PermissionGuard tabName="Ingredient Costs" onMenuClick={toggleSidebar}><Ingredients onMenuClick={toggleSidebar} /></PermissionGuard>} />
          <Route path="/ai-assistant" element={<PermissionGuard tabName="AI Assistant" onMenuClick={toggleSidebar}><AIAssistant onMenuClick={toggleSidebar} /></PermissionGuard>} />
          <Route path="/analytics" element={<PermissionGuard tabName="Analytics" onMenuClick={toggleSidebar}><Analytics onMenuClick={toggleSidebar} /></PermissionGuard>} />
          <Route path="/statistics" element={<PermissionGuard tabName="Statistics" onMenuClick={toggleSidebar}><Statistics onMenuClick={toggleSidebar} /></PermissionGuard>} />
          <Route path="/alerts" element={<PermissionGuard tabName="Smart Alerts" onMenuClick={toggleSidebar}><Alerts onMenuClick={toggleSidebar} /></PermissionGuard>} />
          <Route path="/dose-response" element={<PermissionGuard tabName="Dose-Response (ED50)" onMenuClick={toggleSidebar}><DoseResponse onMenuClick={toggleSidebar} /></PermissionGuard>} />
          <Route path="/resistance" element={<PermissionGuard tabName="Resistance Tracker" onMenuClick={toggleSidebar}><ResistanceTracker onMenuClick={toggleSidebar} /></PermissionGuard>} />
          <Route path="/map" element={<PermissionGuard tabName="Field Map" onMenuClick={toggleSidebar}><FieldMap onMenuClick={toggleSidebar} /></PermissionGuard>} />
          <Route path="/search" element={<PermissionGuard tabName="Smart Search" onMenuClick={toggleSidebar}><SmartSearch onMenuClick={toggleSidebar} /></PermissionGuard>} />
          <Route path="/data" element={<PermissionGuard tabName="Data Management" onMenuClick={toggleSidebar}><DataManagement onMenuClick={toggleSidebar} /></PermissionGuard>} />
          <Route path="/settings" element={<PermissionGuard tabName="Settings" onMenuClick={toggleSidebar}><Settings onMenuClick={toggleSidebar} /></PermissionGuard>} />
          <Route path="/users" element={<PermissionGuard tabName="User Management" onMenuClick={toggleSidebar}><UserManagement onMenuClick={toggleSidebar} /></PermissionGuard>} />
          <Route path="/compare" element={<PermissionGuard tabName="Compare Trials" onMenuClick={toggleSidebar}><CompareTrials onMenuClick={toggleSidebar} /></PermissionGuard>} />
          <Route path="/migration" element={<PermissionGuard tabName="Firebase Migration" onMenuClick={toggleSidebar}><MigrationTool onMenuClick={toggleSidebar} /></PermissionGuard>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>

      </main>

      <BottomNav onMoreClick={toggleSidebar} />
      <Toast />
      <LoadingOverlay />
      
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
    // Setup the platform adapter methods in global state for hooks/services to use
    updateState({
      isOnline: navigator.onLine,
      platformAdapter: {
        showToast: (msg, type) => window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg, type } })),
        showLoading: (show) => window.dispatchEvent(new CustomEvent('app:loading', { detail: { show } })),
        renderSyncStatus: () => window.dispatchEvent(new CustomEvent('app:sync-status-update'))
      }
    });

    const handleOnline = () => {
      updateState({ isOnline: true });
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Back online! Syncing data...', type: 'info' } }));
    };

    const handleOffline = () => {
      updateState({ isOnline: false });
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Offline Mode Active', type: 'info' } }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [updateState]);

  return children;
}

function App() {
  return (
    <ErrorBoundary>
      <AppStateProvider>
        <HashRouter>
          <Routes>
            {/* Public live QR page — no auth required */}
            <Route path="/live/:id" element={<LiveTrialPage />} />
            {/* All authenticated app routes */}
            <Route path="/*" element={<WebPlatformAdapter><AppLayout /></WebPlatformAdapter>} />
          </Routes>
        </HashRouter>
      </AppStateProvider>
    </ErrorBoundary>
  );
}

export default App;
