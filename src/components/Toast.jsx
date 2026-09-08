import React, { useEffect, useState, useRef, useCallback } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, Loader2, X } from 'lucide-react';

const DURATIONS = {
  success: 3200,
  error: 5000,
  warning: 4000,
  info: 2800,
};

export default function Toast() {
  const [toasts, setToasts] = useState([]);
  const counterRef = useRef(0);
  const timersRef = useRef(new Map());

  const dismissToast = useCallback((id) => {
    if (timersRef.current.has(id)) {
      clearTimeout(timersRef.current.get(id));
      timersRef.current.delete(id);
    }
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  useEffect(() => {
    const handleToast = (e) => {
      const detail = e.detail || {};
      const msg = detail.msg || detail.message;
      if (!msg || detail.silent) return;

      const type = detail.type || 'info';
      const toastId = detail.toastId || null;
      const trialId = detail.trialId || null;
      const actionLabel = detail.actionLabel || null;
      const duration = detail.duration || DURATIONS[type] || (actionLabel ? 6000 : 3000);

      setToasts(prev => {
        // 1. If explicit toastId exists, update in-place
        if (toastId) {
          const existingIdx = prev.findIndex(t => t.toastId === toastId);
          if (existingIdx !== -1) {
            const existing = prev[existingIdx];
            if (timersRef.current.has(existing.id)) {
              clearTimeout(timersRef.current.get(existing.id));
            }
            const timer = setTimeout(() => dismissToast(existing.id), duration);
            timersRef.current.set(existing.id, timer);

            const updated = [...prev];
            updated[existingIdx] = {
              ...existing,
              msg,
              type,
              trialId: trialId || existing.trialId,
              actionLabel: actionLabel || existing.actionLabel,
            };
            return updated;
          }
        }

        // 2. If an identical message is already visible, refresh its timer
        const duplicate = prev.find(t => t.msg === msg);
        if (duplicate) {
          if (timersRef.current.has(duplicate.id)) {
            clearTimeout(timersRef.current.get(duplicate.id));
          }
          const timer = setTimeout(() => dismissToast(duplicate.id), duration);
          timersRef.current.set(duplicate.id, timer);
          return prev;
        }

        // 3. New toast: cap maximum visible stack to 2 to prevent flooding
        const id = ++counterRef.current;
        const timer = setTimeout(() => dismissToast(id), duration);
        timersRef.current.set(id, timer);

        const newToast = {
          id,
          toastId,
          msg,
          type,
          trialId,
          actionLabel,
        };

        const pruned = prev.length >= 2 ? prev.slice(prev.length - 1) : prev;
        return [...pruned, newToast];
      });
    };

    window.addEventListener('app:toast', handleToast);
    return () => {
      window.removeEventListener('app:toast', handleToast);
      timersRef.current.forEach(timer => clearTimeout(timer));
      timersRef.current.clear();
    };
  }, [dismissToast]);

  const handleAction = (trialId, id) => {
    if (trialId && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('app:navigate_to_trial', { detail: { trialId } }));
    }
    dismissToast(id);
  };

  const renderIcon = (t) => {
    const isProgress = t.type === 'info' && /(sync|scan|analyz|start|\.\.\.)/i.test(t.msg);
    if (isProgress) {
      return <Loader2 className="w-4 h-4 text-sky-400 animate-spin shrink-0" />;
    }
    switch (t.type) {
      case 'success':
        return <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />;
      case 'info':
      default:
        return <Info className="w-4 h-4 text-sky-400 shrink-0" />;
    }
  };

  const iconBadges = {
    success: 'bg-emerald-500/20 border-emerald-500/30',
    error: 'bg-rose-500/20 border-rose-500/30',
    warning: 'bg-amber-500/20 border-amber-500/30',
    info: 'bg-sky-500/20 border-sky-500/30',
  };

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed top-3 sm:top-5 left-1/2 -translate-x-1/2 z-[100001] flex flex-col gap-2 items-center pointer-events-none w-[calc(100%-1.5rem)] max-w-sm sm:max-w-md select-none"
      aria-live="polite"
      aria-atomic="true"
    >
      {toasts.map(t => (
        <div
          key={t.id}
          onClick={() => dismissToast(t.id)}
          className="pointer-events-auto flex items-center justify-between gap-3 w-full px-3.5 py-2.5 rounded-2xl bg-slate-900/95 text-white shadow-[0_12px_40px_rgba(0,0,0,0.5)] backdrop-blur-xl border border-slate-700/60 text-sm font-medium transition-all duration-300 animate-slide-down cursor-pointer hover:bg-slate-900"
          role="alert"
        >
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className={`p-1.5 rounded-xl shrink-0 border ${iconBadges[t.type] || iconBadges.info}`}>
              {renderIcon(t)}
            </div>
            <span className="text-slate-100 text-xs sm:text-sm font-medium leading-snug truncate">
              {t.msg}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {t.trialId && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleAction(t.trialId, t.id);
                }}
                className="px-2.5 py-1 bg-white/10 hover:bg-white/20 active:scale-95 rounded-lg text-xs font-semibold text-slate-100 border border-white/20 transition-all whitespace-nowrap"
              >
                {t.actionLabel || 'View'} →
              </button>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                dismissToast(t.id);
              }}
              className="p-1 text-slate-400 hover:text-white hover:bg-white/10 active:scale-95 rounded-lg transition-all"
              aria-label="Dismiss notification"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
