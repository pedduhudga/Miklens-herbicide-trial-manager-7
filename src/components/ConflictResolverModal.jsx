import React, { useState, useEffect } from 'react';
import Modal from './Modal.jsx';
import { ShieldAlert, ArrowLeftRight, Check, CloudDownload, Laptop, Sliders, CheckCircle2, SplitSquareVertical } from 'lucide-react';
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

  // Union observations for auto-merge
  const getMergedObs = () => {
    const merged = [...localObs];
    cloudObs.forEach(c => {
      const match = merged.find(l => (l.daa !== undefined && l.daa === c.daa) || (l.date && l.date === c.date));
      if (!match) {
        merged.push(c);
      }
    });
    // Sort by DAA or date
    return merged.sort((a, b) => (Number(a.daa) || 0) - (Number(b.daa) || 0));
  };

  const [mode, setMode] = useState('fieldByField'); // 'quick' | 'fieldByField'
  
  // Field-by-field selections: mapping each field to 'local' or 'cloud' or 'merge'
  const [fieldPicks, setFieldPicks] = useState({
    FormulationName: 'local',
    Dosage: 'local',
    Location: 'local',
    Block: 'local',
    TargetWeed: 'local',
    Crop: 'local',
    Date: 'local',
    IsLive: 'local',
    Notes: 'local',
    observations: 'merge' // 'local' | 'cloud' | 'merge'
  });

  // Fields to inspect
  const FIELDS_META = [
    { key: 'FormulationName', label: 'Formulation / Product' },
    { key: 'Dosage', label: 'Dosage' },
    { key: 'Location', label: 'Location' },
    { key: 'Block', label: 'Field Block' },
    { key: 'TargetWeed', label: 'Target Weed / Bio-target' },
    { key: 'Crop', label: 'Crop' },
    { key: 'Date', label: 'Trial Date', isDate: true },
    { key: 'IsLive', label: 'Active Status (IsLive)', isBoolean: true },
    { key: 'Notes', label: 'Notes' }
  ];

  const handlePickField = (field, source) => {
    setFieldPicks(prev => ({ ...prev, [field]: source }));
  };

  const handleChooseLocalAll = () => {
    onResolve(localItem);
  };

  const handleChooseCloudAll = () => {
    onResolve(cloudItem);
  };

  const handleQuickAutoMerge = () => {
    const mergedObs = getMergedObs();
    const mergedItem = {
      ...cloudItem,
      ...localItem,
      EfficacyDataJSON: JSON.stringify(mergedObs),
      IsLive: localItem.IsLive !== undefined ? localItem.IsLive : cloudItem.IsLive
    };
    onResolve(mergedItem);
  };

  const handleApplyCustomResolution = () => {
    const mergedItem = { ...cloudItem, ...localItem };

    // Apply specific field choices
    FIELDS_META.forEach(({ key }) => {
      const choice = fieldPicks[key];
      if (choice === 'cloud') {
        mergedItem[key] = cloudItem?.[key];
      } else {
        mergedItem[key] = localItem?.[key];
      }
    });

    // Apply observation series choice
    if (fieldPicks.observations === 'local') {
      mergedItem.EfficacyDataJSON = JSON.stringify(localObs);
    } else if (fieldPicks.observations === 'cloud') {
      mergedItem.EfficacyDataJSON = JSON.stringify(cloudObs);
    } else {
      mergedItem.EfficacyDataJSON = JSON.stringify(getMergedObs());
    }

    onResolve(mergedItem);
  };

  const formatVal = (val, meta) => {
    if (val === undefined || val === null || val === '') return <span className="text-slate-400 italic">None</span>;
    if (meta.isDate) return new Date(val).toLocaleDateString();
    if (meta.isBoolean) return val ? 'Active / Live' : 'Completed / Inactive';
    return String(val);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Smart Sync Conflict Resolver" maxWidth="max-w-4xl">
      <div className="space-y-5">
        {/* Banner */}
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-900">
          <ShieldAlert className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm">Concurrent Edits Detected (Local vs Cloud)</h3>
              <div className="flex items-center bg-white border border-amber-300 rounded-lg p-0.5 text-xs font-semibold">
                <button
                  onClick={() => setMode('fieldByField')}
                  className={`px-3 py-1 rounded-md transition ${mode === 'fieldByField' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  <Sliders className="w-3.5 h-3.5 inline mr-1" /> Field-by-Field (8.1)
                </button>
                <button
                  onClick={() => setMode('quick')}
                  className={`px-3 py-1 rounded-md transition ${mode === 'quick' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  Quick Action
                </button>
              </div>
            </div>
            <p className="text-xs text-amber-800 mt-1">
              {mode === 'fieldByField' 
                ? 'Review differences below and choose individual attributes from either Local or Cloud, or union the observation logs.' 
                : 'Select entire record to overwrite or perform an automated union merge.'}
            </p>
          </div>
        </div>

        {mode === 'quick' ? (
          /* Quick 2-Card Layout */
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Local Card */}
              <div className="border border-emerald-200 bg-emerald-50/20 rounded-xl p-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 text-emerald-700 font-bold mb-3 text-sm">
                    <Laptop className="w-4 h-4" /> Local Version (Your Device)
                  </div>
                  <div className="space-y-2 text-xs text-slate-700">
                    <div><span className="font-semibold text-slate-400 block">Formulation:</span> <span className="font-medium">{localItem?.FormulationName || 'N/A'}</span></div>
                    <div><span className="font-semibold text-slate-400 block">Dosage:</span> <span className="font-medium">{localItem?.Dosage || 'N/A'}</span></div>
                    <div><span className="font-semibold text-slate-400 block">Location:</span> <span className="font-medium">{localItem?.Location || 'N/A'}</span></div>
                    <div><span className="font-semibold text-slate-400 block">Observations:</span> <span className="font-medium text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded font-bold">{localObs.length} entries</span></div>
                  </div>
                </div>
                <button
                  onClick={handleChooseLocalAll}
                  className="mt-6 w-full flex items-center justify-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-sm"
                >
                  <Check className="w-4 h-4" /> Keep Local Version
                </button>
              </div>

              {/* Cloud Card */}
              <div className="border border-indigo-200 bg-indigo-50/20 rounded-xl p-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 text-indigo-700 font-bold mb-3 text-sm">
                    <CloudDownload className="w-4 h-4" /> Cloud Version (Database)
                  </div>
                  <div className="space-y-2 text-xs text-slate-700">
                    <div><span className="font-semibold text-slate-400 block">Formulation:</span> <span className="font-medium">{cloudItem?.FormulationName || 'N/A'}</span></div>
                    <div><span className="font-semibold text-slate-400 block">Dosage:</span> <span className="font-medium">{cloudItem?.Dosage || 'N/A'}</span></div>
                    <div><span className="font-semibold text-slate-400 block">Location:</span> <span className="font-medium">{cloudItem?.Location || 'N/A'}</span></div>
                    <div><span className="font-semibold text-slate-400 block">Observations:</span> <span className="font-medium text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded font-bold">{cloudObs.length} entries</span></div>
                  </div>
                </div>
                <button
                  onClick={handleChooseCloudAll}
                  className="mt-6 w-full flex items-center justify-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-sm"
                >
                  <Check className="w-4 h-4" /> Keep Cloud Version
                </button>
              </div>
            </div>

            <div className="flex justify-center pt-2">
              <button
                onClick={handleQuickAutoMerge}
                className="flex items-center gap-2 px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition shadow-md"
              >
                <ArrowLeftRight className="w-4 h-4 text-amber-400" /> Auto-Merge Observation Series
              </button>
            </div>
          </div>
        ) : (
          /* Field-by-Field Granular Picker (8.1) */
          <div className="space-y-4">
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <div className="grid grid-cols-12 bg-slate-100 px-4 py-2.5 text-xs font-bold text-slate-700 border-b border-slate-200">
                <div className="col-span-3">Field</div>
                <div className="col-span-4 flex items-center gap-1 text-emerald-700"><Laptop className="w-3.5 h-3.5" /> Local Value</div>
                <div className="col-span-3 flex items-center gap-1 text-indigo-700"><CloudDownload className="w-3.5 h-3.5" /> Cloud Value</div>
                <div className="col-span-2 text-right">Pick To Keep</div>
              </div>

              <div className="divide-y divide-slate-100 max-h-[380px] overflow-y-auto">
                {FIELDS_META.map(meta => {
                  const localVal = localItem?.[meta.key];
                  const cloudVal = cloudItem?.[meta.key];
                  const isDiff = String(localVal ?? '') !== String(cloudVal ?? '');
                  const pick = fieldPicks[meta.key];

                  return (
                    <div key={meta.key} className={`grid grid-cols-12 px-4 py-2.5 text-xs items-center transition ${isDiff ? 'bg-amber-50/40' : 'hover:bg-slate-50'}`}>
                      <div className="col-span-3 font-semibold text-slate-700 flex items-center gap-1.5">
                        {meta.label}
                        {isDiff && <span className="px-1.5 py-0.2 bg-amber-200 text-amber-800 rounded text-[10px] font-bold">Diff</span>}
                      </div>
                      <div className="col-span-4 text-slate-600 truncate pr-2" title={String(localVal ?? '')}>
                        {formatVal(localVal, meta)}
                      </div>
                      <div className="col-span-3 text-slate-600 truncate pr-2" title={String(cloudVal ?? '')}>
                        {formatVal(cloudVal, meta)}
                      </div>
                      <div className="col-span-2 flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => handlePickField(meta.key, 'local')}
                          className={`px-2 py-1 rounded text-[11px] font-bold transition ${pick === 'local' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                          title="Pick local value"
                        >
                          Local
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePickField(meta.key, 'cloud')}
                          className={`px-2 py-1 rounded text-[11px] font-bold transition ${pick === 'cloud' ? 'bg-indigo-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                          title="Pick cloud value"
                        >
                          Cloud
                        </button>
                      </div>
                    </div>
                  );
                })}

                {/* Observations row */}
                <div className="grid grid-cols-12 px-4 py-3 text-xs items-center bg-slate-50/80">
                  <div className="col-span-3 font-semibold text-slate-800">
                    Observation Timeline
                    <div className="text-[10px] text-slate-400 font-normal">Efficacy logs & ratings</div>
                  </div>
                  <div className="col-span-4 text-emerald-700 font-bold">
                    {localObs.length} observations (Local)
                  </div>
                  <div className="col-span-3 text-indigo-700 font-bold">
                    {cloudObs.length} observations (Cloud)
                  </div>
                  <div className="col-span-2 flex justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => handlePickField('observations', 'local')}
                      className={`px-2 py-1 rounded text-[11px] font-bold ${fieldPicks.observations === 'local' ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'}`}
                    >
                      Local
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePickField('observations', 'cloud')}
                      className={`px-2 py-1 rounded text-[11px] font-bold ${fieldPicks.observations === 'cloud' ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-700'}`}
                    >
                      Cloud
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePickField('observations', 'merge')}
                      className={`px-2 py-1 rounded text-[11px] font-bold ${fieldPicks.observations === 'merge' ? 'bg-amber-600 text-white' : 'bg-slate-200 text-slate-700'}`}
                      title="Union observations by DAA/Date"
                    >
                      Union
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="text-xs text-slate-500">
                Union will combine observations from both devices to prevent lost field notes.
              </div>
              <button
                type="button"
                onClick={handleApplyCustomResolution}
                className="flex items-center gap-1.5 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-md"
              >
                <CheckCircle2 className="w-4 h-4" /> Save Custom Resolved Record
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

