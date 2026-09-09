import React, { useState, useMemo } from 'react';
import { X, Sparkles, FlaskConical, PlusCircle, Check, Loader2, DollarSign, Target, ShieldCheck, Zap, Layers, Leaf } from 'lucide-react';
import { getCategoryConfig } from '../utils/categoryConfig.js';
import { calculateFormulationCost } from '../utils/costUtils.js';
import { _callGeminiApiWithRetries } from '../services/ai.js';
import { DEFAULT_GEMINI_MODEL } from '../utils/aiConstants.js';
import { useAppState } from '../hooks/useAppState.jsx';
import { addFormulation, validateCategoryDataOperation } from '../services/dataLayer.js';
import { findDuplicateFormulation } from '../utils/formulationDuplicateUtils.js';

const STRATEGY_OPTIONS = [
  { id: 'max_efficacy', label: 'Maximum Efficacy & Knockdown', icon: Zap, desc: 'High-potency synergistic blend for resistant or heavy infestations' },
  { id: 'low_cost', label: 'Economic / Low Cost Formulation', icon: DollarSign, desc: 'Optimized commercial ratio minimizing ₹/L cost while meeting efficacy thresholds' },
  { id: 'long_residual', label: 'Long Residual / Systemic Control', icon: ShieldCheck, desc: 'Extended control days with slow-release or systemic translocation' },
  { id: 'bio_organic', label: 'Organic / Bio-Rational Blend', icon: Leaf, desc: 'Natural, botanical, or biological active agents with low eco-toxicity' }
];

export default function AiFormulaGeneratorModal({
  isOpen,
  onClose,
  activeCategory = 'herbicide',
  libraryIngredients = [],
  allTrials = []
}) {
  const { state, updateState, getAppState } = useAppState();
  const config = getCategoryConfig(activeCategory);
  const isViewer = state.auth?.user?.role === 'viewer';

  const [targetProblem, setTargetProblem] = useState('');
  const [targetCrop, setTargetCrop] = useState('');
  const [selectedStrategy, setSelectedStrategy] = useState('max_efficacy');
  const [costCeiling, setCostCeiling] = useState('');
  const [useInventoryOnly, setUseInventoryOnly] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedCandidates, setGeneratedCandidates] = useState([]);
  const [savedFormulas, setSavedFormulas] = useState({});

  // Common target recommendations per category
  const commonTargets = useMemo(() => {
    switch (activeCategory) {
      case 'herbicide':
        return ['Bermuda Grass (Cynodon dactylon)', 'Parthenium hysterophorus', 'Echinochloa crus-galli', 'Cyperus rotundus', 'Amaranthus viridis'];
      case 'fungicide':
        return ['Powdery Mildew (Erysiphe)', 'Sheath Blight (Rhizoctonia)', 'Early Blight (Alternaria)', 'Downy Mildew', 'Anthracnose'];
      case 'pesticide':
        return ['Brown Plant Hopper (Nilaparvata)', 'Fall Armyworm (Spodoptera)', 'Whitefly (Bemisia tabaci)', 'Aphids', 'Helicoverpa armigera'];
      case 'nutrition':
        return ['Nitrogen Deficiency & Low Chlorophyll', 'Zinc / Micronutrient Chlorosis', 'Phosphorus Deficiency', 'Post-Flowering Fruit Drop'];
      case 'biostimulant':
        return ['Drought & Moisture Stress', 'Early Root Initiation & Vigor', 'High Temperature Heat Shock', 'Vegetative Shoot Density'];
      default:
        return ['Broad Spectrum Control'];
    }
  }, [activeCategory]);

  const handleGenerate = async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    setGeneratedCandidates([]);

    try {
      // Build inventory context string
      const inventoryContext = libraryIngredients
        .filter(i => (i.Category || 'herbicide') === activeCategory || !i.Category)
        .slice(0, 25)
        .map(i => `- ${i.Name} (${i.Unit || 'L'}, ₹${i.Cost || '0'}/unit)`)
        .join('\n');

      const strategyMeta = STRATEGY_OPTIONS.find(s => s.id === selectedStrategy);

      const prompt = `You are a Principal Agrochemical Formulation Scientist specializing in ${config.name.toUpperCase()} chemistry.
Design 2 high-potential, scientifically validated candidate formulations with exact recipes.

USER REQUIREMENTS:
- Category: ${config.name}
- Target Species / Problem: ${targetProblem || 'Broad Spectrum ' + config.name}
- Target Crop: ${targetCrop || 'General Crop Field'}
- Design Strategy: ${strategyMeta.label} (${strategyMeta.desc})
${costCeiling ? `- Cost Ceiling: Under ₹${costCeiling} per Liter` : ''}
${useInventoryOnly ? `- Available Ingredients in Inventory to prioritize:\n${inventoryContext || 'Standard agrochemical actives'}` : ''}

CRITICAL RULES:
1. Provide realistic active ingredient and adjuvant concentrations (e.g. in ml or gm per 1 Liter/Kg formulation batch).
2. For each formulation, output an exact JSON block wrapped in \`\`\`formula ... \`\`\` with this structure:
\`\`\`formula
{
  "Name": "Scientific Formulation Name",
  "Code": "F-${activeCategory.substring(0, 3).toUpperCase()}-XXX",
  "TargetSpecs": "Target spectrum summary",
  "PredictedEfficacy": "85-92%",
  "Rationale": "Scientific mechanism of action and reason for high synergy",
  "Ingredients": [
    {"name": "Exact Ingredient Name", "quantity": 150, "unit": "ml"},
    {"name": "Exact Ingredient Name 2", "quantity": 50, "unit": "gm"}
  ]
}
\`\`\`
Provide a brief scientific commentary explaining the mode of action.`;

      const geminiCall = async (genAI) => {
        const response = await genAI.models.generateContent({
          model: DEFAULT_GEMINI_MODEL,
          contents: [{ parts: [{ text: prompt }] }]
        });
        return response?.candidates?.[0]?.content?.parts?.[0]?.text
          || (typeof response?.text === 'function' ? response.text() : response?.text)
          || '';
      };

      const resultText = await _callGeminiApiWithRetries(geminiCall, getAppState);

      // Parse formula candidates
      const blockRegex = /```(?:formula|json)?\s*(\{[\s\S]*?\})\s*```/gi;
      const candidates = [];
      let match;
      while ((match = blockRegex.exec(resultText)) !== null) {
        try {
          const parsed = JSON.parse(match[1]);
          if ((parsed.Name || parsed.name) && Array.isArray(parsed.Ingredients || parsed.ingredients)) {
            const cleanIngs = (parsed.Ingredients || parsed.ingredients).map(i => ({
              name: String(i.name || i.Name || '').trim(),
              quantity: Number(i.quantity ?? i.qty) || 0,
              unit: String(i.unit || 'ml').trim()
            })).filter(i => i.name !== '');

            const cost = calculateFormulationCost(cleanIngs, libraryIngredients);

            candidates.push({
              Name: parsed.Name || parsed.name,
              Code: parsed.Code || parsed.code || `F-${activeCategory.substring(0, 3).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`,
              TargetSpecs: parsed.TargetSpecs || parsed.targetSpecs || targetProblem || 'Broad Spectrum',
              PredictedEfficacy: parsed.PredictedEfficacy || parsed.predictedEfficacy || '85-92%',
              Rationale: parsed.Rationale || parsed.rationale || '',
              Ingredients: cleanIngs,
              cost
            });
          }
        } catch (e) {
          console.warn('Failed to parse candidate JSON:', e);
        }
      }

      if (candidates.length === 0) {
        window.dispatchEvent(new CustomEvent('app:toast', {
          detail: { msg: 'AI generated recommendations, but could not format JSON. Try adjusting the prompt.', type: 'error' }
        }));
      }

      setGeneratedCandidates(candidates);
    } catch (err) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Failed to generate formula: ' + err.message, type: 'error' } }));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveCandidate = async (candidate) => {
    if (isViewer) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Viewer role cannot save formulations.', type: 'error' } }));
      return;
    }

    // Check if identical formula already exists
    const duplicate = findDuplicateFormulation(
      candidate.Ingredients,
      state.formulations || [],
      activeCategory
    );
    if (duplicate) {
      const proceed = window.confirm(
        `⚠️ DUPLICATE RECIPE WARNING!\n\nThis candidate has the EXACT same ingredients and quantities as existing formulation "${duplicate.Name}" (${duplicate.Code || 'No Code'}).\n\nSaving duplicates will lead to redundant field trials.\n\nDo you still want to save this candidate as a new formulation?`
      );
      if (!proceed) return;
    }

    const nowISO = new Date().toISOString();
    const formId = Date.now().toString();
    const payload = {
      ID: formId,
      Category: activeCategory,
      Code: candidate.Code,
      Name: candidate.Name,
      Notes: `[AI Generator Wizard] Strategy: ${selectedStrategy}. Target: ${candidate.TargetSpecs}. Predicted: ${candidate.PredictedEfficacy}. Rationale: ${candidate.Rationale}`,
      IngredientsJSON: JSON.stringify(candidate.Ingredients),
      EstimatedCost: candidate.cost,
      CreatedAt: nowISO
    };

    // Prepend to local state immediately
    const newForms = [payload, ...(state.formulations || [])];
    updateState({ formulations: newForms });

    try {
      await validateCategoryDataOperation('addFormulation', payload, getAppState);
    } catch (vErr) {
      if (vErr.validationError) {
        const { showCategoryValidationToast } = await import('./CategoryValidationAlert.jsx');
        showCategoryValidationToast(vErr);
        return;
      }
    }

    try {
      await addFormulation(payload, getAppState);
      setSavedFormulas(prev => ({ ...prev, [candidate.Code]: true }));
      window.dispatchEvent(new CustomEvent('app:toast', {
        detail: { msg: `Saved novel formulation "${payload.Name}" (${payload.Code})!`, type: 'success' }
      }));
    } catch (err) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Failed to save formulation', type: 'error' } }));
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/70 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl my-auto flex flex-col max-h-[92vh] overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-emerald-800 via-teal-900 to-slate-900 text-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center text-emerald-300 shadow-inner">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold">
                AI Formulation Generator & Optimizer Studio
              </h2>
              <p className="text-xs text-emerald-200/80">
                Target-driven recipe synthesis with Gemini 3 agrochemical intelligence
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-slate-50/50">
          
          {/* Step 1: Target Problem & Crop */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Target className="w-4 h-4 text-rose-500" />
              1. Target Problem & Crop Specifications
            </h3>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Target Weed / Disease / Pest Species or Deficiency
              </label>
              <input
                type="text"
                value={targetProblem}
                onChange={e => setTargetProblem(e.target.value)}
                placeholder="e.g. Bermuda Grass, Parthenium, Powdery Mildew, Nitrogen Deficiency..."
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none transition"
              />
              
              {/* Quick suggestions pills */}
              <div className="flex flex-wrap gap-1.5 mt-2">
                {commonTargets.map((t, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setTargetProblem(t)}
                    className="text-[11px] px-2.5 py-1 bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 border border-slate-200/70 rounded-lg text-slate-600 font-medium transition"
                  >
                    + {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Target Crop</label>
                <input
                  type="text"
                  value={targetCrop}
                  onChange={e => setTargetCrop(e.target.value)}
                  placeholder="e.g. Cotton, Rice, Soybean, Tomato, Wheat"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none transition"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Max Cost Limit (₹ / L, Optional)</label>
                <input
                  type="number"
                  value={costCeiling}
                  onChange={e => setCostCeiling(e.target.value)}
                  placeholder="e.g. 500"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none transition"
                />
              </div>
            </div>
          </div>

          {/* Step 2: Formulation Strategy */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-amber-500" />
              2. Chemical & Agronomic Strategy
            </h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {STRATEGY_OPTIONS.map(strat => {
                const Icon = strat.icon;
                const isSel = selectedStrategy === strat.id;
                return (
                  <button
                    key={strat.id}
                    type="button"
                    onClick={() => setSelectedStrategy(strat.id)}
                    className={`p-3 rounded-xl border text-left transition flex items-start gap-3 ${
                      isSel
                        ? 'border-emerald-500 bg-emerald-50/50 shadow-xs ring-1 ring-emerald-400'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className={`p-2 rounded-lg shrink-0 ${isSel ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <div className={`text-xs font-bold ${isSel ? 'text-emerald-900' : 'text-slate-800'}`}>
                        {strat.label}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 leading-tight">
                        {strat.desc}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={useInventoryOnly}
                  onChange={e => setUseInventoryOnly(e.target.checked)}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                Prioritize ingredients already in our stock inventory ({libraryIngredients.length} ingredients)
              </label>

              <button
                type="button"
                onClick={handleGenerate}
                disabled={isGenerating}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-sm shrink-0"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Synthesizing Recipes...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" /> Generate Candidate Formulations
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Generated Candidates Output */}
          {generatedCandidates.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <FlaskConical className="w-4 h-4 text-emerald-600" />
                Synthesized Candidate Formulations ({generatedCandidates.length})
              </h3>

              {generatedCandidates.map((cand, idx) => {
                const isSaved = !!savedFormulas[cand.Code];
                return (
                  <div key={idx} className="bg-white rounded-2xl border border-emerald-200 p-5 shadow-xs">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="font-mono text-xs font-bold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-md">
                            {cand.Code}
                          </span>
                          <span className="text-xs font-bold px-2 py-0.5 bg-amber-100 text-amber-800 rounded-md border border-amber-200">
                            ⭐ Predicted: {cand.PredictedEfficacy}
                          </span>
                          <span className="text-xs font-bold px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md">
                            ₹{cand.cost.toFixed(2)}/L
                          </span>
                        </div>
                        <h4 className="text-base font-bold text-slate-900">{cand.Name}</h4>
                        <p className="text-xs text-slate-600 mt-0.5">
                          <span className="font-semibold">Target Spectrum:</span> {cand.TargetSpecs}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleSaveCandidate(cand)}
                        disabled={isSaved || isViewer}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm shrink-0 ${
                          isSaved
                            ? 'bg-emerald-700 text-white cursor-default'
                            : 'bg-emerald-600 hover:bg-emerald-700 text-white active:scale-95'
                        }`}
                      >
                        {isSaved ? (
                          <>
                            <Check className="w-4 h-4 text-emerald-200" /> Saved to Database
                          </>
                        ) : (
                          <>
                            <PlusCircle className="w-4 h-4" /> Save to Formulations
                          </>
                        )}
                      </button>
                    </div>

                    {/* Ingredients Recipe Table */}
                    <div className="bg-slate-50/80 rounded-xl border border-slate-200/80 overflow-hidden mb-3">
                      <div className="px-3 py-1.5 bg-slate-100/80 text-[11px] font-bold text-slate-600 flex justify-between">
                        <span>Recipe Components</span>
                        <span>{cand.Ingredients.length} Ingredients</span>
                      </div>
                      <div className="divide-y divide-slate-100 text-xs">
                        {cand.Ingredients.map((ing, iIdx) => (
                          <div key={iIdx} className="px-3 py-2 flex justify-between items-center bg-white">
                            <span className="font-semibold text-slate-800">{ing.name}</span>
                            <span className="font-mono font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                              {ing.quantity} {ing.unit}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {cand.Rationale && (
                      <div className="text-xs text-slate-600 bg-emerald-50/50 p-3 rounded-xl border border-emerald-100 leading-relaxed">
                        <span className="font-bold text-emerald-900">Scientific Mode of Action: </span>
                        {cand.Rationale}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-100 bg-white flex items-center justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition"
          >
            Done
          </button>
        </div>

      </div>
    </div>
  );
}
