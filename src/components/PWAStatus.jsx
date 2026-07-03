import React, { useState, useEffect } from 'react';
import { Download, Smartphone, Wifi, WifiOff, RefreshCw, X, ChevronRight } from 'lucide-react';

export default function PWAStatus() {
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showUpdate, setShowUpdate] = useState(false);
  const [updateRegistration, setUpdateRegistration] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check if app is already installed
    if (window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true) {
      setIsInstalled(true);
    }

    // Listen for install prompt
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // Only show install prompt if not installed and not dismissed
      if (!isInstalled && !dismissed) {
        setIsInstallable(true);
      }
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
  }, [isInstalled, dismissed]);

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
    setShowUpdate(false);
  };

  const handleDismiss = () => {
    setIsInstallable(false);
    setDismissed(true);
  };

  // Don't show install prompt if already installed
  if (isInstalled && !showUpdate) {
    // Still show online/offline indicator for installed apps
    return (
      <div 
        className="md:hidden fixed bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] left-4 z-40"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className={`flex items-center gap-2 px-3 py-2 rounded-full text-xs font-medium shadow-sm backdrop-blur-md ${
          isOnline 
            ? 'bg-emerald-100/90 text-emerald-700' 
            : 'bg-amber-100/90 text-amber-700'
        }`}>
          {isOnline ? (
            <>
              <Wifi className="w-3.5 h-3.5" />
              <span>Online</span>
            </>
          ) : (
            <>
              <WifiOff className="w-3.5 h-3.5" />
              <span>Offline</span>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Desktop/tablet position */}
      <div className="hidden md:block fixed bottom-4 right-4 z-50 max-w-sm flex flex-col gap-3 pointer-events-auto">
        {/* Update prompt */}
        {showUpdate && (
          <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-4 animate-slide-up">
            <div className="flex items-start gap-3">
              <div className="bg-emerald-100 p-2.5 rounded-xl">
                <RefreshCw className="w-5 h-5 text-emerald-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-slate-800 text-sm">Update Available</h3>
                <p className="text-xs text-slate-500 mt-1 mb-3">
                  A new version is ready with improvements.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleUpdateClick}
                    className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-xs font-semibold hover:bg-emerald-700 transition flex items-center gap-1.5"
                  >
                    Update Now
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setShowUpdate(false)}
                    className="text-slate-500 px-3 py-2 rounded-lg text-xs font-medium hover:text-slate-700 transition"
                  >
                    Later
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Online/offline status */}
        <div className={`self-end flex items-center gap-2 px-3 py-2 rounded-full text-xs font-medium transition ${
          isOnline 
            ? 'bg-emerald-100 text-emerald-700' 
            : 'bg-amber-100 text-amber-700'
        }`}>
          {isOnline ? (
            <>
              <Wifi className="w-3.5 h-3.5" />
              Online
            </>
          ) : (
            <>
              <WifiOff className="w-3.5 h-3.5" />
              Offline
            </>
          )}
        </div>
      </div>

      {/* Mobile position - bottom above nav */}
      <div 
        className="md:hidden fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] left-4 right-4 z-40 flex flex-col gap-2 pointer-events-auto"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {/* Update prompt - mobile */}
        {showUpdate && (
          <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-4 animate-slide-up">
            <div className="flex items-start gap-3">
              <div className="bg-emerald-100 p-2.5 rounded-xl">
                <RefreshCw className="w-5 h-5 text-emerald-600 animate-spin" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-slate-800 text-sm">Update Available</h3>
                <p className="text-xs text-slate-500 mt-1 mb-3">
                  Reload to apply the latest improvements.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleUpdateClick}
                    className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-xs font-semibold hover:bg-emerald-700 transition flex items-center gap-1.5"
                  >
                    Reload
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setShowUpdate(false)}
                    className="text-slate-500 px-3 py-2 rounded-lg text-xs font-medium hover:text-slate-700 transition"
                  >
                    Later
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Install prompt - mobile */}
        {isInstallable && !showUpdate && (
          <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-lg border border-slate-200/80 p-4 animate-slide-up">
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 p-3 rounded-xl shadow-md">
                <Smartphone className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-slate-800 text-sm">Install App</h3>
                <p className="text-xs text-slate-500 truncate">
                  Works offline, faster access
                </p>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button
                  onClick={handleInstallClick}
                  className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-semibold hover:bg-emerald-700 transition flex items-center gap-1.5 shadow-md"
                >
                  <Download className="w-3.5 h-3.5" />
                  Install
                </button>
                <button
                  onClick={handleDismiss}
                  className="text-slate-400 p-2 rounded-xl hover:text-slate-600 hover:bg-slate-100 transition"
                  aria-label="Dismiss"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Online/offline status - mobile */}
        {!isInstallable && !showUpdate && (
          <div className={`self-start flex items-center gap-2 px-3 py-2 rounded-full text-xs font-medium shadow-sm backdrop-blur-md ${
            isOnline 
              ? 'bg-emerald-100/90 text-emerald-700' 
              : 'bg-amber-100/90 text-amber-700'
          }`}>
            {isOnline ? (
              <>
                <Wifi className="w-3.5 h-3.5" />
                <span>Online</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5" />
                <span>Offline Mode</span>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}