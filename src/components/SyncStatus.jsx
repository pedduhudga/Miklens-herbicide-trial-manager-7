/**
 * Sync Status Indicator Component
 * Shows online/offline status, sync progress, and conflict alerts
 */

import { useState, useEffect, useCallback } from 'react';
import { 
  initSyncManager, 
  getSyncStatus, 
  isOnline, 
  onSyncStatusChange,
  checkForConflicts,
  resolveConflictWithStrategy,
  autoMergeConflict,
  forceSync,
  SYNC_STATUS 
} from '../services/syncManager.js';
import { 
  Wifi, WifiOff, CheckCircle, AlertTriangle, 
  RefreshCw, Cloud, CloudOff, GitMerge,
  ChevronRight, X, FileJson, Download, Upload
} from 'lucide-react';
import { useAppState } from '../hooks/useAppState.jsx';
import { triggerHaptic } from '../utils/nativeCapabilities.js';

export default function SyncStatus() {
  const [status, setStatus] = useState(SYNC_STATUS.ONLINE);
  const [details, setDetails] = useState(null);
  const [showConflicts, setShowConflicts] = useState(false);
  const [showQueueDetails, setShowQueueDetails] = useState(false);
  const [conflicts, setConflicts] = useState([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [browserOnline, setBrowserOnline] = useState(() => typeof navigator !== 'undefined' ? navigator.onLine : true);

  let appSyncQueue = [];
  let dispatch = null;
  let trialsList = [];
  try {
    const app = useAppState();
    appSyncQueue = app.state?.syncQueue || [];
    dispatch = app.dispatch;
    trialsList = app.state?.trials || [];
  } catch {
    // Graceful fallback if rendered outside AppStateProvider in unit tests
  }

  const appPendingCount = (appSyncQueue || []).filter(s => s.status === 'pending' || s.status === 'failed' || !s.status).length;
  const effectivePendingCount = Math.max(details?.pendingCount || 0, appPendingCount);

  // Monitor browser online/offline events
  useEffect(() => {
    const handleOnline = () => setBrowserOnline(true);
    const handleOffline = () => setBrowserOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Initialize and listen for status changes
  useEffect(() => {
    initSyncManager();
    setStatus(getSyncStatus());
    
    const unsubscribe = onSyncStatusChange((newStatus, newDetails) => {
      setStatus(newStatus);
      setDetails(newDetails);
      
      if (newStatus === SYNC_STATUS.CONFLICTS) {
        loadConflicts();
      }
    });
    
    // Check for conflicts on mount
    loadConflicts();
    
    return unsubscribe;
  }, []);

  // Load unresolved conflicts
  const loadConflicts = useCallback(async () => {
    const unresolved = await checkForConflicts();
    setConflicts(unresolved);
  }, []);

  // Force sync
  const handleForceSync = useCallback(async () => {
    await forceSync();
    if (typeof window !== 'undefined' && typeof window.processSyncQueue === 'function') {
      try {
        await window.processSyncQueue();
      } catch (e) {
        console.error('Failed to process application sync queue:', e);
      }
    }
  }, []);

  // Resolve conflict
  const handleResolve = useCallback(async (conflictId, strategy) => {
    let mergedData = null;
    
    if (strategy === 'merge') {
      const conflict = conflicts.find(c => c.id === conflictId);
      if (conflict) {
        mergedData = autoMergeConflict(conflict.localData, conflict.serverData);
      }
    }
    
    await resolveConflictWithStrategy(conflictId, strategy, mergedData);
    await loadConflicts();
  }, [conflicts]);

  const currentlyOnline = browserOnline && isOnline();

  // Get status display config
  const getStatusConfig = () => {
    if (!currentlyOnline || status === SYNC_STATUS.OFFLINE) {
      if (effectivePendingCount > 0) {
        return {
          icon: <CloudOff className="w-4 h-4" />,
          label: `${effectivePendingCount} Queued`,
          color: 'text-amber-700 bg-amber-50 border-amber-300',
          pulse: false
        };
      }
      return {
        icon: <WifiOff className="w-4 h-4" />,
        label: 'Offline Mode',
        color: 'text-slate-600 bg-slate-100 border-slate-300',
        pulse: false
      };
    }

    if (status === SYNC_STATUS.SYNCING) {
      return {
        icon: <RefreshCw className="w-4 h-4 animate-spin" />,
        label: 'Syncing...',
        color: 'text-blue-600 bg-blue-50 border-blue-200',
        pulse: true
      };
    }

    if (status === SYNC_STATUS.CONFLICTS || conflicts.length > 0) {
      return {
        icon: <GitMerge className="w-4 h-4" />,
        label: `${details?.conflictCount || conflicts.length} Conflicts`,
        color: 'text-orange-600 bg-orange-50 border-orange-200',
        pulse: true
      };
    }

    if (status === SYNC_STATUS.ERROR) {
      return {
        icon: <CloudOff className="w-4 h-4" />,
        label: 'Sync Error',
        color: 'text-red-600 bg-red-50 border-red-200',
        pulse: false
      };
    }

    if (effectivePendingCount > 0) {
      return {
        icon: <Upload className="w-4 h-4 text-amber-600" />,
        label: `${effectivePendingCount} Pending Sync`,
        color: 'text-amber-700 bg-amber-50 border-amber-300',
        pulse: true
      };
    }

    return {
      icon: <CheckCircle className="w-4 h-4 text-emerald-600" />,
      label: 'Cloud Synced',
      color: 'text-emerald-700 bg-emerald-50 border-emerald-200',
      pulse: false
    };
  };

  const config = getStatusConfig();

  return (
    <div className="relative">
      {/* Field-Optimized Status Badge with Haptics */}
      <button
        onClick={() => {
          triggerHaptic('light');
          setIsExpanded(!isExpanded);
        }}
        className={`flex items-center gap-1.5 px-3 py-1.5 md:px-3 md:py-2 rounded-xl text-xs font-semibold border transition shadow-sm touch-manipulation btn-interactive ${
          config.color + (config.pulse ? ' animate-micro-pulse' : '')
        }`}
        title={`Sync Status: ${config.label}`}
        aria-label={`Sync Status: ${config.label}`}
      >
        {config.icon}
        <span className="inline text-[11px] md:text-xs font-medium">{config.label}</span>
        {(status === SYNC_STATUS.CONFLICTS || (effectivePendingCount > 0)) && (
          <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
        )}
      </button>

      {/* Expanded Panel - responsive width */}
      {isExpanded && (
        <div className="absolute right-0 top-full mt-2 w-[calc(100vw-32px)] md:w-72 bg-white rounded-xl shadow-lg border border-slate-200 z-50 overflow-hidden max-w-sm animate-scale-in">
          <div className="p-4 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-slate-800">Sync Status</h4>
              <button 
                onClick={() => setIsExpanded(false)}
                className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Connection</span>
                <span className={currentlyOnline ? 'text-emerald-600 font-medium' : 'text-amber-600 font-medium'}>
                  {currentlyOnline ? 'Online' : 'Offline'}
                </span>
              </div>
              
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Status</span>
                <span className="font-medium text-slate-700 capitalize">{status}</span>
              </div>
              
              {effectivePendingCount > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Pending</span>
                  <span className="font-medium text-amber-600">{effectivePendingCount} items</span>
                </div>
              )}
              
              {conflicts.length > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Conflicts</span>
                  <span className="font-medium text-orange-600">{conflicts.length} unresolved</span>
                </div>
              )}
            </div>
            
            {currentlyOnline && status !== SYNC_STATUS.SYNCING && (
              <button
                onClick={handleForceSync}
                className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition"
              >
                <RefreshCw className="w-4 h-4" />
                Force Sync Now
              </button>
            )}

            {/* Sync Queue Manager */}
            {appSyncQueue && appSyncQueue.length > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-700">
                    Queue Items ({appSyncQueue.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowQueueDetails(!showQueueDetails)}
                    className="text-[11px] text-blue-600 hover:text-blue-800 font-semibold"
                  >
                    {showQueueDetails ? 'Hide' : 'View'}
                  </button>
                </div>

                {showQueueDetails && (
                  <div className="space-y-1.5 max-h-44 overflow-y-auto mb-2 pr-0.5">
                    {appSyncQueue.slice(0, 8).map((item, idx) => {
                      const actionText = item.action || item.type || (item.photo ? 'Photo Upload' : 'Data Action');
                      const trialId = item.trialId || item.payload?.ID || item.payload?.id;
                      const relatedTrial = trialId ? (trialsList || []).find(t => String(t.ID) === String(trialId)) : null;
                      const trialLabel = relatedTrial?.FormulationName || relatedTrial?.Name || (trialId ? `Trial ${String(trialId).slice(0, 8)}…` : '');
                      const isFailed = item.status === 'failed' || item.noRetry;
                      const isUploading = item.status === 'uploading';

                      return (
                        <div key={item.id || idx} className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs flex items-center justify-between gap-1.5">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                                isFailed ? 'bg-red-100 text-red-700' : isUploading ? 'bg-blue-100 text-blue-700 animate-pulse' : 'bg-amber-100 text-amber-700'
                              }`}>
                                {isFailed ? 'Failed' : isUploading ? 'Syncing' : 'Queued'}
                              </span>
                              <span className="font-semibold text-slate-700 truncate">{actionText}</span>
                            </div>
                            {trialLabel && <p className="text-[10px] text-slate-500 truncate mt-0.5">{trialLabel}</p>}
                            {item.lastError && (
                              <p className="text-[9px] text-red-600 truncate mt-0.5" title={item.lastError}>
                                {item.lastError}
                              </p>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              if (dispatch) {
                                const next = appSyncQueue.filter((_, i) => i !== idx);
                                dispatch({ type: 'SET_SYNC_QUEUE', payload: next });
                              }
                            }}
                            className="p-1 text-slate-400 hover:text-red-600 hover:bg-slate-200 rounded transition shrink-0"
                            title="Dismiss item from queue"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                    {appSyncQueue.length > 8 && (
                      <p className="text-[10px] text-slate-400 text-center">+{appSyncQueue.length - 8} more items in queue</p>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-1.5 mt-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (dispatch) {
                        const retried = appSyncQueue.map(i => ({
                          ...i,
                          status: 'pending',
                          attempts: 0,
                          noRetry: false,
                          lastError: null
                        }));
                        dispatch({ type: 'SET_SYNC_QUEUE', payload: retried });
                        handleForceSync();
                      }
                    }}
                    className="px-2 py-1.5 text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg border border-blue-200 transition text-center"
                    title="Reset retry attempts and process immediately"
                  >
                    Retry Failed
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (dispatch) {
                        const cleaned = appSyncQueue.filter(i => !(i.noRetry || (i.attempts && i.attempts >= 4) || i.status === 'failed'));
                        dispatch({ type: 'SET_SYNC_QUEUE', payload: cleaned });
                      }
                    }}
                    className="px-2 py-1.5 text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg border border-slate-200 transition text-center"
                    title="Remove blocked or permanently failed items"
                  >
                    Clear Stale
                  </button>
                </div>
              </div>
            )}

            {/* Offline Fail-Safe Export */}
            <button
              onClick={() => {
                try {
                  const dataToExport = {
                    timestamp: new Date().toISOString(),
                    syncQueue: appSyncQueue,
                    localStorageDump: { ...localStorage }
                  };
                  const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `offline_field_backup_${Date.now()}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                } catch (err) {
                  console.error('Backup export failed:', err);
                }
              }}
              className="mt-2 w-full flex items-center justify-center gap-2 px-3 py-2 border border-slate-200 text-slate-600 hover:text-slate-800 hover:bg-slate-50 rounded-lg text-xs font-medium transition"
              title="Download local JSON copy of queued field observations"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              Export Local Backup (JSON)
            </button>
          </div>
          
          {/* Conflict Warning */}
          {conflicts.length > 0 && (
            <div className="p-4 bg-orange-50 border-t border-orange-100">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-orange-800">
                    {conflicts.length} Data Conflict{conflicts.length !== 1 ? 's' : ''}
                  </p>
                  <p className="text-xs text-orange-600 mt-1">
                    Some of your data conflicts with the server version.
                  </p>
                  <button
                    onClick={() => setShowConflicts(!showConflicts)}
                    className="mt-2 text-xs font-medium text-orange-700 hover:text-orange-800 underline"
                  >
                    {showConflicts ? 'Hide' : 'Resolve Conflicts'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Conflict Resolution Modal */}
      {showConflicts && conflicts.length > 0 && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <GitMerge className="w-5 h-5 text-orange-600" />
                <h3 className="font-bold text-slate-800">Resolve Conflicts</h3>
              </div>
              <button 
                onClick={() => setShowConflicts(false)}
                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              <p className="text-sm text-slate-600 mb-4">
                The following items have conflicting changes between your local data and the server. 
                Choose which version to keep, or let the system auto-merge them.
              </p>
              
              <div className="space-y-4">
                {conflicts.map(conflict => (
                  <div key={conflict.id} className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-700">
                        {conflict.entityType}: {conflict.localData?.Name || conflict.localData?.FormulationName || conflict.entityId}
                      </span>
                      <span className="text-xs text-slate-500">
                        {new Date(conflict.detectedAt).toLocaleString()}
                      </span>
                    </div>
                    
                    <div className="p-4 grid grid-cols-2 gap-4">
                      {/* Local Version */}
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <Download className="w-4 h-4 text-blue-600" />
                          <span className="font-semibold text-blue-800 text-sm">Your Version</span>
                        </div>
                        <p className="text-xs text-blue-600 mb-1">
                          Modified: {new Date(conflict.localData?.LastModified).toLocaleString()}
                        </p>
                        <pre className="text-xs text-slate-600 bg-white p-2 rounded overflow-x-auto max-h-32">
                          {JSON.stringify(conflict.localData, null, 2)}
                        </pre>
                        <button
                          onClick={() => handleResolve(conflict.id, 'local')}
                          className="mt-2 w-full px-3 py-1.5 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 transition"
                        >
                          Keep Mine
                        </button>
                      </div>
                      
                      {/* Server Version */}
                      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <Upload className="w-4 h-4 text-emerald-600" />
                          <span className="font-semibold text-emerald-800 text-sm">Server Version</span>
                        </div>
                        <p className="text-xs text-emerald-600 mb-1">
                          Modified: {new Date(conflict.serverData?.LastModified).toLocaleString()}
                        </p>
                        <pre className="text-xs text-slate-600 bg-white p-2 rounded overflow-x-auto max-h-32">
                          {JSON.stringify(conflict.serverData, null, 2)}
                        </pre>
                        <button
                          onClick={() => handleResolve(conflict.id, 'server')}
                          className="mt-2 w-full px-3 py-1.5 bg-emerald-600 text-white rounded text-sm font-medium hover:bg-emerald-700 transition"
                        >
                          Use Server
                        </button>
                      </div>
                    </div>
                    
                    {/* Auto-merge option */}
                    <div className="px-4 pb-4">
                      <button
                        onClick={() => handleResolve(conflict.id, 'merge')}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition"
                      >
                        <FileJson className="w-4 h-4" />
                        Auto-Merge (Intelligent Merge)
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
