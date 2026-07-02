import { useEffect, useState, useCallback, useRef } from 'react';
import { useAppState } from './useAppState.jsx';
import { processSyncQueue } from '../services/sync.js';
import { flushMirrorQueue } from '../services/sheetMirror.js';

export function useSync() {
  const { state, dispatch, getAppState, updateState } = useAppState();
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [isSyncing, setIsSyncing] = useState(false);
  const isSyncingRef = useRef(false);

  const showToast = useCallback((msg, type) => {
    if(state.platformAdapter && state.platformAdapter.showToast) { state.platformAdapter.showToast(msg, type); } else { console.log("Toast:", type, msg); }
  }, [state.platformAdapter]);

  const renderSyncStatus = useCallback(() => {
    if(state.platformAdapter && state.platformAdapter.renderSyncStatus) { state.platformAdapter.renderSyncStatus(); }
  }, [state.platformAdapter]);

  // Consolidated online/offline handling — single source of truth (Fix #7)
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      updateState({ isOnline: true });
      showToast('Back online! Syncing data...', 'info');
      flushMirrorQueue(getAppState);
    };

    const handleOffline = () => {
      setIsOnline(false);
      updateState({ isOnline: false });
      showToast('Offline Mode Active', 'info');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [showToast, getAppState, updateState]);

  useEffect(() => {
    if (isOnline) {
      flushMirrorQueue(getAppState);
    }
  }, [isOnline, getAppState]);

  // Stabilized runSync using ref to avoid dependency cascade (Fix #10)
  const runSync = useCallback(async () => {
    if (isSyncingRef.current || !navigator.onLine) return;

    isSyncingRef.current = true;
    setIsSyncing(true);
    try {
      await processSyncQueue(getAppState, updateState, showToast, renderSyncStatus);
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  }, [getAppState, updateState, showToast, renderSyncStatus]);

  // Trigger sync when coming online (only depends on isOnline, not syncQueue to avoid cascade)
  useEffect(() => {
    if (isOnline) {
      const appState = getAppState();
      const pending = (appState.syncQueue || []).filter(s => s.status === 'pending' || s.status === 'failed').length;
      if (pending > 0) {
        runSync();
      }
    }
  }, [isOnline, runSync, getAppState]);

  // Periodic sync check — avoids dependency on syncQueue array reference
  useEffect(() => {
    const interval = setInterval(() => {
      const appState = getAppState();
      if (navigator.onLine) {
        const pending = (appState.syncQueue || []).filter(s => s.status === 'pending' || s.status === 'failed').length;
        if (pending > 0) runSync();
      }
    }, 60000);

    return () => clearInterval(interval);
  }, [runSync, getAppState]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.processSyncQueue = runSync;
    }
    return () => {
      if (typeof window !== 'undefined' && window.processSyncQueue === runSync) {
        window.processSyncQueue = undefined;
      }
    };
  }, [runSync]);

  // Listen for messages from the Service Worker (Background Sync events)
  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const handleSWMessage = (event) => {
        if (event.data) {
          if (event.data.type === 'TRIGGER_SYNC') {
            console.log('[BackgroundSync] Triggered sync from SW notification');
            runSync();
          } else if (
            event.data.type === 'SYNC_SUCCESS' ||
            event.data.type === 'SYNC_FAILED' ||
            event.data.type === 'SYNC_PROGRESS'
          ) {
            window.dispatchEvent(new CustomEvent('app:sync-status-update'));
          }
        }
      };
      navigator.serviceWorker.addEventListener('message', handleSWMessage);
      return () => navigator.serviceWorker.removeEventListener('message', handleSWMessage);
    }
  }, [runSync]);

  const addToSyncQueue = useCallback((action) => {
    dispatch({ type: 'ADD_SYNC_ITEM', payload: action });
  }, [dispatch]);

  const clearSyncQueue = useCallback(() => {
    dispatch({ type: 'SET_SYNC_QUEUE', payload: [] });
  }, [dispatch]);

  const pendingCount = (state.syncQueue || []).filter(s => s.status === 'pending' || s.status === 'failed').length;

  return {
    isOnline,
    isSyncing,
    syncQueue: state.syncQueue,
    pendingCount,
    runSync,
    addToSyncQueue,
    clearSyncQueue
  };
}
