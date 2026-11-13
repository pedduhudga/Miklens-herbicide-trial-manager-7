import React, { useState, useEffect, useMemo, useRef } from 'react';
import Modal from '../Modal.jsx';
import {
  Zap, Save, CheckCircle2, CloudRain, Calendar, AlertCircle,
  HelpCircle, Shuffle, Sparkles, Loader2, ArrowDown, ArrowUp,
  Ruler, Sprout, TrendingUp, Filter, Check, X
} from 'lucide-react';
import { calculateDAA } from '../../utils/dateUtils.js';
import { getPrimaryObservationField } from '../../utils/categoryConfig.js';
import { safeJsonParse } from '../../utils/helpers.js';

export default function ProjectBatchObservationModal({
  isOpen,
  onClose,
  project,
  trialsList = [],
  activeCategory = 'herbicide',
  catConfig = {},
  onSaveBatch,
}) {
  const isPotTrial = project?.Design === 'PotTrial' || trialsList.some(t => t.TrialDesign === 'PotTrial' || !!t.PotLabel);
  const isNonHerbicide = activeCategory !== 'herbicide';

  // Mode: 'plantHeight' (Default for pot / non-herbicide trials), 'primary', or 'both'
  const [entryMode, setEntryMode] = useState(() => (isNonHerbicide || isPotTrial ? 'plantHeight' : 'primary'));

  // Observation Date & DAA
  const [obsDate, setObsDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [daa, setDaa] = useState('0');
  const [generalNotes, setGeneralNotes] = useState('');
  const [bbchStage, setBbchStage] = useState('');

  // Sorting: 'walk' (by Column then Row stripe sequence) or 'plot' (by Plot Number)
  const [sortOrder, setSortOrder] = useState('walk');

  // Bulk fill state
  const [bulkHeightValue, setBulkHeightValue] = useState('');
  const [bulkMetricValue, setBulkMetricValue] = useState('');
  const [bulkExcludeControls, setBulkExcludeControls] = useState(true);

  // Per plot data: { [trialId]: { plantHeight: string, metricValue: string, rating: string, notes: string } }
  const [plotEntries, setPlotEntries] = useState({});
  const [isSaving, setIsSaving] = useState(false);

  const primaryField = getPrimaryObservationField(activeCategory);
  const primaryMetricLabel = catConfig.primaryMetric?.label || (
    activeCategory === 'nutrition' ? 'Vigor / Brix' :
    activeCategory === 'biostimulant' ? 'Vigor Index' :
    activeCategory === 'fungicide' ? 'Disease Severity' :
    activeCategory === 'pesticide' ? 'Pest Count' : 'Weed Cover'
  );
  const primaryMetricUnit = catConfig.primaryMetric?.unit || '%';

  // Sort trials according to selected sort order
  const sortedTrials = useMemo(() => {
    const list = [...trialsList];
    if (sortOrder === 'walk') {
      return list.sort((a, b) => {
        const colA = a.PotCol != null ? parseInt(a.PotCol, 10) : 999;
        const colB = b.PotCol != null ? parseInt(b.PotCol, 10) : 999;
        if (colA !== colB) return colA - colB;
        const rowA = a.PotRow != null ? parseInt(a.PotRow, 10) : (parseInt(a.PlotNumber, 10) || 0);
        const rowB = b.PotRow != null ? parseInt(b.PotRow, 10) : (parseInt(b.PlotNumber, 10) || 0);
        return rowA - rowB;
      });
    }
    return list.sort((a, b) => {
      const pA = parseInt(a.PlotNumber, 10) || 0;
      const pB = parseInt(b.PlotNumber, 10) || 0;
      return pA - pB;
    });
  }, [trialsList, sortOrder]);

  // Compute DAA automatically when modal opens or date changes
  useEffect(() => {
    if (!isOpen) return;
    const repTrial = trialsList.find(t => t.Date) || trialsList[0];
    if (repTrial && repTrial.Date) {
      const calc = calculateDAA(obsDate, repTrial.Date);
      setDaa(calc != null ? String(calc) : '0');
    } else if (project?.StartDate) {
      const calc = calculateDAA(obsDate, project.StartDate);
      setDaa(calc != null ? String(calc) : '0');
    } else {
      setDaa('0');
    }
  }, [isOpen, obsDate, trialsList, project]);

  // Reset or initialize plot entries when modal opens
  useEffect(() => {
    if (!isOpen) return;
    const initial = {};
    trialsList.forEach(t => {
      // Pre-populate if this trial already has an observation on this date or DAA
      const eff = safeJsonParse(t.EfficacyDataJSON, []);
      const existingObs = eff.find(o => o.date === obsDate || String(o.daa) === String(daa));

      const existingHeight = existingObs ? (existingObs.plantHeight ?? existingObs['Plant Height'] ?? existingObs.plant_height ?? '') : '';
      const existingMetric = existingObs && existingObs[primaryField] != null ? String(existingObs[primaryField]) : '';

      initial[t.ID] = {
        plantHeight: existingHeight != null && existingHeight !== '' ? String(existingHeight) : '',
        metricValue: existingMetric,
        rating: t.IsControl ? 'Control' : (t.Result || ''),
        notes: existingObs?.notes || '',
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

  // Keyboard Navigation: Enter or ArrowDown jumps to next plot's input, ArrowUp jumps to previous
  const handleKeyDown = (e, currentIndex, fieldKey) => {
    if (e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIndex = currentIndex + 1;
      if (nextIndex < sortedTrials.length) {
        const nextId = `plot-${fieldKey}-${nextIndex}`;
        const nextInput = document.getElementById(nextId);
        if (nextInput) {
          nextInput.focus();
          nextInput.select();
        }
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIndex = currentIndex - 1;
      if (prevIndex >= 0) {
        const prevId = `plot-${fieldKey}-${prevIndex}`;
        const prevInput = document.getElementById(prevId);
        if (prevInput) {
          prevInput.focus();
          prevInput.select();
        }
      }
    }
  };

  // Get previous height from history for comparative growth reference
  const getPreviousHeight = (trial) => {
    const eff = safeJsonParse(trial.EfficacyDataJSON, []);
    if (!eff || eff.length === 0) return null;
    const sorted = [...eff].sort((a, b) => (b.daa || 0) - (a.daa || 0));
    const lastWithHeight = sorted.find(o => (o.plantHeight != null && o.plantHeight !== '') || (o['Plant Height'] != null && o['Plant Height'] !== ''));
    if (!lastWithHeight) return null;
    const val = parseFloat(lastWithHeight.plantHeight ?? lastWithHeight['Plant Height']);
    return isNaN(val) ? null : { val, daa: lastWithHeight.daa };
  };

  // Bulk Apply Plant Height
  const handleApplyBulkHeight = () => {
    if (bulkHeightValue === '') return;
    setPlotEntries(prev => {
      const next = { ...prev };
      trialsList.forEach(t => {
        if (bulkExcludeControls && (t.IsControl === true || t.IsControl === 'true')) {
          return;
        }
        next[t.ID] = {
          ...(next[t.ID] || {}),
          plantHeight: bulkHeightValue
        };
      });
      return next;
    });
    window.dispatchEvent(new CustomEvent('app:toast', {
      detail: { msg: `Applied ${bulkHeightValue} cm plant height to plots!`, type: 'info' }
    }));
  };

  // Bulk Apply Metric Value
  const handleApplyBulkMetric = () => {
    if (bulkMetricValue === '') return;
    setPlotEntries(prev => {
      const next = { ...prev };
      trialsList.forEach(t => {
        if (bulkExcludeControls && (t.IsControl === true || t.IsControl === 'true')) {
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

  // Bulk Apply Rating
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

  // Real-Time Statistics
  const stats = useMemo(() => {
    const heights = Object.values(plotEntries)
      .map(e => parseFloat(e.plantHeight))
      .filter(n => !isNaN(n));
    
    const metrics = Object.values(plotEntries)
      .map(e => parseFloat(e.metricValue))
      .filter(n => !isNaN(n));

    const heightStats = heights.length > 0 ? {
      count: heights.length,
      avg: (heights.reduce((s, v) => s + v, 0) / heights.length).toFixed(1),
      min: Math.min(...heights).toFixed(1),
      max: Math.max(...heights).toFixed(1),
    } : null;

    const metricStats = metrics.length > 0 ? {
      count: metrics.length,
      avg: (metrics.reduce((s, v) => s + v, 0) / metrics.length).toFixed(1),
      min: Math.min(...metrics).toFixed(1),
      max: Math.max(...metrics).toFixed(1),
    } : null;

    return { heightStats, metricStats, total: trialsList.length };
  }, [plotEntries, trialsList.length]);

  const handleSave = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setIsSaving(true);
    try {
      if (onSaveBatch) {
        await onSaveBatch({
          date: obsDate,
          daa: parseInt(daa, 10) || 0,
          generalNotes,
          bbchStage,
          plotEntries,
          primaryField,
          mode: entryMode
        });
      }
      onClose();
    } catch (err) {
      console.error('Failed to save mass observation:', err);
      window.dispatchEvent(new CustomEvent('app:toast', {
        detail: { msg: `Failed to save observations: ${err.message}`, type: 'error' }
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
      title={`⚡ Mass Observation & Plant Height Entry — ${project?.Name || 'Project Trials'}`}
      size="max-w-4xl"
    >
      <div className="space-y-4">
        
        {/* Mode Selector & Walk Sequence Toggle */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pb-2 border-b border-slate-200 dark:border-slate-800">
          
          {/* Target Variable Switcher */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs">
            <button
              type="button"
              onClick={() => setEntryMode('plantHeight')}
              className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 ${
                entryMode === 'plantHeight'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <Ruler className="w-3.5 h-3.5" />
              <span>🌱 Plant Height (cm)</span>
            </button>

            <button
              type="button"
              onClick={() => setEntryMode('primary')}
              className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 ${
                entryMode === 'primary'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <Sprout className="w-3.5 h-3.5" />
              <span>{primaryMetricLabel} ({primaryMetricUnit})</span>
            </button>

            <button
              type="button"
              onClick={() => setEntryMode('both')}
              className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 ${
                entryMode === 'both'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <span>Both (Height + Metric)</span>
            </button>
          </div>

          {/* Sort Order Toggle */}
          <div className="flex items-center gap-1 text-xs">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider hidden sm:inline">Order:</span>
            <button
              type="button"
              onClick={() => setSortOrder(sortOrder === 'walk' ? 'plot' : 'walk')}
              className="px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold hover:bg-slate-50 transition flex items-center gap-1"
              title="Toggle between greenhouse walking order (Column-then-Row) vs Plot Number sequence"
            >
              <Shuffle className="w-3 h-3 text-slate-500" />
              <span>{sortOrder === 'walk' ? 'Walk Sequence (Col → Row)' : 'Plot # (101, 102...)'}</span>
            </button>
          </div>
        </div>

        {/* Top Configuration Card: Date & DAA */}
        <div className="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div>
            <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1">
              Observation Date
            </label>
            <input
              type="date"
              required
              value={obsDate}
              onChange={e => setObsDate(e.target.value)}
              className="w-full px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-semibold focus:ring-2 focus:ring-emerald-400"
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
              className="w-full px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-emerald-400 font-black text-emerald-800 dark:text-emerald-400"
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
              className="w-full px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-emerald-400"
            />
          </div>

          <div className="sm:col-span-3">
            <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1">
              General Batch Assessment / Notes (optional)
            </label>
            <input
              type="text"
              value={generalNotes}
              onChange={e => setGeneralNotes(e.target.value)}
              placeholder="e.g. Rapid canopy vegetative push, healthy internode extension, uniform across replicates..."
              className="w-full px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-emerald-400"
            />
          </div>
        </div>

        {/* Rapid Fill & Autofill Toolbar */}
        <div className="bg-emerald-50/80 dark:bg-emerald-950/20 p-3 rounded-xl border border-emerald-200 dark:border-emerald-800/40 flex flex-wrap items-center justify-between gap-3 text-xs">
          
          {/* Plant Height Autofill (if height mode) */}
          {(entryMode === 'plantHeight' || entryMode === 'both') && (
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-emerald-900 dark:text-emerald-300 flex items-center gap-1">
                <Ruler className="w-3.5 h-3.5 text-emerald-600" /> Fill Height:
              </span>
              <input
                type="number"
                step="0.1"
                placeholder="cm"
                value={bulkHeightValue}
                onChange={e => setBulkHeightValue(e.target.value)}
                className="w-20 px-2 py-1 border border-emerald-300 dark:border-emerald-700 rounded-lg text-xs bg-white dark:bg-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                type="button"
                onClick={handleApplyBulkHeight}
                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs shadow-xs transition active:scale-95"
              >
                Apply
              </button>
            </div>
          )}

          {/* Metric Autofill (if metric mode) */}
          {(entryMode === 'primary' || entryMode === 'both') && (
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-emerald-900 dark:text-emerald-300 flex items-center gap-1">
                <Zap className="w-3.5 h-3.5 text-emerald-600" /> Fill {primaryMetricLabel}:
              </span>
              <input
                type="number"
                step="any"
                placeholder={primaryMetricUnit}
                value={bulkMetricValue}
                onChange={e => setBulkMetricValue(e.target.value)}
                className="w-20 px-2 py-1 border border-emerald-300 dark:border-emerald-700 rounded-lg text-xs bg-white dark:bg-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                type="button"
                onClick={handleApplyBulkMetric}
                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs shadow-xs transition active:scale-95"
              >
                Apply
              </button>
            </div>
          )}

          <label className="flex items-center gap-1.5 text-[11px] text-slate-700 dark:text-slate-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={bulkExcludeControls}
              onChange={e => setBulkExcludeControls(e.target.checked)}
              className="rounded text-emerald-600 focus:ring-emerald-500"
            />
            <span>Skip Controls</span>
          </label>

          {/* Quick Rate helper */}
          <div className="flex items-center gap-1">
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

        {/* Rapid Keyboard Instructions Callout */}
        <div className="bg-sky-50 dark:bg-sky-950/20 border border-sky-200 dark:border-sky-800 rounded-lg px-3 py-1.5 flex items-center justify-between text-[11px] text-sky-800 dark:text-sky-300">
          <span className="flex items-center gap-1.5">
            <span className="font-black px-1.5 py-0.2 bg-white dark:bg-sky-900 border border-sky-300 rounded font-mono text-[10px]">Enter ↵</span>
            <span className="font-black px-1.5 py-0.2 bg-white dark:bg-sky-900 border border-sky-300 rounded font-mono text-[10px]">↓ Down</span>
            <span>Jump straight to the next pot for high-speed notebook mass entry.</span>
          </span>
          <span className="text-sky-600 dark:text-sky-400 font-semibold hidden sm:inline">
            Total {sortedTrials.length} plots ready
          </span>
        </div>

        {/* Plots Data Entry Table */}
        <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden max-h-[420px] overflow-y-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700 text-[11px] uppercase tracking-wider z-10">
              <tr>
                <th className="py-2.5 px-3 w-28">Plot / Pot</th>
                <th className="py-2.5 px-3 min-w-[160px]">Treatment</th>

                {/* Plant Height Column */}
                {(entryMode === 'plantHeight' || entryMode === 'both') && (
                  <th className="py-2.5 px-3 w-40 bg-emerald-100/60 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 font-black">
                    🌱 Plant Height (cm)
                  </th>
                )}

                {/* Primary Metric Column */}
                {(entryMode === 'primary' || entryMode === 'both') && (
                  <th className="py-2.5 px-3 w-36">
                    {primaryMetricLabel} {primaryMetricUnit ? `(${primaryMetricUnit})` : ''}
                  </th>
                )}

                <th className="py-2.5 px-3 w-36 text-center">Rating</th>
                <th className="py-2.5 px-3 min-w-[150px]">Plot Observation Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-800 dark:text-slate-200">
              {sortedTrials.map((trial, idx) => {
                const isControl = trial.IsControl === true || trial.IsControl === 'true';
                const entry = plotEntries[trial.ID] || { plantHeight: '', metricValue: '', rating: '', notes: '' };
                const isPot = !!trial.PotLabel || trial.TrialDesign === 'PotTrial' || trial.TrialDesign === 'rcbd-pot';
                const plotLabel = isPot ? (trial.PotLabel || `Pot ${trial.PlotNumber}`) : (trial.PlotNumber || trial.Plot || `Plot ${idx + 1}`);
                const repLabel = isPot && trial.PotCol
                  ? `Col ${trial.PotCol} · Row ${trial.PotRow || trial.Replication}`
                  : (trial.Replication && !String(trial.Replication).match(/^[1-9]\d{2,}$/) ? `Rep ${trial.Replication}` : (trial.Block ? `Block ${trial.Block}` : ''));

                const prevHeight = getPreviousHeight(trial);
                const currentHNum = parseFloat(entry.plantHeight);
                const diffFromPrev = prevHeight && !isNaN(currentHNum) ? (currentHNum - prevHeight.val).toFixed(1) : null;

                return (
                  <tr
                    key={trial.ID}
                    className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors ${
                      isControl ? 'bg-slate-50/50 dark:bg-slate-900/40' : idx % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-slate-50/20 dark:bg-slate-900/30'
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

                    {/* Plant Height Input (Fast Enter Navigation) */}
                    {(entryMode === 'plantHeight' || entryMode === 'both') && (
                      <td className="py-2 px-3 bg-emerald-50/30 dark:bg-emerald-950/20">
                        <div className="flex items-center gap-2">
                          <input
                            id={`plot-height-${idx}`}
                            type="number"
                            step="0.1"
                            placeholder="0.0"
                            value={entry.plantHeight}
                            onChange={e => handleUpdatePlotField(trial.ID, 'plantHeight', e.target.value)}
                            onKeyDown={e => handleKeyDown(e, idx, 'height')}
                            onFocus={e => e.target.select()}
                            className="w-24 px-2.5 py-1 text-xs border border-emerald-400 dark:border-emerald-600 rounded-lg font-black text-emerald-900 dark:text-emerald-100 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs"
                          />
                          {diffFromPrev !== null && (
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                              parseFloat(diffFromPrev) >= 0 ? 'text-emerald-700 bg-emerald-100' : 'text-amber-700 bg-amber-100'
                            }`}>
                              {parseFloat(diffFromPrev) >= 0 ? `+${diffFromPrev}` : diffFromPrev}
                            </span>
                          )}
                          {diffFromPrev === null && prevHeight && (
                            <span className="text-[10px] text-slate-400 truncate" title={`Previous measurement at DAA ${prevHeight.daa}`}>
                              Prev: {prevHeight.val}
                            </span>
                          )}
                        </div>
                      </td>
                    )}

                    {/* Metric Input (Fast Enter Navigation) */}
                    {(entryMode === 'primary' || entryMode === 'both') && (
                      <td className="py-2 px-3">
                        <input
                          id={`plot-metric-${idx}`}
                          type="number"
                          step="any"
                          placeholder="0.0"
                          value={entry.metricValue}
                          onChange={e => handleUpdatePlotField(trial.ID, 'metricValue', e.target.value)}
                          onKeyDown={e => handleKeyDown(e, idx, 'metric')}
                          onFocus={e => e.target.select()}
                          className="w-24 px-2.5 py-1 text-xs border border-slate-300 dark:border-slate-700 rounded-lg font-bold bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </td>
                    )}

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

        {/* Live Statistics Banner */}
        {stats.heightStats && (
          <div className="px-4 py-2 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl flex flex-wrap items-center justify-between text-xs text-emerald-900 dark:text-emerald-200 font-bold">
            <span className="flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              <span>Heights Entered: {stats.heightStats.count} / {stats.total} pots</span>
            </span>
            <div className="flex items-center gap-3">
              <span>Avg: {stats.heightStats.avg} cm</span>
              <span className="text-emerald-600">•</span>
              <span>Min: {stats.heightStats.min} cm</span>
              <span className="text-emerald-600">•</span>
              <span>Max: {stats.heightStats.max} cm</span>
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-800">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Observations will be cleanly recorded to all plots for <strong>{obsDate}</strong> (DAA {daa || 0}).
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
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-xs sm:text-sm font-extrabold transition flex items-center gap-2 shadow-md disabled:opacity-50 active:scale-95"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving Observations...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Save All Observations ({trialsList.length} Plots)</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </Modal>
  );
}
