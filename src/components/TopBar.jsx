import React, { useState, useEffect } from 'react';
import { Menu, Sun, SunMedium, Download } from 'lucide-react';
import SyncStatus from './SyncStatus.jsx';
import { triggerHaptic } from '../utils/nativeCapabilities.js';

export default function TopBar({ title, onMenuClick }) {
  const [highContrast, setHighContrast] = useState(() => {
    return typeof document !== 'undefined' && document.body.classList.contains('high-contrast');
  });
  const [canInstall, setCanInstall] = useState(false);

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
      </div>
    </header>
  );
}