import React, { useState, useMemo, useEffect } from 'react';
import {
  X, Check, Sparkles, Leaf, Calendar, Clock, AlertCircle, Droplets,
  Layers, ChevronRight, User, CheckCircle2, ShieldCheck, Info
} from 'lucide-react';
import {
  INPUT_CATEGORIES,
  DOSAGE_UNITS,
  APPLICATION_METHODS,
  CATEGORY_INPUT_PRESETS,
  normalizeApplicationItem,
  getInputCategoryBadge
} from '../../utils/agronomicInputs.js';
import { toDatetimeLocal } from '../../utils/dateUtils.js';

export default function BatchApplicationModal({
  isOpen,
  onClose,
  trialsList = [],
  project = null,
  activeCategory = 'nutrition',
  onSaveBatchApplication
}) {
  if (!isOpen) return null;

  // Selected plot IDs
  const [selectedPlotIds, setSelectedPlotIds] = useState(() => {
    return new Set(trialsList.map(t => t.ID));
  });

  // Keep selectedPlotIds updated if trialsList changes
  useEffect(() => {
    setSelectedPlotIds(new Set(trialsList.map(t => t.ID)));
  }, [trialsList]);

  // Form State
  const [appForm, setAppForm] = useState({
    code: 'App A',
    date: toDatetimeLocal(new Date()),
    inputType: activeCategory === 'nutrition' ? 'fertilizer' : (activeCategory === 'biostimulant' ? 'biostimulant' : 'fertilizer'),
    productName: '',
    activeIngredient: '',
    dosage: '',
    dosageUnit: 'g/L',
    method: 'Foliar Spray',
    cropStage: '',
    targetPurpose: '',
    operator: '',
    weather: '',
    notes: '',
  });

  const [selectedPresetIdx, setSelectedPresetIdx] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Available presets for active category
  const presets = useMemo(() => {
    return CATEGORY_INPUT_PRESETS[activeCategory] || CATEGORY_INPUT_PRESETS.nutrition || [];
  }, [activeCategory]);

  // Apply Preset Handler
  const handleSelectPreset = (idxStr) => {
    setSelectedPresetIdx(idxStr);
    if (idxStr === '') return;
    const p = presets[parseInt(idxStr, 10)];
    if (p) {
      setAppForm(prev => ({
        ...prev,
        inputType: p.inputType || prev.inputType,
        productName: p.productName || '',
        activeIngredient: p.activeIngredient || '',
        dosage: p.dosage || '',
        dosageUnit: p.dosageUnit || prev.dosageUnit,
        method: p.method || prev.method,
        cropStage: p.cropStage || prev.cropStage,
        targetPurpose: p.targetPurpose || prev.targetPurpose,
      }));
    }
  };

  // Toggle single plot selection
  const handleTogglePlot = (trialId) => {
    setSelectedPlotIds(prev => {
      const next = new Set(prev);
      if (next.has(trialId)) next.delete(trialId);
      else next.add(trialId);
      return next;
    });
  };

  // Select all / Deselect all
  const handleSelectAll = () => {
    setSelectedPlotIds(new Set(trialsList.map(t => t.ID)));
  };

  const handleDeselectControls = () => {
    const nonControls = trialsList.filter(t => !t.IsControl && t.IsControl !== 'true');
    setSelectedPlotIds(new Set(nonControls.map(t => t.ID)));
  };

  // Submit Handler
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (selectedPlotIds.size === 0) {
      window.dispatchEvent(new CustomEvent('app:toast', {
        detail: { msg: 'Please select at least one plot or plant to apply to.', type: 'error' }
      }));
      return;
    }
    if (!appForm.productName && !appForm.targetPurpose) {
      window.dispatchEvent(new CustomEvent('app:toast', {
        detail: { msg: 'Please enter a product name or purpose for this application.', type: 'error' }
      }));
      return;
    }

    setIsSubmitting(true);
    try {
      const applicationPayload = normalizeApplicationItem({
        ...appForm,
        appliedScope: selectedPlotIds.size === trialsList.length ? 'Whole Trial / All Plots' : `${selectedPlotIds.size} Selected Plots`
      });

      await onSaveBatchApplication({
        targetTrialIds: Array.from(selectedPlotIds),
        applicationItem: applicationPayload
      });

      onClose();
    } catch (err) {
      console.error(err);
      window.dispatchEvent(new CustomEvent('app:toast', {
        detail: { msg: `Failed to save batch application: ${err.message}`, type: 'error' }
      }));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 backdrop-blur-xs animate-fade-in overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden my-6 flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/10 rounded-xl backdrop-blur-xs">
              <Leaf className="w-5 h-5 text-emerald-200" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold">Batch Agronomic Input & Application</h3>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-white/20 capitalize">
                  {activeCategory}
                </span>
              </div>
              <p className="text-xs text-emerald-100 mt-0.5">
                Apply fertilizers, foliar nutrients, sprays, or biostimulants across multiple trial plots/plants simultaneously
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          
          {/* 1. Target Plots Selection Box */}
          <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-600" />
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide">
                  Target Plots / Plants ({selectedPlotIds.size} of {trialsList.length} Selected)
                </h4>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="px-2 py-1 text-emerald-700 dark:text-emerald-400 font-semibold hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded transition"
                >
                  Select All
                </button>
                <span className="text-slate-300">|</span>
                <button
                  type="button"
                  onClick={handleDeselectControls}
                  className="px-2 py-1 text-slate-600 dark:text-slate-300 font-semibold hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition"
                >
                  Exclude Controls
                </button>
              </div>
            </div>

            {/* Plots pills grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 max-h-36 overflow-y-auto p-1 scrollbar-thin">
              {trialsList.map(t => {
                const isSelected = selectedPlotIds.has(t.ID);
                const isControl = t.IsControl === true || t.IsControl === 'true';

                return (
                  <button
                    key={t.ID}
                    type="button"
                    onClick={() => handleTogglePlot(t.ID)}
                    className={`flex items-center justify-between p-2 rounded-lg border text-left text-xs transition ${
                      isSelected
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-400 text-emerald-900 dark:text-emerald-200 font-bold shadow-2xs'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    <div className="truncate pr-1">
                      <div className="font-mono text-[11px] truncate">{t.PlotNumber || t.Plot || 'Plot'}</div>
                      <div className="text-[10px] font-normal text-slate-400 truncate">
                        {isControl ? 'Control' : (t.FormulationName || t.Crop || 'Treated')}
                      </div>
                    </div>
                    {isSelected ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    ) : (
                      <div className="w-3.5 h-3.5 rounded border border-slate-300 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Quick Presets Bar */}
          {presets.length > 0 && (
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 uppercase">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>Quick-Fill from Scientific Agronomic Presets ({activeCategory})</span>
              </label>
              <select
                value={selectedPresetIdx}
                onChange={e => handleSelectPreset(e.target.value)}
                className="w-full px-3 py-2 text-xs sm:text-sm bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 rounded-xl focus:ring-2 focus:ring-amber-400 text-slate-800 dark:text-slate-200 font-medium"
              >
                <option value="">-- Choose a standard preset or enter custom below --</option>
                {presets.map((p, idx) => (
                  <option key={idx} value={String(idx)}>
                    [{p.inputType?.toUpperCase()}] {p.label || p.productName} ({p.dosage} {p.dosageUnit})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* 3. Form Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Input Type */}
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 uppercase mb-1">
                Input Category *
              </label>
              <select
                value={appForm.inputType}
                onChange={e => setAppForm(p => ({ ...p, inputType: e.target.value }))}
                className="w-full px-3 py-2 text-sm border rounded-xl dark:bg-slate-800 dark:border-slate-700 text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-emerald-400"
              >
                {INPUT_CATEGORIES.map(c => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </div>

            {/* Date & Time */}
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 uppercase mb-1">
                Date & Time of Application *
              </label>
              <input
                type="datetime-local"
                value={appForm.date}
                onChange={e => setAppForm(p => ({ ...p, date: e.target.value }))}
                className="w-full px-3 py-2 text-sm border rounded-xl dark:bg-slate-800 dark:border-slate-700 text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-emerald-400"
                required
              />
            </div>

            {/* Product Name */}
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 uppercase mb-1">
                Product / Fertilizer / Material Name *
              </label>
              <input
                type="text"
                placeholder="e.g. Zinc EDTA 12%, Prilled Urea 46%, Mancozeb 75% WP..."
                value={appForm.productName}
                onChange={e => setAppForm(p => ({ ...p, productName: e.target.value }))}
                className="w-full px-3 py-2 text-sm border rounded-xl dark:bg-slate-800 dark:border-slate-700 text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-emerald-400"
                required
              />
            </div>

            {/* Active Ingredient / Formula */}
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 uppercase mb-1">
                Active Ingredient / NPK Analysis
              </label>
              <input
                type="text"
                placeholder="e.g. Zn 12%, 18-46-0, Amino Acids 24%..."
                value={appForm.activeIngredient}
                onChange={e => setAppForm(p => ({ ...p, activeIngredient: e.target.value }))}
                className="w-full px-3 py-2 text-sm border rounded-xl dark:bg-slate-800 dark:border-slate-700 text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-emerald-400"
              />
            </div>

            {/* Dosage & Unit */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 uppercase mb-1">
                  Dosage *
                </label>
                <input
                  type="text"
                  placeholder="e.g. 2.5, 100..."
                  value={appForm.dosage}
                  onChange={e => setAppForm(p => ({ ...p, dosage: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border rounded-xl dark:bg-slate-800 dark:border-slate-700 text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-emerald-400"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 uppercase mb-1">
                  Unit *
                </label>
                <select
                  value={appForm.dosageUnit}
                  onChange={e => setAppForm(p => ({ ...p, dosageUnit: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border rounded-xl dark:bg-slate-800 dark:border-slate-700 text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-emerald-400"
                >
                  {DOSAGE_UNITS.map(u => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                  <option value="g/plant">g/plant</option>
                  <option value="mL/pot">mL/pot</option>
                  <option value="g/pot">g/pot</option>
                </select>
              </div>
            </div>

            {/* Method */}
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 uppercase mb-1">
                Application Method *
              </label>
              <select
                value={appForm.method}
                onChange={e => setAppForm(p => ({ ...p, method: e.target.value }))}
                className="w-full px-3 py-2 text-sm border rounded-xl dark:bg-slate-800 dark:border-slate-700 text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-emerald-400"
              >
                {APPLICATION_METHODS.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>

            {/* Crop Stage */}
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 uppercase mb-1">
                Crop Growth Stage (BBCH)
              </label>
              <input
                type="text"
                placeholder="e.g. Vegetative (BBCH 21), Flowering (BBCH 61)..."
                value={appForm.cropStage}
                onChange={e => setAppForm(p => ({ ...p, cropStage: e.target.value }))}
                className="w-full px-3 py-2 text-sm border rounded-xl dark:bg-slate-800 dark:border-slate-700 text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-emerald-400"
              />
            </div>

            {/* Target Purpose */}
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 uppercase mb-1">
                Objective / Purpose of Input
              </label>
              <input
                type="text"
                placeholder="e.g. Zinc correction, Basal fertilizer foundation, Fruit sizing..."
                value={appForm.targetPurpose}
                onChange={e => setAppForm(p => ({ ...p, targetPurpose: e.target.value }))}
                className="w-full px-3 py-2 text-sm border rounded-xl dark:bg-slate-800 dark:border-slate-700 text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-emerald-400"
              />
            </div>

            {/* Operator */}
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 uppercase mb-1">
                Operator / Applicator
              </label>
              <input
                type="text"
                placeholder="e.g. Field Agronomist, Pavan..."
                value={appForm.operator}
                onChange={e => setAppForm(p => ({ ...p, operator: e.target.value }))}
                className="w-full px-3 py-2 text-sm border rounded-xl dark:bg-slate-800 dark:border-slate-700 text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-emerald-400"
              />
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 uppercase mb-1">
                Weather / Notes
              </label>
              <input
                type="text"
                placeholder="e.g. Clear morning, 28°C, soil well irrigated..."
                value={appForm.notes}
                onChange={e => setAppForm(p => ({ ...p, notes: e.target.value }))}
                className="w-full px-3 py-2 text-sm border rounded-xl dark:bg-slate-800 dark:border-slate-700 text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-emerald-400"
              />
            </div>

          </div>

          {/* Scope notice */}
          <div className="bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/50 p-3 rounded-xl flex items-start gap-2.5 text-xs text-emerald-800 dark:text-emerald-300">
            <Info className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
            <div>
              <span className="font-bold">Instant Multi-Trial Sync:</span> This application will be appended to the agronomic inputs timeline of all <strong>{selectedPlotIds.size} selected plots</strong>. You do not need to open each trial card individually.
            </div>
          </div>

        </form>

        {/* Footer */}
        <div className="p-4 bg-slate-50 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || selectedPlotIds.size === 0}
            className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-xs sm:text-sm rounded-xl transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSubmitting ? (
              <span>Saving Application...</span>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>Apply to {selectedPlotIds.size} Plots / Plants</span>
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
