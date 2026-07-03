import React from 'react';
import { Menu } from 'lucide-react';
import SyncStatus from './SyncStatus.jsx';

export default function TopBar({ title, onMenuClick }) {
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

      {/* Extra padding on mobile for menu button alignment */}
      <div className="md:hidden w-10" />

      <h1 className="text-lg md:text-2xl font-bold text-slate-800 tracking-tight truncate flex-1 text-center mx-2">
        {title}
      </h1>

      <SyncStatus />
    </header>
  );
}