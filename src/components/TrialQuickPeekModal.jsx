import React, { useState, useMemo } from 'react';
import { 
  X, ExternalLink, Calendar, MapPin, User, CheckCircle2, 
  Activity, ArrowRight, Sparkles, Image as ImageIcon,
  Clock, ShieldAlert, Award, FileText, ChevronRight, Eye
} from 'lucide-react';
import { safeJsonParse } from '../utils/helpers.js';
import { getCategoryConfig } from '../utils/categoryConfig.js';
import { validateEfficacyData } from '../utils/analysisUtils.js';

export default function TrialQuickPeekModal({
  isOpen,
  onClose,
  trial,
  activeCategory = 'herbicide',
  onOpenFullTrial
}) {
  const [activeTab, setActiveTab] = useState('summary'); // 'summary' | 'observations' | 'photos'
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const config = getCategoryConfig(activeCategory);

  const observations = useMemo(() => {
    if (!trial) return [];
    const raw = safeJsonParse(trial.EfficacyDataJSON, []);
    return validateEfficacyData(raw, trial.Category || activeCategory, true);
  }, [trial, activeCategory]);

  const photos = useMemo(() => {
    if (!trial) return [];
    return safeJsonParse(trial.PhotoURLs, []).filter(p => p && !p.deleted && (p.url || p.thumbUrl || typeof p === 'string'));
  }, [trial]);

  const controlDays = useMemo(() => {
    if (!trial) return null;
    const days = trial.FinalControlDuration ?? trial.ControlDuration ?? trial.ControlDays;
    if (days !== undefined && days !== null && days !== '') {
      return `${days}d${trial.ControlFinalized || trial.IsCompleted ? ' (finalized)' : ''}`;
    }
    return null;
  }, [trial]);

  const finalEfficacy = useMemo(() => {
    if (!trial) return null;
    if (trial.FinalEfficacy !== undefined && trial.FinalEfficacy !== null && !isNaN(Number(trial.FinalEfficacy))) {
      return Number(trial.FinalEfficacy);
    }
    if (observations.length > 0) {
      const last = observations[observations.length - 1];
      const eff = last.controlPct ?? last.wce ?? last.efficacy;
      if (eff !== undefined && !isNaN(Number(eff))) return Number(eff);
    }
    return null;
  }, [trial, observations]);

  if (!isOpen || !trial) return null;

  const resultColor = 
    trial.Result === 'Excellent' ? 'bg-emerald-100 text-emerald-800 border-emerald-300' :
    trial.Result === 'Good' ? 'bg-teal-100 text-teal-800 border-teal-300' :
    trial.Result === 'Moderate' ? 'bg-amber-100 text-amber-800 border-amber-300' :
    'bg-rose-100 text-rose-800 border-rose-300';

  const isCompleted = trial.IsCompleted || trial.ControlFinalized || trial.Status === 'Completed';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/70 backdrop-blur-xs animate-fade-in">
      <div 
        className="bg-white rounded-2xl shadow-2xl border border-slate-200/90 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 text-white shrink-0 flex items-start justify-between gap-3 border-b border-white/10">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                isCompleted ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
              }`}>
                {isCompleted ? 'Finalized' : 'Active Plot'}
              </span>
              {trial.Result && (
                <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${resultColor}`}>
                  {trial.Result}
                </span>
              )}
              {controlDays && (
                <span className="text-[10px] font-mono font-bold bg-white/10 text-white px-2 py-0.5 rounded-full border border-white/10">
                  ⏳ {controlDays}
                </span>
              )}
            </div>

            <h3 className="font-extrabold text-base sm:text-lg text-white truncate">
              {trial.FormulationName || 'Trial Plot'}
            </h3>
            <p className="text-xs text-slate-300 font-mono mt-0.5 truncate">
              {trial.Dosage ? `Dosage: ${trial.Dosage}` : 'Standard Dosage'}
              {trial.Date ? ` • ${new Date(trial.Date).toLocaleDateString()}` : ''}
              {trial.TrialID ? ` • ID: ${trial.TrialID}` : ''}
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => onOpenFullTrial && onOpenFullTrial(trial.ID || trial.id)}
              className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition shadow-sm active:scale-95 cursor-pointer"
              title="Open full workspace in Trials page"
            >
              <span>Full View</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
              title="Close and return to chat"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Selection */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-4 shrink-0 text-xs font-bold">
          <button
            type="button"
            onClick={() => setActiveTab('summary')}
            className={`py-3 px-3 border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'summary' 
                ? 'border-emerald-600 text-emerald-800' 
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Summary & Target</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('observations')}
            className={`py-3 px-3 border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'observations' 
                ? 'border-emerald-600 text-emerald-800' 
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Observations ({observations.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('photos')}
            className={`py-3 px-3 border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'photos' 
                ? 'border-emerald-600 text-emerald-800' 
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span>Photos ({photos.length})</span>
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 custom-scrollbar text-xs">
          {/* TAB 1: SUMMARY */}
          {activeTab === 'summary' && (
            <div className="space-y-3.5">
              {/* Highlight Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-3 bg-emerald-50/80 rounded-xl border border-emerald-200/80">
                  <span className="text-[10px] font-bold text-emerald-800 uppercase block">Final Control</span>
                  <span className="text-base font-black text-emerald-950 font-mono">
                    {finalEfficacy !== null ? `${finalEfficacy}%` : 'Recorded'}
                  </span>
                </div>
                <div className="p-3 bg-indigo-50/80 rounded-xl border border-indigo-200/80">
                  <span className="text-[10px] font-bold text-indigo-800 uppercase block">Longevity</span>
                  <span className="text-base font-black text-indigo-950 font-mono">
                    {controlDays || 'In Progress'}
                  </span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">Observations</span>
                  <span className="text-base font-black text-slate-800 font-mono">
                    {observations.length} logs
                  </span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">Field Photos</span>
                  <span className="text-base font-black text-slate-800 font-mono">
                    {photos.length} captured
                  </span>
                </div>
              </div>

              {/* Target Weeds / Species */}
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                  Target Weed Species / Target
                </span>
                <p className="font-bold text-slate-800 text-xs leading-relaxed">
                  {trial.WeedSpecies || trial.Target || trial.WeedTarget || trial.TargetSpecs || 'General weed vegetation'}
                </p>
                {trial.Crop && (
                  <p className="text-[11px] text-slate-600">
                    Host / Adjacent Crop: <strong>{trial.Crop}</strong>
                  </p>
                )}
              </div>

              {/* Operational Metadata */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="p-3 bg-white rounded-xl border border-slate-200 flex items-start gap-2.5">
                  <User className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Lead Investigator</span>
                    <span className="font-bold text-slate-800 text-xs">{trial.InvestigatorName || trial.Investigator || 'Pavan (Lead)'}</span>
                  </div>
                </div>

                <div className="p-3 bg-white rounded-xl border border-slate-200 flex items-start gap-2.5">
                  <MapPin className="w-4 h-4 text-sky-600 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Field Coordinates / Location</span>
                    <span className="font-bold text-slate-800 text-xs truncate block">
                      {trial.Location || (trial.Latitude && trial.Longitude ? `${trial.Latitude}, ${trial.Longitude}` : 'Bengaluru Field Station')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Field Observations / Notes */}
              {trial.Notes && (
                <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-200/80 text-amber-950">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 block mb-1">
                    Field Investigator Notes
                  </span>
                  <p className="italic text-xs leading-relaxed">"{trial.Notes}"</p>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: OBSERVATIONS */}
          {activeTab === 'observations' && (
            <div className="space-y-2.5">
              {observations.length === 0 ? (
                <div className="py-8 text-center text-slate-400">
                  <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="font-semibold text-xs">No observation milestones logged yet.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
                  {observations.map((obs, idx) => {
                    const eff = obs.controlPct ?? obs.wce ?? obs.efficacy;
                    const daa = obs.daa !== undefined ? obs.daa : obs.day;
                    return (
                      <div key={idx} className="p-3 hover:bg-slate-50 transition flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-800 font-mono font-black text-xs flex items-center justify-center shrink-0">
                            {daa !== undefined ? `D${daa}` : `#${idx + 1}`}
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-800 text-xs">
                                {obs.date ? new Date(obs.date).toLocaleDateString() : `Observation ${idx + 1}`}
                              </span>
                              {obs.weedCover !== undefined && (
                                <span className="text-[10px] text-slate-500 font-mono">
                                  Weed Cover: {obs.weedCover}%
                                </span>
                              )}
                            </div>
                            {obs.notes && (
                              <p className="text-[11px] text-slate-500 truncate mt-0.5 italic">
                                "{obs.notes}"
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          {eff !== undefined ? (
                            <span className={`font-mono font-black text-sm ${
                              Number(eff) >= 85 ? 'text-emerald-700' : Number(eff) >= 60 ? 'text-teal-700' : 'text-amber-700'
                            }`}>
                              {eff}% Control
                            </span>
                          ) : (
                            <span className="text-slate-400 font-mono text-xs">Recorded</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: PHOTOS */}
          {activeTab === 'photos' && (
            <div className="space-y-3">
              {photos.length === 0 ? (
                <div className="py-8 text-center text-slate-400">
                  <ImageIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="font-semibold text-xs">No field photos uploaded for this plot.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {photos.map((p, idx) => {
                    const imgUrl = typeof p === 'string' ? p : (p.url || p.thumbUrl);
                    return (
                      <div 
                        key={idx} 
                        className="group relative rounded-xl overflow-hidden border border-slate-200 bg-slate-900 aspect-square flex flex-col justify-end shadow-2xs cursor-pointer"
                        onClick={() => setSelectedPhoto(imgUrl)}
                      >
                        <img 
                          src={imgUrl} 
                          alt={`Plot DAA Photo ${idx + 1}`}
                          className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          loading="lazy"
                        />
                        <div className="relative p-2 bg-gradient-to-t from-black/80 via-black/40 to-transparent text-white text-[10px]">
                          <div className="flex items-center justify-between font-mono font-bold">
                            <span>{p.date ? new Date(p.date).toLocaleDateString() : `Photo ${idx + 1}`}</span>
                            {p.daa !== undefined && <span>DAA {p.daa}</span>}
                          </div>
                          {p.weedCover !== undefined && (
                            <div className="text-emerald-300 font-semibold text-[9px]">
                              Weed: {p.weedCover}%
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Photo Zoom Lightbox */}
              {selectedPhoto && (
                <div 
                  className="fixed inset-0 z-60 bg-black/90 p-4 flex items-center justify-center cursor-pointer"
                  onClick={() => setSelectedPhoto(null)}
                >
                  <img 
                    src={selectedPhoto} 
                    alt="Expanded field photo" 
                    className="max-w-full max-h-[85vh] rounded-xl shadow-2xl object-contain"
                  />
                  <button 
                    onClick={() => setSelectedPhoto(null)} 
                    className="absolute top-4 right-4 text-white p-2 rounded-full bg-white/20 hover:bg-white/30"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer Bar */}
        <div className="p-3.5 sm:p-4 bg-slate-50 border-t border-slate-200/80 shrink-0 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 font-bold transition shadow-2xs active:scale-95 cursor-pointer text-xs"
          >
            ⬅ Return to AI Chat
          </button>

          <button
            type="button"
            onClick={() => onOpenFullTrial && onOpenFullTrial(trial.ID || trial.id)}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black transition shadow-md shadow-emerald-600/20 active:scale-95 flex items-center gap-1.5 cursor-pointer text-xs"
          >
            <span>Open Full Workspace in Trials</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
