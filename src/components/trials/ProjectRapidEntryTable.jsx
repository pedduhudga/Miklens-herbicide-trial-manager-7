import React, { useState } from 'react';
import {
  Camera, Image as ImageIcon, Eye, Edit, Plus, Check, Clock,
  Sparkles, Leaf, CheckCircle2, ChevronRight, Scale
} from 'lucide-react';
import { safeJsonParse } from '../../utils/helpers.js';
import { validateEfficacyData } from '../../utils/analysisUtils.js';
import { getPrimaryObservationField } from '../../utils/categoryConfig.js';
import { resolvePhotoSrc } from '../../utils/photoUtils.js';

export default function ProjectRapidEntryTable({
  trialsList = [],
  project = {},
  activeCategory = 'herbicide',
  catConfig = {},
  onQuickRate,
  onQuickPhoto,
  onQuickGalleryUpload,
  onViewDetails,
  onEdit,
  onOpenObsModal,
  onOpenBatchAppModal,
  onSaveInlineObservation,
  selectedForBulk = new Set(),
  onToggleBulk,
}) {
  const [editingPlotId, setEditingPlotId] = useState(null);
  const [inlineValue, setInlineValue] = useState('');
  const [savingPlotId, setSavingPlotId] = useState(null);
  const [tableSearch, setTableSearch] = useState('');

  const primaryField = getPrimaryObservationField(activeCategory);
  const primaryMetricLabel = catConfig.primaryMetric?.label || (
    activeCategory === 'nutrition' ? 'Vigor / Brix' :
    activeCategory === 'biostimulant' ? 'Vigor Index' :
    activeCategory === 'fungicide' ? 'Disease Severity' :
    activeCategory === 'pesticide' ? 'Pest Count' : 'Weed Cover'
  );
  const primaryMetricUnit = catConfig.primaryMetric?.unit || '%';

  const filteredTrials = trialsList.filter(t => {
    if (!tableSearch.trim()) return true;
    const q = tableSearch.toLowerCase();
    const plotCode = (t.PlotNumber || t.Plot || '').toLowerCase();
    const trt = (t.FormulationName || '').toLowerCase();
    const rep = String(t.Replication || '').toLowerCase();
    return plotCode.includes(q) || trt.includes(q) || rep.includes(q);
  });

  const handleStartInlineEdit = (trial, currentVal) => {
    setEditingPlotId(trial.ID);
    setInlineValue(currentVal != null ? String(currentVal) : '');
  };

  const handleCommitInlineEdit = async (trial) => {
    if (inlineValue === '') {
      setEditingPlotId(null);
      return;
    }
    const num = parseFloat(inlineValue);
    if (isNaN(num)) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Please enter a valid numeric value', type: 'warning' } }));
      return;
    }
    setSavingPlotId(trial.ID);
    try {
      if (onSaveInlineObservation) {
        await onSaveInlineObservation(trial, num, primaryField);
      }
    } finally {
      setSavingPlotId(null);
      setEditingPlotId(null);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
      {/* Table Toolbar */}
      <div className="p-3 bg-slate-50/80 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Search plots, treatments, or reps..."
            value={tableSearch}
            onChange={e => setTableSearch(e.target.value)}
            className="px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg text-xs bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 w-56 sm:w-64"
          />
          {tableSearch && (
            <button
              type="button"
              onClick={() => setTableSearch('')}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs px-1"
            >
              ✕
            </button>
          )}
          <span className="text-slate-400 font-medium">
            Showing {filteredTrials.length} of {trialsList.length} units
          </span>
        </div>

        <div className="flex items-center gap-2">
          {onOpenBatchAppModal && (
            <button
              type="button"
              onClick={onOpenBatchAppModal}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-emerald-800 bg-emerald-100/80 hover:bg-emerald-200 dark:text-emerald-300 dark:bg-emerald-950/60 rounded-xl transition shadow-2xs"
              title="Apply fertilizer, protection spray, or agronomic input across all plots in this trial"
            >
              <Leaf className="w-3.5 h-3.5 text-emerald-600" />
              <span>Batch Agronomic Input</span>
            </button>
          )}

          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium hidden sm:inline">
            ⚡ Quick Rate:
          </span>
          <div className="flex items-center gap-1 text-[10px] font-bold">
            <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">E: Excellent</span>
            <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">G: Good</span>
            <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">F: Fair</span>
            <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">P: Poor</span>
            <span className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300">X: Check</span>
          </div>
        </div>
      </div>

      {/* Responsive Table Container */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-100/70 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-700 text-[11px] uppercase tracking-wider">
              <th className="py-2.5 px-3 w-8 text-center">
                <span className="sr-only">Select</span>
              </th>
              <th className="py-2.5 px-3 w-32 font-bold">Plot / Pot</th>
              <th className="py-2.5 px-3 min-w-[200px] font-bold">Treatment / Product</th>
              <th className="py-2.5 px-3 w-48 text-center font-bold">1-Click Quick Rating</th>
              <th className="py-2.5 px-3 w-44 font-bold">
                {primaryMetricLabel} {primaryMetricUnit ? `(${primaryMetricUnit})` : ''}
              </th>
              <th className="py-2.5 px-3 w-28 text-center font-bold">Photos</th>
              <th className="py-2.5 px-3 w-28 font-bold">Yield</th>
              <th className="py-2.5 px-3 w-24 text-right font-bold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-slate-700 dark:text-slate-300">
            {filteredTrials.map((trial, idx) => {
              const isSelected = selectedForBulk.has(trial.ID);
              const isControl = trial.IsControl === true || trial.IsControl === 'true';
              const efficacy = validateEfficacyData(safeJsonParse(trial.EfficacyDataJSON, []), trial.Category || activeCategory, true);
              const latestObs = efficacy.length > 0 ? efficacy[efficacy.length - 1] : null;
              const currentMetricVal = latestObs ? (latestObs[primaryField] ?? latestObs.weedCover ?? null) : null;
              const photos = safeJsonParse(trial.PhotoURLs, []).filter(p => !p.deleted);
              const latestPhoto = photos.length > 0 ? photos[photos.length - 1] : null;
              const photoThumb = latestPhoto ? resolvePhotoSrc(latestPhoto) : null;
              const isInlineEditing = editingPlotId === trial.ID;
              const isSaving = savingPlotId === trial.ID;

              const plotLabel = trial.PlotNumber || trial.Plot || `Unit ${idx + 1}`;
              const repLabel = trial.Replication ? `R${trial.Replication}` : '';

              return (
                <tr
                  key={trial.ID}
                  className={`transition-colors hover:bg-emerald-50/30 dark:hover:bg-slate-800/40 ${
                    isSelected ? 'bg-emerald-50/60 dark:bg-emerald-950/20' : idx % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-slate-50/30 dark:bg-slate-900/60'
                  }`}
                >
                  {/* Bulk Checkbox */}
                  <td className="py-2.5 px-3 text-center">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleBulk && onToggleBulk(trial.ID)}
                      className="rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                    />
                  </td>

                  {/* Plot / Pot ID */}
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-xs">
                        {plotLabel}
                      </span>
                      {repLabel && (
                        <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-200/60 dark:bg-slate-800/80 px-1.5 py-0.2 rounded">
                          {repLabel}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Treatment / Product */}
                  <td className="py-2.5 px-3">
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            isControl ? 'bg-slate-400' : 'bg-emerald-500'
                          }`}
                        />
                        <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                          {trial.FormulationName || 'Untitled Treatment'}
                        </span>
                        {isControl && (
                          <span className="text-[10px] uppercase font-bold px-1.5 py-0.2 rounded bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300 shrink-0">
                            Check
                          </span>
                        )}
                      </div>
                      {trial.Dosage && (
                        <span className="text-[11px] text-slate-400 ml-3.5">
                          Rate: {trial.Dosage}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* 1-Click Quick Rating Buttons */}
                  <td className="py-2.5 px-3">
                    <div className="flex items-center justify-center gap-1">
                      {[
                        { key: 'Excellent', label: 'E', title: 'Excellent', activeBg: 'bg-emerald-600 text-white shadow-xs' },
                        { key: 'Good', label: 'G', title: 'Good', activeBg: 'bg-blue-600 text-white shadow-xs' },
                        { key: 'Fair', label: 'F', title: 'Fair', activeBg: 'bg-amber-600 text-white shadow-xs' },
                        { key: 'Poor', label: 'P', title: 'Poor', activeBg: 'bg-red-600 text-white shadow-xs' },
                        { key: 'Control', label: 'X', title: 'Check / Control', activeBg: 'bg-slate-700 text-white shadow-xs' }
                      ].map(r => {
                        const isActive = trial.Result === r.key;
                        return (
                          <button
                            key={r.key}
                            type="button"
                            title={r.title}
                            onClick={() => onQuickRate && onQuickRate(trial, r.key)}
                            className={`w-6 h-6 rounded-md text-[11px] font-bold transition-all flex items-center justify-center active:scale-90 ${
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

                  {/* Primary Observation / Metric with Inline Edit */}
                  <td className="py-2.5 px-3">
                    {isInlineEditing ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          step="any"
                          autoFocus
                          value={inlineValue}
                          onChange={e => setInlineValue(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleCommitInlineEdit(trial);
                            if (e.key === 'Escape') setEditingPlotId(null);
                          }}
                          className="w-20 px-2 py-1 text-xs border border-emerald-400 rounded focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-white dark:bg-slate-800 font-bold"
                          placeholder="Value"
                        />
                        <button
                          type="button"
                          onClick={() => handleCommitInlineEdit(trial)}
                          disabled={isSaving}
                          className="p-1 rounded bg-emerald-600 text-white hover:bg-emerald-700 transition"
                          title="Save value"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingPlotId(null)}
                          className="p-1 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-300 transition"
                          title="Cancel"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <div
                        onClick={() => handleStartInlineEdit(trial, currentMetricVal)}
                        className="group flex items-center gap-2 cursor-pointer p-1 -m-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                        title="Click to quickly edit value"
                      >
                        <span className="font-bold text-slate-900 dark:text-white">
                          {currentMetricVal != null ? `${currentMetricVal} ${primaryMetricUnit}` : '–'}
                        </span>
                        {latestObs && latestObs.daa != null && (
                          <span className="text-[10px] text-slate-400">
                            (DAA {latestObs.daa})
                          </span>
                        )}
                        <span className="opacity-0 group-hover:opacity-100 text-emerald-600 dark:text-emerald-400 text-[10px] font-semibold underline">
                          edit
                        </span>
                      </div>
                    )}
                  </td>

                  {/* Photo Thumbnail & Capture Button */}
                  <td className="py-2.5 px-3 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      {photoThumb ? (
                        <div
                          onClick={() => onViewDetails && onViewDetails(trial)}
                          className="w-7 h-7 rounded border border-slate-200 dark:border-slate-700 overflow-hidden cursor-pointer hover:ring-2 hover:ring-emerald-400 transition"
                          title={`${photos.length} photo(s). Click to view`}
                        >
                          <img
                            src={photoThumb}
                            alt="Plot"
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-400">No img</span>
                      )}
                      <button
                        type="button"
                        onClick={() => onQuickPhoto && onQuickPhoto(trial)}
                        className="p-1 rounded hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 transition"
                        title="Take Photo"
                      >
                        <Camera className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>

                  {/* Yield */}
                  <td className="py-2.5 px-3">
                    <span className="text-slate-700 dark:text-slate-300 font-medium">
                      {trial.YieldValue ? `${trial.YieldValue} ${trial.YieldUnit || 't/ha'}` : '–'}
                    </span>
                  </td>

                  {/* Actions */}
                  <td className="py-2.5 px-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => onOpenObsModal && onOpenObsModal(trial)}
                        className="p-1 rounded bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:hover:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 transition"
                        title="Add / View Observations"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onViewDetails && onViewDetails(trial)}
                        className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition"
                        title="View Full Details"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onEdit && onEdit(trial)}
                        className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition"
                        title="Edit Plot Trial"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
