import React, { useState, useEffect } from 'react';
import { Menu, Sun, SunMedium } from 'lucide-react';
import SyncStatus from './SyncStatus.jsx';
import { triggerHaptic } from '../utils/nativeCapabilities.js';

export default function TopBar({ title, onMenuClick }) {
  const [highContrast, setHighContrast] = useState(() => {
    return typeof document !== 'undefined' && document.body.classList.contains('high-contrast');
  });

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
      className="bg-white/80 backdrop-blur-md border-b border-slate-200/50 px-4 py-3 flex justify-between items-center flex-shrink-0 shadow-sm sticky top-0 z-20"
      style={{ 
        paddingTop: 'max(12px, env(safe-area-inset-top))',
        paddingLeft: 'max(16px, env(safe-area-inset-left))',
        paddingRight: 'max(16px, env(safe-area-inset-right))'
      }}
    >
      <button
        onClick={onMenuClick}
        aria-label="Toggle menu"
        className="md:hidden -ml-2 p-2.5 rounded-xl text-slate-600 hover:bg-slate-100 active:bg-slate-200 transition-colors touch-manipulation"
      >
        <Menu className="w-6 h-6" />
      </button>

      <h1 className="text-lg md:text-2xl font-bold text-slate-800 tracking-tight truncate flex-1 text-center mx-2">
        {title}
      </h1>

      <div className="flex items-center gap-2">
        <button
          onClick={toggleHighContrast}
          className={`p-2 rounded-xl border transition touch-manipulation ${
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