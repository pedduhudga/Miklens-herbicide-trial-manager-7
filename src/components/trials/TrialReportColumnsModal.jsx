import React from 'react';
import Modal from '../Modal.jsx';
import { getCategoryConfig } from '../../utils/categoryConfig.js';

/**
 * Customise Report Columns Modal
 * Allows users to choose specific observation metrics/columns to include in exported trial reports.
 */
export default function TrialReportColumnsModal({
  isOpen,
  onClose,
  detailTrial,
  projects = [],
  activeCategory = 'herbicide',
  reportFieldSelection = {},
  setReportFieldSelection,
  pendingReportExport
}) {
  if (!isOpen) return null;

  const currentProj = detailTrial ? projects.find(p => String(p.ID) === String(detailTrial.ProjectID)) : null;
  const isPotTrial = currentProj?.Design === 'PotTrial';
  const fields = isPotTrial
    ? (currentProj.PotFields || ['Plant Height', 'Branches', 'Flowers', 'Fruit Count', 'Yield']).map(f => ({ key: f, label: f }))
    : (getCategoryConfig(activeCategory).observationFields || []);

  const handleGenerate = () => {
    if (pendingReportExport) {
      const key = isPotTrial ? (currentProj.Category || activeCategory) : activeCategory;
      if (!window.activeReportFields) window.activeReportFields = {};
      window.activeReportFields[key] = reportFieldSelection;
      pendingReportExport();
    }
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Customise Report Columns">
      <div className="space-y-4">
        <p className="text-sm text-slate-500">
          Select the observation variables/columns you want to include in the generated report:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[50vh] overflow-y-auto pr-1">
          {fields.map(f => (
            <label key={f.key} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-slate-50 cursor-pointer transition">
              <input
                type="checkbox"
                checked={reportFieldSelection[f.key] !== false}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setReportFieldSelection(prev => ({ ...prev, [f.key]: checked }));
                }}
                className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
              />
              <span className="text-sm font-medium text-slate-700">{f.label}</span>
            </label>
          ))}
        </div>
        <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-slate-500 hover:text-slate-700 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleGenerate}
            className="px-4 py-2 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition"
          >
            Generate Report
          </button>
        </div>
      </div>
    </Modal>
  );
}
