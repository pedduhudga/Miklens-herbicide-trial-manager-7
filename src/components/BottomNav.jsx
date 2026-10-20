import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, FlaskConical, ListChecks, PlusCircle, MoreHorizontal, QrCode } from 'lucide-react';
import { useAppState } from '../hooks/useAppState.jsx';
import { getCategoryConfig } from '../utils/categoryConfig.js';

import { triggerHaptic } from '../utils/nativeCapabilities.js';

export default function BottomNav({ onMoreClick }) {
  const { state } = useAppState();
  const activeCategory = state.activeCategory || 'herbicide';
  const catConfig = getCategoryConfig(activeCategory);
  
  // Dynamic active color class based on category - with deep forest green as primary
  const colorMaps = {
    emerald: { 
      active: 'text-[#154734]', 
      activeBg: 'bg-[#154734]/10', 
      fab: 'bg-[#154734]', 
      fabHover: 'hover:bg-[#0e3525]',
      glow: 'shadow-[#154734]/25'
    },
    indigo: { 
      active: 'text-indigo-600', 
      activeBg: 'bg-indigo-50', 
      fab: 'bg-indigo-600', 
      fabHover: 'hover:bg-indigo-700',
      glow: 'shadow-indigo-500/25'
    },
    red: { 
      active: 'text-rose-600', 
      activeBg: 'bg-rose-50', 
      fab: 'bg-rose-600', 
      fabHover: 'hover:bg-rose-700',
      glow: 'shadow-rose-500/25'
    },
    amber: { 
      active: 'text-amber-600', 
      activeBg: 'bg-amber-50', 
      fab: 'bg-amber-600', 
      fabHover: 'hover:bg-amber-700',
      glow: 'shadow-amber-500/25'
    },
    teal: { 
      active: 'text-teal-700', 
      activeBg: 'bg-teal-50', 
      fab: 'bg-teal-700', 
      fabHover: 'hover:bg-teal-800',
      glow: 'shadow-teal-600/25'
    },
  };
  
  const colors = colorMaps[catConfig?.color?.accent] || colorMaps.emerald;

  return (
    <nav 
      className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-200/90 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] z-50 select-none"
      role="navigation" 
      aria-label="Mobile Navigation"
      style={{ 
        paddingBottom: 'max(8px, env(safe-area-inset-bottom, 8px))',
        paddingTop: '6px'
      }}
    >
      <div className="grid grid-cols-5 items-center h-14 max-w-md mx-auto px-1">
        {/* Slot 1: Home */}
        <NavLink
          to="/"
          aria-label="Home"
          onClick={() => triggerHaptic('light')}
          className={({ isActive }) =>
            `flex flex-col items-center justify-center h-full rounded-xl transition-all duration-150 active:scale-95 touch-manipulation ${
              isActive 
                ? `${colors.active} font-semibold` 
                : 'text-slate-500 hover:text-slate-800'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <div className="relative">
                <LayoutDashboard className="w-5 h-5 stroke-[2.2]" />
                {isActive && (
                  <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-[#154734]" />
                )}
              </div>
              <span className="text-[10px] tracking-tight mt-1">Home</span>
            </>
          )}
        </NavLink>

        {/* Slot 2: Products */}
        <NavLink
          to="/formulations"
          aria-label="Products"
          onClick={() => triggerHaptic('light')}
          className={({ isActive }) =>
            `flex flex-col items-center justify-center h-full rounded-xl transition-all duration-150 active:scale-95 touch-manipulation ${
              isActive 
                ? `${colors.active} font-semibold` 
                : 'text-slate-500 hover:text-slate-800'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <div className="relative">
                <FlaskConical className="w-5 h-5 stroke-[2.2]" />
                {isActive && (
                  <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-[#154734]" />
                )}
              </div>
              <span className="text-[10px] tracking-tight mt-1">Products</span>
            </>
          )}
        </NavLink>

        {/* Slot 3: Center Action Button (Scan Plot QR) */}
        <div className="flex flex-col items-center justify-center relative">
          <NavLink
            to="/scanner"
            aria-label="Scan Plot QR Code"
            onClick={() => triggerHaptic('medium')}
            className={({ isActive }) =>
              `relative -top-3 flex flex-col items-center justify-center transition-transform duration-150 active:scale-90 touch-manipulation`
            }
          >
            {({ isActive }) => (
              <>
                <div 
                  className={`
                    ${colors.fab} ${colors.fabHover} text-white rounded-2xl p-3 
                    shadow-md ${colors.glow} border-2 border-white
                    transition-all
                  `}
                >
                  <QrCode className="w-5 h-5 stroke-[2.4]" />
                </div>
                <span className={`text-[10px] font-semibold mt-0.5 tracking-tight ${isActive ? colors.active : 'text-slate-600'}`}>
                  Scan
                </span>
              </>
            )}
          </NavLink>
        </div>

        {/* Slot 4: Trials */}
        <NavLink
          to="/trials"
          aria-label="Trials"
          onClick={() => triggerHaptic('light')}
          className={({ isActive }) =>
            `flex flex-col items-center justify-center h-full rounded-xl transition-all duration-150 active:scale-95 touch-manipulation ${
              isActive 
                ? `${colors.active} font-semibold` 
                : 'text-slate-500 hover:text-slate-800'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <div className="relative">
                <ListChecks className="w-5 h-5 stroke-[2.2]" />
                {isActive && (
                  <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-[#154734]" />
                )}
              </div>
              <span className="text-[10px] tracking-tight mt-1">Trials</span>
            </>
          )}
        </NavLink>

        {/* Slot 5: Menu */}
        <button
          onClick={(e) => {
            triggerHaptic('light');
            onMoreClick(e);
          }}
          aria-label="Open Menu"
          aria-haspopup="true"
          className="flex flex-col items-center justify-center h-full rounded-xl text-slate-500 hover:text-slate-800 active:scale-95 transition-all touch-manipulation"
        >
          <MoreHorizontal className="w-5 h-5 stroke-[2.2]" />
          <span className="text-[10px] tracking-tight mt-1">Menu</span>
        </button>
      </div>
    </nav>
  );
}