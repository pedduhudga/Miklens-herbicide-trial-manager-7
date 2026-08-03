import React, { useEffect, useState, useRef } from 'react';

const DURATIONS = { success: 4000, error: 5000, warning: 4500, info: 3500 };

export default function Toast() {
  const [toasts, setToasts] = useState([]);
  const counterRef = useRef(0);

  useEffect(() => {
    const handleToast = (e) => {
      const id = ++counterRef.current;
      const type = e.detail.type || 'info';
      const duration = DURATIONS[type] || (e.detail.actionLabel ? 7000 : 3500);
      setToasts(prev => [...prev.slice(-3), {
        id,
        msg: e.detail.msg,
        type,
        trialId: e.detail.trialId,
        actionLabel: e.detail.actionLabel
      }]);
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, duration);
    };
    window.addEventListener('app:toast', handleToast);
    return () => window.removeEventListener('app:toast', handleToast);
  }, []);

  const handleAction = (trialId) => {
    if (trialId && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('app:navigate_to_trial', { detail: { trialId } }));
    }
  };

  const bgColors = {
    success: 'bg-emerald-500',
    error: 'bg-red-500',
    warning: 'bg-amber-500',
    info: 'bg-blue-500',
  };

  const icons = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: '⏳',
  };

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[10000] flex flex-col gap-2 items-center pointer-events-auto" style={{minWidth: '280px', maxWidth: '90vw'}}>
      {toasts.map(t => (
        <div
          key={t.id}
          className={`flex items-center justify-between gap-3 px-5 py-3 rounded-xl text-white shadow-xl text-sm font-medium animate-fade-in ${bgColors[t.type] || bgColors.info}`}
          style={{width: '100%'}}
        >
          <div className="flex items-center gap-2 flex-1">
            <span>{icons[t.type] || '💬'}</span>
            <span className="flex-1">{t.msg}</span>
          </div>
          {t.trialId && (
            <button
              onClick={() => handleAction(t.trialId)}
              className="px-3 py-1 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-bold transition-all border border-white/40 cursor-pointer whitespace-nowrap"
            >
              {t.actionLabel || 'View Trial'} →
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
