import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppState } from '../hooks/useAppState.jsx';
import { useAuth } from '../hooks/useAuth.js';
import TopBar from '../components/TopBar.jsx';
import Modal from '../components/Modal.jsx';
import { addFormulation, deleteFormulation, updateFormulation, validateCategoryDataOperation } from '../services/dataLayer.js';
import { safeJsonParse } from '../utils/helpers.js';
import { getCategoryConfig } from '../utils/categoryConfig.js';
import { calculateFormulationCost } from '../utils/costUtils.js';
import { 
  Plus, X, Share2, Edit, Trash2, Copy, Sparkles, Layers, 
  ArrowUpDown, Scale, FileDown, Rocket, Wand2, MoreVertical, 
  ChevronDown, Check 
} from 'lucide-react';
import AppSharingModal from '../components/AppSharingModal.jsx';
import LinkedTrialsModal from '../components/LinkedTrialsModal.jsx';
import FormulationComparisonModal from '../components/FormulationComparisonModal.jsx';
import AiFormulaGeneratorModal from '../components/AiFormulaGeneratorModal.jsx';
import { exportFormulationDossier } from '../services/formulationDossier.js';
import { 
  getFormulationTrialStats, 
  getEfficacyRatingBadge 
} from '../utils/formulationTrialUtils.js';

function FormulationCard({
  form,
  isOwn,
  isShared,
  isSharedEdit,
  isAdmin,
  isViewer,
  CURRENCY_SYMBOL,
  isSelectedForCompare,
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

  return (
    <div
      className={`bg-white rounded-2xl p-5 border transition-all duration-200 flex flex-col justify-between ${
        isSelectedForCompare
          ? 'border-indigo-400 ring-2 ring-indigo-500/20 shadow-md bg-indigo-50/10'
          : 'border-slate-200/90 hover:border-emerald-400/80 hover:shadow-lg shadow-2xs'
      }`}
    >
      <div>
        {/* Header: Title, Code, Badges, Compare Button & 3-dot Menu */}
        <div className="flex justify-between items-start gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h3 className="font-bold text-base text-slate-900 break-words leading-tight">
                {form.Name}
              </h3>
              {form.Code && (
                <span className="font-mono text-[11px] font-bold px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded border border-slate-200/60">
                  {form.Code}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              {/* Efficacy / Kill Rate Badge */}
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-bold border inline-flex items-center gap-1 ${ratingBadge.colorClass}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${ratingBadge.dotColor}`} />
                {ratingBadge.label}
              </span>

              {/* Control Duration Badge */}
              {stats?.avgCtrlDays !== null && stats?.avgCtrlDays > 0 && (
                <span
                  className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-50 text-amber-700 border border-amber-200/80 inline-flex items-center gap-0.5 shadow-2xs"
                  title={`Average sustained control duration: ${stats.avgCtrlDays} days`}
                >
                  ⏳ {stats.avgCtrlDays}d Control
                </span>
              )}

              {/* Weed Spectrum Badge */}
              {stats?.targetCount > 1 && (
                <span
                  className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-teal-50 text-teal-700 border border-teal-200/80 inline-flex items-center gap-0.5 shadow-2xs"
                  title={`Demonstrated control on ${stats.targetCount} weed species`}
                >
                  🌿 {stats.targetCount} Weeds
                </span>
              )}

              {isShared && (
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-indigo-50 text-indigo-700 border border-indigo-100 flex items-center gap-0.5">
                  <Share2 className="w-2.5 h-2.5" /> Shared{isSharedEdit ? ' (Edit)' : ''}
                </span>
              )}

              {!isShared && Array.isArray(form.SharedWith) && form.SharedWith.length > 0 && (
                <span
                  className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-teal-50 text-teal-700 border border-teal-100 flex items-center gap-0.5"
                  title={`Shared with ${form.SharedWith.length} user(s)`}
                >
                  <Share2 className="w-2.5 h-2.5" /> Shared ({form.SharedWith.length})
                </span>
              )}
            </div>
          </div>

          {/* Top Right: Compare Pill & Clean 3-dot Menu */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => onToggleCompare(form.ID)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                isSelectedForCompare
                  ? 'bg-indigo-600 text-white shadow-xs hover:bg-indigo-700 font-bold'
                  : 'text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 border border-slate-200/80 hover:border-indigo-200'
              }`}
              title={isSelectedForCompare ? 'Selected for benchmark comparison' : 'Compare with other formulations'}
            >
              {isSelectedForCompare ? (
                <>
                  <Check className="w-3.5 h-3.5" /> Selected
                </>
              ) : (
                <>
                  <Scale className="w-3.5 h-3.5 text-slate-400" /> Compare
                </>
              )}
            </button>

            {/* 3-Dot Actions Menu */}
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
                <div className="absolute right-0 top-8 z-50 bg-white rounded-xl shadow-xl border border-slate-200/90 py-1 min-w-[200px] text-xs animate-in fade-in zoom-in-95">
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

        {/* Ingredients Showcase - Clean List without Scroll Trap */}
        <div className="mt-3">
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Ingredients ({ings.length})
            </span>
            {ings.length > 3 && (
              <button
                type="button"
                onClick={() => setIsExpanded(!isExpanded)}
                className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-0.5"
              >
                {isExpanded ? 'Show less' : `+${ings.length - 3} more`}
                <ChevronDown className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
              </button>
            )}
          </div>

          <div className="space-y-1.5">
            {visibleIngs.map((ing, i) => (
              <div
                key={i}
                className="flex justify-between items-center bg-slate-50/90 hover:bg-slate-100/80 px-2.5 py-1.5 rounded-lg border border-slate-100 text-xs transition"
              >
                <span className="font-medium text-slate-700 truncate mr-2">{ing.name || 'Unnamed Ingredient'}</span>
                <span className="text-slate-700 font-bold bg-white px-2 py-0.5 rounded border border-slate-200/70 font-mono text-[11px] shrink-0 shadow-2xs">
                  {ing.quantity} {ing.unit}
                </span>
              </div>
            ))}
          </div>

          {/* Dynamic Fields (if any) */}
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
            <div className="mt-2.5 bg-slate-50/60 p-2 rounded-lg border border-slate-100 text-xs">
              <p className="italic text-slate-500 line-clamp-2">{form.Notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* Card Bottom: Clean Metrics + 2 Primary Action Buttons */}
      <div className="mt-4 pt-3.5 border-t border-slate-100 space-y-3">
        {/* KPI Strip: Kill Rate, Control Longevity, Recipe Cost, Field Plots */}
        <div className="grid grid-cols-2 gap-2.5 bg-slate-50/70 p-2.5 rounded-xl border border-slate-100 text-xs">
          <div>
            <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">
              Kill Rate
            </span>
            <p className="font-extrabold text-xs text-slate-800 leading-tight mt-0.5">
              {stats?.avgEfficacy !== null ? `${stats.avgEfficacy}% Complete Kill` : 'Untested'}
            </p>
          </div>

          <div className="text-right">
            <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">
              Control Longevity
            </span>
            <p className="font-bold text-xs text-amber-700 leading-tight mt-0.5">
              {stats?.avgCtrlDays !== null ? `${stats.avgCtrlDays} Days Sustained` : (stats?.total > 0 ? 'Fast Burndown' : 'No data')}
            </p>
          </div>

          <div className="pt-1.5 border-t border-slate-200/60">
            <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">
              Est. Recipe Cost
            </span>
            <p className="font-extrabold text-xs text-emerald-700 leading-tight mt-0.5">
              {CURRENCY_SYMBOL}{form._costVal.toFixed(2)}{' '}
              <span className="text-[9px] text-slate-400 font-normal">/ L</span>
            </p>
          </div>

          <div className="text-right pt-1.5 border-t border-slate-200/60">
            <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">
              Field Trials
            </span>
            <p className="font-bold text-xs text-slate-700 leading-tight mt-0.5">
              {stats?.total > 0 ? (
                <span>
                  {stats.microplotCount} Plot{stats.fieldCount > 0 ? ` • ${stats.fieldCount} Field` : ''}
                </span>
              ) : (
                <span className="text-slate-400 font-normal">No trials yet</span>
              )}
            </p>
          </div>
        </div>

        {/* Action Buttons: ONLY TWO Prominent Actions */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onViewLinkedTrials(form)}
            className={`py-2 px-3 rounded-xl font-bold text-xs border transition flex items-center justify-center gap-1.5 active:scale-95 shadow-2xs ${
              stats?.total > 0
                ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-emerald-600" />
            Linked Trials ({stats?.total || 0})
          </button>

          <button
            type="button"
            onClick={() => onLaunchTrial(form)}
            className="py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition flex items-center justify-center gap-1.5 active:scale-95 shadow-xs"
            title="Launch new trial with this formulation"
          >
            <Rocket className="w-3.5 h-3.5" />
            Launch Trial
          </button>
        </div>
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

  // Form State
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [ingredients, setIngredients] = useState([{ name: '', quantity: '', unit: 'ml' }]);
  const [dynamicFields, setDynamicFields] = useState({});

  const CURRENCY_SYMBOL = '₹';

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

    // Auto-fill unit if ingredient is selected from list
    if (field === 'name') {
      const selectedLibIng = state.ingredients.find(i => i.Name === value);
      if (selectedLibIng) {
        const baseUnit = String(selectedLibIng.Unit || '').toLowerCase().trim();
        if (baseUnit === 'l' || baseUnit === 'litre' || baseUnit === 'litres' || baseUnit === 'liter' || baseUnit === 'liters' || baseUnit === 'ml' || baseUnit === 'millilitre' || baseUnit === 'millilitres') {
          newIngs[index].unit = 'ml';
        } else if (baseUnit === 'kg' || baseUnit === 'kilogram' || baseUnit === 'kilograms' || baseUnit === 'g' || baseUnit === 'gm' || baseUnit === 'gram' || baseUnit === 'grams') {
          newIngs[index].unit = 'gm';
        } else {
          newIngs[index].unit = selectedLibIng.Unit || '';
        }
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

    // Category validation before saving
    try {
      const operation = editingFormulation ? 'updateFormulation' : 'addFormulation';
      await validateCategoryDataOperation(operation, payload, getAppState);
    } catch (validationError) {
      if (validationError.validationError) {
        const { showCategoryValidationToast } = await import('../components/CategoryValidationAlert.jsx');
        showCategoryValidationToast(validationError);
        return; // Stop the save operation
      }
      console.warn('Validation check failed:', validationError);
    }

    try {
      await addFormulation(payload, getAppState);
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Formulation saved', type: 'success' } }));
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

  // Pre-calculate trial performance metrics for each formulation
  const formulationsWithStats = useMemo(() => {
    const rawForms = (state.formulations || []).filter(
      f => f.Category === activeCategory || (!f.Category && activeCategory === 'herbicide')
    );

    return rawForms.map(form => {
      const stats = getFormulationTrialStats(form, state.trials, state.projects, activeCategory);
      const parsedIngs = safeJsonParse(form.IngredientsJSON, []);
      const realCost = calculateFormulationCost(parsedIngs, state.ingredients || []);
      const costVal = realCost > 0 ? realCost : parseFloat(form.EstimatedCost || 0);

      return {
        ...form,
        _stats: stats,
        _trialsCount: stats.total,
        _stdCount: stats.microplotCount,
        _largeCount: stats.fieldCount,
        _avgScore: stats.avgEfficacy,
        _costVal: costVal,
        _parsedIngs: parsedIngs,
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
        <div className="flex flex-col sm:flex-row justify-between items-center gap-3">
          <div className="flex-grow w-full sm:w-auto flex items-center gap-2">
            <input
              type="search"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search formulations by name..."
              className="w-full form-input px-4 py-2 border rounded-xl bg-white shadow-sm text-sm"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap">
            <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 shadow-sm text-xs font-semibold text-slate-700">
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
                className="bg-transparent font-semibold outline-none cursor-pointer text-slate-800"
              >
                <option value="best">Sort: Best (Long Control & High Kill) 🏆</option>
                <option value="control-days">Sort: Longest Control Days ⏳</option>
                <option value="efficacy">Sort: Highest Kill Rate ⚡</option>
                <option value="spectrum">Sort: Broadest Weed Spectrum 🌿</option>
                <option value="trials">Sort: Most Field Tested 🔬</option>
                <option value="cost">Sort: Lowest Cost 💰</option>
                <option value="newest">Sort: Newest First 📅</option>
              </select>
            </div>

            {selectedForCompare.size > 0 && (
              <button
                onClick={() => setIsCompareModalOpen(true)}
                className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-md flex items-center gap-1.5 text-xs font-bold shrink-0 transition active:scale-95"
              >
                <Scale className="w-3.5 h-3.5" /> Compare ({selectedForCompare.size})
              </button>
            )}

            {!isViewer && (
              <button
                onClick={() => setIsGeneratorModalOpen(true)}
                className="px-3 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-md flex items-center gap-1.5 text-xs font-bold shrink-0 transition active:scale-95"
              >
                <Wand2 className="w-3.5 h-3.5" /> AI Recipe Generator
              </button>
            )}

            {!isViewer && (
              <button
                onClick={() => handleOpenModal()}
                className="btn-primary px-3.5 py-2 rounded-xl shadow-md flex items-center gap-1.5 text-xs font-bold shrink-0"
              >
                <Plus className="w-4 h-4" /> New Formula
              </button>
            )}
          </div>
        </div>

        {/* Quick Agronomic Performance Filter Chips */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
          <button
            type="button"
            onClick={() => setPerformanceFilter('all')}
            className={`px-3 py-1.5 rounded-xl font-semibold transition shrink-0 shadow-2xs ${
              performanceFilter === 'all'
                ? 'bg-slate-900 text-white'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            All Formulas ({formulationsWithStats.length})
          </button>
          <button
            type="button"
            onClick={() => setPerformanceFilter('high-kill')}
            className={`px-3 py-1.5 rounded-xl font-semibold transition shrink-0 flex items-center gap-1 shadow-2xs ${
              performanceFilter === 'high-kill'
                ? 'bg-emerald-600 text-white'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700'
            }`}
          >
            ⚡ High Kill Rate (90%+)
          </button>
          <button
            type="button"
            onClick={() => setPerformanceFilter('long-control')}
            className={`px-3 py-1.5 rounded-xl font-semibold transition shrink-0 flex items-center gap-1 shadow-2xs ${
              performanceFilter === 'long-control'
                ? 'bg-amber-600 text-white'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-amber-50 hover:text-amber-700'
            }`}
          >
            ⏳ Long Residual (10d+ Control)
          </button>
          <button
            type="button"
            onClick={() => setPerformanceFilter('broad-spectrum')}
            className={`px-3 py-1.5 rounded-xl font-semibold transition shrink-0 flex items-center gap-1 shadow-2xs ${
              performanceFilter === 'broad-spectrum'
                ? 'bg-teal-600 text-white'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-teal-50 hover:text-teal-700'
            }`}
          >
            🌿 Broad Spectrum (2+ Weeds)
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sortedFormulations.length > 0 ? (
            sortedFormulations.map(form => {
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
                  onToggleCompare={toggleCompareSelection}
                  onViewLinkedTrials={setViewingLinkedTrialsForm}
                  onLaunchTrial={handleLaunchTrial}
                  onAiOptimize={handleAskAIForFormulation}
                  onExportDossier={handleExportDossier}
                  onEdit={handleOpenModal}
                  onDuplicate={(f) => handleOpenModal(f, true)}
                  onShare={handleOpenShareModal}
                  onDelete={handleDelete}
                />
              );
            })
          ) : (
            <div className="col-span-full p-12 text-center text-slate-500 bg-white rounded-2xl shadow-xs border border-slate-200">
              <p className="text-sm font-semibold text-slate-700">
                {searchTerm ? `No formulations matching "${searchTerm}".` : 'No formulations found in this category.'}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Create a new formulation or use the AI Recipe Wizard to generate one.
              </p>
            </div>
          )}
        </div>

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
      >
        <form onSubmit={handleSave} className="space-y-6">
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
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-semibold text-slate-700">Ingredients</label>
              <button
                type="button"
                onClick={handleAddIngredientRow}
                className="text-xs font-bold text-emerald-600 hover:text-emerald-700 bg-emerald-50 px-2 py-1 rounded"
              >
                + Add Row
              </button>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto p-1">
              {ingredients.map((ing, index) => (
                <div key={index} className="flex gap-2 items-center bg-slate-50 p-2 rounded-lg border">
                  <div className="flex-1">
                    <input
                      type="text"
                      list="ingredient-lib-list"
                      required
                      value={ing.name}
                      onChange={e => handleIngredientChange(index, 'name', e.target.value)}
                      className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
                      placeholder="Ingredient name"
                    />
                  </div>
                  <div className="w-24">
                    <input
                      type="number"
                      step="0.001"
                      required
                      value={ing.quantity}
                      onChange={e => handleIngredientChange(index, 'quantity', e.target.value)}
                      className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
                      placeholder="Qty"
                    />
                  </div>
                  <div className="w-20">
                    <input
                      type="text"
                      required
                      value={ing.unit}
                      onChange={e => handleIngredientChange(index, 'unit', e.target.value)}
                      className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
                      placeholder="Unit"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveIngredientRow(index)}
                    disabled={ingredients.length === 1}
                    className="p-1 text-slate-400 hover:text-red-500 disabled:opacity-30"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <datalist id="ingredient-lib-list">
              {state.ingredients.map(i => <option key={i.ID} value={i.Name} />)}
            </datalist>
          </div>

          <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-100 flex justify-between items-center">
            <span className="text-sm font-semibold text-emerald-800">Estimated Total Cost:</span>
            <span className="font-bold text-emerald-700 text-lg">{CURRENCY_SYMBOL}{calculateEstimatedCost().toFixed(2)}</span>
          </div>

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

          <div className="pt-4 flex justify-end gap-3 border-t">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary px-6 py-2 rounded-xl"
            >
              Save Formulation
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
    </div>
  );
}
