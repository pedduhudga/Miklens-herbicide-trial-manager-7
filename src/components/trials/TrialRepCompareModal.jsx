import React from 'react';
import Modal from '../Modal.jsx';
import { safeJsonParse } from '../../utils/helpers.js';
import { validateEfficacyData } from '../../utils/analysisUtils.js';
import { getObservationPrimaryValue } from '../../utils/categoryConfig.js';

/**
 * Cross-Replication Observation Comparison Modal
 * Displays a multi-replication matrix of primary metric values across DAAs for a treatment.
 */
export default function TrialRepCompareModal({
  isOpen,
  onClose,
  detailTrial,
  trials = [],
  activeCategory = 'herbicide',
  catConfig = {}
}) {
  if (!isOpen || !detailTrial?.ProjectID) return null;

  // Get all trials in the same project with the same treatment
  const projectTrials = trials.filter(t => 
    String(t.ProjectID) === String(detailTrial.ProjectID) &&
    (t.FormulationName === detailTrial.FormulationName || t.FormulationID === detailTrial.FormulationID)
  ).sort((a, b) => (parseInt(a.Replication, 10) || 0) - (parseInt(b.Replication, 10) || 0));

  // Get unique DAAs across all replicates
  const repDAAs = new Set();
  projectTrials.forEach(t => {
    const eff = validateEfficacyData(safeJsonParse(t.EfficacyDataJSON, []), activeCategory);
    eff.forEach(obs => {
      if (obs.daa !== undefined && obs.daa !== null) repDAAs.add(Number(obs.daa));
    });
  });
  const sortedDAAs = Array.from(repDAAs).sort((a, b) => a - b);
  const metricLabel = catConfig.primaryMetric?.label || 'Primary Metric';
  const metricUnit = catConfig.primaryMetric?.unit || '%';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Cross-Replicate Observation comparison">
      <div className="space-y-4">
        <div className="bg-slate-50 rounded-xl p-3 border text-xs">
          <span className="font-bold text-slate-700 block mb-0.5">Treatment comparison</span>
          <span className="text-slate-500">
            Treatment: {detailTrial.FormulationName || detailTrial.FormulationID} | Target Metric: {metricLabel} ({metricUnit})
          </span>
        </div>

        {sortedDAAs.length === 0 ? (
          <p className="text-center py-6 text-slate-400 text-xs">No observation points recorded yet.</p>
        ) : (
          <div className="overflow-x-auto border rounded-xl">
            <table className="min-w-full text-xs divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left font-bold text-slate-500 uppercase text-[9px]">Replication</th>
                  {sortedDAAs.map(daa => (
                    <th key={daa} className="px-3 py-2 text-center font-bold text-slate-500 uppercase text-[9px]">DAA {daa}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {projectTrials.map((t, index) => {
                  const eff = validateEfficacyData(safeJsonParse(t.EfficacyDataJSON, []), activeCategory);
                  const isCurrent = t.ID === detailTrial.ID;
                  return (
                    <tr key={t.ID} className={isCurrent ? 'bg-indigo-50/40 font-semibold' : ''}>
                      <td className="px-3 py-2 text-slate-700">
                        Rep {t.Replication || index + 1} {t.PlotNumber ? `(Plot ${t.PlotNumber})` : ''} {t.IsControl ? '[Control]' : ''} {isCurrent ? '⭐' : ''}
                      </td>
                      {sortedDAAs.map(daa => {
                        const match = eff.find(o => Number(o.daa) === Number(daa));
                        const val = match ? getObservationPrimaryValue(activeCategory, match) : null;
                        return (
                          <td key={daa} className="px-3 py-2 text-center font-medium text-slate-600">
                            {val !== null ? `${val}%` : '—'}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex justify-end pt-2">
          <button onClick={onClose} className="px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 text-xs font-bold transition">
            Close Comparison
          </button>
        </div>
      </div>
    </Modal>
  );
}
