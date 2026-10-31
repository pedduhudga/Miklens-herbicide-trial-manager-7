import React from 'react';
import { Loader2, Save } from 'lucide-react';
import Modal from '../Modal.jsx';
import { HARVEST_YIELD_UNITS, CULL_REASONS } from '../../utils/harvestUtils.js';

export default function ProjectBatchHarvestModal({
  isOpen,
  onClose,
  batchHarvestPickingNum,
  setBatchHarvestPickingNum,
  batchHarvestDate,
  setBatchHarvestDate,
  batchHarvestUnit,
  setBatchHarvestUnit,
  batchHarvestPlotArea,
  setBatchHarvestPlotArea,
  batchHarvestGrid,
  setBatchHarvestGrid,
  projectTrials = [],
  handleSaveBatchHarvest,
  isSavingBatchHarvest = false
}) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Batch Harvest Entry — Picking #${batchHarvestPickingNum}`}
    >
      <form onSubmit={handleSaveBatchHarvest} className="space-y-4 max-h-[85vh] overflow-y-auto pr-1">
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-800">
          Enter harvest data for all plots in this picking session. The cumulative total yield for each plot will be recalculated automatically and updated across ANOVA, charts, and scientific reports.
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Picking #</label>
            <input
              type="number"
              min="1"
              required
              value={batchHarvestPickingNum}
              onChange={e => setBatchHarvestPickingNum(parseInt(e.target.value) || 1)}
              className="w-full px-2.5 py-1.5 border rounded text-xs bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Harvest Date</label>
            <input
              type="date"
              required
              value={batchHarvestDate}
              onChange={e => setBatchHarvestDate(e.target.value)}
              className="w-full px-2.5 py-1.5 border rounded text-xs bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Yield Unit</label>
            <select
              value={batchHarvestUnit}
              onChange={e => setBatchHarvestUnit(e.target.value)}
              className="w-full px-2.5 py-1.5 border rounded text-xs bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            >
              {HARVEST_YIELD_UNITS.map(u => (
                <option key={u.value || u.id} value={u.value || u.id}>{u.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Plot Area (m²)</label>
            <input
              type="number"
              step="0.01"
              value={batchHarvestPlotArea}
              onChange={e => setBatchHarvestPlotArea(e.target.value)}
              placeholder="e.g. 15.0"
              className="w-full px-2.5 py-1.5 border rounded text-xs bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="border border-slate-200 rounded-lg overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
              <tr>
                <th className="py-2 px-2.5">Plot / Trt</th>
                <th className="py-2 px-2.5">Marketable ({batchHarvestUnit}) *</th>
                <th className="py-2 px-2.5">Unmarketable / Culls</th>
                <th className="py-2 px-2.5">Cull Reason</th>
                <th className="py-2 px-2.5">Fruit Count</th>
                <th className="py-2 px-2.5">Moisture %</th>
                <th className="py-2 px-2.5">Brix (°Bx)</th>
                <th className="py-2 px-2.5">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {projectTrials.map(trial => {
                const plotData = batchHarvestGrid[trial.ID] || {};
                const isCtrl = trial.IsControl === true || trial.IsControl === 'true';
                return (
                  <tr key={trial.ID} className={isCtrl ? 'bg-amber-50/40 hover:bg-amber-50/70' : 'hover:bg-slate-50'}>
                    <td className="py-2 px-2.5 font-medium whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-slate-800">Plot #{trial.PlotNumber || trial.ID.slice(-4)}</span>
                        {isCtrl && <span className="text-[9px] px-1 py-0.2 bg-amber-200 text-amber-800 rounded font-bold">UTC</span>}
                      </div>
                      <div className="text-[10px] text-slate-500 truncate max-w-[120px]">{trial.FormulationName || 'Untreated'}</div>
                    </td>
                    <td className="py-1 px-1.5">
                      <input
                        type="number"
                        step="any"
                        value={plotData.marketableWeight || ''}
                        onChange={e => {
                          const val = e.target.value;
                          setBatchHarvestGrid(prev => ({
                            ...prev,
                            [trial.ID]: { ...prev[trial.ID], marketableWeight: val }
                          }));
                        }}
                        placeholder="0.0"
                        className="w-24 px-2 py-1 border rounded text-xs focus:ring-1 focus:ring-emerald-500 font-bold text-slate-800"
                      />
                    </td>
                    <td className="py-1 px-1.5">
                      <input
                        type="number"
                        step="any"
                        value={plotData.unmarketableWeight || ''}
                        onChange={e => {
                          const val = e.target.value;
                          setBatchHarvestGrid(prev => ({
                            ...prev,
                            [trial.ID]: { ...prev[trial.ID], unmarketableWeight: val }
                          }));
                        }}
                        placeholder="0.0"
                        className="w-20 px-2 py-1 border rounded text-xs text-slate-600"
                      />
                    </td>
                    <td className="py-1 px-1.5">
                      <select
                        value={plotData.cullReason || 'None / Normal'}
                        onChange={e => {
                          const val = e.target.value;
                          setBatchHarvestGrid(prev => ({
                            ...prev,
                            [trial.ID]: { ...prev[trial.ID], cullReason: val }
                          }));
                        }}
                        className="w-28 px-1.5 py-1 border rounded text-[11px] bg-white text-slate-700"
                      >
                        {CULL_REASONS.map(r => {
                          const label = typeof r === 'string' ? r : r.label;
                          const val = typeof r === 'string' ? r : r.value;
                          return <option key={val} value={val}>{label}</option>;
                        })}
                      </select>
                    </td>
                    <td className="py-1 px-1.5">
                      <input
                        type="number"
                        value={plotData.fruitCount || ''}
                        onChange={e => {
                          const val = e.target.value;
                          setBatchHarvestGrid(prev => ({
                            ...prev,
                            [trial.ID]: { ...prev[trial.ID], fruitCount: val }
                          }));
                        }}
                        placeholder="#"
                        className="w-16 px-2 py-1 border rounded text-xs text-slate-600"
                      />
                    </td>
                    <td className="py-1 px-1.5">
                      <input
                        type="number"
                        step="0.1"
                        value={plotData.moisturePct || ''}
                        onChange={e => {
                          const val = e.target.value;
                          setBatchHarvestGrid(prev => ({
                            ...prev,
                            [trial.ID]: { ...prev[trial.ID], moisturePct: val }
                          }));
                        }}
                        placeholder="%"
                        className="w-16 px-2 py-1 border rounded text-xs text-slate-600"
                      />
                    </td>
                    <td className="py-1 px-1.5">
                      <input
                        type="number"
                        step="0.1"
                        value={plotData.brixScore || ''}
                        onChange={e => {
                          const val = e.target.value;
                          setBatchHarvestGrid(prev => ({
                            ...prev,
                            [trial.ID]: { ...prev[trial.ID], brixScore: val }
                          }));
                        }}
                        placeholder="°Bx"
                        className="w-16 px-2 py-1 border rounded text-xs text-slate-600"
                      />
                    </td>
                    <td className="py-1 px-1.5">
                      <input
                        type="text"
                        value={plotData.notes || ''}
                        onChange={e => {
                          const val = e.target.value;
                          setBatchHarvestGrid(prev => ({
                            ...prev,
                            [trial.ID]: { ...prev[trial.ID], notes: val }
                          }));
                        }}
                        placeholder="Notes"
                        className="w-24 px-2 py-1 border rounded text-xs text-slate-600"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
            disabled={isSavingBatchHarvest}
            className="px-5 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg shadow-sm transition flex items-center gap-1.5"
          >
            {isSavingBatchHarvest ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {isSavingBatchHarvest ? "Saving All Plots..." : `Save Picking #${batchHarvestPickingNum} for All Plots`}
          </button>
        </div>
      </form>
    </Modal>
  );
}
