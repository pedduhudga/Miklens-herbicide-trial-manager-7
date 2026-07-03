import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, FlaskConical, ListChecks, PlusCircle, MoreHorizontal, QrCode } from 'lucide-react';
import { useAppState } from '../hooks/useAppState.jsx';
import { getCategoryConfig } from '../utils/categoryConfig.js';

export default function BottomNav({ onMoreClick }) {
  const { state } = useAppState();
  const activeCategory = state.activeCategory || 'herbicide';
  const catConfig = getCategoryConfig(activeCategory);
  
  // Dynamic active color class based on category
  const colorMaps = {
    emerald: { active: 'text-emerald-600', activeBg: 'bg-emerald-50', fab: 'bg-emerald-500', fabHover: 'hover:bg-emerald-600' },
    indigo: { active: 'text-indigo-600', activeBg: 'bg-indigo-50', fab: 'bg-indigo-500', fabHover: 'hover:bg-indigo-600' },
    red: { active: 'text-red-600', activeBg: 'bg-red-50', fab: 'bg-red-500', fabHover: 'hover:bg-red-600' },
    amber: { active: 'text-amber-600', activeBg: 'bg-amber-50', fab: 'bg-amber-500', fabHover: 'hover:bg-amber-600' },
    teal: { active: 'text-teal-600', activeBg: 'bg-teal-50', fab: 'bg-teal-500', fabHover: 'hover:bg-teal-600' },
  };
  
  const colors = colorMaps[catConfig?.color?.accent] || colorMaps.emerald;

  const navItems = [
    { to: "/", icon: <LayoutDashboard className="w-6 h-6" />, label: "Home" },
    { to: "/formulations", icon: <FlaskConical className="w-6 h-6" />, label: "Products" },
    { to: "/trials", icon: <ListChecks className="w-6 h-6" />, label: "Trials" },
  ];

  return (
    <nav 
      className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-200/80 shadow-[0_-4px_24px_rgba(0,0,0,0.08)] z-50"
      role="navigation" 
      aria-label="Mobile Navigation"
      style={{ 
        paddingBottom: 'env(safe-area-inset-bottom, 8px)',
        paddingTop: '8px'
      }}
    >
      <div className="flex justify-around items-stretch h-16 max-w-lg mx-auto relative">
        {navItems.map((item, index) => (
          <NavLink
            key={item.to}
            to={item.to}
            aria-label={item.label}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center flex-1 h-full transition-all duration-200 ${
                isActive 
                  ? `${colors.active} ${colors.activeBg}` 
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`
            }
          >
            <div className="relative">
              {item.icon}
              {isActive && (
                <span className={`absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full ${colors.fab}`} />
              )}
            </div>
            <span className="text-[11px] font-semibold mt-0.5">{item.label}</span>
          </NavLink>
        ))}

        {/* Floating Action Button for Scanner */}
        <NavLink
          to="/scanner"
          aria-label="Scan Plot QR Code"
          className={({ isActive }) =>
            `absolute -top-5 left-1/2 -translate-x-1/2 flex flex-col items-center justify-center z-10 transition-transform duration-200 active:scale-95 ${
              isActive ? colors.active : 'text-white'
            }`
          }
        >
          <div 
            className={`
              ${colors.fab} ${colors.fabHover} text-white rounded-2xl p-3.5 
              shadow-lg shadow-emerald-500/30 border-[3px] border-white
              hover:shadow-xl hover:shadow-emerald-500/40 transition-all
            `}
          >
            <QrCode className="w-7 h-7" />
          </div>
          <span className={`text-[10px] font-semibold mt-1 ${isActive ? colors.active : 'text-slate-600'}`}>
            Scan
          </span>
        </NavLink>

        {/* Menu Button */}
        <button
          onClick={onMoreClick}
          aria-label="Open Menu"
          aria-haspopup="true"
          className="flex flex-col items-center justify-center flex-1 h-full text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors"
        >
          <MoreHorizontal className="w-6 h-6" />
          <span className="text-[11px] font-semibold mt-0.5">Menu</span>
        </button>
      </div>
    </nav>
  );
}