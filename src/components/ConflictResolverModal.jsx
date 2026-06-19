import React from 'react';
import Modal from './Modal.jsx';
import { ShieldAlert, ArrowLeftRight, Check, CloudDownload, Laptop } from 'lucide-react';
import { safeJsonParse } from '../utils/helpers.js';

export default function ConflictResolverModal({
  isOpen,
  onClose,
  conflict,
  onResolve
}) {
  if (!conflict) return null;

  const { localItem, cloudItem, type = 'trial' } = conflict;

  const localObs = safeJsonParse(localItem?.EfficacyDataJSON, []);
  const cloudObs = safeJsonParse(cloudItem?.EfficacyDataJSON, []);

  const handleChooseLocal = () => {
    onResolve(localItem);
  };

  const handleChooseCloud = () => {
    onResolve(cloudItem);
  };

  const handleMerge = () => {
    // Merge: union observations by DAA/Date, keep the local non-observation attributes (or merge them)
    const mergedObs = [...localObs];
    cloudObs.forEach(c => {
      const match = mergedObs.find(l => l.daa === c.daa || l.date === c.date);
      if (!match) {
        mergedObs.push(c);
      }
    });
    const mergedItem = {
      ...cloudItem,
      ...localItem,
      EfficacyDataJSON: JSON.stringify(mergedObs),
      IsLive: localItem.IsLive !== undefined ? localItem.IsLive : cloudItem.IsLive
    };
    onResolve(mergedItem);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Sync Conflict Detected" maxWidth="max-w-3xl">
      <div className="space-y-6">
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-800">
          <ShieldAlert className="w-8 h-8 text-amber-600 shrink-0" />
          <div>
            <h3 className="font-bold text-sm">Offline vs. Cloud Data Conflict</h3>
            <p className="text-xs mt-0.5">
              The record below has been modified both locally (while offline) and on the cloud database. Select which version to keep, or perform an automatic merge.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Local Version Card */}
          <div className="border border-slate-200 rounded-xl p-5 bg-white relative hover:shadow-md transition flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-emerald-600 font-bold mb-3 text-sm">
                <Laptop className="w-4 h-4" /> Local Version (Your Device)
              </div>
              <div className="space-y-2 text-xs text-slate-600">
                <div><span className="font-semibold text-slate-400 block">Name:</span> <span className="font-medium">{localItem?.FormulationName || 'N/A'}</span></div>
                <div><span className="font-semibold text-slate-400 block">Dosage:</span> <span className="font-medium">{localItem?.Dosage || 'N/A'}</span></div>
                <div><span className="font-semibold text-slate-400 block">Location:</span> <span className="font-medium">{localItem?.Location || 'N/A'}</span></div>
                <div><span className="font-semibold text-slate-400 block">Assessments:</span> <span className="font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-bold">{localObs.length} observations</span></div>
                {localItem?.Date && <div><span className="font-semibold text-slate-400 block">Date:</span> <span className="font-medium">{new Date(localItem.Date).toLocaleDateString()}</span></div>}
              </div>
            </div>

            <button
              onClick={handleChooseLocal}
              className="mt-6 w-full flex items-center justify-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-sm"
            >
              <Check className="w-4 h-4" /> Keep Local Version
            </button>
          </div>

          {/* Cloud Version Card */}
          <div className="border border-slate-200 rounded-xl p-5 bg-white relative hover:shadow-md transition flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-indigo-600 font-bold mb-3 text-sm">
                <CloudDownload className="w-4 h-4" /> Cloud Version (Database)
              </div>
              <div className="space-y-2 text-xs text-slate-600">
                <div><span className="font-semibold text-slate-400 block">Name:</span> <span className="font-medium">{cloudItem?.FormulationName || 'N/A'}</span></div>
                <div><span className="font-semibold text-slate-400 block">Dosage:</span> <span className="font-medium">{cloudItem?.Dosage || 'N/A'}</span></div>
                <div><span className="font-semibold text-slate-400 block">Location:</span> <span className="font-medium">{cloudItem?.Location || 'N/A'}</span></div>
                <div><span className="font-semibold text-slate-400 block">Assessments:</span> <span className="font-medium text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded font-bold">{cloudObs.length} observations</span></div>
                {cloudItem?.Date && <div><span className="font-semibold text-slate-400 block">Date:</span> <span className="font-medium">{new Date(cloudItem.Date).toLocaleDateString()}</span></div>}
              </div>
            </div>

            <button
              onClick={handleChooseCloud}
              className="mt-6 w-full flex items-center justify-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-sm"
            >
              <Check className="w-4 h-4" /> Keep Cloud Version
            </button>
          </div>
        </div>

        {/* Merge Row */}
        <div className="border-t pt-4 flex justify-center">
          <button
            onClick={handleMerge}
            className="flex items-center gap-2 px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition shadow-md"
          >
            <ArrowLeftRight className="w-4 h-4 text-amber-400" /> Auto-Merge Observation Series
          </button>
        </div>
      </div>
    </Modal>
  );
}
