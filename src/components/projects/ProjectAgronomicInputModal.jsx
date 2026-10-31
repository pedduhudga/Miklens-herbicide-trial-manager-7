import React from 'react';
import { Sparkles } from 'lucide-react';
import Modal from '../Modal.jsx';
import {
  INPUT_CATEGORIES,
  DOSAGE_UNITS,
  APPLICATION_METHODS,
  CATEGORY_INPUT_PRESETS
} from '../../utils/agronomicInputs.js';

export default function ProjectAgronomicInputModal({
  isOpen,
  onClose,
  editingProjAppIdx,
  projAppForm,
  setProjAppForm,
  handleSaveProjApp,
  projectCategory = 'herbicide',
  applyPresetToProjAppForm,
  projectTrials = []
}) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editingProjAppIdx !== null ? "Edit Agronomic Management Input" : "Log Agronomic Management Input"}
    >
      <form onSubmit={handleSaveProjApp} className="space-y-4 max-h-[80vh] overflow-y-auto pr-1">
        {editingProjAppIdx === null && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <div className="text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              Quick Field Presets ({projectCategory.toUpperCase()})
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(CATEGORY_INPUT_PRESETS[projectCategory] || CATEGORY_INPUT_PRESETS['nutrition']).map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => applyPresetToProjAppForm(preset)}
                  className="text-[11px] px-2 py-1 rounded-md bg-white border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50 text-slate-700 font-medium transition"
                >
                  {preset.productName} ({preset.dosage} {preset.dosageUnit})
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Input Category *</label>
            <select
              value={projAppForm.inputType}
              onChange={e => setProjAppForm(f => ({ ...f, inputType: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            >
              {INPUT_CATEGORIES.map(cat => (
                <option key={cat.value} value={cat.value}>{cat.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Operation Code</label>
            <input
              type="text"
              value={projAppForm.code}
              onChange={e => setProjAppForm(f => ({ ...f, code: e.target.value }))}
              placeholder="e.g. INP-01, BASAL-01"
              className="w-full px-3 py-2 border rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Product / Fertilizer / Chemical Name *</label>
            <input
              type="text"
              required
              value={projAppForm.productName}
              onChange={e => setProjAppForm(f => ({ ...f, productName: e.target.value }))}
              placeholder="e.g. NPK 10-26-26, Azoxystrobin, Seaweed Extract"
              className="w-full px-3 py-2 border rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Active Ingredient / Composition</label>
            <input
              type="text"
              value={projAppForm.activeIngredient}
              onChange={e => setProjAppForm(f => ({ ...f, activeIngredient: e.target.value }))}
              placeholder="e.g. 10% N, 26% P2O5, 26% K2O or Azoxystrobin 23% SC"
              className="w-full px-3 py-2 border rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Application Date & Time *</label>
            <input
              type="datetime-local"
              required
              value={projAppForm.date}
              onChange={e => setProjAppForm(f => ({ ...f, date: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Dosage Rate *</label>
            <input
              type="text"
              required
              value={projAppForm.dosage}
              onChange={e => setProjAppForm(f => ({ ...f, dosage: e.target.value }))}
              placeholder="e.g. 2.5, 100, 500"
              className="w-full px-3 py-2 border rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Dosage Unit *</label>
            <select
              value={projAppForm.dosageUnit}
              onChange={e => setProjAppForm(f => ({ ...f, dosageUnit: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            >
              {DOSAGE_UNITS.map(u => (
                <option key={u.value} value={u.value}>{u.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Application Method *</label>
            <select
              value={projAppForm.method}
              onChange={e => setProjAppForm(f => ({ ...f, method: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            >
              {APPLICATION_METHODS.map(m => (
                <option key={m.value || m} value={m.value || m}>{m.label || m}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Applied Scope</label>
            <select
              value={projAppForm.appliedScope}
              onChange={e => setProjAppForm(f => ({ ...f, appliedScope: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            >
              <option value="Blanket / Entire Project">Blanket / Entire Project (All Plots)</option>
              <option value="Prophylactic Buffer">Prophylactic Field Border / Buffer</option>
              <option value="Treated Blocks Only">Treated Blocks Only</option>
              <option value="Experimental Trial Plots Only">Experimental Trial Plots Only</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Crop Stage (BBCH)</label>
            <input
              type="text"
              value={projAppForm.cropStage}
              onChange={e => setProjAppForm(f => ({ ...f, cropStage: e.target.value }))}
              placeholder="e.g. Vegetative (BBCH 21), Flowering (BBCH 65)"
              className="w-full px-3 py-2 border rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Target Purpose / Disease / Pest</label>
            <input
              type="text"
              value={projAppForm.targetPurpose}
              onChange={e => setProjAppForm(f => ({ ...f, targetPurpose: e.target.value }))}
              placeholder="e.g. Basal nutrition, Downy mildew prophylactic, Sucking pest control"
              className="w-full px-3 py-2 border rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Operator / Agronomist</label>
            <input
              type="text"
              value={projAppForm.operator}
              onChange={e => setProjAppForm(f => ({ ...f, operator: e.target.value }))}
              placeholder="Name of applicator"
              className="w-full px-3 py-2 border rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>
          <div className="flex items-center pt-5">
            <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700">
              <input
                type="checkbox"
                checked={projAppForm.syncToSubTrials}
                onChange={e => setProjAppForm(f => ({ ...f, syncToSubTrials: e.target.checked }))}
                className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span>Automatically sync to all {projectTrials.length} plots in this project</span>
            </label>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Agronomic Notes & Observations</label>
          <textarea
            rows={2}
            value={projAppForm.notes}
            onChange={e => setProjAppForm(f => ({ ...f, notes: e.target.value }))}
            placeholder="Application conditions, nozzle type, spray volume (L/ha), soil moisture..."
            className="w-full px-3 py-2 border rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          />
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-800 transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-5 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition"
          >
            {editingProjAppIdx !== null ? "Update Agronomic Input" : "Save Agronomic Input"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
