import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, FolderKanban, ScanQrCode, FlaskConical,
  ListChecks, FileBox, ShoppingBag, Sparkles, BarChartBig,
  MapPin, Search, Database, Settings, Users, LogOut, Calculator, Bell,
  TrendingDown, ShieldAlert, Flame, Compass, ChevronDown,
  Leaf, Shield, Bug, Beaker, Sprout, Grid3x3, Key, Lock, Eye, EyeOff, X, CheckCircle, RefreshCw
} from 'lucide-react';
import { useAppState } from '../hooks/useAppState.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { CATEGORIES, getCategoryConfig, hasAccess } from '../utils/categoryConfig.js';
import { getFirebaseAuth } from '../services/firebase.js';
import { signInWithEmailAndPassword, updatePassword } from 'firebase/auth';
import { fbUpdateUserProfile } from '../services/firebaseAuth.js';

const ICON_MAP = {
  Leaf, Shield, Bug, Beaker, Sprout,
};

const ACCENT_CLASSES = {
  emerald: {
    header: 'bg-emerald-600',
    activeBg: 'bg-emerald-100 text-emerald-800',
    hoverBg: 'hover:bg-emerald-50 hover:text-emerald-700',
    iconBg: 'text-emerald-600',
    badge: 'bg-emerald-100 text-emerald-600',
  },
  indigo: {
    header: 'bg-indigo-600',
    activeBg: 'bg-indigo-100 text-indigo-800',
    hoverBg: 'hover:bg-indigo-50 hover:text-indigo-700',
    iconBg: 'text-indigo-600',
    badge: 'bg-indigo-100 text-indigo-600',
  },
  red: {
    header: 'bg-red-600',
    activeBg: 'bg-red-100 text-red-800',
    hoverBg: 'hover:bg-red-50 hover:text-red-700',
    iconBg: 'text-red-600',
    badge: 'bg-red-100 text-red-600',
  },
  amber: {
    header: 'bg-amber-600',
    activeBg: 'bg-amber-100 text-amber-800',
    hoverBg: 'hover:bg-amber-50 hover:text-amber-700',
    iconBg: 'text-amber-600',
    badge: 'bg-amber-100 text-amber-600',
  },
  teal: {
    header: 'bg-teal-600',
    activeBg: 'bg-teal-100 text-teal-800',
    hoverBg: 'hover:bg-teal-50 hover:text-teal-700',
    iconBg: 'text-teal-600',
    badge: 'bg-teal-100 text-teal-600',
  },
};

export default function Sidebar({ isOpen, onClose }) {
  const { user, isAdmin, isViewer, logout } = useAuth();
  const rawUname = user?.Name || user?.Username || user?.username || 'Researcher';
  const cleanUname = rawUname.includes('@') ? rawUname.split('@')[0] : rawUname;
  const displayUname = cleanUname.charAt(0).toUpperCase() + cleanUname.slice(1);
  const { state, dispatch } = useAppState();
  const navigate = useNavigate();
  const firebaseEnabled = !!state.settings?.firebaseEnabled;
  const activeCategory = state.activeCategory || 'herbicide';
  const catConfig = getCategoryConfig(activeCategory);
  const accent = ACCENT_CLASSES[catConfig.color.accent] || ACCENT_CLASSES.emerald;
  const CatIcon = ICON_MAP[catConfig.icon] || FlaskConical;

  const [catDropdownOpen, setCatDropdownOpen] = useState(false);

  // Change Password Modal state
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [changeLoading, setChangeLoading] = useState(false);
  const [changeError, setChangeError] = useState('');
  const [changeSuccess, setChangeSuccess] = useState('');

  const queueLength = state.syncQueue?.length || 0;
  const [prevQueueLength, setPrevQueueLength] = useState(0);
  const [maxQueueLength, setMaxQueueLength] = useState(0);

  if (queueLength !== prevQueueLength) {
    setPrevQueueLength(queueLength);
    if (queueLength === 0) {
      setMaxQueueLength(0);
    } else if (queueLength > maxQueueLength) {
      setMaxQueueLength(queueLength);
    }
  }

  const handleChangePasswordSubmit = async (e) => {
    e.preventDefault();
    setChangeError('');
    setChangeSuccess('');

    if (newPassword.length < 6) {
      setChangeError('New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setChangeError('New passwords do not match.');
      return;
    }

    setChangeLoading(true);
    try {
      // Firebase auth methods are statically imported at the top

      const auth = getFirebaseAuth();
      const userEmail = auth.currentUser?.email;
      if (!userEmail) throw new Error('No user is currently logged in.');

      // 1. Re-authenticate
      const cred = await signInWithEmailAndPassword(auth, userEmail, currentPassword);
      
      // 2. Update Auth password
      await updatePassword(cred.user, newPassword);

      // 3. Update Firestore profile
      await fbUpdateUserProfile(cred.user.uid, { Password: newPassword });

      setChangeSuccess('Password successfully updated!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Password updated successfully!', type: 'success' } }));
      setTimeout(() => setShowChangePasswordModal(false), 1500);
    } catch (err) {
      const map = {
        'auth/wrong-password': 'Incorrect current password.',
        'auth/weak-password': 'New password is too weak.',
      };
      setChangeError(map[err.code] || err.message);
    } finally {
      setChangeLoading(false);
    }
  };

  const handleCategorySwitch = (catId) => {
    dispatch({ type: 'SET_CATEGORY', payload: catId });
    setCatDropdownOpen(false);
    navigate('/');
  };

  const navItems = [
    { to: "/", icon: <LayoutDashboard className="w-5 h-5" />, label: "Dashboard" },
    { to: "/categories", icon: <Grid3x3 className="w-5 h-5" />, label: "All Categories" },
    { to: "/large-scale-trials", icon: <Compass className="w-5 h-5" />, label: "Large Field Trials" },
    { to: "/projects", icon: <FolderKanban className="w-5 h-5" />, label: "Projects (Grouped)" },
    { to: "/scanner", icon: <ScanQrCode className="w-5 h-5" />, label: "Plot Scanner" },
    { to: "/formulations", icon: <FlaskConical className="w-5 h-5" />, label: "Formulations" },
    { to: "/trials", icon: <ListChecks className="w-5 h-5" />, label: "Trials" },
    { to: "/reports", icon: <FileBox className="w-5 h-5" />, label: "Reports & Cards" },
    { to: "/organisations", icon: <FolderKanban className="w-5 h-5" />, label: "Organisations" },
    { to: "/ingredients", icon: <ShoppingBag className="w-5 h-5" />, label: "Ingredient Costs" },
    { to: "/ai-assistant", icon: <Sparkles className="w-5 h-5" />, label: "AI Assistant" },
    { to: "/analytics", icon: <BarChartBig className="w-5 h-5" />, label: "Analytics" },
    { to: "/statistics", icon: <Calculator className="w-5 h-5" />, label: "Statistics" },
    { to: "/dose-response", icon: <TrendingDown className="w-5 h-5" />, label: "Dose-Response (ED50)" },
    // Resistance Tracker — only for herbicide
    ...(activeCategory === 'herbicide' ? [
      { to: "/resistance", icon: <ShieldAlert className="w-5 h-5" />, label: "Resistance Tracker" },
    ] : []),
    { to: "/alerts", icon: <Bell className="w-5 h-5" />, label: "Smart Alerts" },
    { to: "/map", icon: <MapPin className="w-5 h-5" />, label: "Field Map" },
    { to: "/search", icon: <Search className="w-5 h-5" />, label: "Smart Search" },
  ];

  const bottomItems = [
    { to: "/data", icon: <Database className="w-5 h-5" />, label: "Data Management" },
    { to: "/settings", icon: <Settings className="w-5 h-5" />, label: "Settings" },
  ];

  const filteredNavItems = navItems;

  const filteredBottomItems = bottomItems;

  const sidebarClass = `sidebar bg-white/70 backdrop-blur-md w-64 flex-shrink-0 border-r border-white/40 shadow-[4px_0_24px_rgba(0,0,0,0.02)] flex flex-col fixed inset-y-0 left-0 z-30 md:relative md:translate-x-0 transition-transform duration-300 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`;

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-20 md:hidden"
          onClick={onClose}
        />
      )}

      <aside className={sidebarClass}>
        {/* Category-themed header */}
        <div className="px-5 py-4 border-b border-white/50">
          <div className="flex justify-between items-center mb-2">
            <h2 className={`font-bold text-lg ${accent.iconBg} flex items-center gap-2 tracking-tight`}>
              <CatIcon className="h-5 w-5" />
              {catConfig.name} Trials
            </h2>
          </div>

          {/* Category Switcher Dropdown */}
          <div className="relative">
            <button
              onClick={() => setCatDropdownOpen(!catDropdownOpen)}
              className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 transition"
            >
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full`} style={{ background: catConfig.color.hex }} />
                <span>{catConfig.name}</span>
              </div>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${catDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {catDropdownOpen && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden">
                {Object.values(CATEGORIES)
                  .map(cat => {
                    const Icon = ICON_MAP[cat.icon] || FlaskConical;
                    const canAccess = hasAccess(user, cat.id, 'read');
                    const isActive = cat.id === activeCategory;
                    return (
                      <button
                        key={cat.id}
                        onClick={() => canAccess && handleCategorySwitch(cat.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 text-left text-xs transition
                          ${isActive ? 'bg-slate-100 font-bold text-slate-800' : 'text-slate-600 hover:bg-slate-50'}
                          ${!canAccess ? 'text-slate-400 font-medium' : 'cursor-pointer'}
                        `}
                      >
                        <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: cat.color.hexLight }}>
                          <Icon className="w-3.5 h-3.5" style={{ color: cat.color.hex }} />
                        </div>
                        <span>{cat.name}</span>
                        {!canAccess && <span className="ml-auto text-[9px] font-bold uppercase text-red-500 bg-red-50 px-1 py-0.5 rounded border border-red-100">Locked</span>}
                        {isActive && canAccess && <span className="ml-auto text-[9px] font-bold uppercase text-slate-400">Active</span>}
                      </button>
                    );
                  })}
              </div>
            )}
          </div>
        </div>

        <nav className="flex-grow overflow-y-auto p-4 space-y-1">
          {filteredNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => window.innerWidth < 768 && onClose()}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2.5 rounded-xl font-medium transition-all duration-200 ${
                  isActive
                    ? `${accent.activeBg} shadow-sm`
                    : `text-slate-600 ${accent.hoverBg} hover:translate-x-1`
                }`
              }
            >
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          ))}

          <div className="pt-4 mt-8 border-t border-slate-200/50">
            {filteredBottomItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => window.innerWidth < 768 && onClose()}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-2.5 rounded-xl font-medium transition-all duration-200 ${
                    isActive
                      ? `${accent.activeBg} shadow-sm`
                      : `text-slate-600 ${accent.hoverBg} hover:translate-x-1`
                  }`
                }
              >
                {item.icon}
                <span>{item.label}</span>
              </NavLink>
            ))}

            {isAdmin && (
              <div className="border-t border-slate-200/50 mt-4 pt-4 space-y-1">
                <NavLink
                  to="/users"
                  onClick={() => window.innerWidth < 768 && onClose()}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-2.5 rounded-xl font-medium transition-all duration-200 ${
                      isActive
                        ? `${accent.activeBg} shadow-sm`
                        : `text-slate-600 ${accent.hoverBg} hover:translate-x-1`
                    }`
                  }
                >
                  <Users className="w-5 h-5" />
                  <span>User Management</span>
                </NavLink>
                <NavLink
                  to="/migration"
                  onClick={() => window.innerWidth < 768 && onClose()}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-2.5 rounded-xl font-medium transition-all duration-200 ${
                      isActive
                        ? 'bg-orange-100 text-orange-800 shadow-sm'
                        : 'text-slate-600 hover:bg-orange-50 hover:text-orange-700 hover:translate-x-1'
                    }`
                  }
                >
                  <Flame className="w-5 h-5" />
                  <span className="flex items-center gap-1.5">
                    Firebase Migration
                    {firebaseEnabled && <span className="text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full font-bold">ON</span>}
                  </span>
                </NavLink>
              </div>
            )}
          </div>
        </nav>

        {user && (
          <div className="mt-auto p-4 border-t border-slate-200/50 bg-white/50">
            {state.syncQueue && state.syncQueue.length > 0 && (
              <div className="mb-4 p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-1.5">
                <div className="flex justify-between items-center text-[10px]">
                  <span className="font-semibold text-slate-600 flex items-center gap-1">
                    <RefreshCw className="w-3 h-3 animate-spin text-emerald-500" />
                    {maxQueueLength > 0 ? `Syncing ${Math.min(maxQueueLength, maxQueueLength - queueLength + 1)}/${maxQueueLength}...` : 'Syncing...'}
                  </span>
                  <span className="text-slate-400 font-bold">
                    {Math.round(maxQueueLength > 0 ? ((maxQueueLength - queueLength) / maxQueueLength) * 100 : 0)}%
                  </span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-1 overflow-hidden">
                  <div
                    className="bg-emerald-500 h-1 rounded-full transition-all duration-300"
                    style={{ width: `${maxQueueLength > 0 ? ((maxQueueLength - queueLength) / maxQueueLength) * 100 : 0}%` }}
                  />
                </div>
              </div>
            )}
            <div className="flex items-center gap-3 mb-4 px-2">
              <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold uppercase" style={{ background: catConfig.color.hexLight, color: catConfig.color.hex }}>
                {displayUname[0] || 'U'}
              </div>
              <div className="flex flex-col overflow-hidden">
                <span className="text-sm font-bold text-slate-800 truncate">{displayUname}</span>
                <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold">{user.role || user.Role}</span>
              </div>
            </div>
            
            {firebaseEnabled && (
              <button
                onClick={() => {
                  setChangeError('');
                  setChangeSuccess('');
                  setShowChangePasswordModal(true);
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-slate-600 hover:bg-slate-50 transition-all duration-200 font-medium mb-1"
              >
                <Key className="w-5 h-5" />
                <span>Change Password</span>
              </button>
            )}

            <button
              onClick={logout}
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-red-600 hover:bg-red-50 transition-all duration-200 font-medium"
            >
              <LogOut className="w-5 h-5" />
              <span>Sign Out</span>
            </button>
          </div>
        )}
      </aside>

      {/* Change Password Modal */}
      {showChangePasswordModal && (
        <div className="fixed inset-0 z-[21000] flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 relative animate-[modalPopIn_0.3s_ease-out]">
            <button
              onClick={() => setShowChangePasswordModal(false)}
              className="absolute right-4 top-4 p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="text-center pb-2">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 mb-3">
                <Key className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-lg text-slate-800">Change Password</h3>
              <p className="text-xs text-slate-500 mt-1">Update your Firebase account password. Your new password will be synced to the database.</p>
            </div>

            <form onSubmit={handleChangePasswordSubmit} className="space-y-4">
              {changeError && (
                <div className="flex items-center gap-2.5 p-3 bg-red-50 border border-red-100 rounded-xl">
                  <ShieldAlert className="w-4 h-4 text-red-500 shrink-0" />
                  <p className="text-xs text-red-600 font-medium">{changeError}</p>
                </div>
              )}
              {changeSuccess && (
                <div className="flex items-center gap-2.5 p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
                  <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                  <p className="text-xs text-emerald-600 font-medium">{changeSuccess}</p>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Current Password</label>
                <div className="relative">
                  <input
                    type={showCurrentPassword ? "text" : "password"}
                    required
                    value={currentPassword}
                    onChange={e => setCurrentPassword(e.target.value)}
                    className="w-full px-3 py-2 border rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-400 text-sm pr-10"
                    placeholder="Enter current password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">New Password (min 6 chars)</label>
                <div className="relative">
                  <input
                    type={showNewPassword ? "text" : "password"}
                    required
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    className="w-full px-3 py-2 border rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-400 text-sm pr-10"
                    placeholder="Enter new password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Confirm New Password</label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    required
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    className="w-full px-3 py-2 border rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-400 text-sm pr-10"
                    placeholder="Confirm new password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowChangePasswordModal(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={changeLoading}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50 transition"
                >
                  {changeLoading ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
