import React from 'react';
import { ShieldAlert, Lock } from 'lucide-react';
import { useAppState } from '../hooks/useAppState.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { getCategoryConfig, hasAccess } from '../utils/categoryConfig.js';
import TopBar from './TopBar.jsx';

export default function PermissionGuard({ tabName, onMenuClick, children }) {
  const { state } = useAppState();
  const { user, isAdmin, isViewer } = useAuth();
  const activeCategory = state.activeCategory || 'herbicide';
  const catConfig = getCategoryConfig(activeCategory);

  // 1. Check Admin status (always has access)
  if (isAdmin) {
    return <>{children}</>;
  }

  // 2. Check tab permissions
  let hasTabPermission = true;

  if (user?.tabPermissions && user.tabPermissions[tabName] === false) {
    hasTabPermission = false;
  }

  // 3. Check Category permission (if page is category-specific)
  const nonCategorySpecificTabs = ["All Categories", "Settings", "User Management", "Firebase Migration"];
  const isCategorySpecific = !nonCategorySpecificTabs.includes(tabName);
  const hasCatAccess = isCategorySpecific ? hasAccess(user, activeCategory, 'read') : true;

  // If both permissions are granted, render child component
  if (hasTabPermission && hasCatAccess) {
    return <>{children}</>;
  }

  // Otherwise render a premium "Access Restricted" view
  let errorTitle = "Access Restricted";
  let errorMessage = "You do not have permission to view this section.";

  if (!hasTabPermission) {
    errorMessage = `You do not have permission to view the "${tabName}" tab. Please contact your administrator for access.`;
  } else if (!hasCatAccess) {
    errorTitle = "Category Access Denied";
    errorMessage = `You do not have permission to view trials in the "${catConfig.name}" category. Please switch to another category or contact your administrator.`;
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
      <TopBar title={tabName} onMenuClick={onMenuClick} />
      
      <div className="flex-grow flex items-center justify-center p-6 bg-gradient-to-br from-slate-100 to-slate-200">
        <div className="relative max-w-md w-full bg-white/70 backdrop-blur-md border border-white/40 rounded-2xl shadow-2xl p-8 text-center overflow-hidden transition-all duration-300 hover:shadow-3xl">
          {/* Glassmorphic decorative circles */}
          <div className="absolute -top-10 -left-10 w-24 h-24 bg-red-400/10 rounded-full blur-xl pointer-events-none" />
          <div className="absolute -bottom-10 -right-10 w-24 h-24 bg-slate-400/20 rounded-full blur-xl pointer-events-none" />
          
          <div className="relative z-10 flex flex-col items-center">
            {/* Animated Lock Icon Wrapper */}
            <div className="w-20 h-20 rounded-2xl bg-slate-100 flex items-center justify-center mb-6 shadow-inner border border-slate-200/50 group relative">
              <Lock className="w-10 h-10 text-slate-400 animate-pulse transition-transform duration-300 group-hover:scale-110" />
              <ShieldAlert className="w-5 h-5 text-red-500 absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 shadow border border-slate-100" />
            </div>

            <h2 className="text-2xl font-bold text-slate-800 tracking-tight mb-3">
              {errorTitle}
            </h2>
            
            <div className="h-0.5 w-16 bg-slate-300 rounded-full mb-4" />

            <p className="text-slate-600 text-sm leading-relaxed mb-6 font-medium">
              {errorMessage}
            </p>

            <div className="w-full bg-slate-100/50 border border-slate-200/40 rounded-xl px-4 py-3 text-xs text-slate-400 font-mono">
              Role: <span className="font-semibold text-slate-600 uppercase">{user?.role || 'user'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
