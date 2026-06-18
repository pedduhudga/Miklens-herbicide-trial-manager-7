import React, { useState } from 'react';
import { useAppState } from '../hooks/useAppState.jsx';
import { useAuth } from '../hooks/useAuth.js';
import TopBar from '../components/TopBar.jsx';
import Modal from '../components/Modal.jsx';
import { addIngredient, deleteIngredient } from '../services/dataLayer.js';
import { Edit, Trash2, Plus, Search, ChevronDown, ChevronUp, FlaskConical, Share2 } from 'lucide-react';

export default function Ingredients({ onMenuClick }) {
  const { state, updateState, getAppState } = useAppState();
  const { isViewer, user, isAdmin } = useAuth();
  const isOwnData = (record) => {
    if (isAdmin) return true;
    if (!record) return true;
    const ownUid = user?.uid || user?.ID || user?.id;
    return !record.CreatedBy || record.CreatedBy === ownUid;
  };
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingIngredient, setEditingIngredient] = useState(null);
  const [expandedIngId, setExpandedIngId] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [formData, setFormData] = useState({
    Name: '',
    Cost: '',
    Unit: '',
    PubChemCID: '',
    IupacName: '',
    MolecularFormula: '',
    MolecularWeight: '',
    SMILES: ''
  });

  const CURRENCY_SYMBOL = '₹'; // Could be dynamic from settings

  const handleOpenModal = (ingredient = null) => {
    if (ingredient) {
      setEditingIngredient(ingredient);
      setFormData({
        Name: ingredient.Name || '',
        Cost: ingredient.Cost || '',
        Unit: ingredient.Unit || '',
        PubChemCID: ingredient.PubChemCID || '',
        IupacName: ingredient.IupacName || '',
        MolecularFormula: ingredient.MolecularFormula || '',
        MolecularWeight: ingredient.MolecularWeight || '',
        SMILES: ingredient.SMILES || ''
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
        SMILES: ''
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
        setFormData(prev => ({
          ...prev,
          PubChemCID: String(prop.CID || ''),
          IupacName: prop.IUPACName || '',
          MolecularFormula: prop.MolecularFormula || '',
          MolecularWeight: prop.MolecularWeight ? String(prop.MolecularWeight) : '',
          SMILES: prop.CanonicalSMILES || ''
        }));
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Scientific details retrieved from PubChem!', type: 'success' } }));
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
    if (isViewer) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Viewer role cannot modify or save ingredients.', type: 'error' } }));
      return;
    }
    if (editingIngredient && !isOwnData(editingIngredient)) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: "Permission Denied: You cannot modify another user's ingredient.", type: 'error' } }));
      return;
    }
    const payload = {
      ...formData,
      ID: editingIngredient ? editingIngredient.ID : Date.now().toString()
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
    if (isViewer) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Viewer role cannot delete ingredients.', type: 'error' } }));
      return;
    }
    const ingToDelete = state.ingredients?.find(i => i.ID === id);
    if (ingToDelete && !isOwnData(ingToDelete)) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: "Permission Denied: You cannot delete another user's ingredient.", type: 'error' } }));
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

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <TopBar title="Ingredient Costs" onMenuClick={onMenuClick} />

      <div className="flex-1 overflow-y-auto p-6 max-w-4xl mx-auto w-full">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-slate-800">Ingredients Library</h2>
          {!isViewer && (
            <button
              onClick={() => handleOpenModal()}
              className="btn-primary px-4 py-2 rounded-xl shadow-md flex items-center gap-2"
            >
              <Plus className="w-5 h-5" /> Add Ingredient
            </button>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-lg border border-slate-100 overflow-hidden">
          {sortedIngredients.length > 0 ? (
            <ul className="divide-y divide-gray-200">
              {sortedIngredients.map(ing => (
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
                      {!isViewer && isOwnData(ing) && (
                        <>
                          <button
                            onClick={() => handleOpenModal(ing)}
                            className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition"
                            title="Edit"
                          >
                            <Edit className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => handleDelete(ing.ID)}
                            className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition"
                            title="Delete"
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
                    <div className="px-6 pb-5 pt-3 border-t border-slate-50 bg-slate-50/50 flex flex-col md:flex-row gap-5 transition-all">
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
                        <div className="py-4 text-center text-xs text-slate-400 w-full flex flex-col items-center justify-center gap-1.5">
                          <FlaskConical className="w-8 h-8 text-slate-300 animate-pulse" />
                          <p>No scientific profile information found.</p>
                          <button 
                            onClick={() => handleOpenModal(ing)}
                            className="mt-1 text-indigo-600 font-bold hover:underline"
                          >
                            Edit to query PubChem
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-12 text-center text-slate-500">
              No ingredients found. Add one to get started.
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

