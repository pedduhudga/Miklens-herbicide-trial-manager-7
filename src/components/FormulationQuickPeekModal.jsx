import React, { useMemo } from 'react';
import { X, FlaskConical, ExternalLink, Filter, Layers, DollarSign, Trophy, ArrowRight } from 'lucide-react';
import { safeJsonParse } from '../utils/helpers.js';
import { calculateFormulationCost } from '../utils/costUtils.js';
import { getCategoryConfig } from '../utils/categoryConfig.js';
import { useNavigate } from 'react-router-dom';

export default function FormulationQuickPeekModal({
  isOpen,
  onClose,
  formulation,
  allTrials = [],
  ingredientsList = [],
  activeCategory = 'herbicide',
  onApplyTrialFilter
}) {
  const navigate = useNavigate();
  const config = getCategoryConfig(activeCategory);

  const stats = useMemo(() => {
    if (!formulation) return { totalTrials: 0, winRate: 0, avgEff: null, cost: 0, ings: [] };

    const fId = String(formulation.ID || '').toLowerCase();
    const fName = String(formulation.Name || '').toLowerCase();
    const fCode = String(formulation.Code || '').toLowerCase();

    const linked = (allTrials || []).filter(t => {
      const tf = String(t.FormulationID || t.FormulationName || '').trim().toLowerCase();
      return tf && (tf === fId || tf === fName || tf === fCode);
    });

    const winCount = linked.filter(t => {
      const r = (t.Result || '').toLowerCase();
      return r === 'excellent' || r === 'good';
    }).length;
    const winRate = linked.length > 0 ? Math.round((winCount / linked.length) * 100) : 0;

    const effs = linked
      .map(t => Number(t.FinalEfficacy ?? t.Efficacy ?? t.AverageEfficacy))
      .filter(v => !isNaN(v) && v > 0);
    const avgEff = effs.length > 0 ? Math.round(effs.reduce((a, b) => a + b, 0) / effs.length) : null;

    const ings = safeJsonParse(formulation.IngredientsJSON, []);
    const cost = calculateFormulationCost(ings, ingredientsList);

    return {
      totalTrials: linked.length,
      winRate,
      avgEff,
      cost,
      ings
    };
  }, [formulation, allTrials, ingredientsList]);

  if (!isOpen || !formulation) return null;

  const handleGoToFormulations = () => {
    onClose();
    navigate('/formulations');
  };

  const handleFilterTrials = () => {
    onClose();
    if (onApplyTrialFilter) {
      onApplyTrialFilter(formulation.Name || formulation.Code || formulation.ID);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md my-auto flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <FlaskConical className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-sm">{formulation.Name}</h3>
              <p className="text-[11px] font-mono text-slate-500">{formulation.Code || 'Formula'}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 text-xs">
          
          {/* Quick KPIs */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2 bg-slate-50 rounded-xl border border-slate-100">
              <div className="text-[10px] uppercase font-bold text-slate-400">Win Rate</div>
              <div className="text-sm font-extrabold text-slate-800">{stats.winRate}%</div>
            </div>
            <div className="p-2 bg-slate-50 rounded-xl border border-slate-100">
              <div className="text-[10px] uppercase font-bold text-slate-400">Mean Efficacy</div>
              <div className="text-sm font-extrabold text-slate-800">{stats.avgEff !== null ? stats.avgEff + '%' : '—'}</div>
            </div>
            <div className="p-2 bg-slate-50 rounded-xl border border-slate-100">
              <div className="text-[10px] uppercase font-bold text-slate-400">Recipe Cost</div>
              <div className="text-sm font-extrabold text-emerald-700">₹{stats.cost.toFixed(2)}</div>
            </div>
          </div>

          {/* Recipe Ingredients */}
          <div>
            <div className="font-bold text-slate-700 mb-2 flex items-center justify-between">
              <span>Recipe Active Ingredients</span>
              <span className="text-[10px] text-slate-400">{stats.ings.length} items</span>
            </div>
            <div className="bg-slate-50 rounded-xl border border-slate-100 divide-y divide-slate-100 overflow-hidden">
              {stats.ings.length > 0 ? (
                stats.ings.map((ing, i) => (
                  <div key={i} className="px-3 py-2 flex justify-between items-center text-xs">
                    <span className="font-medium text-slate-700">{ing.name}</span>
                    <span className="font-mono font-bold text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200/60">
                      {ing.quantity ?? ing.qty} {ing.unit || 'ml'}
                    </span>
                  </div>
                ))
              ) : (
                <div className="p-3 text-center text-slate-400">No ingredients specified</div>
              )}
            </div>
          </div>

          {formulation.Notes && (
            <div className="p-3 bg-emerald-50/50 border border-emerald-100 rounded-xl text-slate-600 text-[11px] leading-relaxed">
              <span className="font-bold text-emerald-900">Notes: </span>
              {formulation.Notes}
            </div>
          )}

          {/* Direct CTA Buttons */}
          <div className="space-y-2 pt-2">
            <button
              type="button"
              onClick={handleFilterTrials}
              className="w-full py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition flex items-center justify-center gap-2"
            >
              <Filter className="w-3.5 h-3.5" />
              Filter Trials by this Formulation ({stats.totalTrials})
            </button>
            <button
              type="button"
              onClick={handleGoToFormulations}
              className="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold transition flex items-center justify-center gap-2 shadow-xs"
            >
              <span>View in Formulations Hub</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

        </div>

      </div>
    </div>
  );
}
