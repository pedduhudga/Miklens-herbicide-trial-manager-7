import React, { useState, useEffect } from 'react';
import { 
  Download, 
  Smartphone, 
  Wifi, 
  WifiOff, 
  RefreshCw, 
  X, 
  ChevronRight, 
  Plus, 
  HardDrive, 
  Share2, 
  PlusSquare, 
  Zap, 
  Sun, 
  Check 
} from 'lucide-react';
import { getIndexedDBUsage } from '../services/storageQuotaManager.js';
import { 
  triggerHaptic, 
  requestWakeLock, 
  releaseWakeLock, 
  isWakeLockActive, 
  isWakeLockSupported,
  isStandalonePWA 
} from '../utils/nativeCapabilities.js';

export default function PWAStatus() {
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showUpdate, setShowUpdate] = useState(false);
  const [updateRegistration, setUpdateRegistration] = useState(null);
  const [dismissed, setDismissed] = useState(() => {
    try {
      const until = localStorage.getItem('pwa_install_dismissed_until');
      return until ? Number(until) > Date.now() : false;
    } catch (e) {
      return false;
    }
  });
  const [storageStats, setStorageStats] = useState(null);

  const handleDismissInstall = () => {
    triggerHaptic('light');
    setDismissed(true);
    try {
      // Remember dismissal for 7 days
      localStorage.setItem('pwa_install_dismissed_until', String(Date.now() + 7 * 86400000));
    } catch (e) {}
  };
  
  // Custom Install Sheet Modal State
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  
  // Field Screen Wake Lock state
  const [wakeLockEnabled, setWakeLockEnabled] = useState(false);
  const [wakeLockAvailable, setWakeLockAvailable] = useState(false);

  useEffect(() => {
    setIsInstalled(isStandalonePWA());
    setWakeLockAvailable(isWakeLockSupported());

    // Detect iOS devices
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isAppleDevice = /iphone|ipad|ipod/.test(userAgent) || 
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    setIsIOS(isAppleDevice);

    // Listen for display-mode changes
    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const handleModeChange = (e) => {
      if (e.matches) {
        setIsInstalled(true);
        setShowInstallModal(false);
      }
    };
    mediaQuery.addEventListener('change', handleModeChange);

    // Listen for install prompt
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      if (!isStandalonePWA() && !dismissed) {
        setIsInstallable(true);
        window.dispatchEvent(new CustomEvent('pwa:can-install'));
      }
    };

    // Listen for app installed
    const handleAppInstalled = () => {
      triggerHaptic('success');
      setIsInstalled(true);
      setIsInstallable(false);
      setShowInstallModal(false);
      setDeferredPrompt(null);
      window.dispatchEvent(new CustomEvent('pwa:installed'));
    };

    // Network listeners
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    // Service Worker update listener
    const handleSWUpdate = (e) => {
      setUpdateRegistration(e.detail);
      setShowUpdate(true);
      triggerHaptic('medium');
    };

    const handleExternalShowInstall = () => {
      triggerHaptic('selection');
      setShowInstallModal(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('sw-update-available', handleSWUpdate);
    window.addEventListener('pwa-show-install', handleExternalShowInstall);

    // Initial check for iOS PWA installation capability
    if (isAppleDevice && !isStandalonePWA() && !dismissed) {
      window.dispatchEvent(new CustomEvent('pwa:can-install'));
    }

    setIsOnline(navigator.onLine);

    // Load storage quota
    let active = true;
    getIndexedDBUsage().then((stats) => {
      if (active && stats && stats.quota > 0) {
        const usedMB = (stats.used / (1024 * 1024)).toFixed(1);
        const quotaMB = (stats.quota / (1024 * 1024 * 1024)).toFixed(1);
        setStorageStats({ usedMB, quotaGB: quotaMB });
      }
    }).catch(() => {});

    return () => {
      active = false;
      mediaQuery.removeEventListener('change', handleModeChange);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('sw-update-available', handleSWUpdate);
      window.removeEventListener('pwa-show-install', handleExternalShowInstall);
    };
  }, [dismissed]);

  const handleOpenInstallSheet = () => {
    triggerHaptic('selection');
    setShowInstallModal(true);
  };

  const handleNativeInstall = async () => {
    triggerHaptic('medium');
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setIsInstallable(false);
        setDeferredPrompt(null);
        setShowInstallModal(false);
      }
    }
  };

  const handleUpdateClick = () => {
    triggerHaptic('medium');
    if (updateRegistration && updateRegistration.waiting) {
      updateRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
    // Also instruct SW directly via controller
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
    }
    setShowUpdate(false);
    setTimeout(() => {
      window.location.reload();
    }, 400);
  };

  const toggleWakeLock = async () => {
    triggerHaptic('light');
    if (wakeLockEnabled) {
      await releaseWakeLock();
      setWakeLockEnabled(false);
    } else {
      const success = await requestWakeLock();
      if (success) {
        setWakeLockEnabled(true);
      }
    }
  };

  return (
    <>
      {/* ─── DESKTOP UPDATE / STATUS NOTIFIER ─── */}
      <div className="hidden md:flex fixed bottom-5 right-5 z-50 flex-col gap-2.5 pointer-events-auto select-none">
        {showUpdate && (
          <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-emerald-500/30 p-4 max-w-sm animate-slide-up">
            <div className="flex items-start gap-3">
              <div className="bg-emerald-500 text-white p-2.5 rounded-xl shadow-md">
                <RefreshCw className="w-5 h-5 animate-spin" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-slate-800 text-sm">App Update Ready</h3>
                <p className="text-xs text-slate-500 mt-1 mb-3">
                  A high-speed performance update is available. Reload now to apply.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleUpdateClick}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 shadow-sm active:scale-95"
                  >
                    Update Now
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setShowUpdate(false)}
                    className="text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-xl text-xs font-medium transition"
                  >
                    Later
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Desktop status pill: Only display when offline or when wake lock is actively enabled */}
        <div className="flex items-center gap-2 self-end">
          {wakeLockAvailable && isInstalled && wakeLockEnabled && (
            <button
              onClick={toggleWakeLock}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border shadow-sm transition active:scale-95 bg-amber-50 text-amber-700 border-amber-300"
              title="Screen Wake Lock Active (Screen will not dim). Click to turn off."
            >
              <Sun className="w-3.5 h-3.5 text-amber-500 fill-amber-400" />
              <span>Awake Active</span>
            </button>
          )}

          {!isOnline && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold shadow-sm backdrop-blur-md border bg-amber-500 text-white border-amber-400 animate-pulse">
              <WifiOff className="w-3.5 h-3.5" />
              <span>Offline Mode (Synced locally)</span>
            </div>
          )}
        </div>
      </div>

      {/* ─── MOBILE BOTTOM ACTION PILLS & UPDATE BANNER (Streamlined, Non-blocking) ─── */}
      <div 
        className="md:hidden fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] left-3 right-3 z-40 flex flex-col gap-2 pointer-events-none select-none"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {/* Mobile Update Banner */}
        {showUpdate && (
          <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-2xl shadow-xl border border-emerald-500/30 p-3 animate-slide-up flex items-center justify-between gap-3 pointer-events-auto">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="bg-emerald-500 text-white p-2 rounded-xl flex-shrink-0">
                <RefreshCw className="w-4 h-4 animate-spin" />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100">New App Version Ready</h4>
                <p className="text-[11px] text-slate-500 truncate">Tap to reload latest update</p>
              </div>
            </div>
            <button
              onClick={handleUpdateClick}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-xl text-xs font-semibold flex-shrink-0 shadow-sm active:scale-95"
            >
              Reload
            </button>
          </div>
        )}

        {/* Mobile Offline Indicator (Only shown when disconnected, never clutters when online) */}
        {!isOnline && (
          <div className="flex items-center justify-center pointer-events-auto">
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold shadow-lg bg-amber-600 text-white backdrop-blur-md border border-amber-400/40 animate-pulse">
              <WifiOff className="w-3.5 h-3.5 shrink-0" />
              <span>Offline Mode • Changes queued</span>
            </div>
          </div>
        )}

        {/* Mobile Screen Awake Badge (Only shown when user actively enabled it) */}
        {wakeLockEnabled && (
          <div className="flex items-center justify-end pointer-events-auto">
            <button
              onClick={toggleWakeLock}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold shadow-md bg-amber-500 text-white backdrop-blur-md border border-amber-300/50 active:scale-95"
              title="Screen Wake Lock is active. Tap to turn off."
            >
              <Sun className="w-3 h-3 fill-white" />
              <span>Screen Awake</span>
            </button>
          </div>
        )}

        {/* Mobile Install Promotion Banner (Compact, dismissible with 7-day memory) */}
        {!isInstalled && !dismissed && isInstallable && (
          <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-2xl shadow-xl border border-emerald-500/30 p-2.5 animate-slide-up flex items-center justify-between gap-2.5 pointer-events-auto">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-sm flex-shrink-0">
                <Smartphone className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-100">Install Mobile App</span>
                  <span className="text-[9px] font-extrabold bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded-full">0ms</span>
                </div>
                <p className="text-[10px] text-slate-500 truncate">Full offline field performance</p>
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={deferredPrompt ? handleNativeInstall : handleOpenInstallSheet}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 shadow-sm active:scale-95 transition"
              >
                <Download className="w-3 h-3" />
                Install
              </button>
              <button
                onClick={handleDismissInstall}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-xl transition"
                aria-label="Dismiss banner"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ─── NATIVE APP INSTALL INSTRUCTION MODAL (iOS & Android) ─── */}
      {showInstallModal && (
        <div 
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in"
          onClick={() => setShowInstallModal(false)}
        >
          <div 
            className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200/80 w-full max-w-md p-6 max-h-[90vh] overflow-y-auto animate-slide-up"
            onClick={(e) => e.stopPropagation()}
            style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-lg">
                  <Smartphone className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-800 text-lg">Miklens Trial Manager</h3>
                  <p className="text-xs text-emerald-700 font-semibold">Official Native PWA</p>
                </div>
              </div>
              <button 
                onClick={() => setShowInstallModal(false)}
                className="p-2 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Feature Highlights */}
            <div className="grid grid-cols-3 gap-2 my-4">
              <div className="bg-emerald-50/80 rounded-2xl p-2.5 text-center border border-emerald-100">
                <Zap className="w-4 h-4 text-emerald-600 mx-auto mb-1" />
                <span className="text-[11px] font-bold text-emerald-900 block">Instant Speed</span>
                <span className="text-[9px] text-emerald-700">0ms offline load</span>
              </div>
              <div className="bg-emerald-50/80 rounded-2xl p-2.5 text-center border border-emerald-100">
                <WifiOff className="w-4 h-4 text-emerald-600 mx-auto mb-1" />
                <span className="text-[11px] font-bold text-emerald-900 block">100% Offline</span>
                <span className="text-[9px] text-emerald-700">Field work ready</span>
              </div>
              <div className="bg-emerald-50/80 rounded-2xl p-2.5 text-center border border-emerald-100">
                <Sun className="w-4 h-4 text-emerald-600 mx-auto mb-1" />
                <span className="text-[11px] font-bold text-emerald-900 block">Sunlight Mode</span>
                <span className="text-[9px] text-emerald-700">High contrast view</span>
              </div>
            </div>

            {/* Instructions: iOS Safari vs Android Chrome */}
            {isIOS ? (
              <div className="space-y-3.5 my-4">
                <div className="bg-slate-50 rounded-2xl p-3 border border-slate-200/80 flex items-start gap-3">
                  <div className="w-7 h-7 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center font-bold text-xs flex-shrink-0">
                    1
                  </div>
                  <div className="text-xs text-slate-700">
                    Tap the <strong className="text-slate-900">Share button</strong> at the bottom of your Safari screen:
                    <div className="inline-flex items-center gap-1 ml-1.5 px-2 py-0.5 rounded-lg bg-sky-50 text-sky-700 font-semibold border border-sky-200">
                      <Share2 className="w-3.5 h-3.5" />
                      <span>Share</span>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-50 rounded-2xl p-3 border border-slate-200/80 flex items-start gap-3">
                  <div className="w-7 h-7 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs flex-shrink-0">
                    2
                  </div>
                  <div className="text-xs text-slate-700">
                    Scroll down and select <strong className="text-slate-900">"Add to Home Screen"</strong>:
                    <div className="inline-flex items-center gap-1 ml-1.5 px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
                      <PlusSquare className="w-3.5 h-3.5" />
                      <span>Add to Home Screen</span>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-50 rounded-2xl p-3 border border-slate-200/80 flex items-start gap-3">
                  <div className="w-7 h-7 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-xs flex-shrink-0">
                    3
                  </div>
                  <div className="text-xs text-slate-700">
                    Tap <strong className="text-slate-900">"Add"</strong> in the top-right corner to finish installing.
                  </div>
                </div>
              </div>
            ) : deferredPrompt ? (
              <div className="my-5 text-center">
                <p className="text-xs text-slate-600 mb-4">
                  Tap below to add Miklens Trial Manager to your home screen or desktop. No app store download needed.
                </p>
                <button
                  onClick={handleNativeInstall}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3.5 px-5 rounded-2xl font-bold text-sm shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2 transition active:scale-95"
                >
                  <Download className="w-4 h-4" />
                  Install App Now
                </button>
              </div>
            ) : (
              <div className="space-y-3.5 my-4">
                <div className="bg-slate-50 rounded-2xl p-3 border border-slate-200 flex items-start gap-3">
                  <div className="w-7 h-7 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs flex-shrink-0">
                    1
                  </div>
                  <div className="text-xs text-slate-700">
                    Tap the <strong className="text-slate-900">browser menu (⋮)</strong> or install icon in your address bar.
                  </div>
                </div>
                <div className="bg-slate-50 rounded-2xl p-3 border border-slate-200 flex items-start gap-3">
                  <div className="w-7 h-7 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs flex-shrink-0">
                    2
                  </div>
                  <div className="text-xs text-slate-700">
                    Select <strong className="text-slate-900">"Install Miklens Trial Manager"</strong> or <strong>"Add to Home screen"</strong>.
                  </div>
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
              <span className="flex items-center gap-1 text-emerald-600 font-medium">
                <Check className="w-3.5 h-3.5" />
                No App Store required
              </span>
              <button 
                onClick={() => setShowInstallModal(false)}
                className="text-slate-500 font-semibold hover:text-slate-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}