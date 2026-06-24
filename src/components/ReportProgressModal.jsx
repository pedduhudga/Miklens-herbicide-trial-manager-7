import React, { useEffect, useState } from 'react';
import { Loader2, CheckCircle, ChevronRight, X, AlertCircle } from 'lucide-react';

/**
 * ReportProgressModal
 *
 * Props:
 *   isOpen      {boolean}  — controls visibility
 *   steps       {Array}    — [{ label: string, status: 'pending'|'active'|'done'|'error' }]
 *   currentStep {number}   — index of the current active step (optional)
 *   percent     {number}   — 0–100 overall progress percentage
 *   onCancel    {Function} — optional; when provided, a Cancel button is shown (only while percent < 100)
 */
export default function ReportProgressModal({ isOpen, steps = [], currentStep, percent = 0, onCancel }) {
  // After reaching 100% show a "Done!" state briefly
  const [showDone, setShowDone] = useState(false);

  // When percent hits 100, flip into "Done!" mode after 1200ms
  useEffect(() => {
    if (!isOpen) {
      setShowDone(false);
      return;
    }
    if (percent >= 100) {
      const timer = setTimeout(() => setShowDone(true), 1200);
      return () => clearTimeout(timer);
    } else {
      setShowDone(false);
    }
  }, [percent, isOpen]);

  // Prevent body scroll while modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.classList.add('overflow-hidden');
    } else {
      document.body.classList.remove('overflow-hidden');
    }
    return () => {
      document.body.classList.remove('overflow-hidden');
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const isComplete = percent >= 100;
  const clampedPercent = Math.min(100, Math.max(0, percent));

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      aria-modal="true"
      role="dialog"
      aria-label={isComplete ? 'Report Ready' : 'Generating Report'}
    >
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md">

        {/* ── Header ── */}
        <div className="flex items-center gap-3 mb-4">
          {isComplete ? (
            <CheckCircle className="w-6 h-6 text-emerald-500 flex-shrink-0" aria-hidden="true" />
          ) : (
            <Loader2 className="w-6 h-6 text-purple-600 flex-shrink-0 animate-spin" aria-hidden="true" />
          )}
          <h2 className="text-lg font-bold text-slate-800">
            {showDone
              ? 'Done!'
              : isComplete
              ? 'Report Ready'
              : 'Generating Report\u2026'}
          </h2>
        </div>

        {/* ── Progress bar ── */}
        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-2 bg-purple-600 rounded-full transition-all duration-300"
            style={{ width: `${clampedPercent}%` }}
            role="progressbar"
            aria-valuenow={clampedPercent}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>

        {/* ── Percent label ── */}
        <p className="text-right text-xs text-slate-500 mt-1">{clampedPercent}%</p>

        {/* ── Step list ── */}
        {steps.length > 0 && (
          <ul className="mt-4 space-y-2">
            {steps.map((step, idx) => (
              <li key={idx} className="flex items-center gap-2">
                <StepIcon status={step.status} />
                <span
                  className={[
                    'text-sm',
                    step.status === 'active' ? 'font-semibold text-slate-800' : '',
                    step.status === 'done' ? 'text-slate-600' : '',
                    step.status === 'pending' ? 'text-slate-400' : '',
                    step.status === 'error' ? 'text-red-500' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {step.label}
                </span>
              </li>
            ))}
          </ul>
        )}

        {/* ── Cancel button ── */}
        {onCancel && !isComplete && (
          <div className="mt-5 flex justify-center">
            <button
              onClick={onCancel}
              className="text-sm text-slate-500 hover:text-red-500 transition-colors px-3 py-1 rounded-lg hover:bg-red-50"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Renders the appropriate status icon for each step */
function StepIcon({ status }) {
  switch (status) {
    case 'done':
      return <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" aria-label="Done" />;
    case 'active':
      return <ChevronRight className="w-4 h-4 text-purple-600 flex-shrink-0" aria-label="In progress" />;
    case 'error':
      return <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" aria-label="Error" />;
    case 'pending':
    default:
      return (
        <div
          className="w-4 h-4 rounded-full border-2 border-slate-300 flex-shrink-0"
          aria-label="Pending"
        />
      );
  }
}
