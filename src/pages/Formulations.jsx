import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppState } from '../hooks/useAppState.jsx';
import { useAuth } from '../hooks/useAuth.js';
import TopBar from '../components/TopBar.jsx';
import Modal from '../components/Modal.jsx';
import { addFormulation, deleteFormulation, updateFormulation, validateCategoryDataOperation } from '../services/dataLayer.js';
import { safeJsonParse } from '../utils/helpers.js';
import { getCategoryConfig } from '../utils/categoryConfig.js';
import { calculateFormulationCost } from '../utils/costUtils.js';
import { Plus, X, Share2, Edit, Trash2, Copy, Sparkles, Layers, ArrowUpDown, Award, Scale, FileDown, Rocket, Wand2, CheckSquare, Square } from 'lucide-react';
import AppSharingModal from '../components/AppSharingModal.jsx';
import LinkedTrialsModal from '../components/LinkedTrialsModal.jsx';
import FormulationComparisonModal from '../components/FormulationComparisonModal.jsx';
import AiFormulaGeneratorModal from '../components/AiFormulaGeneratorModal.jsx';
import { exportFormulationDossier } from '../services/formulationDossier.js';

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
  const [sortBy, setSortBy] = useState('newest'); // 'newest' | 'efficacy' | 'trials' | 'cost'
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
    exportFormulationDossier(form, state.trials, state.ingredients, state.activeCategory || 'herbicide');
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

  const RESULT_SCORES = { Excellent: 4, Good: 3, Fair: 2, Poor: 1 };

  // Pre-calculate trial performance metrics for each formulation
  const formulationsWithStats = useMemo(() => {
    const rawForms = (state.formulations || []).filter(
      f => f.Category === activeCategory || (!f.Category && activeCategory === 'herbicide')
    );

    const projectMap = new Map();
    (state.projects || []).forEach(p => projectMap.set(String(p.ID), p));

    return rawForms.map(form => {
      const formTrials = (state.trials || []).filter(
        t => (t.Category === activeCategory || (!t.Category && activeCategory === 'herbicide')) &&
             (t.FormulationID === form.ID || String(t.FormulationName || '').trim().toLowerCase() === String(form.Name || '').trim().toLowerCase())
      );

      let stdCount = 0;
      let largeCount = 0;
      formTrials.forEach(t => {
        const proj = projectMap.get(String(t.ProjectID));
        if (proj && proj.Design === 'LargeScale') {
          largeCount++;
        } else {
          stdCount++;
        }
      });

      const ratedTrials = formTrials.filter(t => RESULT_SCORES[t.Result]);
      const avgScore = ratedTrials.length
        ? ratedTrials.reduce((s, t) => s + RESULT_SCORES[t.Result], 0) / ratedTrials.length
        : null;

      const realCost = calculateFormulationCost(form, state.ingredients || []);
      const costVal = realCost > 0 ? realCost : parseFloat(form.EstimatedCost || 0);

      return {
        ...form,
        _trialsCount: formTrials.length,
        _stdCount: stdCount,
        _largeCount: largeCount,
        _avgScore: avgScore,
        _costVal: costVal,
      };
    });
  }, [state.formulations, state.trials, state.projects, state.ingredients, activeCategory]);

  const sortedFormulations = useMemo(() => {
    let list = formulationsWithStats.filter(
      f => !searchTerm || f.Name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    list.sort((a, b) => {
      if (sortBy === 'efficacy') {
        const scoreA = a._avgScore ?? -1;
        const scoreB = b._avgScore ?? -1;
        if (scoreB !== scoreA) return scoreB - scoreA;
        return (b._trialsCount || 0) - (a._trialsCount || 0);
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
  }, [formulationsWithStats, searchTerm, sortBy]);

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
                <option value="newest">Sort: Newest First</option>
                <option value="efficacy">Sort: Highest Efficacy ⭐</option>
                <option value="trials">Sort: Most Tested 🔬</option>
                <option value="cost">Sort: Cost (Low to High) ₹</option>
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

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sortedFormulations.length > 0 ? (
            sortedFormulations.map(form => {
              const ings = safeJsonParse(form.IngredientsJSON, []);
              const formTrials = (state.trials || []).filter(t => t.FormulationID === form.ID || t.FormulationName === form.Name);
              const trialsCount = formTrials.length;
              const RESULT_SCORES = { Excellent: 4, Good: 3, Fair: 2, Poor: 1 };
              const ratedTrials = formTrials.filter(t => RESULT_SCORES[t.Result]);
              const avgScore = ratedTrials.length ? ratedTrials.reduce((s, t) => s + RESULT_SCORES[t.Result], 0) / ratedTrials.length : null;
              const avgLabel = avgScore !== null ? (avgScore >= 3.5 ? 'Excellent' : avgScore >= 2.5 ? 'Good' : avgScore >= 1.5 ? 'Fair' : 'Poor') : null;
              const avgLabelColor = { Excellent: 'bg-emerald-100 text-emerald-700', Good: 'bg-blue-100 text-blue-700', Fair: 'bg-amber-100 text-amber-700', Poor: 'bg-red-100 text-red-700' };
              const ownUid = user?.uid || user?.ID || user?.id;
              const isOwn = isOwnData(form);
              const isShared = !!(form.CreatedBy && form.CreatedBy !== ownUid);
              const isSharedEdit = Array.isArray(form.SharedWithEdit) && form.SharedWithEdit.includes(ownUid);
              return (
                <div key={form.ID} className="cv-auto bg-white p-6 rounded-xl shadow-lg relative transition-all duration-300 hover:shadow-xl hover:-translate-y-1 border border-transparent hover:border-emerald-500/50 flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-start gap-3 mb-3">
                      <div className="flex items-start gap-2 flex-1 min-w-0">
                        <button
                          type="button"
                          onClick={() => toggleCompareSelection(form.ID)}
                          title={selectedForCompare.has(form.ID) ? "Unselect from comparison" : "Select for benchmark comparison"}
                          className={`p-1 rounded-md transition mt-0.5 shrink-0 ${selectedForCompare.has(form.ID) ? 'text-indigo-600 bg-indigo-50 ring-1 ring-indigo-400' : 'text-slate-300 hover:text-slate-500 hover:bg-slate-50'}`}
                        >
                          {selectedForCompare.has(form.ID) ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-base text-slate-800 break-words leading-tight">{form.Name}</h3>
                          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                            {form.Code && (
                              <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">
                                {form.Code}
                              </span>
                            )}
                            {isShared && (
                              <span className="text-[9px] px-2 py-0.5 rounded-full font-bold bg-indigo-50 text-indigo-700 border border-indigo-100 flex items-center gap-0.5">
                                <Share2 className="w-2.5 h-2.5 animate-pulse" /> Shared{isSharedEdit ? ' (Edit)' : ''}
                              </span>
                            )}
                            {!isShared && Array.isArray(form.SharedWith) && form.SharedWith.length > 0 && (
                              <span className="text-[9px] px-2 py-0.5 rounded-full font-bold bg-teal-50 text-teal-700 border border-teal-100 flex items-center gap-0.5" title={`Shared with ${form.SharedWith.length} user(s)`}>
                                <Share2 className="w-2.5 h-2.5" /> Shared ({form.SharedWith.length})
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {!isViewer && (isOwn || isSharedEdit) && (
                        <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-lg border border-slate-100 flex-shrink-0">
                          {isAdmin && (
                            <button 
                              onClick={(e) => handleOpenShareModal(e, form)} 
                              className="p-1.5 text-indigo-600 hover:bg-indigo-100 rounded transition" 
                              title="Share Formulation"
                            >
                              <Share2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {isOwn && (
                            <button 
                              onClick={() => handleOpenModal(form, true)} 
                              className="p-1.5 text-slate-600 hover:bg-slate-200 rounded transition" 
                              title="Duplicate Formulation"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button 
                            onClick={() => handleOpenModal(form)} 
                            className="p-1.5 text-emerald-600 hover:bg-emerald-100 rounded transition" 
                            title="Edit"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          {isOwn && (
                            <button 
                              onClick={() => handleDelete(form.ID)} 
                              className="p-1.5 text-red-500 hover:bg-red-100 rounded transition" 
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="mt-3 text-sm text-slate-600">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Ingredients</p>
                      <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                        {ings.map((ing, i) => (
                          <div key={i} className="flex justify-between items-center bg-slate-50/80 px-2.5 py-1.5 rounded-lg border border-slate-100 text-xs">
                            <span className="font-semibold text-slate-700 truncate mr-2">{ing.name}</span>
                            <span className="text-slate-600 font-semibold bg-white px-2 py-0.5 rounded border border-slate-200/60 font-mono flex-shrink-0">
                              {ing.quantity} {ing.unit}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Category-specific formulation fields */}
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
                        <div className="mt-3 bg-slate-50/40 p-2.5 rounded-lg border border-slate-100 text-xs">
                          <strong className="text-slate-600 block mb-0.5 text-[10px] uppercase tracking-wider">Notes</strong>
                          <p className="italic leading-relaxed text-slate-500 break-words">{form.Notes}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
                    <div className="flex justify-between items-center gap-2 flex-wrap">
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">Estimated Cost</span>
                        <p className="font-black text-base text-emerald-600 leading-none mt-1">
                          {CURRENCY_SYMBOL}{form._costVal.toFixed(2)}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap">
                        {form._trialsCount > 0 ? (
                          <span className="text-[11px] bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded-full font-bold border border-slate-200">
                            {form._stdCount} Std{form._largeCount > 0 ? ` • ${form._largeCount} Field` : ''}
                          </span>
                        ) : (
                          <span className="text-[10px] bg-slate-50 text-slate-400 px-2 py-0.5 rounded-full font-medium border border-slate-100">
                            Untested
                          </span>
                        )}

                        {avgLabel && (
                          <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold border ${avgLabelColor[avgLabel]}`}>
                            {avgLabel}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Action Row 1: Linked Trials & AI Optimize */}
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        onClick={() => setViewingLinkedTrialsForm(form)}
                        className="py-2 px-2.5 rounded-xl bg-slate-100 hover:bg-emerald-50 hover:text-emerald-800 text-slate-700 font-bold text-xs border border-slate-200 transition flex items-center justify-center gap-1.5 shadow-2xs active:scale-95"
                      >
                        <Layers className="w-3.5 h-3.5 text-emerald-600" /> Linked Trials ({form._trialsCount})
                      </button>

                      <button
                        onClick={() => handleAskAIForFormulation(form)}
                        className="py-2 px-2.5 rounded-xl bg-violet-50 hover:bg-violet-100 text-violet-700 font-bold text-xs border border-violet-200 transition flex items-center justify-center gap-1 shadow-2xs active:scale-95"
                        title="Ask AI to optimize or benchmark this formulation"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-violet-600" /> AI Optimize
                      </button>
                    </div>

                    {/* Action Row 2: Launch Trial, Compare, Dossier */}
                    <div className="grid grid-cols-3 gap-1.5 pt-0.5">
                      <button
                        onClick={() => handleLaunchTrial(form)}
                        className="py-1.5 px-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] transition flex items-center justify-center gap-1 shadow-2xs active:scale-95"
                        title="Launch new trial using this formulation"
                      >
                        <Rocket className="w-3 h-3" /> Launch Trial
                      </button>

                      <button
                        onClick={() => {
                          toggleCompareSelection(form.ID);
                          if (!selectedForCompare.has(form.ID) && selectedForCompare.size >= 1) {
                            setIsCompareModalOpen(true);
                          }
                        }}
                        className={`py-1.5 px-2 rounded-lg font-bold text-[11px] border transition flex items-center justify-center gap-1 shadow-2xs active:scale-95 ${
                          selectedForCompare.has(form.ID)
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                        }`}
                        title="Benchmark against other formulations"
                      >
                        <Scale className="w-3 h-3 text-indigo-500" /> Compare
                      </button>

                      <button
                        onClick={() => handleExportDossier(form)}
                        className="py-1.5 px-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] border border-slate-200 transition flex items-center justify-center gap-1 shadow-2xs active:scale-95"
                        title="Export Printable Agronomic Dossier"
                      >
                        <FileDown className="w-3 h-3 text-slate-600" /> Dossier
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="col-span-full p-12 text-center text-slate-500 bg-white rounded-xl shadow-md">
              {searchTerm ? `No formulations matching "${searchTerm}".` : 'No formulations found. Create your first mixture.'}
            </div>
          )}
        </div>

        {/* Floating Bottom Comparison Dock */}
        {selectedForCompare.size >= 2 && (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-slate-900/95 backdrop-blur-md text-white px-5 py-3 rounded-2xl shadow-2xl border border-slate-700 flex items-center gap-4 animate-slide-up">
            <div className="flex items-center gap-2">
              <Scale className="w-5 h-5 text-emerald-400" />
              <span className="text-xs font-bold">
                {selectedForCompare.size} formulations selected for benchmark
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsCompareModalOpen(true)}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition shadow-sm"
              >
                Compare Now ⚖️
              </button>
              <button
                onClick={() => setSelectedForCompare(new Set())}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white transition"
                title="Clear selection"
              >
                <X className="w-4 h-4" />
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
