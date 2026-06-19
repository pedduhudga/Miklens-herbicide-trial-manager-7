import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppState } from '../hooks/useAppState.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { CATEGORIES, hasAccess } from '../utils/categoryConfig.js';
import {
  Leaf, Shield, Bug, Beaker, Sprout, ChevronRight, Lock, LogOut, FlaskConical
} from 'lucide-react';

const ICON_MAP = {
  Leaf: Leaf,
  Shield: Shield,
  Bug: Bug,
  Beaker: Beaker,
  Sprout: Sprout,
};

const COLOR_MAP = {
  emerald: {
    card: 'bg-gradient-to-br from-emerald-500 to-emerald-700',
    hover: 'hover:from-emerald-400 hover:to-emerald-600',
    glow: 'hover:shadow-emerald-300/50',
    ring: 'ring-emerald-400',
    badge: 'bg-emerald-100 text-emerald-700',
    iconBg: 'bg-white/20',
  },
  indigo: {
    card: 'bg-gradient-to-br from-indigo-500 to-purple-700',
    hover: 'hover:from-indigo-400 hover:to-purple-600',
    glow: 'hover:shadow-indigo-300/50',
    ring: 'ring-indigo-400',
    badge: 'bg-indigo-100 text-indigo-700',
    iconBg: 'bg-white/20',
  },
  red: {
    card: 'bg-gradient-to-br from-red-500 to-orange-600',
    hover: 'hover:from-red-400 hover:to-orange-500',
    glow: 'hover:shadow-red-300/50',
    ring: 'ring-red-400',
    badge: 'bg-red-100 text-red-700',
    iconBg: 'bg-white/20',
  },
  amber: {
    card: 'bg-gradient-to-br from-amber-500 to-yellow-600',
    hover: 'hover:from-amber-400 hover:to-yellow-500',
    glow: 'hover:shadow-amber-300/50',
    ring: 'ring-amber-400',
    badge: 'bg-amber-100 text-amber-700',
    iconBg: 'bg-white/20',
  },
  teal: {
    card: 'bg-gradient-to-br from-teal-500 to-cyan-600',
    hover: 'hover:from-teal-400 hover:to-cyan-500',
    glow: 'hover:shadow-teal-300/50',
    ring: 'ring-teal-400',
    badge: 'bg-teal-100 text-teal-700',
    iconBg: 'bg-white/20',
  },
};

export default function CategorySelector() {
  const { state, dispatch } = useAppState();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const rawUname = user?.username || user?.Username || user?.Name || 'User';
  const cleanUname = rawUname.includes('@') ? rawUname.split('@')[0] : rawUname;
  const displayUname = cleanUname.charAt(0).toUpperCase() + cleanUname.slice(1);

  const lastUsed = state.activeCategory;

  // Count trials per category (look at all data for counts)
  const trialCounts = useMemo(() => {
    const counts = {};
    Object.keys(CATEGORIES).forEach(catId => { counts[catId] = 0; });
    // Count from state.trials (these are existing herbicide trials)
    const trials = state.trials || [];
    trials.forEach(t => {
      const cat = t.Category || 'herbicide';
      if (counts[cat] !== undefined) counts[cat]++;
    });
    return counts;
  }, [state.trials]);

  const handleSelect = (categoryId) => {
    dispatch({ type: 'SET_CATEGORY', payload: categoryId });
    navigate('/');
  };

  const categories = Object.values(CATEGORIES);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-5 border-b border-slate-200/60 bg-white/70 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-lg shadow-emerald-200/50">
            <FlaskConical className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800 tracking-tight">Miklens Trial Manager</h1>
            <p className="text-xs text-slate-400">Multi-Category Agri-Science Platform</p>
          </div>
        </div>
        {user && (
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-sm font-semibold text-slate-700">{displayUname}</span>
              <span className="text-xs text-slate-400 uppercase tracking-wider">{user.role || user.Role || 'user'}</span>
            </div>
            <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold uppercase text-sm">
              {displayUname[0] || 'U'}
            </div>
            <button
              onClick={logout}
              className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-8 sm:py-12">
        <div className="text-center mb-8 sm:mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-800 mb-2">
            Select Trial Category
          </h2>
          <p className="text-slate-500 text-sm sm:text-base max-w-lg mx-auto">
            Choose which type of trials you want to work with. Each category has its own data, formulations, and analysis tools.
          </p>
        </div>

        {/* Category Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 max-w-4xl w-full">
          {categories.map((cat) => {
            const Icon = ICON_MAP[cat.icon] || Leaf;
            const colors = COLOR_MAP[cat.color.accent] || COLOR_MAP.emerald;
            const canAccess = hasAccess(user, cat.id, 'read');
            const isLast = lastUsed === cat.id;
            const count = trialCounts[cat.id] || 0;

            return (
              <button
                key={cat.id}
                onClick={() => canAccess && handleSelect(cat.id)}
                disabled={!canAccess}
                className={`
                  relative group rounded-2xl p-6 text-left text-white transition-all duration-300
                  ${colors.card} ${canAccess ? colors.hover : 'opacity-50 cursor-not-allowed grayscale'}
                  ${canAccess ? `hover:scale-[1.03] hover:shadow-2xl ${colors.glow}` : ''}
                  ${isLast && canAccess ? `ring-3 ${colors.ring} ring-offset-2` : ''}
                  shadow-lg
                `}
              >
                {/* Last Used Badge */}
                {isLast && canAccess && (
                  <div className="absolute -top-2 -right-2 bg-white text-slate-700 text-[10px] font-bold px-2.5 py-1 rounded-full shadow-md border border-slate-200 uppercase tracking-wider">
                    Last Used
                  </div>
                )}

                {/* Lock Icon for No Access */}
                {!canAccess && (
                  <div className="absolute top-3 right-3">
                    <Lock className="w-5 h-5 text-white/60" />
                  </div>
                )}

                {/* Icon */}
                <div className={`w-14 h-14 rounded-xl ${colors.iconBg} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}>
                  <Icon className="w-7 h-7 text-white" />
                </div>

                {/* Name & Description */}
                <h3 className="text-xl font-bold mb-1.5">{cat.name}</h3>
                <p className="text-white/70 text-xs leading-relaxed mb-4 line-clamp-2">
                  {cat.description}
                </p>

                {/* Footer */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="bg-white/20 text-white text-xs font-bold px-2.5 py-1 rounded-lg backdrop-blur-sm">
                      {count} trial{count !== 1 ? 's' : ''}
                    </span>
                  </div>
                  {canAccess && (
                    <div className="flex items-center gap-1 text-white/80 text-xs font-medium group-hover:text-white transition">
                      <span>Open</span>
                      <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer info */}
        <p className="text-xs text-slate-400 mt-8 text-center">
          Each category maintains separate trials, formulations, projects, and analysis data.
        </p>
      </main>
    </div>
  );
}
