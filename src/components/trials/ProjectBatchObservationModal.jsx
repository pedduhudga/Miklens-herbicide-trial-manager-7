import React, { useState, useEffect, useMemo } from 'react';
import Modal from '../Modal.jsx';
import {
  Zap, Save, Calendar, History, ChevronDown, ChevronUp,
  Shuffle, Loader2, Ruler, Sprout, TrendingUp, RotateCcw,
  Cloud, Edit3, PlusCircle, Eye, EyeOff
} from 'lucide-react';
import { calculateDAA } from '../../utils/dateUtils.js';
import { getPrimaryObservationField } from '../../utils/categoryConfig.js';
import { safeJsonParse } from '../../utils/helpers.js';
import { getMassObservationHistory } from '../../services/dataLayer.js';
import {
  normalizeObsDate,
  formatDisplayDate,
  extractHeightFromObs,
  findObservationForDate,
  getPreviousHeightBeforeDate,
  buildRecordedDatesHistory,
} from '../../utils/massObservationUtils.js';

export default function ProjectBatchObservationModal({
  isOpen,
  onClose,
  project,
  trialsList = [],
  activeCategory = 'herbicide',
  catConfig = {},
  onSaveBatch,
  onSave,
  getAppState,
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

  // Earlier dates history visibility (HIDDEN by default as requested)
  const [showHistory, setShowHistory] = useState(false);
  const [firebaseHistory, setFirebaseHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Bulk fill state
  const [bulkHeightValue, setBulkHeightValue] = useState('');
  const [bulkMetricValue, setBulkMetricValue] = useState('');
  const [bulkExcludeControls, setBulkExcludeControls] = useState(true);

  // Per plot data: { [trialId]: { plantHeight: string, metricValue: string, rating: string, notes: string } }
  const [plotEntries, setPlotEntries] = useState({});
  const [isSaving, setIsSaving] = useState(false);

  const primaryField = getPrimaryObservationField(activeCategory);
  const primaryMetricLabel = catConfig.primaryMetric?.label || (
    activeCategory === 'nutrition' ? 'Visual Vigor' :
    activeCategory === 'biostimulant' ? 'Vigor Index' :
    activeCategory === 'fungicide' ? 'Disease Severity' :
    activeCategory === 'pesticide' ? 'Pest Count' : 'Weed Cover'
  );
  const primaryMetricUnit = catConfig.primaryMetric?.unit || (
    activeCategory === 'nutrition' || activeCategory === 'biostimulant' ? '0-10' : '%'
  );

  // Reset modal defaults (hide history, set today's date) when freshly opened
  useEffect(() => {
    if (!isOpen) return;
    setShowHistory(false);
    setObsDate(new Date().toISOString().split('T')[0]);
  }, [isOpen, project?.ID]);

  // Load saved mass observation batches from Firebase `massObservations` collection
  useEffect(() => {
    if (!isOpen) return;
    const projectId = project?.ID || trialsList[0]?.ProjectID;
    if (!projectId) {
      setFirebaseHistory([]);
      return;
    }
    let cancelled = false;
    setLoadingHistory(true);
    getMassObservationHistory(projectId, getAppState)
      .then(records => {
        if (!cancelled) setFirebaseHistory(Array.isArray(records) ? records : []);
      })
      .catch(() => {
        if (!cancelled) setFirebaseHistory([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingHistory(false);
      });
    return () => { cancelled = true; };
  }, [isOpen, project?.ID, trialsList.length, getAppState]);

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

  // Merged chronological history of all recorded dates (trials' EfficacyDataJSON + Firebase `massObservations`)
  const recordedDatesHistory = useMemo(
    () => buildRecordedDatesHistory(trialsList, firebaseHistory, primaryField),
    [trialsList, firebaseHistory, primaryField]
  );

  // Normalized active observation date
  const normObsDate = useMemo(() => normalizeObsDate(obsDate), [obsDate]);

  // Reference batch from history if the currently selected date already has saved entries
  const savedBatchForSelectedDate = useMemo(
    () => recordedDatesHistory.find(d => d.date === normObsDate) || null,
    [recordedDatesHistory, normObsDate]
  );

  // Compute DAA synchronously whenever modal opens or obsDate changes
  const computeDaaForDate = (targetDate) => {
    const repTrial = trialsList.find(t => t.Date) || trialsList[0];
    const baseDate = repTrial?.Date || project?.StartDate;
    if (baseDate && targetDate) {
      const calc = calculateDAA(targetDate, baseDate);
      if (calc != null && !isNaN(calc)) return String(calc);
    }
    return '0';
  };

  // Re-hydrate DAA, General Notes, BBCH, and per-plot entries EVERY TIME obsDate changes!
  // If obsDate has NO recorded data, ALL inputs reset to blank so the user can cleanly enter that date's values.
  useEffect(() => {
    if (!isOpen) return;

    const computedDaa = computeDaaForDate(normObsDate);
    setDaa(computedDaa);

    const fbBatchForDate = firebaseHistory.find(b => normalizeObsDate(b.Date || b.date) === normObsDate) || null;
    const fbEntries = fbBatchForDate?.Entries || {};

    let loadedGeneralNotes = fbBatchForDate?.GeneralNotes || '';
    let loadedBbch = fbBatchForDate?.BBCHStage || '';

    const initial = {};
    trialsList.forEach(t => {
      const eff = safeJsonParse(t.EfficacyDataJSON, []);
      // Strict date match ONLY (never grabs an earlier date's DAA 0 / previous entry!)
      const existingObs = findObservationForDate(eff, normObsDate, null);
      const fbPlotEntry = fbEntries[t.ID] || null;

      let hVal = '';
      if (existingObs) {
        const extracted = extractHeightFromObs(existingObs);
        if (extracted !== null) hVal = String(extracted);
      } else if (fbPlotEntry && fbPlotEntry.plantHeight != null && fbPlotEntry.plantHeight !== '') {
        hVal = String(fbPlotEntry.plantHeight);
      }

      let mVal = '';
      if (existingObs && existingObs[primaryField] != null && existingObs[primaryField] !== '') {
        mVal = String(existingObs[primaryField]);
      } else if (fbPlotEntry && fbPlotEntry.metricValue != null && fbPlotEntry.metricValue !== '') {
        mVal = String(fbPlotEntry.metricValue);
      }

      let plotNotes = '';
      if (existingObs?.notes && existingObs.notes !== 'Mass observation entry') {
        plotNotes = existingObs.notes;
      } else if (fbPlotEntry?.notes) {
        plotNotes = fbPlotEntry.notes;
      }

      if (!loadedBbch && existingObs?.bbchStage) {
        loadedBbch = existingObs.bbchStage;
      }

      const isCtrl = t.IsControl === true || t.IsControl === 'true';
      const existingRating = existingObs?.rating || fbPlotEntry?.rating || '';

      initial[t.ID] = {
        plantHeight: hVal,
        metricValue: mVal,
        rating: existingRating || (isCtrl ? 'Control' : ''),
        notes: plotNotes,
      };
    });

    setGeneralNotes(loadedGeneralNotes);
    setBbchStage(loadedBbch);
    setPlotEntries(initial);
  }, [isOpen, normObsDate, trialsList, primaryField, firebaseHistory]);

  const handleUpdatePlotField = (trialId, field, value) => {
    setPlotEntries(prev => ({
      ...prev,
      [trialId]: {
        ...(prev[trialId] || {}),
        [field]: value
      }
    }));
  };

  // Clear all inputs for the currently selected date (handy for fresh re-entry)
  const handleClearCurrentInputs = () => {
    const cleared = {};
    trialsList.forEach(t => {
      const isCtrl = t.IsControl === true || t.IsControl === 'true';
      cleared[t.ID] = {
        plantHeight: '',
        metricValue: '',
        rating: isCtrl ? 'Control' : '',
        notes: '',
      };
    });
    setPlotEntries(cleared);
    setGeneralNotes('');
    setBbchStage('');
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

  // Get previous height strictly BEFORE the currently selected observation date
  const getPreviousHeight = (trial) => {
    const eff = safeJsonParse(trial.EfficacyDataJSON, []);
    return getPreviousHeightBeforeDate(eff, normObsDate, daa);
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
    const saveHandler = onSaveBatch || onSave;
    setIsSaving(true);
    try {
      if (saveHandler) {
        await saveHandler({
          date: normObsDate || obsDate,
          daa: parseInt(daa, 10) || 0,
          batchDaa: parseInt(daa, 10) || 0,
          generalNotes,
          bbchStage,
          plotEntries,
          primaryField,
          mode: entryMode,
          project,
          trialsList,
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
      maxWidth="max-w-5xl"
    >
      <div className="space-y-4">

        {/* Mode Selector, Earlier Dates Toggle & Walk Sequence Toggle */}
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

          {/* Right Controls: Earlier Dates Toggle (Hidden by default) + Sort Order Toggle */}
          <div className="flex items-center gap-2 text-xs flex-wrap">
            {/* Compact Earlier Dates History Toggle */}
            <button
              type="button"
              onClick={() => setShowHistory(prev => !prev)}
              className={`px-2.5 py-1.5 rounded-lg border font-bold transition flex items-center gap-1.5 ${
                showHistory
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                  : 'bg-white dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-700 hover:bg-indigo-50'
              }`}
              title="Toggle visibility of all earlier recorded dates in this project"
            >
              {showHistory ? <EyeOff className="w-3.5 h-3.5" /> : <History className="w-3.5 h-3.5" />}
              <span>
                {showHistory ? 'Hide Earlier Dates' : 'Earlier Dates'} ({recordedDatesHistory.length})
              </span>
              {showHistory ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>

            {/* Sort Order Toggle */}
            <button
              type="button"
              onClick={() => setSortOrder(sortOrder === 'walk' ? 'plot' : 'walk')}
              className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold hover:bg-slate-50 transition flex items-center gap-1"
              title="Toggle between greenhouse walking order (Column-then-Row) vs Plot Number sequence"
            >
              <Shuffle className="w-3 h-3 text-slate-500" />
              <span>{sortOrder === 'walk' ? 'Walk Sequence (Col → Row)' : 'Plot # (101, 102...)'}</span>
            </button>
          </div>
        </div>

        {/* Collapsible Earlier Dates Data Panel (Hidden by Default) */}
        {showHistory && (
          <div className="bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 rounded-xl p-3 space-y-2.5 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span className="font-extrabold text-indigo-950 dark:text-indigo-200">
                  Recorded Earlier Dates ({recordedDatesHistory.length})
                </span>
                {loadingHistory && (
                  <span className="text-[11px] text-indigo-500 flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" /> Syncing Firebase...
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setObsDate(new Date().toISOString().split('T')[0])}
                className="px-2 py-1 rounded-md bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 font-bold text-[11px] hover:bg-indigo-100 transition flex items-center gap-1"
              >
                <PlusCircle className="w-3 h-3" /> Today ({formatDisplayDate(new Date().toISOString().split('T')[0])})
              </button>
            </div>

            {recordedDatesHistory.length === 0 ? (
              <div className="text-slate-500 dark:text-slate-400 italic py-2 text-center bg-white/70 dark:bg-slate-900/50 rounded-lg border border-indigo-100 dark:border-indigo-900">
                No earlier observation dates recorded yet for this project. Enter data below and save to start tracking dates.
              </div>
            ) : (
              <>
                {/* Clickable Date Chips to Jump / Edit any Date */}
                <div className="flex flex-wrap gap-1.5">
                  {recordedDatesHistory.map(item => {
                    const isSelected = item.date === normObsDate;
                    return (
                      <button
                        key={item.date}
                        type="button"
                        onClick={() => setObsDate(item.date)}
                        className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold transition flex items-center gap-1.5 ${
                          isSelected
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                            : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-indigo-200 dark:border-indigo-700 hover:border-indigo-400 hover:bg-indigo-50'
                        }`}
                        title={`Click to load & edit entries for ${formatDisplayDate(item.date)}`}
                      >
                        <span>{formatDisplayDate(item.date)}</span>
                        {item.daa !== null && (
                          <span className={`px-1 rounded text-[10px] ${isSelected ? 'bg-indigo-500 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>
                            D{item.daa}
                          </span>
                        )}
                        <span className={`text-[10px] ${isSelected ? 'text-indigo-100' : 'text-slate-500'}`}>
                          {item.avgHeight ? `Avg ${item.avgHeight} cm` : `${item.plotCount} plots`}
                        </span>
                        {item.fromFirebaseCollection && (
                          <Cloud className={`w-3 h-3 ${isSelected ? 'text-indigo-200' : 'text-emerald-500'}`} title="Synced in Firebase massObservations collection" />
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Compact Multi-Date Comparison Matrix across All Plots */}
                <div className="border border-indigo-200/80 dark:border-indigo-800 rounded-lg overflow-hidden bg-white dark:bg-slate-900 max-h-52 overflow-y-auto overflow-x-auto">
                  <table className="w-full text-left text-[11px] border-collapse">
                    <thead className="sticky top-0 bg-indigo-100/80 dark:bg-indigo-950 text-indigo-950 dark:text-indigo-200 font-bold border-b border-indigo-200 dark:border-indigo-800 z-10">
                      <tr>
                        <th className="py-1.5 px-2.5 whitespace-nowrap">Plot / Pot</th>
                        <th className="py-1.5 px-2.5 whitespace-nowrap">Treatment</th>
                        {recordedDatesHistory.map(d => (
                          <th key={d.date} className="py-1.5 px-2.5 whitespace-nowrap text-center">
                            <div className="flex flex-col items-center">
                              <span>{formatDisplayDate(d.date)}</span>
                              <span className="text-[9px] font-semibold text-indigo-600 dark:text-indigo-400">
                                {d.daa !== null ? `DAA ${d.daa}` : ''}
                              </span>
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {sortedTrials.map((trial, idx) => {
                        const isPot = !!trial.PotLabel || trial.TrialDesign === 'PotTrial' || trial.TrialDesign === 'rcbd-pot';
                        const plotLabel = isPot ? (trial.PotLabel || `Pot ${trial.PlotNumber}`) : (trial.PlotNumber || trial.Plot || `Plot ${idx + 1}`);
                        return (
                          <tr key={trial.ID} className="hover:bg-indigo-50/40 dark:hover:bg-indigo-950/20">
                            <td className="py-1 px-2.5 font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">{plotLabel}</td>
                            <td className="py-1 px-2.5 text-slate-600 dark:text-slate-300 truncate max-w-[150px]">{trial.FormulationName || 'Untreated'}</td>
                            {recordedDatesHistory.map(d => {
                              const rec = d.entriesByTrialId[trial.ID];
                              const hStr = rec?.plantHeight != null ? `${rec.plantHeight} cm` : null;
                              const mStr = rec?.metricValue != null ? `${rec.metricValue}${primaryMetricUnit === '%' ? '%' : ''}` : null;
                              return (
                                <td key={d.date} className="py-1 px-2.5 text-center whitespace-nowrap">
                                  {hStr || mStr ? (
                                    <div className="inline-flex items-center gap-1">
                                      {hStr && <span className="font-bold text-emerald-700 dark:text-emerald-400">{hStr}</span>}
                                      {hStr && mStr && <span className="text-slate-300">|</span>}
                                      {mStr && <span className="font-semibold text-blue-700 dark:text-blue-400">{mStr}</span>}
                                    </div>
                                  ) : (
                                    <span className="text-slate-300 dark:text-slate-600">—</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {/* Top Configuration Card: Date & DAA */}
        <div className="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                Observation Date
              </label>
              {savedBatchForSelectedDate ? (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200">
                  <Edit3 className="w-2.5 h-2.5" /> Saved ({savedBatchForSelectedDate.plotCount})
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200">
                  ● New Entry
                </span>
              )}
            </div>
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

          {/* Quick Rate helper + Clear Inputs */}
          <div className="flex items-center gap-2">
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

            <button
              type="button"
              onClick={handleClearCurrentInputs}
              className="px-2 py-0.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 text-[11px] font-semibold flex items-center gap-1"
              title="Clear all entered values for this date"
            >
              <RotateCcw className="w-3 h-3" /> Clear
            </button>
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
            {formatDisplayDate(normObsDate)} • {sortedTrials.length} plots ready
          </span>
        </div>

        {/* Plots Data Entry Table */}
        <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden max-h-[420px] overflow-y-auto overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-xs border-collapse">
            <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700 text-[11px] uppercase tracking-wider z-10">
              <tr>
                <th className="py-2.5 px-3 w-28">Plot / Pot</th>
                <th className="py-2.5 px-3 min-w-[140px] max-w-[180px]">Treatment</th>

                {/* Plant Height Column */}
                {(entryMode === 'plantHeight' || entryMode === 'both') && (
                  <th className="py-2.5 px-3 w-44 bg-emerald-100/60 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 font-black">
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
                <th className="py-2.5 px-3 w-40">Plot Observation Note</th>
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
                const diffFromPrev = prevHeight && entry.plantHeight !== '' && !isNaN(currentHNum)
                  ? (currentHNum - prevHeight.val).toFixed(1)
                  : null;

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
                    <td className="py-2 px-3 max-w-[180px]">
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
                            <span
                              className={`text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap ${
                                parseFloat(diffFromPrev) >= 0 ? 'text-emerald-700 bg-emerald-100' : 'text-amber-700 bg-amber-100'
                              }`}
                              title={`Change vs previous ${prevHeight.val} cm (${prevHeight.date ? formatDisplayDate(prevHeight.date) : `D${prevHeight.daa}`})`}
                            >
                              {parseFloat(diffFromPrev) >= 0 ? `+${diffFromPrev}` : diffFromPrev}
                            </span>
                          )}
                          {diffFromPrev === null && prevHeight && (
                            <span
                              className="text-[10px] text-slate-400 truncate whitespace-nowrap"
                              title={`Previous measurement: ${prevHeight.val} cm on ${prevHeight.date ? formatDisplayDate(prevHeight.date) : `DAA ${prevHeight.daa}`}`}
                            >
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
              <span>Heights Entered ({formatDisplayDate(normObsDate)}): {stats.heightStats.count} / {stats.total} plots</span>
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
        <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Recording to trial cards & Firebase <code className="text-[11px] bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">massObservations</code> for <strong>{formatDisplayDate(normObsDate)}</strong> (DAA {daa || 0}).
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
                  <span>
                    {savedBatchForSelectedDate
                      ? `Update ${formatDisplayDate(normObsDate)} (${trialsList.length} Plots)`
                      : `Save ${formatDisplayDate(normObsDate)} (${trialsList.length} Plots)`}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </Modal>
  );
}
