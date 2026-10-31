import React from 'react';
import Modal from '../Modal.jsx';
import { HARVEST_YIELD_UNITS, CULL_REASONS } from '../../utils/harvestUtils.js';

/**
 * Multi-Harvest / Picking Entry Modal
 * Records single picking events with marketable weight, culls, fruit counts, brix score, and moisture.
 */
export default function TrialHarvestPickingModal({
  isOpen,
  onClose,
  editingPickingIdx,
  pickingForm,
  setPickingForm,
  harvestForm = {},
  handleSavePicking
}) {
  if (!isOpen) return null;

  const currentPickingNum = pickingForm.pickingNumber || 
    (editingPickingIdx !== null ? editingPickingIdx + 1 : ((harvestForm.pickings || []).length + 1));

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editingPickingIdx !== null ? `Edit Harvest Picking #${currentPickingNum}` : `Record Harvest Picking #${currentPickingNum}`}
    >
      <form onSubmit={handleSavePicking} className="space-y-4 max-h-[80vh] overflow-y-auto pr-1">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Picking Number *</label>
            <input
              type="number"
              min="1"
              required
              value={pickingForm.pickingNumber}
              onChange={e => setPickingForm({ ...pickingForm, pickingNumber: e.target.value })}
              className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
              placeholder="1"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Harvest Date *</label>
            <input
              type="date"
              required
              value={pickingForm.harvestDate}
              onChange={e => setPickingForm({ ...pickingForm, harvestDate: e.target.value })}
              className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Crop Stage (BBCH)</label>
            <input
              type="text"
              value={pickingForm.cropStage || ''}
              onChange={e => setPickingForm({ ...pickingForm, cropStage: e.target.value })}
              className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
              placeholder="e.g. BBCH 89 (Full Maturity)"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Yield Unit</label>
            <select
              value={pickingForm.yieldUnit || harvestForm.yieldUnit || 'g/plant'}
              onChange={e => setPickingForm({ ...pickingForm, yieldUnit: e.target.value })}
              className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white font-medium"
            >
              {HARVEST_YIELD_UNITS.map(u => (
                <option key={u.value} value={u.value}>{u.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Plot Area (m² - for ha extrapolation)</label>
            <input
              type="number"
              step="any"
              min="0"
              placeholder="e.g. 15.0"
              value={pickingForm.plotAreaM2 || ''}
              onChange={e => setPickingForm({ ...pickingForm, plotAreaM2: e.target.value })}
              className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
              Marketable Yield ({pickingForm.yieldUnit || harvestForm.yieldUnit || 'g/plant'}) *
            </label>
            <input
              type="number"
              step="any"
              min="0"
              required
              placeholder="e.g. 850"
              value={pickingForm.actualMarketableWeight}
              onChange={e => setPickingForm({ ...pickingForm, actualMarketableWeight: e.target.value })}
              className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white font-bold text-emerald-800"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
              Unmarketable Yield ({pickingForm.yieldUnit || harvestForm.yieldUnit || 'g/plant'})
            </label>
            <input
              type="number"
              step="any"
              min="0"
              placeholder="e.g. 90"
              value={pickingForm.actualUnmarketableWeight}
              onChange={e => setPickingForm({ ...pickingForm, actualUnmarketableWeight: e.target.value })}
              className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white text-rose-700"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Cull / Damage Reason</label>
            <select
              value={pickingForm.cullReason || ''}
              onChange={e => setPickingForm({ ...pickingForm, cullReason: e.target.value })}
              className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
            >
              <option value="">None / Not applicable</option>
              {CULL_REASONS.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Fruit / Pod Count (per plant/plot)</label>
            <input
              type="number"
              min="0"
              placeholder="e.g. 35"
              value={pickingForm.actualFruitCount}
              onChange={e => setPickingForm({ ...pickingForm, actualFruitCount: e.target.value })}
              className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Moisture Content (%)</label>
            <input
              type="number"
              step="0.1"
              min="0"
              max="100"
              placeholder="e.g. 14.5"
              value={pickingForm.moisturePct ?? ''}
              onChange={e => setPickingForm({ ...pickingForm, moisturePct: e.target.value })}
              className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Brix / Quality Score (°Bx - for fruits/vegetables/cane)</label>
          <input
            type="number"
            step="0.1"
            min="0"
            placeholder="e.g. 12.8"
            value={pickingForm.brixScore ?? ''}
            onChange={e => setPickingForm({ ...pickingForm, brixScore: e.target.value })}
            className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Harvest Notes / Remarks</label>
          <textarea
            rows="3"
            value={pickingForm.notes}
            onChange={e => setPickingForm({ ...pickingForm, notes: e.target.value })}
            className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
            placeholder="Fruit sizing, quality grading, color, blemish notes for this picking..."
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
            Save Harvest Picking
          </button>
        </div>
      </form>
    </Modal>
  );
}
