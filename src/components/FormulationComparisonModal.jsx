import React, { useState, useMemo, useCallback } from 'react';
import { X, Sparkles, Trophy, Check, ArrowRight, Printer, AlertTriangle, Layers, Target, Scale, DollarSign, Activity, FileDown, Loader2 } from 'lucide-react';
import { safeJsonParse } from '../utils/helpers.js';
import { sanitizeAiContent } from '../utils/sanitize.js';
import { calculateFormulationCost } from '../utils/costUtils.js';
import { getCategoryConfig } from '../utils/categoryConfig.js';
import { _callGeminiApiWithRetries } from '../services/ai.js';
import { DEFAULT_GEMINI_MODEL } from '../utils/aiConstants.js';
import { exportFormulationDossier } from '../services/formulationDossier.js';
import { useAppState } from '../hooks/useAppState.jsx';

import { getFormulationTrialStats } from '../utils/formulationTrialUtils.js';

export default function FormulationComparisonModal({
  isOpen,
  onClose,
  formulations = [],
  allTrials = [],
  allProjects = [],
  ingredientsList = [],
  activeCategory = 'herbicide',
  onLaunchTrial,
  onAiOptimize
}) {
  const { getAppState } = useAppState();
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [isAiLoading, setIsAiLoading] = useState(false);

  const config = getCategoryConfig(activeCategory);

  // Compute stats for each compared formulation
  const comparedData = useMemo(() => {
    return formulations.map(f => {
      const stats = getFormulationTrialStats(f, allTrials, allProjects, activeCategory);
      const parsedIngs = safeJsonParse(f.IngredientsJSON, []);
      const realCost = calculateFormulationCost(parsedIngs, ingredientsList);
      const cost = realCost > 0 ? realCost : parseFloat(f.EstimatedCost || 0);

      return {
        ...f,
        ingredients: parsedIngs,
        cost,
        linkedTrials: stats.linkedTrials,
        totalTrials: stats.total,
        microplotCount: stats.microplotCount,
        fieldCount: stats.fieldCount,
        winRate: stats.winRate,
        avgEff: stats.avgEfficacy,
        peakEff: stats.peakEfficacy,
        avgCtrlDays: stats.avgCtrlDays,
        targetMap: stats.targetMap
      };
    });
  }, [formulations, allTrials, allProjects, ingredientsList, activeCategory]);

  // Extract all unique ingredient names across compared formulations
  const allUniqueIngNames = useMemo(() => {
    const names = new Set();
    comparedData.forEach(f => {
      f.ingredients.forEach(i => {
        if (i.name) names.add(i.name.trim());
      });
    });
    return Array.from(names);
  }, [comparedData]);

  // Extract all unique targets tested across compared formulations
  const allUniqueTargets = useMemo(() => {
    const targets = new Set();
    comparedData.forEach(f => {
      Object.keys(f.targetMap).forEach(t => targets.add(t));
    });
    return Array.from(targets);
  }, [comparedData]);

  // Call Gemini for Head-to-Head AI Mode-of-Action analysis
  const handleRunAiComparison = useCallback(async () => {
    if (comparedData.length < 2 || isAiLoading) return;
    setIsAiLoading(true);
    setAiAnalysis(null);

    try {
      const summaryText = comparedData.map((f, i) => {
        const ingList = f.ingredients.map(ing => `${ing.name} (${ing.quantity}${ing.unit})`).join(', ');
        return `FORMULATION ${i + 1}: "${f.Name}" (Code: ${f.Code || 'N/A'})
- Ingredients: ${ingList || 'None specified'}
- Cost: ₹${f.cost.toFixed(2)}/L
- Total Trials: ${f.totalTrials} (${f.microplotCount} Microplot, ${f.fieldCount} Large Field)
- Win Rate: ${f.winRate}%
- Avg Efficacy: ${f.avgEff !== null ? f.avgEff + '%' : 'N/A'}, Peak: ${f.peakEff !== null ? f.peakEff + '%' : 'N/A'}
- Avg Finalized Control Days: ${f.avgCtrlDays !== null ? f.avgCtrlDays + 'd' : 'N/A'}
- Targets Tested: ${Object.keys(f.targetMap).join(', ') || 'None'}`;
      }).join('\n\n');

      const prompt = `You are a Senior ${config.name} Formulation Scientist and Agrochemical Specialist.
Compare the following ${comparedData.length} ${config.name.toUpperCase()} formulations head-to-head using our trial database findings:

${summaryText}

Please provide an in-depth scientific evaluation covering:
1. **Mode of Action (MoA) & Chemistry Comparison**: Compare the active ingredients, speed of activity (contact vs systemic), and synergy between components.
2. **Performance & Field Efficacy Benchmark**: Which formula wins on efficacy, control longevity, and reliability across trials? Cite the win rates and data.
3. **Economics & Cost-Efficacy**: Compare cost per liter vs performance. Which offers the best economic return for farmers?
4. **Field Positioning & Strategy**: Which field conditions, weed/disease/pest pressures, or crop stages should each formula be deployed in?
5. **Formulation Synergy / Optimization Recommendation**: What single improvement or tank-mix tweak would make the best formula even stronger?`;

      const geminiCall = async (genAI) => {
        const modelName = DEFAULT_GEMINI_MODEL;
        const response = await genAI.models.generateContent({
          model: modelName,
          contents: [{ parts: [{ text: prompt }] }]
        });
        return response?.candidates?.[0]?.content?.parts?.[0]?.text
          || (typeof response?.text === 'function' ? response.text() : response?.text)
          || '';
      };

      const result = await _callGeminiApiWithRetries(geminiCall, getAppState);
      setAiAnalysis(result);
    } catch (err) {
      setAiAnalysis(`⚠️ Comparison analysis unavailable: ${err.message}`);
    } finally {
      setIsAiLoading(false);
    }
  }, [comparedData, isAiLoading, config.name, getAppState]);

  if (!isOpen || formulations.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/70 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl my-auto flex flex-col max-h-[92vh] overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-400">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold">
                Head-to-Head Formulation Benchmark
              </h2>
              <p className="text-xs text-slate-400">
                Comparing {comparedData.length} {config.name.toLowerCase()} formulations across recipe, agronomic metrics, and field performance
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-slate-50/50">
          
          {/* Top Comparison KPI Cards */}
          <div className={`grid grid-cols-1 md:grid-cols-${Math.min(comparedData.length, 4)} gap-4`}>
            {comparedData.map((f, i) => (
              <div key={f.ID || i} className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs relative flex flex-col justify-between">
                {/* Winner Badge candidate */}
                {f.winRate >= 75 && f.totalTrials >= 2 && (
                  <div className="absolute -top-2.5 right-4 bg-emerald-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-xs flex items-center gap-1">
                    <Trophy className="w-3 h-3" /> High Win Rate
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-[11px] font-bold px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md">
                      {f.Code || 'Formula ' + (i + 1)}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {f.totalTrials} Trials ({f.microplotCount} Std / {f.fieldCount} Field)
                    </span>
                  </div>
                  <h3 className="font-bold text-slate-800 text-base leading-snug">{f.Name}</h3>
                  <div className="text-xs font-semibold text-emerald-600 mt-1">
                    ₹{f.cost.toFixed(2)} <span className="text-slate-400 text-[10px] font-normal">/ L recipe cost</span>
                  </div>

                  {/* Metrics Grid */}
                  <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-slate-100 text-center">
                    <div className="p-1.5 bg-slate-50 rounded-lg">
                      <div className="text-[10px] uppercase font-bold text-slate-400">Win Rate</div>
                      <div className="text-sm font-extrabold text-slate-800">{f.winRate}%</div>
                    </div>
                    <div className="p-1.5 bg-slate-50 rounded-lg">
                      <div className="text-[10px] uppercase font-bold text-slate-400">Avg Efficacy</div>
                      <div className="text-sm font-extrabold text-slate-800">{f.avgEff !== null ? f.avgEff + '%' : '—'}</div>
                    </div>
                    <div className="p-1.5 bg-slate-50 rounded-lg">
                      <div className="text-[10px] uppercase font-bold text-slate-400">Ctrl Days</div>
                      <div className="text-sm font-extrabold text-slate-800">{f.avgCtrlDays !== null ? f.avgCtrlDays + 'd' : '—'}</div>
                    </div>
                  </div>
                </div>

                {/* Card Action Buttons */}
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-2">
                  <button
                    onClick={() => onLaunchTrial && onLaunchTrial(f)}
                    className="flex-1 py-1.5 px-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 shadow-2xs"
                  >
                    🚀 Launch Trial
                  </button>
                  <button
                    onClick={() => exportFormulationDossier(f, allTrials, ingredientsList, activeCategory)}
                    title="Export Agronomic Dossier"
                    className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs transition"
                  >
                    <FileDown className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* AI Mode of Action & Synergy Evaluation Section */}
          <div className="bg-gradient-to-br from-indigo-900 via-slate-900 to-indigo-950 rounded-2xl p-5 text-white shadow-md border border-indigo-500/20">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-white">AI Mode-of-Action & Agronomic Synergy Evaluator</h4>
                  <p className="text-xs text-indigo-200/70">Powered by Gemini 3 trial database synthesis</p>
                </div>
              </div>
              <button
                onClick={handleRunAiComparison}
                disabled={isAiLoading}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-sm shrink-0 self-start sm:self-auto"
              >
                {isAiLoading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Analyzing Chemistry...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-amber-300" /> Run AI Comparison
                  </>
                )}
              </button>
            </div>

            {aiAnalysis ? (
              <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/10 text-xs leading-relaxed text-indigo-50 whitespace-pre-wrap max-h-72 overflow-y-auto custom-scrollbar"
                dangerouslySetInnerHTML={{ __html: sanitizeAiContent(aiAnalysis) }}
              />
            ) : !isAiLoading && (
              <div className="text-xs text-indigo-200/60 bg-black/20 rounded-xl p-3 text-center border border-white/5">
                Click <strong>"Run AI Comparison"</strong> to generate a chemistry mode-of-action comparison, resistance risk evaluation, and field deployment recommendations.
              </div>
            )}
          </div>

          {/* Recipe Component Breakdown Table */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
            <h4 className="font-bold text-sm text-slate-800 mb-3 flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-600" />
              Side-by-Side Recipe & Ingredient Matrix
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                    <th className="py-2.5 px-3">Active Ingredient / Component</th>
                    {comparedData.map((f, i) => (
                      <th key={f.ID || i} className="py-2.5 px-3 text-center">
                        {f.Name} <span className="text-slate-400 font-normal">({f.Code || 'F' + (i + 1)})</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {allUniqueIngNames.length > 0 ? (
                    allUniqueIngNames.map((ingName, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/60 transition">
                        <td className="py-2.5 px-3 font-semibold text-slate-700">{ingName}</td>
                        {comparedData.map((f, i) => {
                          const match = f.ingredients.find(item => item.name?.toLowerCase().trim() === ingName.toLowerCase().trim());
                          return (
                            <td key={f.ID || i} className="py-2.5 px-3 text-center font-mono">
                              {match ? (
                                <span className="px-2 py-0.5 bg-emerald-50 text-emerald-800 font-bold rounded-md border border-emerald-200/60">
                                  {match.quantity ?? match.qty} {match.unit || 'ml'}
                                </span>
                              ) : (
                                <span className="text-slate-300 font-normal">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={comparedData.length + 1} className="py-4 text-center text-slate-400">
                        No recipe ingredients specified for these formulations.
                      </td>
                    </tr>
                  )}
                  <tr className="bg-slate-50/80 font-bold border-t border-slate-200">
                    <td className="py-2.5 px-3 text-slate-700">Estimated Cost / Liter (₹)</td>
                    {comparedData.map((f, i) => (
                      <td key={f.ID || i} className="py-2.5 px-3 text-center text-emerald-700 font-bold text-sm">
                        ₹{f.cost.toFixed(2)}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Target Spectrum Efficacy Matrix */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
            <h4 className="font-bold text-sm text-slate-800 mb-3 flex items-center gap-2">
              <Target className="w-4 h-4 text-rose-500" />
              Target Spectrum Efficacy Comparison
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                    <th className="py-2.5 px-3">Target Species / Condition</th>
                    {comparedData.map((f, i) => (
                      <th key={f.ID || i} className="py-2.5 px-3 text-center">
                        {f.Name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {allUniqueTargets.length > 0 ? (
                    allUniqueTargets.map((tgt, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/60 transition">
                        <td className="py-2.5 px-3 font-semibold text-slate-700">{tgt}</td>
                        {comparedData.map((f, i) => {
                          const tData = f.targetMap[tgt];
                          if (!tData) {
                            return <td key={f.ID || i} className="py-2.5 px-3 text-center text-slate-300">—</td>;
                          }
                          const avg = tData.validCount > 0 ? Math.round(tData.sumEff / tData.validCount) : null;
                          return (
                            <td key={f.ID || i} className="py-2.5 px-3 text-center">
                              {avg !== null ? (
                                <span className={`px-2 py-0.5 rounded-md font-bold text-xs ${
                                  avg >= 85 ? 'bg-emerald-100 text-emerald-800' :
                                  avg >= 70 ? 'bg-blue-100 text-blue-800' :
                                  avg >= 50 ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'
                                }`}>
                                  {avg}% ({tData.count}t)
                                </span>
                              ) : (
                                <span className="text-slate-400">{tData.count} trials</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={comparedData.length + 1} className="py-4 text-center text-slate-400">
                        No targets recorded in linked trials for these formulations.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-100 bg-white flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-400">
            Select or unselect formulations in the Formulations Hub to change comparison set.
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition"
          >
            Close Benchmark
          </button>
        </div>

      </div>
    </div>
  );
}
