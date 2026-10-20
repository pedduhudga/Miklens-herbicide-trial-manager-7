import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAppState } from '../hooks/useAppState.jsx';
import { useAuth } from '../hooks/useAuth.js';
import TopBar from '../components/TopBar.jsx';
import Modal from '../components/Modal.jsx';
import { addFormulation, deleteFormulation, updateFormulation, validateCategoryDataOperation, addIngredient } from '../services/dataLayer.js';
import { safeJsonParse } from '../utils/helpers.js';
import { getCategoryConfig } from '../utils/categoryConfig.js';
import { calculateFormulationCost, getFormulationCostDetails, findIngredientInLibrary, parseIngredientCost, convertQuantityToBase } from '../utils/costUtils.js';
import { 
  Plus, X, Share2, Edit, Trash2, Copy, Sparkles, Layers, 
  ArrowUpDown, Scale, FileDown, Rocket, Wand2, MoreVertical, 
  ChevronDown, Check, AlertCircle, LayoutGrid, List, Table,
  Search, SlidersHorizontal, TrendingUp, Clock, Coins, FlaskConical,
  Beaker, Tag, ChevronUp, Info, Eye
} from 'lucide-react';
import AppSharingModal from '../components/AppSharingModal.jsx';
import LinkedTrialsModal from '../components/LinkedTrialsModal.jsx';
import FormulationComparisonModal from '../components/FormulationComparisonModal.jsx';
import AiFormulaGeneratorModal from '../components/AiFormulaGeneratorModal.jsx';
import FormulationQuickPeekModal from '../components/FormulationQuickPeekModal.jsx';
import { exportFormulationDossier } from '../services/formulationDossier.js';
import { 
  getFormulationTrialStats, 
  getEfficacyRatingBadge,
  isFormulationEligibleForTrial 
} from '../utils/formulationTrialUtils.js';
import { analyzeFormulationSynergy } from '../utils/hracSynergy.js';
import { findDuplicateFormulation, detectAllDuplicateFormulations } from '../utils/formulationDuplicateUtils.js';

function FormulationCard({
  form,
  isOwn,
  isShared,
  isSharedEdit,
  isAdmin,
  isViewer,
  CURRENCY_SYMBOL,
  isSelectedForCompare,
  isHighlighted = false,
  onQuickPeek,
  onToggleCompare,
  onViewLinkedTrials,
  onLaunchTrial,
  onAiOptimize,
  onExportDossier,
  onEdit,
  onDuplicate,
  onShare,
  onDelete,
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!isMenuOpen) return;
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMenuOpen]);

  const stats = form._stats;
  const ings = form._parsedIngs || [];
  const visibleIngs = isExpanded ? ings : ings.slice(0, 3);
  const ratingBadge = getEfficacyRatingBadge(stats?.avgEfficacy);
  const synergy = useMemo(() => {
    return analyzeFormulationSynergy(ings, form?.Category || 'herbicide');
  }, [ings, form?.Category]);

  const hasHighEfficacy = stats?.avgEfficacy !== null && stats?.avgEfficacy >= 90;
  const hasGoodEfficacy = stats?.avgEfficacy !== null && stats?.avgEfficacy >= 75 && stats?.avgEfficacy < 90;
  const isDuplicate = form._duplicates && form._duplicates.length > 0;
  const isEligible = isFormulationEligibleForTrial(form);

  // Top accent bar color gradient
  const topAccentClass = hasHighEfficacy
    ? 'from-emerald-500 via-teal-500 to-emerald-400'
    : hasGoodEfficacy
    ? 'from-blue-500 via-indigo-500 to-cyan-400'
    : isDuplicate
    ? 'from-amber-400 via-orange-500 to-amber-500'
    : 'from-slate-200 to-slate-300';

  return (
    <div
      id={`form-card-${form.ID}`}
      className={`bg-white rounded-2xl border transition-all duration-300 flex flex-col justify-between relative overflow-hidden group hover:shadow-xl ${
        isHighlighted
          ? 'ring-4 ring-purple-500/80 border-purple-500 shadow-2xl bg-purple-50/20'
          : isSelectedForCompare
          ? 'border-indigo-500 ring-2 ring-indigo-500/20 shadow-lg bg-indigo-50/15'
          : 'border-slate-200/90 hover:border-emerald-400/80 shadow-xs'
      }`}
    >
      {/* Top Accent Gradient Line */}
      <div className={`h-1 w-full bg-gradient-to-r ${topAccentClass}`} />

      <div className="p-5 flex-1 flex flex-col justify-between">
        <div>
          {/* Header Row: Title, Code, Compare Pill & Actions Dropdown */}
          <div className="flex justify-between items-start gap-2 mb-2.5">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h3
                  onClick={() => onQuickPeek && onQuickPeek(form)}
                  className="font-bold text-base text-slate-900 group-hover:text-emerald-700 transition cursor-pointer truncate max-w-full"
                  title="Click to view detailed recipe dossier & trial analytics"
                >
                  {form.Name}
                </h3>
                {form.Code && (
                  <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded-md border border-slate-200/70 shrink-0">
                    {form.Code}
                  </span>
                )}
              </div>

              {/* Tag Row: Clean, prioritized non-wrapping chips */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {/* Rating Badge */}
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-bold border inline-flex items-center gap-1 shrink-0 ${ratingBadge.colorClass}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${ratingBadge.dotColor}`} />
                  {ratingBadge.label}
                </span>

                {/* Control Days */}
                {stats?.avgCtrlDays !== null && stats?.avgCtrlDays > 0 && (
                  <span
                    className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-50 text-amber-800 border border-amber-200/90 inline-flex items-center gap-0.5 shrink-0"
                    title={`Average sustained control duration: ${stats.avgCtrlDays} days`}
                  >
                    ⏳ {stats.avgCtrlDays}d Control
                  </span>
                )}

                {/* MoA Badge */}
                {(synergy.uniqueGroups?.length > 0 || synergy.uniqueHracGroups?.length > 0) && (
                  <span
                    className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-purple-50 text-purple-700 border border-purple-200/90 inline-flex items-center gap-1 shrink-0 cursor-pointer hover:bg-purple-100 transition"
                    onClick={(e) => { e.stopPropagation(); onQuickPeek && onQuickPeek(form); }}
                    title={synergy.moaSummary}
                  >
                    <Sparkles className="w-2.5 h-2.5 text-purple-600" />
                    {synergy.badgeLabel || ((synergy.uniqueGroups || synergy.uniqueHracGroups).length > 1
                      ? `Multi-MoA`
                      : `${synergy.committee || 'HRAC'} ${(synergy.uniqueGroups || synergy.uniqueHracGroups)[0]}`)}
                  </span>
                )}

                {/* Organic Badge */}
                {synergy.isOrganicBio && (
                  <span
                    className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-50 text-emerald-800 border border-emerald-300 inline-flex items-center gap-0.5 shrink-0"
                    title={`Bio-Rational input: ${synergy.organicStandard || 'OMRI / NPOP Eligible'}`}
                  >
                    🍃 {synergy.allOrganic ? '100% Organic' : 'Bio-Rational'}
                  </span>
                )}

                {/* Target Spectrum */}
                {stats?.targetCount > 1 && (
                  <span
                    className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-teal-50 text-teal-800 border border-teal-200/90 inline-flex items-center gap-0.5 shrink-0"
                    title={`Demonstrated control across ${stats.targetCount} targets`}
                  >
                    {(form.Category || 'herbicide') === 'herbicide' ? `🌿 ${stats.targetCount} Weeds` :
                     (form.Category || 'herbicide') === 'fungicide' ? `🛡️ ${stats.targetCount} Diseases` :
                     (form.Category || 'herbicide') === 'pesticide' ? `🐛 ${stats.targetCount} Pests` :
                     `🌱 ${stats.targetCount} Targets`}
                  </span>
                )}

                {/* Antagonism Risk */}
                {synergy.hasAntagonism && (
                  <span
                    className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-rose-50 text-rose-700 border border-rose-300 inline-flex items-center gap-0.5 shrink-0 animate-pulse"
                    title="Antagonism Risk detected"
                  >
                    ⚠️ Antagonism
                  </span>
                )}
              </div>
            </div>

            {/* Top Right Actions */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => onToggleCompare(form.ID)}
                className={`p-1.5 px-2 rounded-lg text-xs font-semibold flex items-center gap-1 transition ${
                  isSelectedForCompare
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-500 hover:text-indigo-600 hover:bg-indigo-50/70 border border-slate-200/70'
                }`}
                title={isSelectedForCompare ? 'Deselect from comparison' : 'Add to side-by-side comparison'}
              >
                <Scale className="w-3.5 h-3.5" />
                <span className="hidden sm:inline text-[11px]">{isSelectedForCompare ? 'Selected' : 'Compare'}</span>
              </button>

              <div className="relative" ref={menuRef}>
                <button
                  type="button"
                  onClick={() => setIsMenuOpen(!isMenuOpen)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 border border-transparent hover:border-slate-200 transition"
                  title="More actions"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>

                {isMenuOpen && (
                  <div className="absolute right-0 top-8 z-50 bg-white rounded-xl shadow-xl border border-slate-200 py-1 min-w-[200px] text-xs animate-in fade-in zoom-in-95">
                    <button
                      onClick={() => {
                        setIsMenuOpen(false);
                        onAiOptimize(form);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-violet-700 hover:bg-violet-50 font-semibold text-left"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-violet-500" /> AI Recipe Optimization
                    </button>

                    <button
                      onClick={() => {
                        setIsMenuOpen(false);
                        onExportDossier(form);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-slate-700 hover:bg-slate-50 text-left"
                    >
                      <FileDown className="w-3.5 h-3.5 text-slate-500" /> Export Agronomic Dossier
                    </button>

                    {!isViewer && (
                      <>
                        <hr className="my-1 border-slate-100" />

                        {isOwn && (
                          <button
                            onClick={() => {
                              setIsMenuOpen(false);
                              onDuplicate(form);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-slate-700 hover:bg-slate-50 text-left"
                          >
                            <Copy className="w-3.5 h-3.5 text-slate-500" /> Duplicate Recipe
                          </button>
                        )}

                        {(isOwn || isSharedEdit) && (
                          <button
                            onClick={() => {
                              setIsMenuOpen(false);
                              onEdit(form);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-emerald-700 hover:bg-emerald-50 text-left"
                          >
                            <Edit className="w-3.5 h-3.5 text-emerald-600" /> Edit Formula
                          </button>
                        )}

                        {isAdmin && (
                          <button
                            onClick={(e) => {
                              setIsMenuOpen(false);
                              onShare(e, form);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-indigo-700 hover:bg-indigo-50 text-left"
                          >
                            <Share2 className="w-3.5 h-3.5 text-indigo-500" /> Share Permissions
                          </button>
                        )}

                        {isOwn && (
                          <button
                            onClick={() => {
                              setIsMenuOpen(false);
                              onDelete(form.ID);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-rose-600 hover:bg-rose-50 text-left"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-rose-500" /> Delete Formula
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Duplicate Recipe Alert Banner (if duplicate detected) */}
          {isDuplicate && (
            <div
              onClick={() => onQuickPeek && onQuickPeek(form)}
              className="mt-2 mb-2.5 p-2 bg-amber-50/90 border border-amber-200/90 rounded-xl text-amber-900 text-xs flex items-center justify-between gap-1.5 cursor-pointer hover:bg-amber-100/90 transition shadow-2xs"
              title="Click to view duplicate formulation recipe comparison"
            >
              <div className="flex items-center gap-1.5 truncate">
                <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span className="font-semibold truncate">Duplicate Recipe of "{form._duplicates[0].Name}"</span>
              </div>
              <span className="text-[10px] font-bold text-amber-700 underline shrink-0">Inspect</span>
            </div>
          )}

          {/* Ingredients Recipe Section: Clean laboratory list without bulky input boxes */}
          <div className="mt-3 bg-slate-50/70 rounded-xl p-3 border border-slate-100">
            <div className="flex justify-between items-center mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                <Beaker className="w-3 h-3 text-slate-400" />
                Recipe Components ({ings.length})
              </span>
              {ings.length > 3 && (
                <button
                  type="button"
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-0.5 transition"
                >
                  {isExpanded ? 'Show less' : `+${ings.length - 3} more`}
                  <ChevronDown className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                </button>
              )}
            </div>

            <div className="space-y-1.5">
              {visibleIngs.length > 0 ? (
                visibleIngs.map((ing, i) => (
                  <div
                    key={i}
                    className="flex justify-between items-center text-xs py-1 px-2 rounded-lg bg-white/90 border border-slate-100 hover:border-slate-200 transition"
                  >
                    <span className="font-medium text-slate-700 truncate pr-2 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/70 shrink-0" />
                      {ing.name || 'Unnamed Ingredient'}
                    </span>
                    <span className="font-mono text-[11px] font-semibold text-slate-700 shrink-0 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200/60">
                      {ing.quantity} {ing.unit}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-400 italic py-1">No active ingredients recorded</p>
              )}
            </div>

            {/* Dynamic category-specific fields */}
            {(() => {
              const catConfig = getCategoryConfig(form.Category || 'herbicide');
              const fields = catConfig.formulationFields?.map(f => {
                const val = form[f.key];
                if (!val) return null;
                return (
                  <div className="flex justify-between text-xs py-1 border-b border-dashed border-slate-100" key={f.key}>
                    <span className="text-slate-400">{f.label}:</span>
                    <span className="font-semibold text-slate-700">{val}</span>
                  </div>
                );
              }).filter(Boolean);
              if (!fields || fields.length === 0) return null;
              return <div className="space-y-0.5 mt-2 border-t border-slate-100 pt-2">{fields}</div>;
            })()}

            {form.Notes && (
              <p className="mt-2 text-[11px] text-slate-500 italic line-clamp-2 border-t border-slate-200/50 pt-1.5">
                "{form.Notes}"
              </p>
            )}
          </div>
        </div>

        {/* Card Bottom: Streamlined 4-Stat KPI Bar + Two Balanced Action Buttons */}
        <div className="mt-4 pt-3.5 border-t border-slate-100">
          {/* Streamlined KPI Grid */}
          <div className="grid grid-cols-4 divide-x divide-slate-100 bg-slate-50/70 rounded-xl p-2.5 mb-3 border border-slate-100/90 text-center">
            <div className="px-1">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Kill Rate</span>
              <span className={`text-xs font-black block mt-0.5 ${stats?.avgEfficacy >= 90 ? 'text-emerald-700' : stats?.avgEfficacy >= 75 ? 'text-teal-700' : 'text-slate-800'}`}>
                {stats?.avgEfficacy !== null ? `${stats.avgEfficacy}%` : '–'}
              </span>
            </div>
            <div className="px-1">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Residual</span>
              <span className="text-xs font-black text-amber-700 block mt-0.5">
                {stats?.avgCtrlDays !== null ? `${stats.avgCtrlDays}d` : '–'}
              </span>
            </div>
            <div className="px-1">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Est. Cost</span>
              <span className="text-xs font-black text-slate-800 block mt-0.5 truncate" title={`${CURRENCY_SYMBOL}${form._costVal.toFixed(2)} ${form._unitLabel || '/ L'}`}>
                {CURRENCY_SYMBOL}{form._costVal.toFixed(1)}
              </span>
            </div>
            <div className="px-1">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Trials</span>
              <span className="text-xs font-black text-indigo-700 block mt-0.5">
                {stats?.total || 0}
              </span>
            </div>
          </div>

          {/* Action Buttons: Linked Trials and Launch Trial */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onViewLinkedTrials(form)}
              className="py-2 px-3 rounded-xl font-bold text-xs bg-slate-50 hover:bg-emerald-50 text-slate-700 hover:text-emerald-800 border border-slate-200/90 hover:border-emerald-300 transition flex items-center justify-center gap-1.5 active:scale-95 shadow-2xs"
            >
              <Layers className="w-3.5 h-3.5 text-emerald-600" />
              Linked Trials ({stats?.total || 0})
            </button>

            <button
              type="button"
              onClick={() => onLaunchTrial(form)}
              className={`py-2 px-3 rounded-xl font-bold text-xs transition flex items-center justify-center gap-1.5 active:scale-95 shadow-xs ${
                isEligible
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-emerald-600/20'
                  : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
              }`}
              title={isEligible ? 'Launch new trial with this formulation' : 'Add 3+ ingredients to enable trials'}
            >
              <Rocket className="w-3.5 h-3.5" />
              Launch Trial
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// High-Density Compact Card View
function FormulationCompactCard({
  form,
  isOwn,
  CURRENCY_SYMBOL,
  isSelectedForCompare,
  isHighlighted = false,
  onQuickPeek,
  onToggleCompare,
  onViewLinkedTrials,
  onLaunchTrial,
  onAiOptimize,
  onExportDossier,
  onEdit,
  onDuplicate,
  onShare,
  onDelete,
  isAdmin,
  isViewer,
  isSharedEdit
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const stats = form._stats;
  const ings = form._parsedIngs || [];
  const ratingBadge = getEfficacyRatingBadge(stats?.avgEfficacy);
  const isEligible = isFormulationEligibleForTrial(form);
  const isDuplicate = form._duplicates && form._duplicates.length > 0;

  useEffect(() => {
    if (!isMenuOpen) return;
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMenuOpen]);

  return (
    <div
      id={`form-card-${form.ID}`}
      className={`bg-white rounded-2xl border p-4 transition-all duration-200 flex flex-col justify-between hover:shadow-lg ${
        isHighlighted
          ? 'ring-4 ring-purple-500/80 border-purple-500 bg-purple-50/20'
          : isSelectedForCompare
          ? 'border-indigo-500 ring-2 ring-indigo-500/20 bg-indigo-50/15'
          : 'border-slate-200/90 hover:border-emerald-400/80 shadow-2xs'
      }`}
    >
      <div>
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h4
                onClick={() => onQuickPeek && onQuickPeek(form)}
                className="font-bold text-sm text-slate-900 hover:text-emerald-700 cursor-pointer transition truncate max-w-full"
              >
                {form.Name}
              </h4>
              {form.Code && (
                <span className="font-mono text-[9px] font-bold px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">
                  {form.Code}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 mt-1 flex-wrap">
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold border inline-flex items-center gap-1 ${ratingBadge.colorClass}`}>
                <span className={`w-1 h-1 rounded-full ${ratingBadge.dotColor}`} />
                {ratingBadge.label}
              </span>
              {stats?.avgCtrlDays !== null && stats?.avgCtrlDays > 0 && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold bg-amber-50 text-amber-800 border border-amber-200">
                  ⏳ {stats.avgCtrlDays}d
                </span>
              )}
              {isDuplicate && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold bg-amber-100 text-amber-900 border border-amber-300">
                  ⚠️ Duplicate
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => onToggleCompare(form.ID)}
              className={`p-1.5 rounded-lg text-xs transition ${
                isSelectedForCompare ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50'
              }`}
              title="Compare"
            >
              <Scale className="w-3.5 h-3.5" />
            </button>
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <MoreVertical className="w-3.5 h-3.5" />
              </button>
              {isMenuOpen && (
                <div className="absolute right-0 top-7 z-50 bg-white rounded-xl shadow-xl border border-slate-200 py-1 min-w-[180px] text-xs">
                  <button onClick={() => { setIsMenuOpen(false); onQuickPeek(form); }} className="w-full text-left px-3 py-1.5 hover:bg-slate-50 flex items-center gap-1.5">
                    <Eye className="w-3 h-3 text-slate-400" /> Quick Dossier
                  </button>
                  <button onClick={() => { setIsMenuOpen(false); onAiOptimize(form); }} className="w-full text-left px-3 py-1.5 hover:bg-slate-50 text-violet-700 font-semibold flex items-center gap-1.5">
                    <Sparkles className="w-3 h-3 text-violet-500" /> AI Optimize
                  </button>
                  {!isViewer && (
                    <>
                      <button onClick={() => { setIsMenuOpen(false); onEdit(form); }} className="w-full text-left px-3 py-1.5 hover:bg-slate-50 text-emerald-700 flex items-center gap-1.5">
                        <Edit className="w-3 h-3 text-emerald-600" /> Edit Formula
                      </button>
                      {isOwn && (
                        <button onClick={() => { setIsMenuOpen(false); onDelete(form.ID); }} className="w-full text-left px-3 py-1.5 hover:bg-rose-50 text-rose-600 flex items-center gap-1.5">
                          <Trash2 className="w-3 h-3 text-rose-500" /> Delete
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <p className="text-[11px] text-slate-500 truncate mb-3" title={ings.map(i => `${i.name} (${i.quantity} ${i.unit})`).join(', ')}>
          <span className="font-semibold text-slate-600">Recipe: </span>
          {ings.length > 0 ? ings.map(i => i.name).join(', ') : 'No ingredients'}
        </p>
      </div>

      <div className="pt-2 border-t border-slate-100">
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="text-[10px] text-slate-400 font-semibold">Cost: <strong className="text-slate-800">{CURRENCY_SYMBOL}{form._costVal.toFixed(1)}</strong></span>
          <span className="text-[10px] text-slate-400 font-semibold">Trials: <strong className="text-indigo-700">{stats?.total || 0}</strong></span>
          <span className="text-[10px] text-slate-400 font-semibold">Kill: <strong className="text-emerald-700">{stats?.avgEfficacy !== null ? `${stats.avgEfficacy}%` : '–'}</strong></span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => onViewLinkedTrials(form)}
            className="py-1.5 px-2 rounded-lg text-xs font-semibold bg-slate-50 hover:bg-emerald-50 text-slate-700 border border-slate-200 transition text-center"
          >
            Linked ({stats?.total || 0})
          </button>
          <button
            type="button"
            onClick={() => onLaunchTrial(form)}
            disabled={!isEligible}
            className={`py-1.5 px-2 rounded-lg text-xs font-bold transition text-center ${
              isEligible ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-slate-100 text-slate-400 cursor-not-allowed'
            }`}
          >
            Launch
          </button>
        </div>
      </div>
    </div>
  );
}

// Scientific Data Table View
function FormulationTableView({
  formulations,
  selectedForCompare,
  onToggleCompare,
  onQuickPeek,
  onViewLinkedTrials,
  onLaunchTrial,
  onAiOptimize,
  onExportDossier,
  onEdit,
  onDuplicate,
  onShare,
  onDelete,
  CURRENCY_SYMBOL,
  isViewer,
  isAdmin,
  isOwnData
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50/90 border-b border-slate-200/80 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              <th className="py-3 px-3 w-10 text-center">Compare</th>
              <th className="py-3 px-4">Formulation & Code</th>
              <th className="py-3 px-3">MoA / Classification</th>
              <th className="py-3 px-4">Recipe Summary</th>
              <th className="py-3 px-3 text-center">Kill Rate</th>
              <th className="py-3 px-3 text-center">Residual</th>
              <th className="py-3 px-3 text-right">Est. Cost</th>
              <th className="py-3 px-3 text-center">Field Plots</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {formulations.map(form => {
              const stats = form._stats;
              const ings = form._parsedIngs || [];
              const ratingBadge = getEfficacyRatingBadge(stats?.avgEfficacy);
              const synergy = form._synergy;
              const isSelected = selectedForCompare.has(form.ID);
              const isEligible = isFormulationEligibleForTrial(form);
              const isOwn = isOwnData(form);
              const isDuplicate = form._duplicates && form._duplicates.length > 0;

              return (
                <tr key={form.ID} className={`hover:bg-slate-50/80 transition ${isSelected ? 'bg-indigo-50/20' : ''}`}>
                  <td className="py-3 px-3 text-center">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleCompare(form.ID)}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <span
                        onClick={() => onQuickPeek && onQuickPeek(form)}
                        className="font-bold text-slate-900 hover:text-emerald-700 cursor-pointer text-xs"
                      >
                        {form.Name}
                      </span>
                      {form.Code && (
                        <span className="font-mono text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200/60">
                          {form.Code}
                        </span>
                      )}
                      {isDuplicate && (
                        <span className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 font-bold" title={`Duplicate of ${form._duplicates[0].Name}`}>
                          ⚠️ Duplicate
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-3">
                    {synergy?.committee ? (
                      <span className="inline-flex items-center gap-1 font-semibold text-[11px] text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200/80">
                        <Sparkles className="w-2.5 h-2.5 text-purple-500" />
                        {synergy.committee} {(synergy.uniqueGroups || synergy.uniqueHracGroups || []).join('+') || 'Unclassified'}
                      </span>
                    ) : (
                      <span className="text-slate-400 text-[11px]">—</span>
                    )}
                  </td>
                  <td className="py-3 px-4 max-w-xs">
                    <div className="truncate text-[11px] text-slate-600 font-medium" title={ings.map(i => `${i.name} (${i.quantity} ${i.unit})`).join(', ')}>
                      {ings.length > 0 ? (
                        ings.map(i => `${i.name} (${i.quantity}${i.unit})`).join(', ')
                      ) : (
                        <span className="text-slate-400 italic">No ingredients</span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-3 text-center">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border ${ratingBadge.colorClass}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${ratingBadge.dotColor}`} />
                      {stats?.avgEfficacy !== null ? `${stats.avgEfficacy}%` : 'Untested'}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-center">
                    {stats?.avgCtrlDays !== null && stats?.avgCtrlDays > 0 ? (
                      <span className="font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200/80 text-[11px]">
                        ⏳ {stats.avgCtrlDays}d
                      </span>
                    ) : (
                      <span className="text-slate-400 text-[11px]">—</span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-right">
                    <span className="font-mono font-bold text-slate-800 text-xs">
                      {CURRENCY_SYMBOL}{form._costVal.toFixed(2)}
                    </span>
                    <span className="text-[10px] text-slate-400 block">{form._unitLabel || '/ L'}</span>
                  </td>
                  <td className="py-3 px-3 text-center">
                    <button
                      type="button"
                      onClick={() => onViewLinkedTrials(form)}
                      className="font-bold text-emerald-700 hover:text-emerald-800 hover:underline text-xs"
                    >
                      {stats?.total || 0} Plots
                    </button>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => onQuickPeek && onQuickPeek(form)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                        title="Quick View Dossier"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onLaunchTrial(form)}
                        disabled={!isEligible}
                        className={`p-1.5 px-2.5 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
                          isEligible
                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs'
                            : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                        }`}
                        title={isEligible ? "Launch Trial" : "Complete recipe first"}
                      >
                        <Rocket className="w-3 h-3" />
                        <span>Launch</span>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Formulations({ onMenuClick }) {
  const navigate = useNavigate();
  const { state, updateState, getAppState } = useAppState();
  const { isViewer, user, isAdmin } = useAuth();
  const isOwnData = (record) => {
    if (isAdmin) return true;
    if (!record) return true;
    const ownUid = user?.uid || user?.ID || user?.id;
    return !record.CreatedBy || record.CreatedBy === ownUid;
  };
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [sharingFormulation, setSharingFormulation] = useState(null);
  const [viewingLinkedTrialsForm, setViewingLinkedTrialsForm] = useState(null);
  const [sortBy, setSortBy] = useState('best'); // 'best' | 'control-days' | 'efficacy' | 'spectrum' | 'trials' | 'cost' | 'newest'
  const [performanceFilter, setPerformanceFilter] = useState('all'); // 'all' | 'high-kill' | 'long-control' | 'broad-spectrum'
  const [selectedForCompare, setSelectedForCompare] = useState(new Set());
  const [isCompareModalOpen, setIsCompareModalOpen] = useState(false);
  const [isGeneratorModalOpen, setIsGeneratorModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'compact' | 'table'

  const toggleCompareSelection = (formId) => {
    setSelectedForCompare(prev => {
      const next = new Set(prev);
      if (next.has(formId)) {
        next.delete(formId);
      } else {
        if (next.size >= 4) {
          window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Maximum 4 formulations can be compared simultaneously.', type: 'error' } }));
          return prev;
        }
        next.add(formId);
      }
      return next;
    });
  };

  const handleLaunchTrial = (form) => {
    if (!isFormulationEligibleForTrial(form)) {
      window.dispatchEvent(new CustomEvent('app:toast', { 
        detail: { msg: 'This formulation cannot be linked to a trial yet. Please complete the formulation recipe first.', type: 'warning' } 
      }));
      return;
    }
    navigate('/trials', {
      state: {
        newTrialWithFormulation: {
          id: form.ID,
          name: form.Name,
          code: form.Code
        }
      }
    });
  };

  const handleExportDossier = (form) => {
    exportFormulationDossier(form, state.trials, state.ingredients, state.activeCategory || 'herbicide', state.projects);
  };

  const handleOpenShareModal = (e, formulation) => {
    e.stopPropagation();
    setSharingFormulation(formulation);
    setIsShareModalOpen(true);
  };

  const handleSaveSharing = async (sharedWith, sharedWithEdit) => {
    if (!sharingFormulation) return;
    setIsShareModalOpen(false);

    const updatedForm = {
      ...sharingFormulation,
      SharedWith: sharedWith,
      SharedWithEdit: sharedWithEdit
    };
    const newForms = state.formulations.map(f => f.ID === sharingFormulation.ID ? updatedForm : f);
    updateState({ formulations: newForms });

    try {
      await updateFormulation(updatedForm, getAppState);
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Sharing permissions updated successfully', type: 'success' } }));
    } catch (err) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Failed to update sharing permissions', type: 'error' } }));
      updateState({ formulations: state.formulations });
    }
  };
  const [editingForm, setEditingForm] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [highlightFormId, setHighlightFormId] = useState(null);
  const [quickPeekForm, setQuickPeekForm] = useState(null);

  const location = useLocation();

  // ── ROUTING & FOCUS EFFECT ──────────────────────────────────────────
  useEffect(() => {
    let focusId = location.state?.focusFormula;
    if (!focusId) {
      const searchParams = new URLSearchParams(location.search);
      focusId = searchParams.get('focus');
    }
    if (!focusId) {
      const hash = location.hash || window.location.hash || '';
      if (hash.includes('focus=')) {
        focusId = hash.match(/focus=([^&#\s]+)/i)?.[1];
      }
    }
    if (focusId && state.formulations?.length) {
      const cleanFocus = decodeURIComponent(focusId).trim().toLowerCase();
      const formToFocus = (state.formulations || []).find(f => {
        const fid = String(f.ID || '').trim().toLowerCase();
        const fcode = String(f.Code || '').trim().toLowerCase();
        const fname = String(f.Name || '').trim().toLowerCase();
        return fid === cleanFocus || fcode === cleanFocus || fname === cleanFocus ||
               (cleanFocus.length > 2 && fname.includes(cleanFocus)) ||
               (fname.length > 2 && cleanFocus.includes(fname));
      });

      if (formToFocus) {
        setSearchTerm('');
        setPerformanceFilter('all');
        setHighlightFormId(formToFocus.ID);
        setQuickPeekForm(formToFocus);

        let attempts = 0;
        const scrollInterval = setInterval(() => {
          attempts++;
          const el = document.getElementById(`form-card-${formToFocus.ID}`);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            clearInterval(scrollInterval);
          } else if (attempts >= 10) {
            clearInterval(scrollInterval);
          }
        }, 150);

        const timeout = setTimeout(() => {
          setHighlightFormId(null);
        }, 4500);

        return () => {
          clearInterval(scrollInterval);
          clearTimeout(timeout);
        };
      }
    }
  }, [location.search, location.hash, location.state, state.formulations]);

  // Direct Event Listener for instant cross-tab navigation
  useEffect(() => {
    const handleNavigate = (e) => {
      const fId = e.detail?.formulaId;
      if (!fId || !state.formulations?.length) return;
      const cleanFocus = decodeURIComponent(fId).trim().toLowerCase();
      const formToFocus = state.formulations.find(f => {
        const fid = String(f.ID || '').trim().toLowerCase();
        const fcode = String(f.Code || '').trim().toLowerCase();
        const fname = String(f.Name || '').trim().toLowerCase();
        return fid === cleanFocus || fcode === cleanFocus || fname === cleanFocus ||
               (cleanFocus.length > 2 && fname.includes(cleanFocus)) ||
               (fname.length > 2 && cleanFocus.includes(fname));
      });
      if (formToFocus) {
        setSearchTerm('');
        setPerformanceFilter('all');
        setHighlightFormId(formToFocus.ID);
        setQuickPeekForm(formToFocus);
        setTimeout(() => {
          const el = document.getElementById(`form-card-${formToFocus.ID}`);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 200);
      }
    };
    window.addEventListener('app:navigate_to_formulation', handleNavigate);
    return () => window.removeEventListener('app:navigate_to_formulation', handleNavigate);
  }, [state.formulations]);

  // Form State
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [ingredients, setIngredients] = useState([{ name: '', quantity: '', unit: 'ml' }]);
  const [dynamicFields, setDynamicFields] = useState({});

  // Quick Add Ingredient Modal State (directly accessible from Formulation modal)
  const [isQuickAddIngOpen, setIsQuickAddIngOpen] = useState(false);
  const [quickIngName, setQuickIngName] = useState('');
  const [quickIngCost, setQuickIngCost] = useState('');
  const [quickIngUnit, setQuickIngUnit] = useState('L');
  const [quickIngTargetIndex, setQuickIngTargetIndex] = useState(null);
  const [isSavingQuickIng, setIsSavingQuickIng] = useState(false);

  const CURRENCY_SYMBOL = '₹';

  const handleOpenQuickAddIngredient = (initialName = '', rowIndex = null) => {
    setQuickIngName(initialName ? String(initialName).trim() : '');
    setQuickIngCost('');
    setQuickIngUnit('L');
    setQuickIngTargetIndex(rowIndex);
    setIsQuickAddIngOpen(true);
  };

  const handleSaveQuickIngredient = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const trimmedName = quickIngName.trim();
    if (!trimmedName) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Ingredient name is required.', type: 'error' } }));
      return;
    }
    const parsedCost = parseFloat(quickIngCost);
    if (isNaN(parsedCost) || parsedCost < 0) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Please enter a valid price (e.g. 500).', type: 'error' } }));
      return;
    }

    setIsSavingQuickIng(true);
    const activeCategory = state.activeCategory || 'herbicide';
    const newIngredientPayload = {
      ID: Date.now().toString(),
      Name: trimmedName,
      Cost: parsedCost,
      Unit: quickIngUnit || 'L',
      Category: activeCategory,
      CreatedAt: new Date().toISOString()
    };

    // 1. Optimistically update state.ingredients in-memory
    const updatedIngredientsList = [...(state.ingredients || []), newIngredientPayload];
    updateState({ ingredients: updatedIngredientsList });

    // 2. Link directly to the active formulation recipe rows
    const baseUnitLower = (quickIngUnit || 'L').toLowerCase();
    const defaultRecipeUnit = ['kg', 'gm', 'g', 'gram', 'grams', 'mg'].includes(baseUnitLower) ? 'gm' : 'ml';

    if (quickIngTargetIndex !== null && quickIngTargetIndex >= 0 && quickIngTargetIndex < ingredients.length) {
      const updatedRows = [...ingredients];
      updatedRows[quickIngTargetIndex] = {
        ...updatedRows[quickIngTargetIndex],
        name: trimmedName,
        unit: updatedRows[quickIngTargetIndex].unit || defaultRecipeUnit
      };
      setIngredients(updatedRows);
    } else {
      const updatedRows = [...ingredients];
      const lastRow = updatedRows[updatedRows.length - 1];
      if (lastRow && !lastRow.name) {
        lastRow.name = trimmedName;
        lastRow.unit = defaultRecipeUnit;
      } else {
        updatedRows.push({ name: trimmedName, quantity: '', unit: defaultRecipeUnit });
      }
      setIngredients(updatedRows);
    }

    setIsQuickAddIngOpen(false);
    setIsSavingQuickIng(false);

    // 3. Persist to data layer / cloud database
    try {
      await addIngredient(newIngredientPayload, getAppState);
      window.dispatchEvent(new CustomEvent('app:toast', {
        detail: { msg: `Added "${trimmedName}" (${CURRENCY_SYMBOL}${parsedCost.toFixed(2)} / ${quickIngUnit}) to Ingredients Library!`, type: 'success' }
      }));
    } catch (err) {
      console.error('Failed to save ingredient to library:', err);
      window.dispatchEvent(new CustomEvent('app:toast', {
        detail: { msg: 'Ingredient linked to recipe, but failed to save permanently to library.', type: 'warning' }
      }));
    }
  };

  const handleOpenModal = (form = null, duplicate = false) => {
    const activeCategory = state.activeCategory || 'herbicide';
    const activeConfig = getCategoryConfig(activeCategory);
    const initialDyn = {};
    activeConfig.formulationFields?.forEach(f => {
      initialDyn[f.key] = form ? (form[f.key] || '') : '';
    });
    setDynamicFields(initialDyn);

    if (form) {
      setEditingForm(duplicate ? null : form);
      setName(duplicate ? `${form.Name} (Copy)` : form.Name);
      setNotes(form.Notes || '');
      const parsedIngs = safeJsonParse(form.IngredientsJSON, [{ name: '', quantity: '', unit: 'ml' }]);
      setIngredients(parsedIngs.length > 0 ? parsedIngs : [{ name: '', quantity: '', unit: 'ml' }]);
    } else {
      setEditingForm(null);
      setName('');
      setNotes('');
      setIngredients([{ name: '', quantity: '', unit: 'ml' }]);
    }
    setIsModalOpen(true);
  };

  // Live duplicate detection inside formulation modal
  const duplicateFormMatch = useMemo(() => {
    if (!isModalOpen) return null;
    const clean = (ingredients || []).filter(i => i && i.name && i.name.trim() !== '' && i.quantity !== '' && !isNaN(parseFloat(i.quantity)));
    if (clean.length === 0) return null;
    return findDuplicateFormulation(
      clean,
      state.formulations || [],
      state.activeCategory || 'herbicide',
      editingForm ? editingForm.ID : null
    );
  }, [isModalOpen, ingredients, state.formulations, state.activeCategory, editingForm]);

  const handleAddIngredientRow = () => {
    setIngredients([...ingredients, { name: '', quantity: '', unit: 'ml' }]);
  };

  const handleRemoveIngredientRow = (index) => {
    if (ingredients.length > 1) {
      const ing = ingredients[index];
      const name = ing && ing.name ? `"${ing.name}"` : 'this ingredient';
      if (!window.confirm(`Remove ${name} from formulation?`)) return;
      setIngredients(ingredients.filter((_, i) => i !== index));
    }
  };

  const handleIngredientChange = (index, field, value) => {
    const newIngs = [...ingredients];
    newIngs[index][field] = value;

    // Auto-fill unit if ingredient is selected or matched in library
    if (field === 'name') {
      const selectedLibIng = findIngredientInLibrary(value, state.ingredients || []);
      if (selectedLibIng) {
        const baseUnit = String(selectedLibIng.Unit || selectedLibIng.unit || '').toLowerCase().trim();
        if (baseUnit === 'l' || baseUnit === 'litre' || baseUnit === 'litres' || baseUnit === 'liter' || baseUnit === 'liters' || baseUnit === 'ml' || baseUnit === 'millilitre' || baseUnit === 'millilitres') {
          newIngs[index].unit = newIngs[index].unit || 'ml';
        } else if (baseUnit === 'kg' || baseUnit === 'kilogram' || baseUnit === 'kilograms' || baseUnit === 'g' || baseUnit === 'gm' || baseUnit === 'gram' || baseUnit === 'grams') {
          newIngs[index].unit = newIngs[index].unit || 'gm';
        } else {
          newIngs[index].unit = newIngs[index].unit || selectedLibIng.Unit || selectedLibIng.unit || 'ml';
        }
      } else if (!newIngs[index].unit) {
        newIngs[index].unit = 'ml';
      }
    }
    setIngredients(newIngs);
  };

  // Estimate cost based on ingredient library
  const calculateEstimatedCost = () => {
    return calculateFormulationCost(ingredients, state.ingredients || []);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (isViewer) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Viewer role cannot modify or save formulations.', type: 'error' } }));
      return;
    }
    const cleanIngs = ingredients.filter(i => i.name.trim() !== '');
    if (cleanIngs.length === 0) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'At least one ingredient is required', type: 'error' } }));
      return;
    }

    // Flag duplicate recipe to prevent redundant field trials
    if (duplicateFormMatch) {
      const proceed = window.confirm(
        `⚠️ DUPLICATE FORMULA DETECTED!\n\nThis recipe has the EXACT same ingredients and quantities as existing formula "${duplicateFormMatch.Name}" (${duplicateFormMatch.Code || 'No Code'}).\n\nSaving exact duplicates leads to redundant, wasted field trials.\n\nDo you want to proceed anyway with duplicate recipe?`
      );
      if (!proceed) return;
    }

    // Use a numeric timestamp string so sort always works correctly
    const nowISO = new Date().toISOString();

    const activeCategory = state.activeCategory || 'herbicide';
    const payload = {
      ID: editingForm ? editingForm.ID : Date.now().toString(),
      Category: activeCategory,
      Name: name,
      Notes: notes,
      IngredientsJSON: JSON.stringify(cleanIngs),
      EstimatedCost: calculateEstimatedCost(),
      // Keep original CreatedAt when editing; set fresh ISO string for new/duplicate
      CreatedAt: editingForm ? editingForm.CreatedAt : nowISO,
      ...dynamicFields,
    };

    // Category validation before saving
    try {
      const operation = editingForm ? 'updateFormulation' : 'addFormulation';
      await validateCategoryDataOperation(operation, payload, getAppState);
    } catch (validationError) {
      if (validationError.validationError) {
        const { showCategoryValidationToast } = await import('../components/CategoryValidationAlert.jsx');
        showCategoryValidationToast(validationError);
        return; // Stop the save operation
      }
      console.warn('Validation check failed:', validationError);
    }

    let newForms = [...(state.formulations || [])];
    if (editingForm) {
      // Replace in-place, then re-sort will handle position
      newForms = newForms.map(f => f.ID === payload.ID ? payload : f);
    } else {
      // ✅ Prepend so the new item is immediately at the top
      newForms = [payload, ...newForms];
    }
    updateState({ formulations: newForms });
    setIsModalOpen(false);

    try {
      if (editingForm) {
        await updateFormulation(payload, getAppState);
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Formulation updated successfully', type: 'success' } }));
      } else {
        await addFormulation(payload, getAppState);
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Formulation saved', type: 'success' } }));
      }
    } catch (err) {
      if (err.validationError) {
        const { showCategoryValidationToast } = await import('../components/CategoryValidationAlert.jsx');
        showCategoryValidationToast(err);
      } else {
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Failed to save formulation', type: 'error' } }));
      }
    }
  };

  const handleDelete = async (id) => {
    if (isViewer) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Viewer role cannot delete formulations.', type: 'error' } }));
      return;
    }
    if (!window.confirm('Delete this formulation?')) return;

    const newForms = state.formulations.filter(f => f.ID !== id);
    updateState({ formulations: newForms });

    try {
      await deleteFormulation({ ID: id }, getAppState);
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Formulation deleted', type: 'success' } }));
    } catch (err) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Failed to delete formulation', type: 'error' } }));
    }
  };

  // Helper to get a comparable timestamp from various date formats
  const getTimestamp = (dateValue) => {
    if (!dateValue) return 0;
    // Firestore Timestamp object { seconds, nanoseconds }
    if (typeof dateValue === 'object' && dateValue.seconds) {
      return dateValue.seconds * 1000;
    }
    // ISO string or numeric string (Date.now().toString())
    const parsed = new Date(dateValue).getTime();
    return isNaN(parsed) ? 0 : parsed;
  };

  const activeCategory = state.activeCategory || 'herbicide';

  // Pre-calculate trial performance metrics and duplicate recipes for each formulation
  const formulationsWithStats = useMemo(() => {
    const rawForms = (state.formulations || []).filter(
      f => f.Category === activeCategory || (!f.Category && activeCategory === 'herbicide')
    );

    const duplicateLookup = detectAllDuplicateFormulations(rawForms, activeCategory);

    return rawForms.map(form => {
      const stats = getFormulationTrialStats(form, state.trials, state.projects, activeCategory);
      const parsedIngs = safeJsonParse(form.IngredientsJSON, []);
      const synergy = analyzeFormulationSynergy(parsedIngs, form.Category || activeCategory);
      const costDetails = getFormulationCostDetails(parsedIngs, state.ingredients || []);
      const costVal = costDetails.totalCost > 0 ? costDetails.totalCost : parseFloat(form.EstimatedCost || 0);
      let unitLabel = '';
      if (costDetails.totalVolumeL > 0) {
        unitLabel = costDetails.totalVolumeL === 1 ? '/ L' : `/ ${costDetails.totalVolumeL >= 1 ? costDetails.totalVolumeL.toFixed(1) + 'L' : (costDetails.totalVolumeL * 1000).toFixed(0) + 'ml'}`;
      } else if (costDetails.totalWeightKg > 0) {
        unitLabel = costDetails.totalWeightKg === 1 ? '/ kg' : `/ ${costDetails.totalWeightKg >= 1 ? costDetails.totalWeightKg.toFixed(1) + 'kg' : (costDetails.totalWeightKg * 1000).toFixed(0) + 'gm'}`;
      }
      const formDuplicates = duplicateLookup.get(String(form.ID || form.id)) || [];

      return {
        ...form,
        _stats: stats,
        _synergy: synergy,
        _trialsCount: stats.total,
        _stdCount: stats.microplotCount,
        _largeCount: stats.fieldCount,
        _avgScore: stats.avgEfficacy,
        _costVal: costVal,
        _unitLabel: unitLabel,
        _costDetails: costDetails,
        _parsedIngs: parsedIngs,
        _duplicates: formDuplicates
      };
    });
  }, [state.formulations, state.trials, state.projects, state.ingredients, activeCategory]);

  const sortedFormulations = useMemo(() => {
    let list = formulationsWithStats.filter(
      f => !searchTerm || f.Name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Performance quick filters
    if (performanceFilter === 'high-kill') {
      list = list.filter(f => (f._stats?.avgEfficacy ?? 0) >= 90);
    } else if (performanceFilter === 'long-control') {
      list = list.filter(f => (f._stats?.avgCtrlDays ?? 0) >= 10);
    } else if (performanceFilter === 'broad-spectrum') {
      list = list.filter(f => (f._stats?.targetCount ?? 0) >= 2);
    } else if (performanceFilter === 'duplicates') {
      list = list.filter(f => f._duplicates && f._duplicates.length > 0);
    } else if (performanceFilter === 'organic') {
      list = list.filter(f => f._synergy?.isOrganicBio);
    }

    list.sort((a, b) => {
      if (sortBy === 'best') {
        const scoreA = a._stats?.agronomicScore ?? -1;
        const scoreB = b._stats?.agronomicScore ?? -1;
        if (scoreB !== scoreA) return scoreB - scoreA;
        const ctrlA = a._stats?.avgCtrlDays ?? -1;
        const ctrlB = b._stats?.avgCtrlDays ?? -1;
        if (ctrlB !== ctrlA) return ctrlB - ctrlA;
        return (b._stats?.avgEfficacy ?? -1) - (a._stats?.avgEfficacy ?? -1);
      }
      if (sortBy === 'control-days') {
        const ctrlA = a._stats?.avgCtrlDays ?? -1;
        const ctrlB = b._stats?.avgCtrlDays ?? -1;
        if (ctrlB !== ctrlA) return ctrlB - ctrlA;
        return (b._stats?.avgEfficacy ?? -1) - (a._stats?.avgEfficacy ?? -1);
      }
      if (sortBy === 'efficacy' || sortBy === 'kill-rate') {
        const scoreA = a._stats?.avgEfficacy ?? -1;
        const scoreB = b._stats?.avgEfficacy ?? -1;
        if (scoreB !== scoreA) return scoreB - scoreA;
        return (b._stats?.avgCtrlDays ?? -1) - (a._stats?.avgCtrlDays ?? -1);
      }
      if (sortBy === 'spectrum') {
        const specA = a._stats?.targetCount ?? 0;
        const specB = b._stats?.targetCount ?? 0;
        if (specB !== specA) return specB - specA;
        return (b._stats?.agronomicScore ?? -1) - (a._stats?.agronomicScore ?? -1);
      }
      if (sortBy === 'trials') {
        return (b._trialsCount || 0) - (a._trialsCount || 0);
      }
      if (sortBy === 'cost') {
        return (a._costVal || 0) - (b._costVal || 0);
      }
      // 'newest' default
      const aTs = getTimestamp(a.CreatedAt || a._createdAt);
      const bTs = getTimestamp(b.CreatedAt || b._createdAt);
      return bTs - aTs;
    });

    return list;
  }, [formulationsWithStats, searchTerm, sortBy, performanceFilter]);

  const formulationsToCompare = useMemo(() => {
    return (state.formulations || []).filter(f => selectedForCompare.has(f.ID));
  }, [state.formulations, selectedForCompare]);

  const handleAskAIForFormulation = (form) => {
    const prompt = `Please evaluate the agronomic performance and recipe of formula "${form.Name}" in the ${activeCategory} category. How does it compare against other formulas in our trials, what is its optimal dosage, and how can we upgrade its ingredients for superior efficacy?`;
    navigate('/ai-assistant', { state: { prefilledPrompt: prompt } });
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <TopBar title="Formulations" onMenuClick={onMenuClick} />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        {/* Compact Mobile Formulations Header */}
        <div className="sm:hidden -mx-4 -mt-4 mb-3 px-3.5 pt-3 pb-2 flex items-center justify-between border-b border-slate-200/80 bg-white/80 backdrop-blur-xs">
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-base font-bold text-slate-800 tracking-tight">
                Formulations
              </h1>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                {formulationsWithStats.length}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
              <span className="text-[#154734] font-semibold">
                {formulationsWithStats.filter(f => (f._stats?.avgEfficacy || 0) >= 90).length} High Kill
              </span>
              <span>•</span>
              <span>
                {formulationsWithStats.filter(f => (f._stats?.avgControlDays || 0) >= 10).length} Residual
              </span>
            </div>
          </div>
          {!isViewer && (
            <button
              onClick={() => handleOpenModal()}
              className="px-3 py-1.5 bg-[#154734] hover:bg-[#0e3525] text-white rounded-xl text-xs font-semibold shadow-xs flex items-center gap-1 active:scale-95 transition touch-manipulation"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New</span>
            </button>
          )}
        </div>

        {/* Desktop / Tablet Formulation Hub Hero Header */}
        <div className="hidden sm:block relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-[#0e3525] p-6 text-white shadow-md border border-slate-700/60">
          <div className="absolute -right-12 -top-12 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute right-1/4 -bottom-12 w-48 h-48 bg-teal-500/10 rounded-full blur-2xl pointer-events-none" />

          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5">
                  <FlaskConical className="w-3 h-3" /> Formulation & Recipe Engine
                </span>
                <span className="text-xs text-slate-400 capitalize">• {activeCategory} R&D</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2.5">
                Active Formulations
                <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-white/10 text-slate-200">
                  {formulationsWithStats.length} Total
                </span>
              </h1>
              <p className="text-slate-300 text-xs sm:text-sm mt-1 max-w-2xl leading-relaxed">
                Precision active ingredient blends, HRAC/FRAC/IRAC mode-of-action tracking, and live field trial efficacy analysis.
              </p>
            </div>

            {/* Quick KPI stats strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 shrink-0">
              <div className="bg-white/5 backdrop-blur-xs rounded-xl p-3 border border-white/10 flex flex-col">
                <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Catalog</span>
                <span className="text-lg font-bold text-white mt-0.5">{formulationsWithStats.length}</span>
                <span className="text-[10px] text-slate-400">Tested recipes</span>
              </div>
              <div className="bg-emerald-500/10 backdrop-blur-xs rounded-xl p-3 border border-emerald-500/20 flex flex-col">
                <span className="text-[10px] font-medium text-emerald-300 uppercase tracking-wider flex items-center gap-1">
                  ⚡ High Kill
                </span>
                <span className="text-lg font-bold text-emerald-400 mt-0.5">
                  {formulationsWithStats.filter(f => (f._stats?.avgEfficacy || 0) >= 90).length}
                </span>
                <span className="text-[10px] text-emerald-300/70">≥90% efficacy</span>
              </div>
              <div className="bg-amber-500/10 backdrop-blur-xs rounded-xl p-3 border border-amber-500/20 flex flex-col">
                <span className="text-[10px] font-medium text-amber-300 uppercase tracking-wider flex items-center gap-1">
                  ⏳ Residual
                </span>
                <span className="text-lg font-bold text-amber-400 mt-0.5">
                  {formulationsWithStats.filter(f => (f._stats?.avgControlDays || 0) >= 10).length}
                </span>
                <span className="text-[10px] text-amber-300/70">≥10d control</span>
              </div>
              <div className="bg-teal-500/10 backdrop-blur-xs rounded-xl p-3 border border-teal-500/20 flex flex-col">
                <span className="text-[10px] font-medium text-teal-300 uppercase tracking-wider flex items-center gap-1">
                  🍃 Bio / Org
                </span>
                <span className="text-lg font-bold text-teal-400 mt-0.5">
                  {formulationsWithStats.filter(f => f._synergy?.isOrganicBio).length}
                </span>
                <span className="text-[10px] text-teal-300/70">Bio-friendly</span>
              </div>
            </div>
          </div>
        </div>

        {/* Search, Sort, View Modes and Action Controls */}
        <div className="flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-3 bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-xs">
          {/* Search bar */}
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search by formulation name, code, or ingredient..."
              className="w-full pl-9 pr-8 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50/50 hover:bg-white focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-between lg:justify-end">
            {/* Sort Dropdown */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-slate-700">
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
                className="bg-transparent font-semibold outline-none cursor-pointer text-slate-800 text-xs"
              >
                <option value="best">Sort: Best (Long Control & High Kill) 🏆</option>
                <option value="control-days">Sort: Longest Control Days ⏳</option>
                <option value="efficacy">Sort: Highest Kill Rate ⚡</option>
                <option value="spectrum">Sort: Broadest Spectrum 🎯</option>
                <option value="trials">Sort: Most Field Tested 🔬</option>
                <option value="cost">Sort: Lowest Cost 💰</option>
                <option value="newest">Sort: Newest First 📅</option>
              </select>
            </div>

            {/* View Switcher: Grid / Compact / Table */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-2xs">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-lg transition text-xs flex items-center gap-1 ${
                  viewMode === 'grid'
                    ? 'bg-white text-emerald-700 shadow-xs font-bold'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
                title="Rich Cards Grid"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span className="hidden sm:inline text-[11px]">Cards</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('compact')}
                className={`p-1.5 rounded-lg transition text-xs flex items-center gap-1 ${
                  viewMode === 'compact'
                    ? 'bg-white text-emerald-700 shadow-xs font-bold'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
                title="Compact Density"
              >
                <List className="w-3.5 h-3.5" />
                <span className="hidden sm:inline text-[11px]">Compact</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded-lg transition text-xs flex items-center gap-1 ${
                  viewMode === 'table'
                    ? 'bg-white text-emerald-700 shadow-xs font-bold'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
                title="Scientific Table View"
              >
                <Table className="w-3.5 h-3.5" />
                <span className="hidden sm:inline text-[11px]">Table</span>
              </button>
            </div>

            {/* Compare Button */}
            {selectedForCompare.size > 0 && (
              <button
                onClick={() => setIsCompareModalOpen(true)}
                className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs flex items-center gap-1.5 text-xs font-bold transition active:scale-95"
              >
                <Scale className="w-3.5 h-3.5" /> Compare ({selectedForCompare.size})
              </button>
            )}

            {/* AI Generator CTA */}
            {!isViewer && (
              <button
                onClick={() => setIsGeneratorModalOpen(true)}
                className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-xs flex items-center gap-1.5 text-xs font-bold transition active:scale-95"
              >
                <Wand2 className="w-3.5 h-3.5" /> AI Recipe
              </button>
            )}

            {/* New Formula CTA */}
            {!isViewer && (
              <button
                onClick={() => handleOpenModal()}
                className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs flex items-center gap-1.5 text-xs font-bold transition active:scale-95"
              >
                <Plus className="w-3.5 h-3.5" /> New Formula
              </button>
            )}
          </div>
        </div>

        {/* Quick Agronomic Performance Filter Chips */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
          <button
            type="button"
            onClick={() => setPerformanceFilter('all')}
            className={`px-3 py-1.5 rounded-xl font-semibold transition shrink-0 flex items-center gap-1.5 shadow-2xs ${
              performanceFilter === 'all'
                ? 'bg-slate-900 text-white'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <span>All Formulas</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
              performanceFilter === 'all' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
            }`}>
              {formulationsWithStats.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setPerformanceFilter('high-kill')}
            className={`px-3 py-1.5 rounded-xl font-semibold transition shrink-0 flex items-center gap-1.5 shadow-2xs ${
              performanceFilter === 'high-kill'
                ? 'bg-emerald-600 text-white'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700'
            }`}
          >
            <span>⚡ High Kill Rate (90%+)</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
              performanceFilter === 'high-kill' ? 'bg-white/20 text-white' : 'bg-emerald-50 text-emerald-700'
            }`}>
              {formulationsWithStats.filter(f => (f._stats?.avgEfficacy || 0) >= 90).length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setPerformanceFilter('long-control')}
            className={`px-3 py-1.5 rounded-xl font-semibold transition shrink-0 flex items-center gap-1.5 shadow-2xs ${
              performanceFilter === 'long-control'
                ? 'bg-amber-600 text-white'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-amber-50 hover:text-amber-700'
            }`}
          >
            <span>⏳ Long Residual (10d+)</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
              performanceFilter === 'long-control' ? 'bg-white/20 text-white' : 'bg-amber-50 text-amber-700'
            }`}>
              {formulationsWithStats.filter(f => (f._stats?.avgControlDays || 0) >= 10).length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setPerformanceFilter('broad-spectrum')}
            className={`px-3 py-1.5 rounded-xl font-semibold transition shrink-0 flex items-center gap-1.5 shadow-2xs ${
              performanceFilter === 'broad-spectrum'
                ? 'bg-teal-600 text-white'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-teal-50 hover:text-teal-700'
            }`}
          >
            <span>
              {activeCategory === 'herbicide' ? '🌿 Broad Spectrum (2+ Weeds)' :
               activeCategory === 'fungicide' ? '🛡️ Broad Spectrum (2+ Diseases)' :
               activeCategory === 'pesticide' ? '🐛 Broad Spectrum (2+ Pests)' :
               '🌱 Broad Spectrum (2+ Targets)'}
            </span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
              performanceFilter === 'broad-spectrum' ? 'bg-white/20 text-white' : 'bg-teal-50 text-teal-700'
            }`}>
              {formulationsWithStats.filter(f => (f._stats?.weedsControlledCount || 0) >= 2).length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setPerformanceFilter('organic')}
            className={`px-3 py-1.5 rounded-xl font-semibold transition shrink-0 flex items-center gap-1.5 shadow-2xs ${
              performanceFilter === 'organic'
                ? 'bg-emerald-700 text-white'
                : 'bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-50'
            }`}
          >
            <span>🍃 Organic / Bio</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
              performanceFilter === 'organic' ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800'
            }`}>
              {formulationsWithStats.filter(f => f._synergy?.isOrganicBio).length}
            </span>
          </button>
          {formulationsWithStats.some(f => f._duplicates?.length > 0) && (
            <button
              type="button"
              onClick={() => setPerformanceFilter('duplicates')}
              className={`px-3 py-1.5 rounded-xl font-semibold transition shrink-0 flex items-center gap-1.5 shadow-2xs ${
                performanceFilter === 'duplicates'
                  ? 'bg-amber-600 text-white'
                  : 'bg-white border border-amber-300 text-amber-800 hover:bg-amber-50'
              }`}
            >
              <span>⚠️ Duplicate Recipes</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                performanceFilter === 'duplicates' ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-800'
              }`}>
                {formulationsWithStats.filter(f => f._duplicates?.length > 0).length}
              </span>
            </button>
          )}
        </div>

        {/* Content Views: Grid, Compact, or Scientific Table */}
        {sortedFormulations.length === 0 ? (
          <div className="py-16 text-center bg-white rounded-2xl border border-dashed border-slate-200 shadow-2xs">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-400">
              <FlaskConical className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-800">No Formulations Found</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              No recipes match your current search and filter criteria. Try clearing filters or create a new formulation.
            </p>
            {!isViewer && (
              <button
                type="button"
                onClick={() => handleOpenModal()}
                className="mt-4 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-xs inline-flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" /> Create New Formulation
              </button>
            )}
          </div>
        ) : viewMode === 'table' ? (
          <FormulationTableView
            formulations={sortedFormulations}
            selectedForCompare={selectedForCompare}
            onToggleCompare={toggleCompareSelection}
            onQuickPeek={setQuickPeekForm}
            onViewLinkedTrials={setViewingLinkedTrialsForm}
            onLaunchTrial={handleLaunchTrial}
            onAiOptimize={handleAskAIForFormulation}
            onExportDossier={handleExportDossier}
            onEdit={handleOpenModal}
            onDuplicate={(f) => handleOpenModal(f, true)}
            onShare={handleOpenShareModal}
            onDelete={handleDelete}
            CURRENCY_SYMBOL={CURRENCY_SYMBOL}
            isViewer={isViewer}
            isAdmin={isAdmin}
            isOwnData={isOwnData}
          />
        ) : viewMode === 'compact' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {sortedFormulations.map(form => {
              const ownUid = user?.uid || user?.ID || user?.id;
              const isOwn = isOwnData(form);
              const isShared = !!(form.CreatedBy && form.CreatedBy !== ownUid);
              const isSharedEdit = Array.isArray(form.SharedWithEdit) && form.SharedWithEdit.includes(ownUid);
              const isSelectedForCompare = selectedForCompare.has(form.ID);

              return (
                <FormulationCompactCard
                  key={form.ID}
                  form={form}
                  isOwn={isOwn}
                  isShared={isShared}
                  isSharedEdit={isSharedEdit}
                  isAdmin={isAdmin}
                  isViewer={isViewer}
                  CURRENCY_SYMBOL={CURRENCY_SYMBOL}
                  isSelectedForCompare={isSelectedForCompare}
                  isHighlighted={highlightFormId === form.ID}
                  onQuickPeek={() => setQuickPeekForm(form)}
                  onToggleCompare={toggleCompareSelection}
                  onViewLinkedTrials={() => setViewingLinkedTrialsForm(form)}
                  onLaunchTrial={() => handleLaunchTrial(form)}
                  onAiOptimize={() => handleAskAIForFormulation(form)}
                  onExportDossier={() => handleExportDossier(form)}
                  onEdit={() => handleOpenModal(form)}
                  onDuplicate={() => handleOpenModal(form, true)}
                  onShare={(e) => handleOpenShareModal(e, form)}
                  onDelete={() => handleDelete(form.ID)}
                />
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sortedFormulations.map(form => {
              const ownUid = user?.uid || user?.ID || user?.id;
              const isOwn = isOwnData(form);
              const isShared = !!(form.CreatedBy && form.CreatedBy !== ownUid);
              const isSharedEdit = Array.isArray(form.SharedWithEdit) && form.SharedWithEdit.includes(ownUid);
              const isSelectedForCompare = selectedForCompare.has(form.ID);

              return (
                <FormulationCard
                  key={form.ID}
                  form={form}
                  isOwn={isOwn}
                  isShared={isShared}
                  isSharedEdit={isSharedEdit}
                  isAdmin={isAdmin}
                  isViewer={isViewer}
                  CURRENCY_SYMBOL={CURRENCY_SYMBOL}
                  isSelectedForCompare={isSelectedForCompare}
                  isHighlighted={highlightFormId === form.ID}
                  onQuickPeek={() => setQuickPeekForm(form)}
                  onToggleCompare={toggleCompareSelection}
                  onViewLinkedTrials={() => setViewingLinkedTrialsForm(form)}
                  onLaunchTrial={() => handleLaunchTrial(form)}
                  onAiOptimize={() => handleAskAIForFormulation(form)}
                  onExportDossier={() => handleExportDossier(form)}
                  onEdit={() => handleOpenModal(form)}
                  onDuplicate={() => handleOpenModal(form, true)}
                  onShare={(e) => handleOpenShareModal(e, form)}
                  onDelete={() => handleDelete(form.ID)}
                />
              );
            })}
          </div>
        )}


        {/* Floating Bottom Comparison Dock */}
        {selectedForCompare.size >= 1 && (
          <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 bg-slate-900/95 backdrop-blur-md text-white px-5 py-3 rounded-2xl shadow-2xl border border-slate-700 flex items-center gap-4 animate-in slide-in-from-bottom-5">
            <div className="flex items-center gap-2">
              <Scale className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-bold tracking-wide">
                {selectedForCompare.size} of 4 Formulations Selected
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsCompareModalOpen(true)}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition shadow-sm flex items-center gap-1.5 active:scale-95"
              >
                <Scale className="w-3.5 h-3.5" /> Compare Side-by-Side
              </button>
              <button
                type="button"
                onClick={() => setSelectedForCompare(new Set())}
                className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
                title="Clear selection"
              >
                Clear
              </button>
            </div>
          </div>
        )}
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingForm && !name.includes('(Copy)') ? 'Edit Formulation' : 'New Formulation'}
        headerActions={
          <button
            type="submit"
            form="formulation-modal-form"
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-xs transition"
            title="Save Formulation"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Save</span>
          </button>
        }
        footer={
          <div className="flex items-center justify-between w-full gap-3">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl font-semibold text-sm transition shadow-2xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="formulation-modal-form"
              className="btn-primary px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 shadow-md hover:shadow-lg transition active:scale-95"
            >
              <Check className="w-4 h-4" />
              <span>{editingForm && !name.includes('(Copy)') ? 'Save Changes' : 'Create Formulation'}</span>
            </button>
          </div>
        }
      >
        <form id="formulation-modal-form" onSubmit={handleSave} className="space-y-6">
          {/* Live Duplicate Warning Banner */}
          {duplicateFormMatch && (
            <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-xl text-amber-900 flex items-start gap-2.5 animate-in fade-in">
              <span className="text-lg shrink-0">⚠️</span>
              <div className="text-xs space-y-1">
                <p className="font-extrabold text-amber-950">
                  DUPLICATE FORMULA DETECTED!
                </p>
                <p className="text-slate-700">
                  This recipe has the exact same ingredients and quantities as existing formula{' '}
                  <strong className="text-slate-900">"{duplicateFormMatch.Name}"</strong>{' '}
                  ({duplicateFormMatch.Code || 'No Code'}).
                </p>
                <p className="text-[11px] text-amber-800 font-semibold">
                  💡 Hint: To avoid redundant, wasteful trials, adjust quantities/actives or launch a new trial under the existing formulation instead.
                </p>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Formulation Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
              placeholder="e.g., Trial Mix A"
            />
          </div>

          {(() => {
            const catConfig = getCategoryConfig(activeCategory);
            return catConfig.formulationFields?.map(field => (
              <div key={field.key}>
                <label className="block text-sm font-semibold text-slate-700 mb-1">{field.label}</label>
                {field.type === 'select' ? (
                  <select
                    value={dynamicFields[field.key] || ''}
                    onChange={e => setDynamicFields(p => ({ ...p, [field.key]: e.target.value }))}
                    className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none bg-white text-sm"
                  >
                    <option value="">-- Choose {field.label} --</option>
                    {field.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                ) : (
                  <input
                    type={field.type}
                    value={dynamicFields[field.key] || ''}
                    onChange={e => setDynamicFields(p => ({ ...p, [field.key]: e.target.value }))}
                    className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
                    placeholder={field.placeholder || ''}
                  />
                )}
              </div>
            ));
          })()}

          <div>
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mb-2.5">
              <div>
                <label className="block text-sm font-bold text-slate-800">Recipe Ingredients</label>
                <span className="text-xs text-slate-500">Specify active components, quantities, and units</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleOpenQuickAddIngredient('', null)}
                  className="text-xs font-bold text-purple-700 hover:text-purple-800 bg-purple-50 hover:bg-purple-100 border border-purple-200/80 px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition"
                  title="Add a new ingredient and its unit price directly into the ingredients library"
                >
                  <Plus className="w-3.5 h-3.5" />
                  + New Ingredient
                </button>
                <button
                  type="button"
                  onClick={handleAddIngredientRow}
                  className="text-xs font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/80 px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Row
                </button>
              </div>
            </div>

            <div className="space-y-3 p-0.5 pr-1">
              {ingredients.map((ing, index) => {
                const cleanName = (ing.name || '').trim();
                const matchedLib = cleanName ? findIngredientInLibrary(cleanName, state.ingredients || []) : null;
                const libCost = matchedLib ? parseIngredientCost(matchedLib) : 0;
                const libUnit = matchedLib ? (matchedLib.Unit || matchedLib.unit || 'L') : '';
                const rawQty = parseFloat(ing.quantity);
                const hasValidQty = !isNaN(rawQty) && rawQty > 0;
                const effectiveUnit = (ing.unit || libUnit || 'ml').trim();
                const qtyInBase = hasValidQty && matchedLib ? convertQuantityToBase(rawQty, effectiveUnit, libUnit) : 0;
                const lineCost = libCost * qtyInBase;

                return (
                  <div key={index} className="bg-slate-50/90 hover:bg-slate-50 p-3 rounded-xl border border-slate-200/90 shadow-2xs space-y-2.5 transition-all">
                    {/* Row 1: Item Identifier + Full-Width Ingredient Name Input + Remove Button */}
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold flex items-center justify-center shrink-0">
                        {index + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <input
                          type="text"
                          list="ingredient-lib-list"
                          required
                          value={ing.name}
                          onChange={e => handleIngredientChange(index, 'name', e.target.value)}
                          className="w-full px-3 py-2 text-sm font-semibold border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none bg-white text-slate-800 placeholder-slate-400 transition"
                          placeholder="Ingredient name (e.g. Glyphosate, Pelargonic acid)"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveIngredientRow(index)}
                        disabled={ingredients.length === 1}
                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg disabled:opacity-20 shrink-0 transition"
                        title="Remove ingredient"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Row 2: Quantity & Unit in a clean responsive grid */}
                    <div className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-5 sm:col-span-4">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Quantity</span>
                        <input
                          type="number"
                          step="any"
                          required
                          value={ing.quantity}
                          onChange={e => handleIngredientChange(index, 'quantity', e.target.value)}
                          className="w-full px-3 py-1.5 text-sm font-mono border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white font-semibold text-slate-800"
                          placeholder="0.00"
                        />
                      </div>
                      <div className="col-span-4 sm:col-span-3">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Unit</span>
                        <input
                          type="text"
                          list="unit-options-list"
                          required
                          value={ing.unit}
                          onChange={e => handleIngredientChange(index, 'unit', e.target.value)}
                          className="w-full px-3 py-1.5 text-sm font-mono border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white font-semibold text-slate-800"
                          placeholder="ml / L"
                        />
                      </div>
                      <div className="col-span-3 sm:col-span-5 self-end pb-0.5">
                        <div className="flex items-center gap-1 flex-wrap">
                          {['ml', 'L', 'gm', 'kg'].map(u => (
                            <button
                              key={u}
                              type="button"
                              onClick={() => handleIngredientChange(index, 'unit', u)}
                              className={`px-1.5 py-1 text-[10px] font-bold rounded border transition leading-none ${
                                (ing.unit || '').toLowerCase() === u.toLowerCase()
                                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                              }`}
                            >
                              {u}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Row 3: Price and Library Status Strip */}
                    <div className="pt-1.5 border-t border-slate-200/60 flex items-center justify-between text-xs px-0.5">
                      {cleanName ? (
                        matchedLib ? (
                          libCost > 0 ? (
                            <div className="flex items-center gap-2 flex-wrap w-full justify-between">
                              <span className="text-emerald-700 font-medium inline-flex items-center gap-1.5 text-xs">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse" />
                                <span>Library: <strong>{CURRENCY_SYMBOL}{libCost.toFixed(2)} / {libUnit.toUpperCase()}</strong></span>
                                {matchedLib.Name && matchedLib.Name.toLowerCase() !== cleanName.toLowerCase() && (
                                  <span className="text-slate-400 text-[10px]">({matchedLib.Name})</span>
                                )}
                              </span>
                              {hasValidQty && (
                                <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full text-xs font-bold border border-emerald-200">
                                  Line Cost: {CURRENCY_SYMBOL}{lineCost.toFixed(2)}
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center justify-between w-full gap-2 flex-wrap">
                              <span className="text-amber-700 font-medium text-xs flex items-center gap-1">
                                <span>⚠️</span> Price missing in library
                              </span>
                              <button
                                type="button"
                                onClick={() => handleOpenQuickAddIngredient(cleanName, index)}
                                className="text-xs text-purple-700 hover:text-purple-800 font-bold bg-purple-50 hover:bg-purple-100 border border-purple-200 px-2 py-1 rounded-lg transition"
                              >
                                + Set Price ({CURRENCY_SYMBOL})
                              </button>
                            </div>
                          )
                        ) : (
                          <div className="flex items-center justify-between w-full gap-2 flex-wrap">
                            <span className="text-amber-700 font-medium text-xs">
                              Not in ingredients library
                            </span>
                            <button
                              type="button"
                              onClick={() => handleOpenQuickAddIngredient(cleanName, index)}
                              className="font-bold text-purple-700 hover:text-purple-800 bg-purple-50 hover:bg-purple-100 border border-purple-200 px-2.5 py-1 rounded-lg text-xs transition inline-flex items-center gap-1"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              Save to Library & Set Price
                            </button>
                          </div>
                        )
                      ) : (
                        <span className="text-slate-400 italic text-[11px]">Type or choose ingredient name from library dropdown</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <datalist id="ingredient-lib-list">
              {state.ingredients.map(i => <option key={i.ID} value={i.Name} />)}
            </datalist>
            <datalist id="unit-options-list">
              <option value="ml" />
              <option value="L" />
              <option value="gm" />
              <option value="kg" />
              <option value="mg" />
            </datalist>
          </div>

          {/* Real-time Estimated Cost Breakdown Strip */}
          {(() => {
            const costDetails = getFormulationCostDetails(ingredients, state.ingredients || []);
            const hasUnpriced = costDetails.unpricedIngredients.length > 0;
            return (
              <div className="space-y-1.5">
                <div className="bg-emerald-50 p-3.5 rounded-xl border border-emerald-200/80 flex justify-between items-center">
                  <div>
                    <span className="text-sm font-bold text-emerald-900 block">Est. Recipe Cost:</span>
                    <span className="text-[11px] text-emerald-700">
                      {costDetails.totalVolumeL > 0 ? (
                        <>Total recipe batch: {costDetails.totalVolumeL >= 1 ? `${costDetails.totalVolumeL.toFixed(3)} L` : `${(costDetails.totalVolumeL * 1000).toFixed(1)} ml`}{costDetails.totalVolumeL !== 1 ? ` • (Rate: ${CURRENCY_SYMBOL}${costDetails.costPerUnit.toFixed(2)} / L)` : ''}</>
                      ) : costDetails.totalWeightKg > 0 ? (
                        <>Total recipe batch: {costDetails.totalWeightKg >= 1 ? `${costDetails.totalWeightKg.toFixed(3)} kg` : `${(costDetails.totalWeightKg * 1000).toFixed(1)} gm`}{costDetails.totalWeightKg !== 1 ? ` • (Rate: ${CURRENCY_SYMBOL}${costDetails.costPerUnit.toFixed(2)} / kg)` : ''}</>
                      ) : (
                        <>Total recipe cost</>
                      )}
                      {' • '}{costDetails.pricedCount} of {costDetails.totalCount} ingredients priced
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="font-extrabold text-emerald-700 text-2xl">
                      {CURRENCY_SYMBOL}{costDetails.totalCost.toFixed(2)}
                    </span>
                  </div>
                </div>

                {hasUnpriced && (
                  <div className="p-2.5 bg-amber-50 border border-amber-200/80 rounded-xl text-xs text-amber-900 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <span className="font-bold">Unpriced ingredients: </span>
                      <span className="text-amber-800">
                        {costDetails.unpricedIngredients.map((u, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => {
                              const rowIndex = ingredients.findIndex(i => (i.name || '').trim().toLowerCase() === u.name.toLowerCase());
                              handleOpenQuickAddIngredient(u.name, rowIndex >= 0 ? rowIndex : null);
                            }}
                            className="inline-flex items-center underline font-semibold text-amber-900 hover:text-amber-700 mr-2"
                            title="Click to add price to library"
                          >
                            {u.name} (+ add price)
                          </button>
                        ))}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Notes (Optional)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
              placeholder="Preparation instructions, mixing order..."
              rows={3}
            />
          </div>

          <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl font-medium text-sm transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary px-6 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 shadow-md active:scale-95"
            >
              <Check className="w-4 h-4" />
              <span>{editingForm && !name.includes('(Copy)') ? 'Save Changes' : 'Save Formulation'}</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* Quick Add Ingredient to Library Modal */}
      <Modal
        isOpen={isQuickAddIngOpen}
        onClose={() => setIsQuickAddIngOpen(false)}
        title="Add New Ingredient to Library"
        footer={
          <div className="flex items-center justify-between w-full gap-2">
            <button
              type="button"
              onClick={() => setIsQuickAddIngOpen(false)}
              className="px-4 py-2 text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-sm font-medium transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="quick-add-ingredient-form"
              disabled={isSavingQuickIng}
              className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-bold shadow-xs transition active:scale-95 disabled:opacity-50 flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              {isSavingQuickIng ? 'Saving to Library...' : 'Save & Link to Recipe'}
            </button>
          </div>
        }
      >
        <form id="quick-add-ingredient-form" onSubmit={handleSaveQuickIngredient} className="space-y-4">
          <div className="p-3 bg-purple-50/70 border border-purple-200/80 rounded-xl text-xs text-purple-900 leading-relaxed">
            ✨ <strong>Quick Ingredient Creator:</strong> This ingredient and its unit price will be permanently saved to your <strong>{activeCategory}</strong> library and will automatically calculate recipe costs for all formulations.
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Ingredient Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={quickIngName}
              onChange={e => setQuickIngName(e.target.value)}
              className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none text-sm bg-white"
              placeholder="e.g. Acetic acid, Capric Acid, Citronella oil"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Unit Price ({CURRENCY_SYMBOL}) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="any"
                min="0"
                required
                value={quickIngCost}
                onChange={e => setQuickIngCost(e.target.value)}
                className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none text-sm bg-white font-mono"
                placeholder="e.g. 825.00"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Base Unit <span className="text-red-500">*</span>
              </label>
              <select
                value={quickIngUnit}
                onChange={e => setQuickIngUnit(e.target.value)}
                className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none bg-white text-sm"
              >
                <option value="L">L (Per Litre)</option>
                <option value="kg">kg (Per Kilogram)</option>
                <option value="ml">ml (Per Millilitre)</option>
                <option value="gm">gm (Per Gram)</option>
              </select>
            </div>
          </div>

          <div className="pt-3 flex justify-end gap-2 border-t">
            <button
              type="button"
              onClick={() => setIsQuickAddIngOpen(false)}
              className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl text-sm font-medium transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSavingQuickIng}
              className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-bold shadow-xs transition active:scale-95 disabled:opacity-50 flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              {isSavingQuickIng ? 'Saving to Library...' : 'Save & Link to Recipe'}
            </button>
          </div>
        </form>
      </Modal>

      <AppSharingModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        initialSharedWith={sharingFormulation?.SharedWith || []}
        initialSharedWithEdit={sharingFormulation?.SharedWithEdit || []}
        onSave={handleSaveSharing}
      />

      {viewingLinkedTrialsForm && (
        <LinkedTrialsModal
          isOpen={!!viewingLinkedTrialsForm}
          onClose={() => setViewingLinkedTrialsForm(null)}
          formulation={viewingLinkedTrialsForm}
          allTrials={state.trials}
          allProjects={state.projects}
          allIngredients={state.ingredients}
          activeCategory={activeCategory}
        />
      )}

      {/* Head-to-Head Formulation Benchmark Comparison Modal */}
      <FormulationComparisonModal
        isOpen={isCompareModalOpen}
        onClose={() => setIsCompareModalOpen(false)}
        formulations={formulationsToCompare}
        allTrials={state.trials}
        allProjects={state.projects}
        ingredientsList={state.ingredients}
        activeCategory={activeCategory}
        onLaunchTrial={handleLaunchTrial}
      />

      {/* In-Tab AI Recipe Generator Wizard Modal */}
      <AiFormulaGeneratorModal
        isOpen={isGeneratorModalOpen}
        onClose={() => setIsGeneratorModalOpen(false)}
        activeCategory={activeCategory}
        libraryIngredients={state.ingredients}
        allTrials={state.trials}
      />

      {/* Exact Formula Quick-Peek Modal */}
      <FormulationQuickPeekModal
        isOpen={!!quickPeekForm}
        onClose={() => setQuickPeekForm(null)}
        formulation={quickPeekForm}
        allTrials={state.trials}
        ingredientsList={state.ingredients}
        activeCategory={activeCategory}
        onApplyTrialFilter={(name) => navigate('/trials', { state: { searchFilter: name } })}
        onEdit={(f) => {
          setQuickPeekForm(null);
          handleOpenModal(f);
        }}
      />
    </div>
  );
}
