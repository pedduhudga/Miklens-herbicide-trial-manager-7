import React, { useState, useEffect } from 'react';
import { Download, Smartphone, Wifi, WifiOff, RefreshCw } from 'lucide-react';

export default function PWAStatus() {
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showUpdate, setShowUpdate] = useState(false);
  const [updateRegistration, setUpdateRegistration] = useState(null);

  useEffect(() => {
    // Check if app is already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
    }

    // Listen for install prompt
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    // Listen for app installed
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setIsInstallable(false);
      setDeferredPrompt(null);
    };

    // Listen for online/offline
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    // Listen for Service Worker updates
    const handleSWUpdate = (e) => {
      setUpdateRegistration(e.detail);
      setShowUpdate(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('sw-update-available', handleSWUpdate);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('sw-update-available', handleSWUpdate);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      
      if (outcome === 'accepted') {
        setIsInstallable(false);
        setDeferredPrompt(null);
      }
    }
  };

  const handleUpdateClick = () => {
    if (updateRegistration && updateRegistration.waiting) {
      updateRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
  };

  // Don't show if already installed and no update is available
  if (isInstalled && !showUpdate) {
    return null;
  }

  return (
    <div className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:bottom-4 right-4 z-50 max-w-sm flex flex-col gap-2 pointer-events-auto">
      {/* Update prompt */}
      {showUpdate && (
        <div className="bg-white rounded-lg shadow-lg border border-slate-200 p-4 mb-3 animate-bounce">
          <div className="flex items-start gap-3">
            <div className="bg-emerald-100 p-2 rounded-lg">
              <RefreshCw className="w-5 h-5 text-emerald-600 animate-spin" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-slate-800 text-sm">App Update Available</h3>
              <p className="text-xs text-slate-600 mb-3">
                A new version of Trial Manager is ready. Reload to apply updates.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleUpdateClick}
                  className="bg-emerald-600 text-white px-3 py-1.5 rounded-md text-xs font-medium hover:bg-emerald-700 transition flex items-center gap-1"
                >
                  Update & Reload
                </button>
                <button
                  onClick={() => setShowUpdate(false)}
                  className="text-slate-500 px-3 py-1.5 rounded-md text-xs font-medium hover:text-slate-700 transition"
                >
                  Later
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Install prompt */}
      {isInstallable && (
        <div className="bg-white rounded-lg shadow-lg border border-slate-200 p-4 mb-3">
          <div className="flex items-start gap-3">
            <div className="bg-emerald-100 p-2 rounded-lg">
              <Smartphone className="w-5 h-5 text-emerald-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-slate-800 text-sm">Install App</h3>
              <p className="text-xs text-slate-600 mb-3">
                Install Trial Manager for offline access and better performance
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleInstallClick}
                  className="bg-emerald-600 text-white px-3 py-1.5 rounded-md text-xs font-medium hover:bg-emerald-700 transition flex items-center gap-1"
                >
                  <Download className="w-3 h-3" />
                  Install
                </button>
                <button
                  onClick={() => setIsInstallable(false)}
                  className="text-slate-500 px-3 py-1.5 rounded-md text-xs font-medium hover:text-slate-700 transition"
                >
                  Later
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Online/offline status */}
      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition ${
        isOnline 
          ? 'bg-emerald-100 text-emerald-700' 
          : 'bg-amber-100 text-amber-700'
      }`}>
        {isOnline ? (
          <>
            <Wifi className="w-3 h-3" />
            Online
          </>
        ) : (
          <>
            <WifiOff className="w-3 h-3" />
            Offline Mode
          </>
        )}
      </div>
    </div>
  );
}