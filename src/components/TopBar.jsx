import React, { useState, useEffect, useRef } from 'react';
import { Menu, Sun, SunMedium, Download, LogOut, Key, User, X } from 'lucide-react';
import SyncStatus from './SyncStatus.jsx';
import { triggerHaptic } from '../utils/nativeCapabilities.js';
import { useAuth } from '../hooks/useAuth.js';
import { useAppState } from '../hooks/useAppState.jsx';
import { getCategoryConfig } from '../utils/categoryConfig.js';

export default function TopBar({ title, onMenuClick }) {
  const { user, logout } = useAuth();
  const { state } = useAppState();
  const catConfig = getCategoryConfig(state?.activeCategory || 'herbicide');
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const profileMenuRef = useRef(null);

  const [highContrast, setHighContrast] = useState(() => {
    return typeof document !== 'undefined' && document.body.classList.contains('high-contrast');
  });
  const [canInstall, setCanInstall] = useState(false);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target)) {
        setShowProfileMenu(false);
      }
    };
    if (showProfileMenu) {
      document.addEventListener('mousedown', handleOutsideClick);
      document.addEventListener('touchstart', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, [showProfileMenu]);

  useEffect(() => {
    const handleCanInstall = () => setCanInstall(true);
    const handleInstalled = () => setCanInstall(false);
    window.addEventListener('pwa:can-install', handleCanInstall);
    window.addEventListener('pwa:installed', handleInstalled);
    return () => {
      window.removeEventListener('pwa:can-install', handleCanInstall);
      window.removeEventListener('pwa:installed', handleInstalled);
    };
  }, []);

  const handleInstallClick = () => {
    triggerHaptic('selection');
    window.dispatchEvent(new CustomEvent('pwa-show-install'));
  };

  const toggleHighContrast = () => {
    triggerHaptic('light');
    if (typeof document !== 'undefined') {
      const isCurrentlyHigh = document.body.classList.contains('high-contrast');
      if (isCurrentlyHigh) {
        document.body.classList.remove('high-contrast');
        localStorage.removeItem('field_high_contrast');
        setHighContrast(false);
      } else {
        document.body.classList.add('high-contrast');
        localStorage.setItem('field_high_contrast', 'true');
        setHighContrast(true);
      }
    }
  };

  useEffect(() => {
    if (typeof document !== 'undefined' && localStorage.getItem('field_high_contrast') === 'true') {
      document.body.classList.add('high-contrast');
      setHighContrast(true);
    }
  }, []);

  return (
    <header 
      className="bg-white/80 backdrop-blur-md border-b border-slate-200/50 px-4 py-3 flex justify-between items-center flex-shrink-0 shadow-sm sticky top-0 z-20 w-full max-w-full overflow-hidden"
      style={{ 
        paddingTop: 'max(12px, env(safe-area-inset-top))',
        paddingLeft: 'max(16px, env(safe-area-inset-left))',
        paddingRight: 'max(16px, env(safe-area-inset-right))'
      }}
    >
      <button
        onClick={onMenuClick}
        aria-label="Toggle menu"
        className="md:hidden -ml-2 p-2.5 rounded-xl text-slate-600 hover:bg-slate-100 btn-interactive touch-manipulation"
      >
        <Menu className="w-6 h-6" />
      </button>

      <h1 className="text-base sm:text-xl font-bold text-slate-800 tracking-tight truncate flex-1 text-left mx-1 sm:mx-2 min-w-0">
        {title}
      </h1>

      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        {canInstall && (
          <button
            onClick={handleInstallClick}
            className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-xl bg-[#154734]/10 text-[#154734] hover:bg-[#154734]/15 border border-[#154734]/20 font-bold text-xs shadow-2xs transition active:scale-95 touch-manipulation"
            title="Install Miklens Trial Manager PWA to home screen"
          >
            <Download className="w-3.5 h-3.5 text-[#154734]" />
            <span className="hidden sm:inline">Install</span>
          </button>
        )}

        <button
          onClick={toggleHighContrast}
          className={`p-2 rounded-xl border transition btn-interactive touch-manipulation ${
            highContrast 
              ? 'bg-amber-100 border-amber-300 text-amber-800 shadow-sm' 
              : 'border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50'
          }`}
          title={highContrast ? 'Sunlight Mode Active (Click to disable)' : 'Enable Outdoor Sunlight Mode'}
          aria-label="Toggle Sunlight High-Contrast Mode"
        >
          {highContrast ? <SunMedium className="w-4 h-4 text-amber-600 fill-amber-500" /> : <Sun className="w-4 h-4" />}
        </button>

        <SyncStatus />

        {/* Mobile Quick User Profile & Logout Button */}
        {user && (
          <div className="relative md:hidden" ref={profileMenuRef}>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setShowProfileMenu(!showProfileMenu);
              }}
              className="w-8 h-8 rounded-full flex items-center justify-center font-black text-xs uppercase shadow-xs border border-white/80 active:scale-95 transition"
              style={{ background: catConfig?.color?.hexLight || '#e0f2fe', color: catConfig?.color?.hex || '#0284c7' }}
              title="Account & Sign Out"
              aria-label="Account & Sign Out"
            >
              {(user.displayName || user.Name || user.username || user.Username || user.email || 'U')[0]}
            </button>

            {showProfileMenu && (
              <div className="absolute right-0 top-full mt-2 w-56 bg-white border border-slate-200 rounded-2xl shadow-2xl p-3 z-[110] animate-scale-in text-xs space-y-2">
                <div className="flex items-center gap-2.5 pb-2 border-b border-slate-100">
                  <div 
                    className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm uppercase shrink-0"
                    style={{ background: catConfig?.color?.hexLight || '#e0f2fe', color: catConfig?.color?.hex || '#0284c7' }}
                  >
                    {(user.displayName || user.Name || user.username || user.Username || user.email || 'U')[0]}
                  </div>
                  <div className="overflow-hidden">
                    <p className="font-bold text-slate-900 truncate">
                      {user.displayName || user.Name || user.username || user.Username || user.email}
                    </p>
                    <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">
                      {user.role || user.Role || 'Researcher'}
                    </p>
                  </div>
                </div>

                {canInstall && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowProfileMenu(false);
                      handleInstallClick();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 text-emerald-800 font-bold hover:bg-emerald-100 transition active:scale-95"
                  >
                    <Download className="w-4 h-4 text-emerald-600" />
                    <span>Install App</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setShowProfileMenu(false);
                    if (window.confirm('Log out of this account?')) {
                      logout();
                    }
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-red-600 hover:bg-red-50 font-bold transition active:scale-95"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign Out</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}