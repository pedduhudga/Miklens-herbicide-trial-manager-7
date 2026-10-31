import React, { useState, useEffect } from 'react';
import Modal from '../Modal.jsx';
import {
  Zap, Save, CheckCircle2, CloudRain, Calendar, AlertCircle,
  HelpCircle, Shuffle, Sparkles, Loader2
} from 'lucide-react';
import { calculateDAA } from '../../utils/dateUtils.js';
import { getPrimaryObservationField } from '../../utils/categoryConfig.js';

export default function ProjectBatchObservationModal({
  isOpen,
  onClose,
  project,
  trialsList = [],
  activeCategory = 'herbicide',
  catConfig = {},
  onSaveBatch,
}) {
  const [obsDate, setObsDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [daa, setDaa] = useState('');
  const [generalNotes, setGeneralNotes] = useState('');
  const [bbchStage, setBbchStage] = useState('');
  
  // Bulk fill state
  const [bulkMetricValue, setBulkMetricValue] = useState('');
  const [bulkExcludeControls, setBulkExcludeControls] = useState(true);

  // Per plot data: { [trialId]: { metricValue: string, rating: string, notes: string } }
  const [plotEntries, setPlotEntries] = useState({});
  const [isSaving, setIsSaving] = useState(false);

  const primaryField = getPrimaryObservationField(activeCategory);
  const primaryMetricLabel = catConfig.primaryMetric?.label || 'Efficacy';
  const primaryMetricUnit = catConfig.primaryMetric?.unit || '%';

  // Compute DAA automatically when modal opens or date changes
  useEffect(() => {
    if (!isOpen) return;
    const repTrial = trialsList.find(t => t.Date) || trialsList[0];
    if (repTrial && repTrial.Date) {
      const calc = calculateDAA(obsDate, repTrial.Date);
      setDaa(calc != null ? String(calc) : '0');
    } else {
      setDaa('0');
    }
  }, [isOpen, obsDate, trialsList]);

  // Reset or initialize plot entries when modal opens
  useEffect(() => {
    if (!isOpen) return;
    const initial = {};
    trialsList.forEach(t => {
      initial[t.ID] = {
        metricValue: '',
        rating: t.IsControl ? 'Control' : (t.Result || ''),
        notes: '',
      };
    });
    setPlotEntries(initial);
  }, [isOpen, trialsList]);

  const handleUpdatePlotField = (trialId, field, value) => {
    setPlotEntries(prev => ({
      ...prev,
      [trialId]: {
        ...(prev[trialId] || {}),
        [field]: value
      }
    }));
  };

  const handleApplyBulkMetric = () => {
    if (bulkMetricValue === '') return;
    setPlotEntries(prev => {
      const next = { ...prev };
      trialsList.forEach(t => {
        if (bulkExcludeControls && (t.IsControl === true || t.IsControl === 'true')) {
          // Skip controls if excluded
          return;
        }
        next[t.ID] = {
          ...(next[t.ID] || {}),
          metricValue: bulkMetricValue
        };
      });
      return next;
    });
    window.dispatchEvent(new CustomEvent('app:toast', {
      detail: { msg: `Applied ${bulkMetricValue}${primaryMetricUnit} to plots!`, type: 'info' }
    }));
  };

  const handleApplyBulkRating = (rating) => {
    setPlotEntries(prev => {
      const next = { ...prev };
      trialsList.forEach(t => {
        if (bulkExcludeControls && (t.IsControl === true || t.IsControl === 'true')) {
          next[t.ID] = { ...(next[t.ID] || {}), rating: 'Control' };
          return;
        }
        next[t.ID] = {
          ...(next[t.ID] || {}),
          rating: rating
        };
      });
      return next;
    });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      if (onSaveBatch) {
        await onSaveBatch({
          date: obsDate,
          daa: parseInt(daa, 10) || 0,
          generalNotes,
          bbchStage,
          plotEntries,
          primaryField
        });
      }
      onClose();
    } catch (err) {
      console.error('Failed to save batch observation:', err);
      window.dispatchEvent(new CustomEvent('app:toast', {
        detail: { msg: `Failed to save batch observations: ${err.message}`, type: 'error' }
      }));
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`⚡ Rapid Batch Observation — ${project?.Name || 'Project Trials'}`}
      size="max-w-4xl"
    >
      <form onSubmit={handleSave} className="space-y-4">
        {/* Top Configuration Card */}
        <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-slate-200 dark:border-slate-700 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div>
            <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1">
              Observation Date
            </label>
            <input
              type="date"
              required
              value={obsDate}
              onChange={e => setObsDate(e.target.value)}
              className="w-full px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1">
              Days After App (DAA)
            </label>
            <input
              type="number"
              required
              value={daa}
              onChange={e => setDaa(e.target.value)}
              placeholder="e.g. 7, 14, 21"
              className="w-full px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-emerald-500 font-bold"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1">
              Growth Stage / BBCH (optional)
            </label>
            <input
              type="text"
              value={bbchStage}
              onChange={e => setBbchStage(e.target.value)}
              placeholder="e.g. BBCH 14 (4 leaves)"
              className="w-full px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div className="sm:col-span-3">
            <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1">
              General Batch Assessment / Notes
            </label>
            <input
              type="text"
              value={generalNotes}
              onChange={e => setGeneralNotes(e.target.value)}
              placeholder="e.g. Uniform vigor across reps, no phytotoxicity noted, optimal conditions..."
              className="w-full px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-emerald-500"
            />
          </div>
        </div>

        {/* Rapid Fill Toolbar */}
        <div className="bg-emerald-50/70 dark:bg-emerald-950/20 p-3 rounded-xl border border-emerald-200 dark:border-emerald-800/40 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 text-emerald-600" /> Autofill Value:
            </span>
            <input
              type="number"
              step="any"
              placeholder={`Value (${primaryMetricUnit})`}
              value={bulkMetricValue}
              onChange={e => setBulkMetricValue(e.target.value)}
              className="w-28 px-2.5 py-1 border border-emerald-300 dark:border-emerald-700 rounded-lg text-xs bg-white dark:bg-slate-800 font-bold focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            <button
              type="button"
              onClick={handleApplyBulkMetric}
              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs shadow-xs transition"
            >
              Apply to Plots
            </button>
            <label className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-400 cursor-pointer select-none ml-2">
              <input
                type="checkbox"
                checked={bulkExcludeControls}
                onChange={e => setBulkExcludeControls(e.target.checked)}
                className="rounded text-emerald-600 focus:ring-emerald-500"
              />
              <span>Keep Control check untouched</span>
            </label>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
              Bulk Rate:
            </span>
            {[
              { label: 'E', key: 'Excellent', cls: 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800' },
              { label: 'G', key: 'Good', cls: 'bg-blue-100 hover:bg-blue-200 text-blue-800' },
              { label: 'F', key: 'Fair', cls: 'bg-amber-100 hover:bg-amber-200 text-amber-800' },
              { label: 'P', key: 'Poor', cls: 'bg-red-100 hover:bg-red-200 text-red-800' }
            ].map(b => (
              <button
                key={b.key}
                type="button"
                onClick={() => handleApplyBulkRating(b.key)}
                className={`px-2 py-0.5 rounded text-[11px] font-bold transition ${b.cls}`}
                title={`Set all plots to ${b.key}`}
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>

        {/* Plots Data Entry Table */}
        <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden max-h-[380px] overflow-y-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700 text-[11px] uppercase tracking-wider z-10">
              <tr>
                <th className="py-2.5 px-3 w-28">Plot / Pot</th>
                <th className="py-2.5 px-3 min-w-[180px]">Treatment</th>
                <th className="py-2.5 px-3 w-36">
                  {primaryMetricLabel} {primaryMetricUnit ? `(${primaryMetricUnit})` : ''}
                </th>
                <th className="py-2.5 px-3 w-40 text-center">Rating</th>
                <th className="py-2.5 px-3 min-w-[160px]">Plot Observation Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-800 dark:text-slate-200">
              {trialsList.map((trial, idx) => {
                const isControl = trial.IsControl === true || trial.IsControl === 'true';
                const entry = plotEntries[trial.ID] || { metricValue: '', rating: '', notes: '' };
                const plotLabel = trial.PlotNumber || trial.Plot || `Plot ${idx + 1}`;
                const repLabel = trial.Replication ? `Rep ${trial.Replication}` : '';

                return (
                  <tr
                    key={trial.ID}
                    className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors ${
                      isControl ? 'bg-slate-50/40 dark:bg-slate-900/40' : idx % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-slate-50/20 dark:bg-slate-900/30'
                    }`}
                  >
                    {/* Plot Code */}
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="font-bold text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-xs">
                          {plotLabel}
                        </span>
                        {repLabel && (
                          <span className="text-[10px] text-slate-400 font-medium">
                            {repLabel}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Treatment Name */}
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${isControl ? 'bg-slate-400' : 'bg-emerald-500'}`} />
                        <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                          {trial.FormulationName || 'Untitled Treatment'}
                        </span>
                        {isControl && (
                          <span className="text-[10px] uppercase font-bold px-1.5 py-0.2 rounded bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300 shrink-0">
                            Check
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Metric Input */}
                    <td className="py-2 px-3">
                      <input
                        type="number"
                        step="any"
                        placeholder="0.0"
                        value={entry.metricValue}
                        onChange={e => handleUpdatePlotField(trial.ID, 'metricValue', e.target.value)}
                        className="w-full px-2.5 py-1 text-xs border border-slate-300 dark:border-slate-700 rounded-lg font-bold bg-white dark:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                    </td>

                    {/* Quick Rating Buttons */}
                    <td className="py-2 px-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {[
                          { key: 'Excellent', label: 'E', activeBg: 'bg-emerald-600 text-white' },
                          { key: 'Good', label: 'G', activeBg: 'bg-blue-600 text-white' },
                          { key: 'Fair', label: 'F', activeBg: 'bg-amber-600 text-white' },
                          { key: 'Poor', label: 'P', activeBg: 'bg-red-600 text-white' },
                          { key: 'Control', label: 'X', activeBg: 'bg-slate-700 text-white' }
                        ].map(r => {
                          const isActive = entry.rating === r.key;
                          return (
                            <button
                              key={r.key}
                              type="button"
                              onClick={() => handleUpdatePlotField(trial.ID, 'rating', isActive ? '' : r.key)}
                              className={`w-6 h-6 rounded text-[11px] font-bold transition flex items-center justify-center ${
                                isActive
                                  ? r.activeBg
                                  : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'
                              }`}
                            >
                              {r.label}
                            </button>
                          );
                        })}
                      </div>
                    </td>

                    {/* Plot Notes */}
                    <td className="py-2 px-3">
                      <input
                        type="text"
                        placeholder="Plot notes (optional)..."
                        value={entry.notes}
                        onChange={e => handleUpdatePlotField(trial.ID, 'notes', e.target.value)}
                        className="w-full px-2.5 py-1 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Observations will be saved to all {trialsList.length} plots at DAA {daa || 0}.
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-xs font-semibold transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-sm disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving Observations...</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>Save All Observations ({trialsList.length} Plots)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
