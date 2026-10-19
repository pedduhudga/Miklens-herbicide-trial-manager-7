import React, { useState } from 'react';
import { useAppState } from '../hooks/useAppState.jsx';
import { useAuth } from '../hooks/useAuth.js';
import TopBar from '../components/TopBar.jsx';
import Modal from '../components/Modal.jsx';
import { addIngredient, deleteIngredient } from '../services/dataLayer.js';
import { hasAccess } from '../utils/categoryConfig.js';
import { identifyMoA } from '../utils/agrochemicalMoaDatabase.js';
import { Edit, Trash2, Plus, Search, ChevronDown, ChevronUp, FlaskConical, Share2, ShieldCheck, X, Sparkles, AlertCircle, Leaf } from 'lucide-react';

export default function Ingredients({ onMenuClick }) {
  const { state, updateState, getAppState } = useAppState();
  const { isViewer: authIsViewer, user, isAdmin } = useAuth();

  const activeCategory = state.activeCategory || 'herbicide';
  // Any scientist or user with active category or herbicide write access can add and edit ingredients
  const hasCategoryWrite = isAdmin || hasAccess(user, activeCategory, 'write') || hasAccess(user, 'herbicide', 'write');
  const hasCategoryRead = isAdmin || hasAccess(user, activeCategory, 'read') || hasAccess(user, 'herbicide', 'read');
  const isViewer = !hasCategoryWrite;

  const canEditIngredient = (record) => {
    if (isAdmin) return true;
    if (hasCategoryWrite) return true;
    if (!record) return false;
    const ownUid = user?.uid || user?.ID || user?.id;
    return !record.CreatedBy || record.CreatedBy === ownUid;
  };
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingIngredient, setEditingIngredient] = useState(null);
  const [expandedIngId, setExpandedIngId] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [formData, setFormData] = useState({
    Name: '',
    Cost: '',
    Unit: '',
    PubChemCID: '',
    IupacName: '',
    MolecularFormula: '',
    MolecularWeight: '',
    SMILES: '',
    MoACode: '',
    ChemicalFamily: '',
    TargetSite: '',
    Systemicity: '',
    ResistanceRisk: '',
    MoACommittee: ''
  });

  const handleShareLibrary = async () => {
    if (isViewer) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Viewer role cannot share ingredients.', type: 'error' } }));
      return;
    }

    const ownUid = user?.uid || user?.ID || user?.id;
    const activeCategory = state.activeCategory || 'herbicide';

    if (!window.confirm(`Share all your ${activeCategory} ingredients with other scientists who have access to the ${activeCategory} tab?`)) {
      return;
    }

    const toast = (msg, type = 'success') =>
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg, type } }));

    // Show loading overlay
    window.dispatchEvent(new CustomEvent('app:loading', { detail: { show: true } }));

    try {
      // 1. Fetch all users
      const { getUsers } = await import('../services/dataLayer.js');
      const { hasAccess } = await import('../utils/categoryConfig.js');
      
      const allUsers = await getUsers({}, getAppState);
      
      // 2. Filter users who have access to the active category and are not the current user / admins
      const targetUsers = (allUsers || []).filter(u => {
        const uid = u.id || u.ID || u.uid;
        if (uid === ownUid) return false;
        
        const role = String(u.role || u.Role || '').toLowerCase();
        if (role === 'admin') return false; // Admins already see everything
        
        return hasAccess(u, activeCategory, 'read');
      });

      if (targetUsers.length === 0) {
        toast(`No other scientists found with access to the ${activeCategory} tab.`, 'info');
        return;
      }

      const targetUids = targetUsers.map(u => u.id || u.ID || u.uid);

      // 3. Filter ingredients owned by the current user in the active category
      const ownIngredients = (state.ingredients || []).filter(ing => {
        const createdBy = ing.CreatedBy || ing.createdBy;
        const isOwn = !createdBy || createdBy === ownUid || isAdmin;
        const matchesCategory = ing.Category === activeCategory || (!ing.Category && activeCategory === 'herbicide');
        return isOwn && matchesCategory;
      });

      if (ownIngredients.length === 0) {
        toast(`You don't have any ${activeCategory} ingredients to share.`, 'info');
        return;
      }

      // 4. Update each ingredient's SharedWith array to include these scientist UIDs
      const updatedIngredients = [...state.ingredients];
      
      const promises = ownIngredients.map(async (ing) => {
        const currentShared = Array.isArray(ing.SharedWith) ? ing.SharedWith : [];
        const newShared = Array.from(new Set([...currentShared, ...targetUids]));
        
        const updatedIng = {
          ...ing,
          SharedWith: newShared
        };

        const idx = updatedIngredients.findIndex(i => i.ID === ing.ID);
        if (idx !== -1) {
          updatedIngredients[idx] = updatedIng;
        }

        return addIngredient(updatedIng, getAppState);
      });

      await Promise.all(promises);

      // 5. Update state
      updateState({ ingredients: updatedIngredients });
      toast(`Successfully shared ${ownIngredients.length} ingredients with ${targetUsers.length} scientists!`, 'success');
    } catch (err) {
      console.error('Error sharing library:', err);
      toast('Failed to share ingredients library.', 'error');
    } finally {
      window.dispatchEvent(new CustomEvent('app:loading', { detail: { show: false } }));
    }
  };

  const CURRENCY_SYMBOL = '₹'; // Could be dynamic from settings

  const handleAutoDetectMoA = (nameOverride = null) => {
    const activeName = (nameOverride || formData.Name || '').trim();
    if (!activeName) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Please enter an ingredient name first.', type: 'info' } }));
      return;
    }
    const detected = identifyMoA(activeName, state.activeCategory || 'herbicide');
    if (detected) {
      setFormData(prev => ({
        ...prev,
        MoACode: detected.code || '',
        ChemicalFamily: detected.chemicalFamily || prev.ChemicalFamily || '',
        TargetSite: detected.targetSite || detected.name || prev.TargetSite || '',
        Systemicity: detected.systemicity || prev.Systemicity || '',
        ResistanceRisk: detected.resistanceRisk || prev.ResistanceRisk || '',
        MoACommittee: detected.committee || prev.MoACommittee || ''
      }));
      window.dispatchEvent(new CustomEvent('app:toast', {
        detail: { msg: `Matched ${detected.code}: ${detected.chemicalFamily || detected.name}`, type: 'success' }
      }));
    } else {
      window.dispatchEvent(new CustomEvent('app:toast', {
        detail: { msg: `No standard committee entry found for "${activeName}". You can enter custom MoA details.`, type: 'info' }
      }));
    }
  };

  const handleOpenModal = (ingredient = null) => {
    if (ingredient) {
      setEditingIngredient(ingredient);
      const detected = identifyMoA(ingredient.Name, ingredient.Category || state.activeCategory || 'herbicide');
      setFormData({
        Name: ingredient.Name || '',
        Cost: ingredient.Cost || '',
        Unit: ingredient.Unit || '',
        PubChemCID: ingredient.PubChemCID || '',
        IupacName: ingredient.IupacName || '',
        MolecularFormula: ingredient.MolecularFormula || '',
        MolecularWeight: ingredient.MolecularWeight || '',
        SMILES: ingredient.SMILES || '',
        MoACode: ingredient.MoACode || detected?.code || '',
        ChemicalFamily: ingredient.ChemicalFamily || detected?.chemicalFamily || '',
        TargetSite: ingredient.TargetSite || detected?.targetSite || '',
        Systemicity: ingredient.Systemicity || detected?.systemicity || '',
        ResistanceRisk: ingredient.ResistanceRisk || detected?.resistanceRisk || '',
        MoACommittee: ingredient.MoACommittee || detected?.committee || ''
      });
    } else {
      setEditingIngredient(null);
      setFormData({
        Name: '',
        Cost: '',
        Unit: '',
        PubChemCID: '',
        IupacName: '',
        MolecularFormula: '',
        MolecularWeight: '',
        SMILES: '',
        MoACode: '',
        ChemicalFamily: '',
        TargetSite: '',
        Systemicity: '',
        ResistanceRisk: '',
        MoACommittee: ''
      });
    }
    setIsModalOpen(true);
  };

  const handleSearchPubChem = async () => {
    if (!formData.Name) return;
    setIsSearching(true);
    try {
      const response = await fetch(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(formData.Name)}/property/MolecularFormula,MolecularWeight,IUPACName,CanonicalSMILES/JSON`);
      if (!response.ok) {
        throw new Error('Active ingredient not found in PubChem.');
      }
      const data = await response.json();
      const prop = data.PropertyTable?.Properties?.[0];
      if (prop) {
        const detected = identifyMoA(formData.Name, state.activeCategory || 'herbicide');
        setFormData(prev => ({
          ...prev,
          PubChemCID: String(prop.CID || ''),
          IupacName: prop.IUPACName || '',
          MolecularFormula: prop.MolecularFormula || '',
          MolecularWeight: prop.MolecularWeight ? String(prop.MolecularWeight) : '',
          SMILES: prop.CanonicalSMILES || '',
          ...(detected ? {
            MoACode: prev.MoACode || detected.code || '',
            ChemicalFamily: prev.ChemicalFamily || detected.chemicalFamily || '',
            TargetSite: prev.TargetSite || detected.targetSite || '',
            Systemicity: prev.Systemicity || detected.systemicity || '',
            ResistanceRisk: prev.ResistanceRisk || detected.resistanceRisk || '',
            MoACommittee: prev.MoACommittee || detected.committee || ''
          } : {})
        }));
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Scientific details retrieved from PubChem & MoA database!', type: 'success' } }));
      } else {
        throw new Error('No properties found for this compound.');
      }
    } catch (err) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: err.message || 'PubChem search failed', type: 'error' } }));
    } finally {
      setIsSearching(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!hasCategoryWrite) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: `Permission Denied: Write permission required to modify ${activeCategory} ingredients.`, type: 'error' } }));
      return;
    }
    if (editingIngredient && !canEditIngredient(editingIngredient)) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: "Permission Denied: You do not have permission to modify this ingredient.", type: 'error' } }));
      return;
    }
    const ownUid = user?.uid || user?.ID || user?.id || '';
    const payload = {
      ...(editingIngredient || {}),
      ...formData,
      Category: editingIngredient?.Category || activeCategory,
      ID: editingIngredient ? editingIngredient.ID : Date.now().toString(),
      CreatedBy: editingIngredient?.CreatedBy || ownUid,
      UpdatedBy: ownUid,
      _updatedAt: new Date().toISOString()
    };

    // Optimistic UI Update
    let newIngredients = [...state.ingredients];
    if (editingIngredient) {
      newIngredients = newIngredients.map(i => i.ID === payload.ID ? payload : i);
    } else {
      newIngredients.push(payload);
    }
    updateState({ ingredients: newIngredients });
    setIsModalOpen(false);

    try {
      await addIngredient(payload, getAppState);
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Ingredient saved successfully', type: 'success' } }));
    } catch (err) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Failed to save ingredient', type: 'error' } }));
      // Optional: rollback optimistic update
    }
  };

  const handleDelete = async (id) => {
    if (!hasCategoryWrite) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: `Permission Denied: Write permission required to delete ${activeCategory} ingredients.`, type: 'error' } }));
      return;
    }
    const ingToDelete = state.ingredients?.find(i => i.ID === id);
    if (ingToDelete && !canEditIngredient(ingToDelete)) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: "Permission Denied: You do not have permission to delete this ingredient.", type: 'error' } }));
      return;
    }
    if (!window.confirm('Are you sure you want to delete this ingredient?')) return;

    // Optimistic UI Update
    const newIngredients = state.ingredients.filter(i => i.ID !== id);
    updateState({ ingredients: newIngredients });

    try {
      await deleteIngredient({ ID: id }, getAppState);
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Ingredient deleted', type: 'success' } }));
    } catch (err) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Failed to delete ingredient', type: 'error' } }));
      // Optional: rollback optimistic update
    }
  };

  const sortedIngredients = [...(state.ingredients || [])].filter(ing => ing && ing.Name)
    .sort((a, b) => String(b.ID).localeCompare(String(a.ID), undefined, { numeric: true }));

  const filteredIngredients = sortedIngredients.filter(ing => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      (ing.Name && ing.Name.toLowerCase().includes(q)) ||
      (ing.IupacName && ing.IupacName.toLowerCase().includes(q)) ||
      (ing.MolecularFormula && ing.MolecularFormula.toLowerCase().includes(q)) ||
      (ing.PubChemCID && String(ing.PubChemCID).toLowerCase().includes(q)) ||
      (ing.Unit && ing.Unit.toLowerCase().includes(q)) ||
      (ing.SMILES && ing.SMILES.toLowerCase().includes(q))
    );
  });

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <TopBar title="Ingredient Costs" onMenuClick={onMenuClick} />

      <div className="flex-1 overflow-y-auto p-6 pb-24 max-w-4xl mx-auto w-full">
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-6">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Ingredients Library</h2>
            <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              Shared {activeCategory.charAt(0).toUpperCase() + activeCategory.slice(1)} Catalog {hasCategoryWrite ? '• Full Edit Access Granted' : '• Read-Only Mode'}
            </p>
          </div>
          {hasCategoryWrite && (
            <div className="flex items-center gap-3">
              <button
                onClick={handleShareLibrary}
                className="px-4 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-xl font-semibold border border-indigo-200/60 flex items-center gap-2 transition text-sm"
                title={`Share all ingredients in the active category with other scientists`}
              >
                <Share2 className="w-4 h-4" /> Share Library
              </button>
              <button
                onClick={() => handleOpenModal()}
                className="btn-primary px-4 py-2 rounded-xl shadow-md flex items-center gap-2 transition text-sm font-semibold"
              >
                <Plus className="w-5 h-5" /> Add Ingredient
              </button>
            </div>
          )}
        </div>

        {/* Search Bar */}
        <div className="mb-4 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
          <div className="relative flex-1 group">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none group-focus-within:text-emerald-600 transition-colors" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by ingredient name, PubChem CID, formula, IUPAC name..."
              className="w-full pl-10 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 shadow-sm transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="flex items-center justify-between sm:justify-end gap-2 text-xs font-semibold text-slate-500 px-1">
            <span>
              {searchQuery ? (
                <>
                  <span className="text-emerald-600 font-bold">{filteredIngredients.length}</span> of {sortedIngredients.length} found
                </>
              ) : (
                <>
                  <span className="font-bold text-slate-700">{sortedIngredients.length}</span> total ingredients
                </>
              )}
            </span>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="text-xs text-indigo-600 hover:text-indigo-700 hover:underline font-semibold"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-lg border border-slate-100 overflow-hidden">
          {filteredIngredients.length > 0 ? (
            <ul className="divide-y divide-gray-200">
              {filteredIngredients.map(ing => (
                <li key={ing.ID} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                  <div 
                    className="p-4 flex justify-between items-center cursor-pointer" 
                    onClick={() => setExpandedIngId(expandedIngId === ing.ID ? null : ing.ID)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
                        <FlaskConical className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-slate-800">{ing.Name}</p>
                          {(() => {
                            const detected = identifyMoA(ing.Name, ing.Category || state.activeCategory || 'herbicide');
                            const code = ing.MoACode || detected?.code;
                            const risk = ing.ResistanceRisk || detected?.resistanceRisk;
                            const chemFamily = ing.ChemicalFamily || detected?.chemicalFamily;
                            const isOrganic = detected?.isOrganic || code?.includes('(Bio)') || code?.startsWith('BIO') || code?.includes('BM') || code?.includes('UNE') || code?.includes('UNF') || code?.includes('UNM');

                            if (!code) return null;

                            const colorClasses = 
                              isOrganic ? 'bg-emerald-100 text-emerald-800 border-emerald-300' :
                              code.startsWith('HRAC') ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                              code.startsWith('FRAC') ? 'bg-purple-50 text-purple-700 border-purple-200' :
                              code.startsWith('IRAC') ? 'bg-amber-50 text-amber-800 border-amber-200' :
                              'bg-teal-50 text-teal-700 border-teal-200';

                            return (
                              <span 
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shadow-2xs flex items-center gap-1 ${colorClasses}`}
                                title={`${chemFamily ? chemFamily + ' • ' : ''}${risk ? 'Resistance Risk: ' + risk : ''}${detected?.organicStandard ? ' • ' + detected.organicStandard : ''}`}
                              >
                                {isOrganic ? <Leaf className="w-2.5 h-2.5 text-emerald-700" /> : <ShieldCheck className="w-2.5 h-2.5" />}
                                {code}
                              </span>
                            );
                          })()}
                          {ing.PubChemCID && (
                            <span className="text-[10px] bg-indigo-50 text-indigo-600 font-bold px-1.5 py-0.5 rounded-full border border-indigo-100">
                              PubChem Verified
                            </span>
                          )}
                          {(() => {
                            const ownUid = user?.uid || user?.ID || user?.id;
                            const isShared = !!(ing.CreatedBy && ing.CreatedBy !== ownUid);
                            return isShared && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center gap-0.5">
                                <Share2 className="w-2.5 h-2.5 animate-pulse" /> Shared
                              </span>
                            );
                          })()}
                        </div>
                        <p className="text-sm text-slate-500 font-medium mt-0.5">
                          {CURRENCY_SYMBOL}{parseFloat(ing.Cost || 0).toFixed(2)} / {ing.Unit}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                      {canEditIngredient(ing) && (
                        <>
                          <button
                            onClick={() => handleOpenModal(ing)}
                            className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition"
                            title="Edit Ingredient"
                          >
                            <Edit className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => handleDelete(ing.ID)}
                            className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition"
                            title="Delete Ingredient"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => setExpandedIngId(expandedIngId === ing.ID ? null : ing.ID)}
                        className="p-2 text-slate-400 hover:bg-slate-100 rounded-lg transition"
                        title={expandedIngId === ing.ID ? "Collapse" : "Expand"}
                      >
                        {expandedIngId === ing.ID ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>

                  {expandedIngId === ing.ID && (
                    <div className="px-6 pb-5 pt-3 border-t border-slate-50 bg-slate-50/50 flex flex-col gap-4 transition-all">
                      <div className="flex flex-col md:flex-row gap-5">
                        {ing.PubChemCID ? (
                          <>
                            <div className="flex-shrink-0 flex items-center justify-center p-3 rounded-xl bg-white border border-slate-200 self-start">
                              <img 
                                src={`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${ing.PubChemCID}/PNG`} 
                                alt={`${ing.Name} chemical structure`} 
                                className="w-28 h-28 object-contain"
                                onError={(e) => { e.target.style.display = 'none'; }}
                              />
                            </div>
                            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-600">
                              <div>
                                <p className="font-semibold text-slate-400 uppercase tracking-wider text-[10px]">PubChem CID</p>
                                <p className="font-bold text-slate-800 text-sm mt-0.5">{ing.PubChemCID}</p>
                              </div>
                              {ing.MolecularFormula && (
                                <div>
                                  <p className="font-semibold text-slate-400 uppercase tracking-wider text-[10px]">Molecular Formula</p>
                                  <p className="font-bold text-slate-800 text-sm mt-0.5">{ing.MolecularFormula}</p>
                                </div>
                              )}
                              {ing.MolecularWeight && (
                                <div>
                                  <p className="font-semibold text-slate-400 uppercase tracking-wider text-[10px]">Molecular Weight</p>
                                  <p className="font-bold text-slate-800 text-sm mt-0.5">{ing.MolecularWeight} g/mol</p>
                                </div>
                              )}
                              {ing.IupacName && (
                                <div className="col-span-1 sm:col-span-2">
                                  <p className="font-semibold text-slate-400 uppercase tracking-wider text-[10px]">IUPAC Chemical Name</p>
                                  <p className="font-bold text-slate-800 mt-0.5 break-all text-xs leading-relaxed">{ing.IupacName}</p>
                                </div>
                              )}
                              {ing.SMILES && (
                                <div className="col-span-1 sm:col-span-2">
                                  <p className="font-semibold text-slate-400 uppercase tracking-wider text-[10px]">Canonical SMILES</p>
                                  <p className="font-mono text-slate-800 mt-0.5 break-all bg-white p-2 rounded-lg border border-slate-200 text-[10px] select-all leading-tight">{ing.SMILES}</p>
                                </div>
                              )}
                            </div>
                          </>
                        ) : (
                          <div className="py-2 text-center text-xs text-slate-400 w-full flex flex-col items-center justify-center gap-1">
                            <p>No PubChem scientific 2D structure query stored.</p>
                            <button 
                              onClick={() => handleOpenModal(ing)}
                              className="text-indigo-600 font-bold hover:underline"
                            >
                              Query PubChem
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Official Mode of Action & Resistance Management Panel */}
                      {(() => {
                        const detected = identifyMoA(ing.Name, ing.Category || state.activeCategory || 'herbicide');
                        const code = ing.MoACode || detected?.code;
                        const chemFamily = ing.ChemicalFamily || detected?.chemicalFamily;
                        const targetSite = ing.TargetSite || detected?.targetSite || detected?.name;
                        const systemicity = ing.Systemicity || detected?.systemicity;
                        const risk = ing.ResistanceRisk || detected?.resistanceRisk;
                        const crossRisk = detected?.crossResistanceRisk;
                        const committee = ing.MoACommittee || detected?.committee || 'MoA';

                        if (!code && !chemFamily && !targetSite) return null;

                        return (
                          <div className="w-full pt-3 border-t border-slate-200/60">
                            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                                {detected?.isOrganic ? <Leaf className="w-3.5 h-3.5 text-emerald-600" /> : <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />}
                                Official Mode of Action & Resistance Profile ({committee})
                              </span>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {detected?.organicStandard && (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                                    <Leaf className="w-2.5 h-2.5 text-emerald-600" />
                                    {detected.organicStandard}
                                  </span>
                                )}
                                {risk && (
                                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                                    risk.toLowerCase().includes('high') ? 'bg-red-50 text-red-700 border border-red-200' :
                                    risk.toLowerCase().includes('medium') ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                                    'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  }`}>
                                    Risk: {risk.split(' ')[0]}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs text-slate-600">
                              <div className="bg-white p-2.5 rounded-xl border border-slate-200/80 shadow-2xs">
                                <p className="font-semibold text-slate-400 uppercase text-[9px] tracking-wide">Classification Code</p>
                                <p className="font-bold text-slate-800 text-xs mt-0.5">{code || 'Standard'}</p>
                              </div>
                              <div className="bg-white p-2.5 rounded-xl border border-slate-200/80 shadow-2xs">
                                <p className="font-semibold text-slate-400 uppercase text-[9px] tracking-wide">Chemical Family</p>
                                <p className="font-bold text-slate-800 text-xs mt-0.5 truncate" title={chemFamily}>{chemFamily || 'Organic Active'}</p>
                              </div>
                              <div className="bg-white p-2.5 rounded-xl border border-slate-200/80 shadow-2xs">
                                <p className="font-semibold text-slate-400 uppercase text-[9px] tracking-wide">Systemicity / Uptake</p>
                                <p className="font-medium text-slate-800 text-xs mt-0.5 truncate" title={systemicity}>{systemicity || 'Contact / Systemic'}</p>
                              </div>
                              <div className="bg-white p-2.5 rounded-xl border border-slate-200/80 shadow-2xs sm:col-span-2 lg:col-span-1">
                                <p className="font-semibold text-slate-400 uppercase text-[9px] tracking-wide">Biochemical Target Site</p>
                                <p className="font-medium text-slate-800 text-xs mt-0.5 truncate" title={targetSite}>{targetSite || 'Biochemical Target'}</p>
                              </div>
                            </div>
                            {crossRisk && (
                              <p className="text-[11px] text-slate-500 mt-2 bg-amber-50/60 p-2 rounded-lg border border-amber-200/50 flex items-center gap-1.5">
                                <AlertCircle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                                <span><strong>Resistance Guidance:</strong> {crossRisk}</span>
                              </p>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : sortedIngredients.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              No ingredients found. Add one to get started.
            </div>
          ) : (
            <div className="p-12 text-center text-slate-500 flex flex-col items-center justify-center gap-3">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                <Search className="w-6 h-6" />
              </div>
              <div>
                <p className="font-semibold text-slate-700">No ingredients matching &ldquo;{searchQuery}&rdquo;</p>
                <p className="text-xs text-slate-400 mt-1">Try checking the spelling, chemical formula, or PubChem CID.</p>
              </div>
              <button
                onClick={() => setSearchQuery('')}
                className="mt-1 px-4 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-200/60 transition"
              >
                Clear Search Filter
              </button>
            </div>
          )}
        </div>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingIngredient ? 'Edit Ingredient' : 'New Ingredient'}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="block text-sm font-semibold text-slate-700 mb-1">Ingredient Name</label>
              <input
                type="text"
                required
                value={formData.Name}
                onChange={e => setFormData({...formData, Name: e.target.value})}
                className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                placeholder="e.g., Glyphosate"
              />
            </div>
            <button
              type="button"
              onClick={handleSearchPubChem}
              disabled={isSearching || !formData.Name}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white rounded-xl text-xs font-semibold h-[42px] transition flex items-center gap-1"
            >
              <Search className="w-3.5 h-3.5" />
              {isSearching ? 'Searching...' : 'PubChem'}
            </button>
          </div>

          {formData.PubChemCID && (
            <div className="border border-slate-100 bg-indigo-50/30 rounded-xl p-3 mt-1 space-y-2.5">
              <div className="flex justify-between items-center">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-indigo-700">PubChem Scientific Profile</h4>
                <button 
                  type="button" 
                  onClick={() => setFormData(prev => ({ ...prev, PubChemCID: '', IupacName: '', MolecularFormula: '', MolecularWeight: '', SMILES: '' }))}
                  className="text-[10px] text-red-500 hover:underline font-bold"
                >
                  Clear Profile
                </button>
              </div>
              
              <div className="flex gap-3 items-center">
                <img 
                  src={`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${formData.PubChemCID}/PNG`} 
                  alt="Chemical structure preview" 
                  className="w-16 h-16 object-contain rounded-lg border border-slate-200 bg-white"
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
                <div className="flex-1 text-[11px] space-y-1 text-slate-700 min-w-0">
                  <p className="truncate"><strong>CID:</strong> {formData.PubChemCID}</p>
                  {formData.MolecularFormula && <p className="truncate"><strong>Formula:</strong> {formData.MolecularFormula}</p>}
                  {formData.MolecularWeight && <p className="truncate"><strong>Weight:</strong> {formData.MolecularWeight} g/mol</p>}
                  {formData.IupacName && <p className="truncate" title={formData.IupacName}><strong>IUPAC:</strong> {formData.IupacName}</p>}
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Cost ({CURRENCY_SYMBOL})</label>
              <input
                type="number"
                step="0.01"
                required
                value={formData.Cost}
                onChange={e => setFormData({...formData, Cost: e.target.value})}
                className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Unit</label>
              <input
                type="text"
                required
                value={formData.Unit}
                onChange={e => setFormData({...formData, Unit: e.target.value})}
                className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                placeholder="e.g., Litre, Kg"
              />
            </div>
          </div>

          {/* Mode of Action (HRAC / FRAC / IRAC) Classification Box */}
          <div className="border border-slate-200 bg-slate-50/80 rounded-xl p-3.5 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                Mode of Action & Committee Classification
              </span>
              <button
                type="button"
                onClick={() => handleAutoDetectMoA()}
                className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 hover:underline cursor-pointer"
                title="Auto-detect MoA from global HRAC / FRAC / IRAC registry"
              >
                <Sparkles className="w-3 h-3 text-indigo-500" />
                Auto-Detect MoA
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Committee Code / Group</label>
                <input
                  type="text"
                  value={formData.MoACode}
                  onChange={e => setFormData({ ...formData, MoACode: e.target.value })}
                  placeholder="e.g., HRAC 9, FRAC 11, IRAC 28"
                  className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Chemical Family</label>
                <input
                  type="text"
                  value={formData.ChemicalFamily}
                  onChange={e => setFormData({ ...formData, ChemicalFamily: e.target.value })}
                  placeholder="e.g., Triketone, Triazole, Diamide"
                  className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Target Site</label>
                <input
                  type="text"
                  value={formData.TargetSite}
                  onChange={e => setFormData({ ...formData, TargetSite: e.target.value })}
                  placeholder="e.g., EPSP synthase, RyR calcium channels"
                  className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Resistance Risk</label>
                <select
                  value={formData.ResistanceRisk}
                  onChange={e => setFormData({ ...formData, ResistanceRisk: e.target.value })}
                  className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
                >
                  <option value="">Select Risk...</option>
                  <option value="Low">Low Risk</option>
                  <option value="Medium">Medium Risk</option>
                  <option value="High">High Risk</option>
                  <option value="Low / None (Multi-site)">Low / None (Multi-site)</option>
                  <option value="Not Applicable">Not Applicable (Adjuvant)</option>
                </select>
              </div>
            </div>
          </div>

          <div className="pt-4 flex justify-end gap-3">
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
              Save
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

