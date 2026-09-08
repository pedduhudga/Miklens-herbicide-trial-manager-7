import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  X, Sparkles, ExternalLink, Activity, Award, ShieldCheck, 
  Layers, Compass, Leaf, BarChart2, TrendingUp, Calendar, MapPin, User, ChevronRight, CheckCircle2, FileDown, Rocket
} from 'lucide-react';
import { safeJsonParse } from '../utils/helpers.js';
import { calculateDAA } from '../utils/dateUtils.js';
import { calculateFormulationCost } from '../utils/costUtils.js';
import { getCategoryConfig, getPrimaryObservationField } from '../utils/categoryConfig.js';
import { exportFormulationDossier } from '../services/formulationDossier.js';
import { 
  getFormulationTrialStats, 
  getTrialCalculatedEfficacy, 
  getTrialTargetSpecies 
} from '../utils/formulationTrialUtils.js';

export default function LinkedTrialsModal({ isOpen, onClose, formulation, allTrials = [], allProjects = [], allIngredients = [], activeCategory = 'herbicide' }) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'standard' | 'large'
  const config = getCategoryConfig(activeCategory);
  const primaryField = getPrimaryObservationField(activeCategory);

  // Compute accurate trial performance metrics for this formulation
  const stats = useMemo(() => {
    return getFormulationTrialStats(formulation, allTrials, allProjects, activeCategory);
  }, [formulation, allTrials, allProjects, activeCategory]);

  const linkedTrials = stats.linkedTrials || [];

  // Distinguish between Standard Trials (Microplot) and Large Field Trials
  const { standardTrials, largeScaleTrials } = useMemo(() => {
    const std = [];
    const large = [];

    const projectMap = new Map();
    (allProjects || []).forEach(p => projectMap.set(String(p.ID || p.id), p));

    linkedTrials.forEach(t => {
      const proj = projectMap.get(String(t.ProjectID));
      const isField = (proj && proj.Design === 'LargeScale') || t.Design === 'LargeScale' || t.ProjectDesign === 'LargeScale';
      if (isField) {
        large.push({ ...t, _projectName: proj?.Name || '', _isLargeScale: true });
      } else {
        std.push({ ...t, _projectName: proj?.Name || '', _isLargeScale: false });
      }
    });

    return { standardTrials: std, largeScaleTrials: large };
  }, [linkedTrials, allProjects]);

  const dosageList = useMemo(() => Object.values(stats.dosageMap || {}), [stats.dosageMap]);
  const targetList = useMemo(() => Object.values(stats.targetMap || {}), [stats.targetMap]);

  if (!isOpen || !formulation) return null;

  const ingredientsList = safeJsonParse(formulation.IngredientsJSON, []);
  const realCost = calculateFormulationCost(formulation, allIngredients || []);
  const costDisplay = realCost > 0 ? realCost : parseFloat(formulation.EstimatedCost || 0);

  const displayedTrials = activeTab === 'standard' 
    ? standardTrials 
    : activeTab === 'large' 
      ? largeScaleTrials 
      : [...standardTrials, ...largeScaleTrials];

  const handleOpenStandardTrial = (trialId) => {
    onClose();
    navigate(`/trials?focus=${trialId}`);
  };

  const handleOpenLargeScaleTrial = (projectId, subTrialId) => {
    onClose();
    navigate(`/large-scale-trials?projectId=${projectId}&subTrialId=${subTrialId}`);
  };

  const handleConsultAI = () => {
    onClose();
    const promptText = `Analyze the complete trial performance for formula "${formulation.Name}" in the ${config.name} category. It has ${stats.total} total trials (${standardTrials.length} standard, ${largeScaleTrials.length} large-scale). Its win rate is ${stats.winRate}%, and average efficacy is ${stats.avgEfficacy ?? 'N/A'}%. What are its strengths, failure points, and how can we optimize its dosage or ingredients?`;
    navigate('/ai-assistant', { state: { prefilledPrompt: promptText } });
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-5 overflow-y-auto animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-slate-100 bg-gradient-to-r from-slate-50 via-white to-emerald-50/40 flex justify-between items-start gap-4">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200">
                {activeCategory} Formula
              </span>
              {stats.winRate >= 75 && stats.total >= 3 && (
                <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1">
                  ⭐ Top Performer
                </span>
              )}
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 truncate">{formulation.Name}</h2>
            <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
              <span>Estimated Cost: <strong className="text-emerald-700 font-bold">₹{costDisplay.toFixed(2)}/L</strong></span>
              <span>•</span>
              <span>Ingredients: <strong className="text-slate-700">{ingredientsList.length} Active Items</strong></span>
            </div>
          </div>

          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          {/* KPI Dashboard */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100 text-center">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Total Trials</span>
              <span className="text-2xl font-black text-slate-800 leading-tight block mt-0.5">{stats.total}</span>
              <span className="text-[10px] text-slate-500 font-medium">
                {standardTrials.length} Standard • {largeScaleTrials.length} Field
              </span>
            </div>

            <div className="bg-emerald-50/60 p-3.5 rounded-2xl border border-emerald-100 text-center">
              <span className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider block">Win Rate</span>
              <span className="text-2xl font-black text-emerald-700 leading-tight block mt-0.5">{stats.winRate}%</span>
              <span className="text-[10px] text-emerald-600 font-medium">Rated Good/Excellent</span>
            </div>

            <div className="bg-blue-50/60 p-3.5 rounded-2xl border border-blue-100 text-center">
              <span className="text-[11px] font-bold text-blue-600 uppercase tracking-wider block">Avg Efficacy</span>
              <span className="text-2xl font-black text-blue-700 leading-tight block mt-0.5">
                {stats.avgEfficacy !== null ? `${stats.avgEfficacy}%` : 'N/A'}
              </span>
              <span className="text-[10px] text-blue-600 font-medium">
                Peak: {stats.maxEfficacy !== null ? `${stats.maxEfficacy}%` : 'N/A'}
              </span>
            </div>

            <div className="bg-purple-50/60 p-3.5 rounded-2xl border border-purple-100 text-center">
              <span className="text-[11px] font-bold text-purple-600 uppercase tracking-wider block">Finalized Control</span>
              <span className="text-2xl font-black text-purple-700 leading-tight block mt-0.5">
                {stats.avgCtrlDays !== null ? `${stats.avgCtrlDays}d` : 'N/A'}
              </span>
              <span className="text-[10px] text-purple-600 font-medium">{stats.finalized} finalized studies</span>
            </div>
          </div>

          {/* Quick R&D Action Bar */}
          <div className="flex flex-wrap items-center gap-2 p-3 bg-gradient-to-r from-emerald-50 via-teal-50 to-slate-50 border border-emerald-200/80 rounded-2xl shadow-2xs">
            <span className="text-[11px] font-bold text-emerald-900 flex items-center gap-1 uppercase tracking-wider mr-1">
              <Rocket className="w-3.5 h-3.5 text-emerald-600" /> Actions:
            </span>
            <button
              onClick={() => {
                onClose();
                navigate('/trials', {
                  state: {
                    newTrialWithFormulation: {
                      id: formulation.ID,
                      name: formulation.Name,
                      code: formulation.Code
                    }
                  }
                });
              }}
              className="py-1.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition flex items-center gap-1.5 shadow-xs"
            >
              🌿 Launch Microplot Trial
            </button>
            <button
              onClick={() => {
                onClose();
                navigate(`/large-scale-trials?formulation=${encodeURIComponent(formulation.Name || formulation.Code || formulation.ID)}`);
              }}
              className="py-1.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition flex items-center gap-1.5 shadow-xs"
            >
              🚜 Launch Field Study
            </button>
            <button
              onClick={() => exportFormulationDossier(formulation, allTrials, allIngredients, activeCategory)}
              className="py-1.5 px-3 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold text-xs transition flex items-center gap-1.5 shadow-2xs"
            >
              <FileDown className="w-3.5 h-3.5 text-slate-600" /> Export Dossier
            </button>
            <button
              onClick={handleConsultAI}
              className="py-1.5 px-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold text-xs transition flex items-center gap-1.5 shadow-xs ml-auto"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300" /> AI Optimize
            </button>
          </div>

          {/* Dosage & Target Response Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Dosage Performance */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <BarChart2 className="w-4 h-4 text-emerald-600" /> Dosage Performance
              </h4>
              {dosageList.length > 0 ? (
                <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                  {dosageList.map((d, i) => (
                    <div key={i} className="flex justify-between items-center text-xs p-2 rounded-xl bg-slate-50 border border-slate-100">
                      <span className="font-bold text-slate-800">{d.dosage}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-slate-500">{d.count} trial{d.count > 1 ? 's' : ''}</span>
                        <span className="font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                          {d.avgEff !== null ? `${d.avgEff}% eff` : `${d.winRate}% win`}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">No dosage variance recorded.</p>
              )}
            </div>

            {/* Target Spectrum */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-blue-600" /> Target Spectrum & Control
              </h4>
              {targetList.length > 0 ? (
                <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                  {targetList.map((tg, i) => (
                    <div key={i} className="flex justify-between items-center text-xs p-2 rounded-xl bg-slate-50 border border-slate-100">
                      <span className="font-bold text-slate-800 truncate mr-2">{tg.target}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-slate-500">{tg.count} trial{tg.count > 1 ? 's' : ''}</span>
                        <span className="font-semibold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                          {tg.avgEff !== null ? `${tg.avgEff}% eff` : `${tg.winRate}% win`}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">No target species recorded yet.</p>
              )}
            </div>
          </div>

          {/* Linked Trials Navigation Section */}
          <div className="space-y-3">
            <div className="flex justify-between items-center flex-wrap gap-2">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <Compass className="w-4 h-4 text-indigo-600" /> Linked Field Studies ({displayedTrials.length})
              </h3>

              {/* Sub-Tabs: All vs Standard vs Large Scale */}
              <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-semibold text-slate-600">
                <button
                  onClick={() => setActiveTab('all')}
                  className={`px-3 py-1 rounded-lg transition ${activeTab === 'all' ? 'bg-white shadow text-slate-900 font-bold' : 'hover:text-slate-900'}`}
                >
                  All ({linkedTrials.length})
                </button>
                <button
                  onClick={() => setActiveTab('standard')}
                  className={`px-3 py-1 rounded-lg transition flex items-center gap-1 ${activeTab === 'standard' ? 'bg-white shadow text-emerald-800 font-bold' : 'hover:text-slate-900'}`}
                >
                  <Leaf className="w-3 h-3" /> Standard ({standardTrials.length})
                </button>
                <button
                  onClick={() => setActiveTab('large')}
                  className={`px-3 py-1 rounded-lg transition flex items-center gap-1 ${activeTab === 'large' ? 'bg-white shadow text-indigo-800 font-bold' : 'hover:text-slate-900'}`}
                >
                  <Compass className="w-3 h-3" /> Field Scale ({largeScaleTrials.length})
                </button>
              </div>
            </div>

            {/* Trial Cards List */}
            {displayedTrials.length > 0 ? (
              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                {displayedTrials.map((t) => {
                  const isLarge = t._isLargeScale;
                  const isCompleted = t.IsCompleted === true || t.IsCompleted === 'true';
                  const eff = getTrialCalculatedEfficacy(t, activeCategory);
                  const targetSpecies = getTrialTargetSpecies(t, activeCategory);

                  return (
                    <div 
                      key={t.ID}
                      className="p-3.5 rounded-2xl bg-white border border-slate-200 hover:border-emerald-400 hover:shadow-md transition-all flex flex-col sm:flex-row justify-between sm:items-center gap-3"
                    >
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border ${
                            isLarge 
                              ? 'bg-indigo-50 text-indigo-700 border-indigo-200' 
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          }`}>
                            {isLarge ? '🚜 Large Field' : '🌿 Microplot'}
                          </span>

                          {eff !== null && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                              ⭐ {eff}% Efficacy
                            </span>
                          )}

                          {t.Result && (
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${
                              t.Result === 'Excellent' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                              t.Result === 'Good' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                              t.Result === 'Fair' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                              'bg-slate-100 text-slate-700 border-slate-300'
                            }`}>
                              {t.Result}
                            </span>
                          )}

                          {targetSpecies && targetSpecies !== 'General' && (
                            <span className="text-[10px] text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                              🎯 {targetSpecies}
                            </span>
                          )}

                          {isCompleted && (
                            <span className="text-[10px] text-purple-700 font-bold bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200">
                              Finalized
                            </span>
                          )}
                        </div>

                        <h4 className="text-sm font-bold text-slate-900 truncate">
                          {t.TrialName || `${formulation.Name} @ ${t.Dosage || 'Std Dosage'}`}
                        </h4>

                        <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                          {t.Date && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {t.Date.split('T')[0]}</span>}
                          {t.Location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {t.Location}</span>}
                          {t.InvestigatorName && <span className="flex items-center gap-1"><User className="w-3 h-3" /> {t.InvestigatorName}</span>}
                          {t._projectName && <span className="text-indigo-600 font-semibold">• Project: {t._projectName}</span>}
                        </div>
                      </div>

                      {/* Direct Cross-Tab Navigation CTA */}
                      <div className="shrink-0 flex items-center">
                        {isLarge ? (
                          <button
                            onClick={() => handleOpenLargeScaleTrial(t.ProjectID, t.ID)}
                            className="w-full sm:w-auto px-3.5 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs border border-indigo-200 transition flex items-center justify-center gap-1.5 shadow-sm"
                          >
                            Open in Field Trials 🚜 <ExternalLink className="w-3 h-3" />
                          </button>
                        ) : (
                          <button
                            onClick={() => handleOpenStandardTrial(t.ID)}
                            className="w-full sm:w-auto px-3.5 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-xs border border-emerald-200 transition flex items-center justify-center gap-1.5 shadow-sm"
                          >
                            Open in Trials Tab 🌿 <ExternalLink className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                <p className="text-xs text-slate-500 font-medium">No trials linked to this formulation under the selected tab.</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-slate-100 bg-slate-50 flex flex-col sm:flex-row justify-between items-center gap-3">
          <button
            onClick={handleConsultAI}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-bold text-xs shadow-md transition flex items-center justify-center gap-2"
          >
            <Sparkles className="w-4 h-4 text-violet-200" /> Ask AI to Optimize this Formula
          </button>

          <button
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-white hover:bg-slate-200 text-slate-700 font-bold text-xs border border-slate-200 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
