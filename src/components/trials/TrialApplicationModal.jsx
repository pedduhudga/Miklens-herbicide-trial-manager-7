import React from 'react';
import Modal from '../Modal.jsx';
import { Loader2, MapPin } from 'lucide-react';
import {
  INPUT_CATEGORIES,
  DOSAGE_UNITS,
  APPLICATION_METHODS,
  CATEGORY_INPUT_PRESETS
} from '../../utils/agronomicInputs.js';
import SprayWeatherRiskBadge from '../SprayWeatherRiskBadge.jsx';

/**
 * Agronomic Input & Application Log Modal
 * Records sprays, fertilizations, biostimulants, fungicides with live weather auto-fetching and risk assessment.
 */
export default function TrialApplicationModal({
  isOpen,
  onClose,
  editingAppIdx,
  appForm,
  setAppForm,
  handleSaveApp,
  handleFetchAppWeather,
  isFetchingAppWeather,
  detailTrial,
  activeTrial,
  activeCategory = 'herbicide'
}) {
  if (!isOpen) return null;

  const currentCategory = detailTrial?.Category || activeTrial?.Category || activeCategory;
  const catPresets = CATEGORY_INPUT_PRESETS[currentCategory] || CATEGORY_INPUT_PRESETS.nutrition;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editingAppIdx !== null ? 'Edit Application Entry' : 'Log Agronomic Input / Application'}
    >
      <form onSubmit={handleSaveApp} className="space-y-4 max-h-[80vh] overflow-y-auto pr-1">
        {/* Quick Category Preset selector */}
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="text-xs font-bold text-emerald-900 block">⚡ Quick Agronomic Preset</span>
            <span className="text-[11px] text-emerald-700">Pre-fill scientific formulation, active ingredient, dosage & purpose:</span>
          </div>
          <select
            defaultValue=""
            onChange={(e) => {
              const pIdx = e.target.value;
              if (pIdx === '') return;
              const selected = catPresets[parseInt(pIdx, 10)];
              if (selected) {
                setAppForm(prev => ({
                  ...prev,
                  inputType: selected.inputType || prev.inputType,
                  productName: selected.productName || prev.productName,
                  activeIngredient: selected.activeIngredient || prev.activeIngredient,
                  dosage: selected.dosage || prev.dosage,
                  dosageUnit: selected.dosageUnit || prev.dosageUnit,
                  method: selected.method || prev.method,
                  targetPurpose: selected.targetPurpose || prev.targetPurpose,
                  cropStage: selected.cropStage || prev.cropStage,
                  notes: selected.notes || prev.notes
                }));
              }
              e.target.value = '';
            }}
            className="text-xs bg-white border border-emerald-300 text-emerald-900 font-semibold rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-400"
          >
            <option value="">Select preset...</option>
            {catPresets.map((preset, pIdx) => (
              <option key={pIdx} value={pIdx}>
                {preset.label || `${preset.productName} (${preset.dosage} ${preset.dosageUnit})`}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Application Code/Name *</label>
            <input
              type="text"
              required
              value={appForm.code}
              onChange={e => setAppForm({ ...appForm, code: e.target.value })}
              className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
              placeholder="e.g. App A"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Input Category *</label>
            <select
              value={appForm.inputType || 'fertilizer'}
              onChange={e => setAppForm({ ...appForm, inputType: e.target.value })}
              className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white font-semibold"
            >
              {INPUT_CATEGORIES.map(cat => (
                <option key={cat.value} value={cat.value}>{cat.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Date & Time *</label>
            <input
              type="datetime-local"
              required
              value={appForm.date}
              onChange={e => setAppForm({ ...appForm, date: e.target.value })}
              className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
            />
          </div>
        </div>

        {/* Product & Active Ingredient */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Product / Brand Name *</label>
            <input
              type="text"
              required
              value={appForm.productName || ''}
              onChange={e => setAppForm({ ...appForm, productName: e.target.value })}
              className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
              placeholder="e.g. Urea 46% N / Mancozeb 75 WP / Coragen"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Active Ingredient / Composition</label>
            <input
              type="text"
              value={appForm.activeIngredient || ''}
              onChange={e => setAppForm({ ...appForm, activeIngredient: e.target.value })}
              className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
              placeholder="e.g. Nitrogen 46% / Mancozeb 75% / Chlorantraniliprole 18.5%"
            />
          </div>
        </div>

        {/* Dosage & Dosage Unit */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Dosage / Rate *</label>
            <input
              type="text"
              required
              value={appForm.dosage}
              onChange={e => setAppForm({ ...appForm, dosage: e.target.value })}
              className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
              placeholder="e.g. 2.5 or 150"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Dosage Unit</label>
            <select
              value={appForm.dosageUnit || 'L/ha'}
              onChange={e => setAppForm({ ...appForm, dosageUnit: e.target.value })}
              className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
            >
              {DOSAGE_UNITS.map(u => (
                <option key={u.value} value={u.value}>{u.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Application Method</label>
            <select
              value={appForm.method || 'Foliar Spray'}
              onChange={e => setAppForm({ ...appForm, method: e.target.value })}
              className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
            >
              {APPLICATION_METHODS.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Target Purpose & Operator */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Target Purpose / Pest / Deficiency</label>
            <input
              type="text"
              value={appForm.targetPurpose || ''}
              onChange={e => setAppForm({ ...appForm, targetPurpose: e.target.value })}
              className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
              placeholder="e.g. Early Blight control, Vegetative N boost"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Operator / Technician</label>
            <input
              type="text"
              value={appForm.operator || ''}
              onChange={e => setAppForm({ ...appForm, operator: e.target.value })}
              className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
              placeholder="e.g. Field Officer Name"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Applied Scope</label>
            <select
              value={appForm.appliedScope || 'Plot-level'}
              onChange={e => setAppForm({ ...appForm, appliedScope: e.target.value })}
              className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
            >
              <option value="Plot-level">Plot-level (This plot only)</option>
              <option value="Blanket / Trial-wide">Blanket / Trial-wide (Across all plots)</option>
              <option value="Buffer / Border">Buffer / Border Strip</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Crop Growth Stage (BBCH)</label>
            <input
              type="text"
              value={appForm.cropStage}
              onChange={e => setAppForm({ ...appForm, cropStage: e.target.value })}
              className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
              placeholder="e.g. BBCH 12"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Target / Weed Growth Stage</label>
            <input
              type="text"
              value={appForm.targetStage}
              onChange={e => setAppForm({ ...appForm, targetStage: e.target.value })}
              className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
              placeholder="e.g. 10 cm height"
            />
          </div>
        </div>

        {/* Tank Mix & Adjuvant */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Adjuvant</label>
            <input
              type="text"
              value={appForm.adjuvant}
              onChange={e => setAppForm({ ...appForm, adjuvant: e.target.value })}
              className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
              placeholder="e.g. Silwet 0.05%, Hasten 0.5 L/ha"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Tank Mix Partners</label>
            <input
              type="text"
              value={appForm.tankMix}
              onChange={e => setAppForm({ ...appForm, tankMix: e.target.value })}
              className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
              placeholder="e.g. Glyphosate 360g + 2,4-D 500g"
            />
          </div>
        </div>

        {/* Weather Details Box */}
        <div className="border rounded-xl p-3 bg-slate-50 space-y-3">
          <div className="flex justify-between items-center border-b pb-2">
            <span className="text-xs font-bold text-slate-700 uppercase">Weather Conditions at Application</span>
            <button
              type="button"
              onClick={handleFetchAppWeather}
              disabled={isFetchingAppWeather}
              className="text-xs text-emerald-600 hover:text-emerald-700 font-bold flex items-center gap-1 disabled:opacity-50"
            >
              {isFetchingAppWeather ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" /> Fetching...
                </>
              ) : (
                <>
                  <MapPin className="w-3 h-3" /> Auto-fetch weather
                </>
              )}
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <label className="block text-slate-500 font-semibold mb-1">Temp (°C)</label>
              <input
                type="number"
                step="0.1"
                value={appForm.temp}
                onChange={e => setAppForm({ ...appForm, temp: e.target.value })}
                className="w-full px-2 py-1.5 border rounded-lg bg-white"
                placeholder="25"
              />
            </div>
            <div>
              <label className="block text-slate-500 font-semibold mb-1">Humidity (%)</label>
              <input
                type="number"
                value={appForm.humidity}
                onChange={e => setAppForm({ ...appForm, humidity: e.target.value })}
                className="w-full px-2 py-1.5 border rounded-lg bg-white"
                placeholder="60"
              />
            </div>
            <div>
              <label className="block text-slate-500 font-semibold mb-1">Wind (km/h)</label>
              <input
                type="number"
                step="0.1"
                value={appForm.windspeed}
                onChange={e => setAppForm({ ...appForm, windspeed: e.target.value })}
                className="w-full px-2 py-1.5 border rounded-lg bg-white"
                placeholder="10"
              />
            </div>
            <div>
              <label className="block text-slate-500 font-semibold mb-1">Rain within 2h?</label>
              <select
                value={appForm.rain}
                onChange={e => setAppForm({ ...appForm, rain: e.target.value })}
                className="w-full px-2 py-1.5 border rounded-lg bg-white"
              >
                <option value="No">No</option>
                <option value="Yes">Yes</option>
              </select>
            </div>
          </div>
          <div className="mt-3">
            <SprayWeatherRiskBadge
              weather={{
                temp: appForm.temp,
                humidity: appForm.humidity,
                wind: appForm.windspeed,
                rain: appForm.rain
              }}
              formulation={activeTrial?.FormulationName || activeTrial?.FormulationID}
              activeCategory={activeTrial?.Category || currentCategory}
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Application Notes / Details</label>
          <textarea
            rows="3"
            value={appForm.notes}
            onChange={e => setAppForm({ ...appForm, notes: e.target.value })}
            className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
            placeholder="Record any specific details such as nozzle type, pressure, soil moisture, etc."
          />
        </div>

        <div className="pt-4 flex justify-end gap-3 border-t">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg font-medium"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 rounded-lg text-sm font-bold shadow-sm transition"
          >
            Save Application Entry
          </button>
        </div>
      </form>
    </Modal>
  );
}
