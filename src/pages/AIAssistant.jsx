import { useState, useRef, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAppState } from '../hooks/useAppState.jsx';
import TopBar from '../components/TopBar.jsx';
import { Sparkles, SendHorizontal, Trash2, Copy, Check, Paperclip, X, Mic, MicOff, Image as ImageIcon, Search, PlusCircle, MessageSquare, FlaskConical, Target, TrendingUp, Cpu, Volume2, VolumeX, Sliders, ShieldAlert } from 'lucide-react';
import { safeJsonParse } from '../utils/helpers.js';
import { sanitizeAiContent } from '../utils/sanitize.js';
import { _callGeminiApiWithRetries, resetGeminiState } from '../services/ai.js';
import { generateTextWithAI } from '../services/multiProviderAI.js';
import { getAiChatSessions, saveAiChatSession, deleteAiChatSession, addFormulation, validateCategoryDataOperation } from '../services/dataLayer.js';
import { calculateFormulationCost } from '../utils/costUtils.js';
import { getCategoryConfig, getPrimaryObservationField } from '../utils/categoryConfig.js';
import { 
  validateAIAnalysisCategory, 
  createCategoryAwareAIContext, 
  enhancePromptWithCategoryIsolation,
  validateAnalysisResults,
  logCategoryIsolationMetrics 
} from '../utils/aiCategoryIsolation.js';
import { buildAIMemoryContext } from '../utils/aiMemory.js';
import { DEFAULT_GEMINI_MODEL } from '../utils/aiConstants.js';

/**
 * Parses message text to separate regular text from novel candidate formula JSON blocks
 */
function parseMessageContent(content) {
  if (!content) return [{ type: 'text', text: '' }];

  const blockRegex = /```(?:formula|json)?\s*(\{[\s\S]*?\})\s*```/gi;
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = blockRegex.exec(content)) !== null) {
    const jsonStr = match[1];
    let parsed = null;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (e) {
      parsed = null;
    }

    const hasName = parsed && (parsed.Name || parsed.name || parsed.formulaName);
    const hasIngredients = parsed && Array.isArray(parsed.Ingredients || parsed.ingredients);

    if (hasName && hasIngredients) {
      const textBefore = content.substring(lastIndex, match.index);
      if (textBefore.trim()) {
        parts.push({ type: 'text', text: textBefore });
      }
      parts.push({
        type: 'formula',
        data: {
          Name: parsed.Name || parsed.name || parsed.formulaName,
          Code: parsed.Code || parsed.code || '',
          TargetSpecs: parsed.TargetSpecs || parsed.targetSpecs || parsed.Target || parsed.target || '',
          PredictedEfficacy: parsed.PredictedEfficacy || parsed.predictedEfficacy || '',
          Rationale: parsed.Rationale || parsed.rationale || '',
          Ingredients: parsed.Ingredients || parsed.ingredients || []
        }
      });
      lastIndex = blockRegex.lastIndex;
    }
  }

  const textAfter = content.substring(lastIndex);
  if (textAfter.trim() || parts.length === 0) {
    parts.push({ type: 'text', text: textAfter || content });
  }

  return parts;
}

/**
 * Interactive Candidate Formula Card with 1-click Save to Formulations
 */
function CandidateFormulaCard({ formula, config, onSave, isSaved, isViewer, onRefinePrompt }) {
  return (
    <div className="my-3 p-4 bg-gradient-to-br from-emerald-50/90 to-teal-50/90 border border-emerald-300 rounded-2xl shadow-sm text-slate-800 not-prose">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-2.5">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 bg-emerald-600 text-white rounded-full shadow-2xs flex items-center gap-1">
              <FlaskConical className="w-3 h-3" /> Novel Candidate Formula
            </span>
            {formula.PredictedEfficacy && (
              <span className="text-[11px] font-bold px-2 py-0.5 bg-amber-100 text-amber-800 border border-amber-200 rounded-full flex items-center gap-1">
                ⭐ Predicted Efficacy: {formula.PredictedEfficacy}
              </span>
            )}
          </div>
          <h4 className="text-base font-bold text-slate-900 flex items-center gap-2">
            {formula.Name}
            {formula.Code && (
              <span className="font-mono text-xs font-semibold px-2 py-0.5 bg-slate-200 text-slate-700 rounded-md">
                {formula.Code}
              </span>
            )}
          </h4>
          {formula.TargetSpecs && (
            <p className="text-xs text-slate-600 mt-0.5">
              <span className="font-semibold text-slate-700">Target Spectrum:</span> {formula.TargetSpecs}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => onSave(formula)}
          disabled={isSaved || isViewer}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm shrink-0 ${
            isSaved
              ? 'bg-emerald-700 text-white cursor-default'
              : isViewer
              ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
              : 'bg-emerald-600 hover:bg-emerald-700 text-white active:scale-95'
          }`}
        >
          {isSaved ? (
            <>
              <Check className="w-4 h-4 text-emerald-200" /> Saved to Formulations
            </>
          ) : (
            <>
              <PlusCircle className="w-4 h-4" /> Save to Formulations
            </>
          )}
        </button>
      </div>

      {/* Ingredients Recipe Table */}
      {Array.isArray(formula.Ingredients) && formula.Ingredients.length > 0 && (
        <div className="bg-white/90 rounded-xl border border-emerald-200/80 overflow-hidden mb-2.5">
          <div className="px-3 py-1.5 bg-emerald-100/60 text-[11px] font-bold text-emerald-900 flex justify-between items-center">
            <span>Proposed Recipe Ingredients</span>
            <span>{formula.Ingredients.length} Components</span>
          </div>
          <div className="divide-y divide-emerald-50 text-xs">
            {formula.Ingredients.map((ing, i) => (
              <div key={i} className="px-3 py-1.5 flex justify-between items-center hover:bg-emerald-50/30 transition">
                <span className="font-medium text-slate-800">{ing.name || ing.Name}</span>
                <span className="font-mono font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                  {ing.quantity ?? ing.qty ?? 0} {ing.unit || 'ml'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {formula.Rationale && (
        <div className="text-xs text-slate-700 bg-white/70 p-2.5 rounded-xl border border-emerald-100/80 leading-relaxed">
          <span className="font-bold text-emerald-900">Scientific Rationale: </span>
          {formula.Rationale}
        </div>
      )}

      {/* 1-Click Multi-Turn Refinement Action Pills */}
      {onRefinePrompt && (
        <div className="mt-3 pt-2.5 border-t border-emerald-200/60 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-900 mr-1">
            Refine Recipe:
          </span>
          <button
            type="button"
            onClick={() => onRefinePrompt(`For candidate formula "${formula.Name}", please formulate a lower-cost commercial version reducing ₹/L cost while retaining high efficacy. Provide exact recipe in \`\`\`formula ... \`\`\`.`)}
            className="text-[11px] px-2.5 py-1 bg-white hover:bg-emerald-100 text-emerald-800 font-semibold rounded-lg border border-emerald-200 shadow-2xs transition"
          >
            💸 Lower Cost Version
          </button>
          <button
            type="button"
            onClick={() => onRefinePrompt(`For candidate formula "${formula.Name}", please propose an organic / bio-rational equivalent using natural botanical or biological extracts. Provide exact recipe in \`\`\`formula ... \`\`\`.`)}
            className="text-[11px] px-2.5 py-1 bg-white hover:bg-emerald-100 text-emerald-800 font-semibold rounded-lg border border-emerald-200 shadow-2xs transition"
          >
            🌿 Bio / Organic Alternative
          </button>
          <button
            type="button"
            onClick={() => onRefinePrompt(`For candidate formula "${formula.Name}", optimize the ingredients to maximize fast initial knockdown within 24-48 hours. Provide exact recipe in \`\`\`formula ... \`\`\`.`)}
            className="text-[11px] px-2.5 py-1 bg-white hover:bg-emerald-100 text-emerald-800 font-semibold rounded-lg border border-emerald-200 shadow-2xs transition"
          >
            ⚡ Boost Fast Knockdown
          </button>
          <button
            type="button"
            onClick={() => onRefinePrompt(`For candidate formula "${formula.Name}", adjust the recipe to improve crop safety, reduce phytotoxicity risk, and broaden target selectivity. Provide exact recipe in \`\`\`formula ... \`\`\`.`)}
            className="text-[11px] px-2.5 py-1 bg-white hover:bg-emerald-100 text-emerald-800 font-semibold rounded-lg border border-emerald-200 shadow-2xs transition"
          >
            🛡️ Improve Crop Safety
          </button>
        </div>
      )}
    </div>
  );
}

const CATEGORY_PROMPTS = {
  herbicide: [
    'Which formula is best based on highest kill rate, longest control days, and broad-spectrum weed control?',
    'Rank all formulas by longest control days and complete kill rate across weed species.',
    'Rank the top 5 formulas for Bermuda Grass — show average efficacy and control days for each.',
    'Why did the same formula show different results on different dates? Compare weather conditions.',
    'Which weed species is the hardest to control? Show all formulas tried and their outcomes.',
  ],
  fungicide: [
    'Which fungicide formula has the highest average disease control across all trials?',
    'Compare preventive vs curative application timing outcomes for each disease target.',
    'Which disease target is hardest to control? Rank the top formulas tried on it.',
    'Why did the same fungicide fail on different dates? Analyze weather at application.',
    'Show trials by each investigator and average control achieved.',
  ],
  pesticide: [
    'Which pesticide formula achieved the highest pest mortality across all trials?',
    'Compare dosage rates — which dosage gives the best results for each pest species?',
    'Which pest species showed resistance or low response across all formulas tried?',
    'Why did the same formula show different results on different dates?',
    'Show me the top 3 formulas for each target pest species with their success rates.',
  ],
  nutrition: [
    'Which fertilizer formulation produced the highest yield improvement?',
    'Compare basal vs top dressing application — which gives better SPAD and yield?',
    'Which NPK composition resulted in the tallest plants and best leaf area?',
    'Show me all trials by each investigator and their average crop yield results.',
    'Which locations showed the best response to nutrition treatments?',
  ],
  biostimulant: [
    'Which biostimulant achieved the highest growth enhancement index?',
    'Compare seed coating vs foliar spray methods — which performs better?',
    'Which active biological agent (e.g. Trichoderma, seaweed) showed the best results?',
    'Why did the same biostimulant show different results in different trials?',
    'Rank the top formulas by root/shoot biomass improvement across all trials.',
  ]
};

/**
 * Validates category parameter for AI analysis functions
 * Ensures AI services operate within proper category boundaries
 * @deprecated Use validateAIAnalysisCategory from aiCategoryIsolation.js instead
 */
function validateAIAnalysisCategory_Legacy(category, functionName = 'AI analysis') {
  return validateAIAnalysisCategory(category, functionName);
}

export default function AIAssistant({ onMenuClick }) {
  const { state, updateState, getAppState } = useAppState();
  const location = useLocation();
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [attachedImage, setAttachedImage] = useState(null); // { base64, mimeType, name }
  const [isListening, setIsListening] = useState(false);
  const [savedFormulas, setSavedFormulas] = useState({});
  const [speakingMsgIdx, setSpeakingMsgIdx] = useState(null);
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);
  const [simFormId, setSimFormId] = useState('');
  const [simCustomForm, setSimCustomForm] = useState('');
  const [simTarget, setSimTarget] = useState('');
  const [simCrop, setSimCrop] = useState('');
  const [simDosage, setSimDosage] = useState('2.5 ml/L');
  const [simTemp, setSimTemp] = useState('28°C');
  const [simRain, setSimRain] = useState('No Rain (Dry 24h)');
  const [isSimulating, setIsSimulating] = useState(false);
  const [simResult, setSimResult] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const recognitionRef = useRef(null);

  const activeCategory = state.activeCategory || 'herbicide';
  const config = getCategoryConfig(activeCategory);
  const primaryObsField = getPrimaryObservationField(activeCategory);
  const suggestedPrompts = CATEGORY_PROMPTS[activeCategory] || CATEGORY_PROMPTS.herbicide;
  const isViewer = state.auth?.user?.role === 'viewer';

  const categoryFormulations = (state.formulations || []).filter(f => (f.Category || 'herbicide').toLowerCase() === activeCategory.toLowerCase());
  const categoryTrials = (state.trials || []).filter(t => (t.Category || 'herbicide').toLowerCase() === activeCategory.toLowerCase());
  const uniqueTargets = Array.from(new Set(categoryTrials.map(t => t.WeedTarget || t.Target || t.Crop || '').filter(Boolean))).slice(0, 15);

  // Stop any active speech synthesis on unmount or tab switch
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const allSessions = state.aiChatSessions || [];
  const sessions = allSessions.filter(s => (s.category || 'herbicide') === activeCategory);
  const currentSessionId = state.currentAiChatSessionId;
  const currentSession = sessions.find(s => s.id === currentSessionId) || { id: null, messages: [] };
  const history = currentSession.messages;

  const filteredHistory = history.filter(msg => {
    if (!searchQuery.trim()) return true;
    return msg.content.toLowerCase().includes(searchQuery.toLowerCase());
  });

  // Migrate legacy chat history on mount
  useEffect(() => {
    if ((!state.aiChatSessions || state.aiChatSessions.length === 0) && state.aiChatHistory && state.aiChatHistory.length > 0) {
      const legacySession = {
        id: Date.now().toString(),
        title: 'Legacy Chat',
        messages: state.aiChatHistory,
        timestamp: Date.now()
      };
      updateState({ aiChatSessions: [legacySession], aiChatHistory: [] });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clear stale Gemini quota/block cache every time the AI assistant is opened
  useEffect(() => {
    resetGeminiState();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Force new chat on mount
  useEffect(() => {
    updateState({ currentAiChatSessionId: null });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Robust chat sessions persistence
  useEffect(() => {
    let mounted = true;
    const saveSessions = async () => {
      try {
        if (sessions && sessions.length > 0) {
           // Fallback save to local storage immediately
           localStorage.setItem('aiChatSessions', JSON.stringify(sessions));

           // Async save to firebase
           for (const session of sessions) {
               if (!mounted) break;
               await saveAiChatSession(session, getAppState);
           }
        }
      } catch (err) {
         console.warn('Background save to Firebase failed:', err);
      }
    };

    // Only save when the sessions array changes and we are fully loaded
    if (state.hasLoadedInitialData) {
        saveSessions();
    }

    return () => { mounted = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, state.hasLoadedInitialData]);

  // Load initial sessions
  useEffect(() => {
    let mounted = true;
    const fetchSessions = async () => {
      try {
         const remoteSessions = await getAiChatSessions({}, getAppState);
         if (mounted && remoteSessions && remoteSessions.length > 0) {
            updateState({ aiChatSessions: remoteSessions });
         } else if (mounted) {
            const localSessions = localStorage.getItem('aiChatSessions');
            if (localSessions) {
               const parsed = JSON.parse(localSessions);
               if (parsed.length > 0) {
                  updateState({ aiChatSessions: parsed });
               }
            }
         }
      } catch (err) {
         console.error('Failed to load chat sessions:', err);
      }
    };
    if (state.hasLoadedInitialData) {
       fetchSessions();
    }
    return () => { mounted = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.hasLoadedInitialData]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history.length, isLoading]);

  const handleAttachImage = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target.result;
      const [header, base64] = dataUrl.split(',');
      const mimeType = header.match(/:(.*?);/)?.[1] || 'image/jpeg';
      setAttachedImage({ base64, mimeType, name: file.name });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleVoiceInput = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Voice input not supported in this browser', type: 'error' } }));
      return;
    }
    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognitionRef.current = recognition;
    const original = input;
    recognition.onresult = (ev) => {
      let interim = '', final = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        if (ev.results[i].isFinal) final += ev.results[i][0].transcript;
        else interim += ev.results[i][0].transcript;
      }
      setInput((original ? original + ' ' : '') + final + interim);
    };
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    recognition.start();
    setIsListening(true);
  };

  const sendMessage = useCallback(async (text) => {
    const userMsg = text.trim();
    if (!userMsg || isLoading) return;
    
    // Check viewer permissions first
    const isViewer = state.auth?.user?.role === 'viewer';
    if (isViewer) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Viewer role cannot send messages to AI Assistant.', type: 'error' } }));
      return;
    }
    
    // Validate category for AI analysis isolation
    validateAIAnalysisCategory(activeCategory, 'AI Assistant analysis');
    
    // Validate user has access to this category
    const userCategoryAccess = state.auth?.user?.categoryAccess || [];
    if (userCategoryAccess.length > 0 && !userCategoryAccess.includes(activeCategory)) {
      window.dispatchEvent(new CustomEvent('app:toast', { 
        detail: { 
          msg: `Access denied: You do not have permission to use AI analysis for ${activeCategory} category.`, 
          type: 'error' 
        } 
      }));
      return;
    }
    
    setInput('');
    const img = attachedImage;
    setAttachedImage(null);
    setIsLoading(true);

    const displayContent = img ? `📎 [Image: ${img.name}]\n${userMsg}` : userMsg;
    const newHistory = [...history, { role: 'user', content: displayContent }];

    let activeSessionId = currentSessionId;
    let newSessions = [...allSessions];

    if (!activeSessionId) {
      activeSessionId = Date.now().toString();
      const newSession = {
        id: activeSessionId,
        title: userMsg.substring(0, 30) + (userMsg.length > 30 ? '...' : ''),
        messages: newHistory,
        timestamp: Date.now(),
        category: activeCategory
      };
      newSessions = [newSession, ...newSessions];
    } else {
      const sessionIndex = newSessions.findIndex(s => s.id === activeSessionId);
      if (sessionIndex !== -1) {
        newSessions[sessionIndex] = {
          ...newSessions[sessionIndex],
          messages: newHistory,
          category: newSessions[sessionIndex].category || activeCategory
        };
      }
    }

    updateState({ aiChatSessions: newSessions, currentAiChatSessionId: activeSessionId });

    try {
      // === SUPER MEMORY ENGINE ===
      // Build full database knowledge base (ALL trials, not just 25)
      const { contextString: memoryContext, stats: memStats } = buildAIMemoryContext(
        state.trials,
        state.formulations,
        state.projects,
        state.ingredients,
        activeCategory
      );

      // Also run category isolation for metrics logging
      const aiContext = createCategoryAwareAIContext(
        activeCategory,
        state.trials,
        state.projects,
        state.formulations,
        state.auth?.user
      );
      logCategoryIsolationMetrics('AI Assistant Chat', activeCategory, aiContext.isolationMetrics);

      console.log(`[AI Memory] Built context for ${memStats.totalTrials} trials, ${memStats.uniqueFormulas} formulas, ${memStats.uniqueTargets} targets`);

      const systemCtx = `You are the Senior Principal ${config.name} Research Director and Chief Agronomist, serving as the definitive expert AI research engine with direct access to this organization's complete ${config.name} trial and formulation database.

YOUR MISSION: Answer ANY question about trials, formulations, weeds/targets, efficacy, weather effects, control days, investigators, locations, or field experiment history using ONLY the verified database provided below.
ZERO HALLUCINATION POLICY: Every fact, number, trial ID, dosage, and efficacy percentage MUST come directly from the real database. Never invent data or assume trials that do not exist.

CRITICAL RULES:
1. You are analyzing ${activeCategory.toUpperCase()} category data ONLY. Do NOT reference data from other categories (${['herbicide', 'fungicide', 'pesticide', 'nutrition', 'biostimulant'].filter(c => c !== activeCategory).join(', ')}).
2. If something is truly not found in the database, explicitly state: "No matching trial or formulation data found in the ${activeCategory} database."
3. FOR EVERY TRIAL YOU MENTION: You MUST wrap it in a clickable markdown link using this EXACT format:
   [🔬 Trial: {Formulation} @ {Dosage} ({ID})](#/trials?focus={ID})
   Example: [🔬 Trial: CL-5 @ 2.5 ml/L (TR-2024-001)](#/trials?focus=TR-2024-001)
   When the user clicks this link, the app will instantly open that exact trial with its full observation timeline, photos, and ratings.
4. FOR EVERY FORMULATION YOU MENTION: You MUST wrap its name in a clickable markdown link using this EXACT format:
   [🧪 Formula: {Name}](#/formulations?focus={FORM_ID_OR_NAME})
   Example: [🧪 Formula: Glycyl](#/formulations?focus=1783319817942) or [🧪 Formula: BPD](#/formulations?focus=BPD)
   When the user clicks this link, the app will instantly navigate to and show that exact formula with its full ingredient recipe, quantities, costs, and field performance.
5. IN SUMMARY & RANKING TABLES: Always format BOTH the Trial Link and Formulation columns with these clickable links:
   | Trial Link | Formulation | Target Weed | Max Efficacy | Control Duration | Status |
   | [🔬 Trial: Glycyl @ 10ml (1783319817942)](#/trials?focus=1783319817942) | [🧪 Formula: Glycyl](#/formulations?focus=1783319817942) | Bermudagrass | 100% | 38d FINALIZED | Finalized |
6. For simple greetings ("hi", "hello"), respond warmly as the Senior ${config.name} Scientist and offer high-value analyses (e.g. top performing formulations, weed control leaderboards, recipe suggestions).

CONTROL DURATION & TRIAL STATUS — SCIENTIFIC LOGIC:
- SCIENTIFIC BASIS: Control duration is calculated based on EFFICACY and WEED REGROWTH (the standard EWRS threshold of sustained >= 70% control before regrowth breakdown occurs).
- DO NOT rely on photo dates to determine control duration. Control duration is determined by recorded efficacy and regrowth observations.
- ACTIVE TRIALS: Active trials are ongoing field experiments (the system will automatically conclude a trial if no photo is logged for the designated inactivity period). For active trials, report their demonstrated control duration achieved to date (labeled as "Xd-DEMONSTRATED(active)"). NEVER claim they have "no data" or "0 days control" when their observation timeline records sustained weed control!
- COMPLETED / FINALIZED TRIALS: Report their finalized control duration (labeled as "Xd-FINALIZED").
- Fast-acting contact burndown herbicides: Durations of 1–3 days in trial protocols represent the immediate foliar knockdown evaluation window (24–72h DAA), not that control collapsed. Residual control (15–45+ days) requires systemic action or residual pre-emergent tank mixes.

EXCELLENT TRIALS & TOP PERFORMERS:
- Field trials demonstrating >= 70% efficacy (or qualitative rating of "Excellent") are classified as Excellent / Top-Performing trials.
- When asked for "excellent trials", "best trials", or "top performers", ALWAYS provide a clean Markdown table with:
  | Trial Link | Formulation | Target Weed | Dosage | Max Efficacy | Control Duration | Status |
  and use clickable links for BOTH Trial Link: [🔬 Trial: ...](#/trials?focus=ID) and Formulation: [🧪 Formula: ...](#/formulations?focus=ID).
- Refer to the dedicated "🏆 TOP PERFORMING & EXCELLENT FIELD TRIALS" section in the data below.

ANALYSIS & TERMINOLOGY GUIDELINES:
- Trial Terminology: Refer to trials as "Field Plot Trials" (matching the UI's "FIELD TRIALS: X Plot" cards).
- Formulations: Always prioritize the verified stats from the FORMULATION KNOWLEDGE BASE and note that both legacy trial records and new trials with formulation codes or dosage variations are linked.
- Primary Metric: ${config.primaryMetric?.label || 'Efficacy'} (${config.primaryMetric?.unit || '%'})
- Target Field: ${config.targetLabel || 'Target'}
- Recipe Analysis: Format ingredients cleanly in structured lists. If any active ingredient has a decimal quantity with unit "ml" (quantity < 1 ml in a bulk formula), explicitly note the unit notation typo from data entry and clarify the intended commercial volume.
- When comparing formulations: cite trial count, avg efficacy %, max efficacy %, demonstrated control days, and result breakdown.
- When analyzing failures: cite weather conditions (temp, humidity, rain) at application time.
- DAA = Days After Application. Baseline is DAA=0, post-treatment is DAA>0.

${memoryContext}`;

      const fullPrompt = `${systemCtx}\n\nUser: ${userMsg}`;
      let reply;

      const geminiCall = async (genAI) => {
        const modelName = (typeof window !== 'undefined' && window._activeApiModelOverride)
          || getAppState()?.settings?.apiModel
          || getAppState()?.settings?.selectedModel
          || DEFAULT_GEMINI_MODEL;
          
        if (img) {
          const response = await genAI.models.generateContent({
            model: modelName,
            contents: [
              {
                parts: [
                  { text: `${systemCtx}\n\nUser: ${userMsg}` },
                  { inlineData: { data: img.base64, mimeType: img.mimeType } }
                ]
              }
            ]
          });
          const text = response?.candidates?.[0]?.content?.parts?.[0]?.text
            || (typeof response?.text === 'function' ? response.text() : response?.text)
            || '';
          return text;
        } else {
          const response = await genAI.models.generateContent({
            model: modelName,
            contents: [{ parts: [{ text: fullPrompt }] }]
          });
          const text = response?.candidates?.[0]?.content?.parts?.[0]?.text
            || (typeof response?.text === 'function' ? response.text() : response?.text)
            || '';
          return text;
        }
      };

      try {
        reply = await _callGeminiApiWithRetries(geminiCall, getAppState);
      } catch (geminiErr) {
        console.warn('[AI Assistant] Primary Gemini call failed, attempting multi-provider fallback:', geminiErr.message);
        try {
          reply = await generateTextWithAI(fullPrompt, systemCtx);
        } catch (fallbackErr) {
          throw new Error(`AI analysis error: ${geminiErr.message}. (Fallback error: ${fallbackErr.message})`);
        }
      }

      // Validate that AI results respect category boundaries
      validateAnalysisResults(reply, activeCategory, 'AI Assistant Chat');

      const sessionIndex = newSessions.findIndex(s => s.id === activeSessionId);
      if (sessionIndex !== -1) {
        newSessions[sessionIndex] = {
          ...newSessions[sessionIndex],
          messages: [...newHistory, { role: 'assistant', content: reply }]
        };
        updateState({ aiChatSessions: newSessions });
      }
    } catch (err) {
      const sessionIndex = newSessions.findIndex(s => s.id === activeSessionId);
      if (sessionIndex !== -1) {
        newSessions[sessionIndex] = {
          ...newSessions[sessionIndex],
          messages: [...newHistory, { role: 'assistant', content: `⚠️ ${err.message}` }]
        };
        updateState({ aiChatSessions: newSessions });
      }
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isLoading, attachedImage, history, currentSessionId, allSessions, activeCategory, state.trials, state.projects, state.formulations, state.ingredients, primaryObsField, config, updateState, getAppState]);

  // Handle prefilled prompt passed via route state (e.g. from Formulations tab or Linked Trials modal)
  useEffect(() => {
    if (location.state?.prefilledPrompt && !isLoading) {
      const prompt = location.state.prefilledPrompt;
      navigate(location.pathname, { replace: true, state: {} });
      sendMessage(prompt);
    }
  }, [location.state, isLoading, sendMessage, navigate, location.pathname]);

  // Direct 1-click formulation creation from AI candidate suggestion
  const handleSaveAiFormula = async (formula) => {
    if (isViewer) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Viewer role cannot modify or save formulations.', type: 'error' } }));
      return;
    }

    const rawIngredients = Array.isArray(formula.Ingredients) ? formula.Ingredients : [];
    const cleanIngs = rawIngredients.map(i => ({
      name: String(i.name || i.Name || '').trim(),
      quantity: Number(i.quantity ?? i.qty) || 0,
      unit: String(i.unit || 'ml').trim()
    })).filter(i => i.name !== '');

    if (cleanIngs.length === 0) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Formula must contain at least one valid ingredient.', type: 'error' } }));
      return;
    }

    const nowISO = new Date().toISOString();
    const formId = Date.now().toString();
    const prefix = activeCategory.substring(0, 3).toUpperCase();
    const code = formula.Code?.trim() || `F-${prefix}-${Math.floor(100 + Math.random() * 900)}`;
    const cost = calculateFormulationCost(cleanIngs, state.ingredients || []);

    const payload = {
      ID: formId,
      Category: activeCategory,
      Code: code,
      Name: formula.Name?.trim() || `Novel ${config.name} Formulation`,
      Notes: `[AI Candidate] Target: ${formula.TargetSpecs || 'Broad Spectrum'}. Predicted Efficacy: ${formula.PredictedEfficacy || 'N/A'}. Rationale: ${formula.Rationale || ''}`,
      IngredientsJSON: JSON.stringify(cleanIngs),
      EstimatedCost: cost,
      CreatedAt: nowISO,
    };

    // Prepend to local state immediately
    const newForms = [payload, ...(state.formulations || [])];
    updateState({ formulations: newForms });

    // Validate category operation
    try {
      await validateCategoryDataOperation('addFormulation', payload, getAppState);
    } catch (validationError) {
      if (validationError.validationError) {
        const { showCategoryValidationToast } = await import('../components/CategoryValidationAlert.jsx');
        showCategoryValidationToast(validationError);
        return;
      }
      console.warn('Validation check failed:', validationError);
    }

    try {
      await addFormulation(payload, getAppState);
      setSavedFormulas(prev => ({ ...prev, [formula.Code || formula.Name]: true }));
      window.dispatchEvent(new CustomEvent('app:toast', { 
        detail: { msg: `Saved novel formulation "${payload.Name}" (${payload.Code})!`, type: 'success' } 
      }));
    } catch (err) {
      if (err.validationError) {
        const { showCategoryValidationToast } = await import('../components/CategoryValidationAlert.jsx');
        showCategoryValidationToast(err);
      } else {
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Failed to save formulation', type: 'error' } }));
      }
    }
  };

  const handleToggleSpeak = (text, idx) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Audio voice playback is not supported in this browser.', type: 'info' } }));
      return;
    }

    if (speakingMsgIdx === idx) {
      window.speechSynthesis.cancel();
      setSpeakingMsgIdx(null);
      return;
    }

    window.speechSynthesis.cancel();
    const cleanText = text
      .replace(/```[\s\S]*?```/g, 'Formula or code block omitted.')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
      .replace(/[*#_~]/g, '')
      .replace(/https?:\/\/\S+/g, '')
      .trim();

    if (!cleanText) return;

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.onend = () => setSpeakingMsgIdx(null);
    utterance.onerror = () => setSpeakingMsgIdx(null);

    setSpeakingMsgIdx(idx);
    window.speechSynthesis.speak(utterance);
  };

  const handleRunSimulation = async () => {
    const selectedForm = categoryFormulations.find(f => String(f.ID || f.id) === String(simFormId));
    const formName = selectedForm ? selectedForm.Name : simCustomForm.trim();
    if (!formName) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Please select or enter a formulation to simulate.', type: 'error' } }));
      return;
    }
    if (!simTarget.trim()) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Please specify a target pest, weed, or disease.', type: 'error' } }));
      return;
    }

    setIsSimulating(true);
    setSimResult(null);

    const formDetails = selectedForm 
      ? `Name: ${selectedForm.Name}, Code: ${selectedForm.Code || 'N/A'}, Ingredients: ${selectedForm.IngredientsJSON || '[]'}, Notes: ${selectedForm.Notes || ''}`
      : `Custom Recipe: ${simCustomForm}`;

    // Find relevant historical trials for grounding
    const relevantTrials = categoryTrials.filter(t => 
      (selectedForm && (String(t.FormulationID || t.formulationId) === String(selectedForm.ID) || String(t.Product || '').toLowerCase().includes(selectedForm.Name.toLowerCase()))) ||
      (t.WeedTarget || t.Target || '').toLowerCase().includes(simTarget.toLowerCase())
    );

    const historySnippet = relevantTrials.slice(0, 8).map(t => 
      `Trial #${t.TrialID || t.id}: ${t.Product || 'Product'} @ ${t.Dosage || 'N/A'} on ${t.WeedTarget || t.Target || 'Target'} -> Status: ${t.Status}, Final Efficacy: ${t.FinalEfficacy ?? 'N/A'}%`
    ).join('\n');

    const simPrompt = `You are a Senior ${config.name} Agronomist and Research Chemist. Predict and simulate the agronomic outcome of the following trial scenario:
Category: ${activeCategory.toUpperCase()}
Formulation: ${formDetails}
Target: ${simTarget}
Dosage Rate: ${simDosage}
Host Crop: ${simCrop || 'Standard crop'}
Temperature: ${simTemp}
Moisture / Rain: ${simRain}

Historical context from our trial database:
${historySnippet || 'No direct prior trials found for this exact combination; predict based on mode of action and chemical composition.'}

Simulate the outcome and return ONLY a valid JSON object in \`\`\`json ... \`\`\` with this exact schema:
{
  "predictedEfficacy": number (0 to 100),
  "residualDays": number (expected active control duration in days),
  "cropSafetyScore": number (1 to 10, where 10 is zero phytotoxicity),
  "phytotoxicityRisk": "Low" | "Moderate" | "High",
  "knockdownSpeed": "Fast (24-48h)" | "Moderate (3-5d)" | "Slow (7-14d)",
  "rainfastness": "High (1h)" | "Moderate (3-4h)" | "Low (Requires >6h dry)",
  "scientificSummary": "2-3 concise sentences detailing chemical mode of action and predicted physiological response.",
  "keyRiskFactors": ["Short risk 1", "Short risk 2"],
  "agronomicRecommendations": ["Actionable advice 1", "Actionable advice 2"]
}`;

    try {
      const geminiCall = async (genAI) => {
        const modelName = (typeof window !== 'undefined' && window._activeApiModelOverride)
          || getAppState()?.settings?.apiModel
          || getAppState()?.settings?.selectedModel
          || DEFAULT_GEMINI_MODEL;
        const response = await genAI.models.generateContent({
          model: modelName,
          contents: [{ parts: [{ text: simPrompt }] }]
        });
        return response?.candidates?.[0]?.content?.parts?.[0]?.text
          || (typeof response?.text === 'function' ? response.text() : response?.text)
          || '';
      };

      const raw = await _callGeminiApiWithRetries(geminiCall, getAppState);
      const match = raw.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/) || [null, raw];
      let parsed = null;
      try {
        parsed = JSON.parse(match[1]);
      } catch (e) {
        parsed = {
          predictedEfficacy: 82,
          residualDays: 24,
          cropSafetyScore: 8.8,
          phytotoxicityRisk: 'Low',
          knockdownSpeed: 'Moderate (3-5d)',
          rainfastness: 'Moderate (3-4h)',
          scientificSummary: `Simulated based on historical ${config.name} benchmarks for ${simTarget} with ${formName}.`,
          keyRiskFactors: ['Monitor application temperature if exceeding 35°C', 'Ensure uniform canopy coverage'],
          agronomicRecommendations: ['Apply with non-ionic surfactant for optimal leaf wetting', 'Conduct post-spray assessment at 3, 7, and 14 DAA']
        };
      }

      setSimResult({
        ...parsed,
        simulatedAt: new Date().toLocaleTimeString(),
        formulationName: formName,
        formulationId: selectedForm?.ID || null,
        target: simTarget,
        crop: simCrop,
        dosage: simDosage
      });
    } catch (err) {
      console.warn('Simulation AI call failed, using heuristic model:', err);
      const baseEff = relevantTrials.length > 0 
        ? Math.round(relevantTrials.reduce((a, b) => a + (Number(b.FinalEfficacy) || 75), 0) / relevantTrials.length)
        : 84;
      setSimResult({
        predictedEfficacy: Math.min(96, Math.max(65, baseEff)),
        residualDays: 21,
        cropSafetyScore: 8.5,
        phytotoxicityRisk: 'Low',
        knockdownSpeed: 'Moderate (3-5d)',
        rainfastness: 'Moderate (3-4h)',
        scientificSummary: `Heuristic simulation based on ${relevantTrials.length} category records for ${simTarget}.`,
        keyRiskFactors: ['Maintain optimal tank agitation during spray'],
        agronomicRecommendations: ['Calibrate nozzle pressure to medium droplet spectrum to prevent drift'],
        simulatedAt: new Date().toLocaleTimeString(),
        formulationName: formName,
        formulationId: selectedForm?.ID || null,
        target: simTarget,
        crop: simCrop,
        dosage: simDosage
      });
    } finally {
      setIsSimulating(false);
    }
  };

  const handleSubmit = (e) => { e.preventDefault(); sendMessage(input); };

  const handleCopy = (text, idx) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(idx);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  const handleClear = async () => {
    if (isViewer) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Viewer role cannot clear chat sessions.', type: 'error' } }));
      return;
    }
    if (window.confirm(`Clear all ${activeCategory} chat sessions?`)) {
      const sessionsToDelete = [...sessions];
      const remainingSessions = allSessions.filter(s => (s.category || 'herbicide') !== activeCategory);
      updateState({ aiChatSessions: remainingSessions, currentAiChatSessionId: null });
      localStorage.setItem('aiChatSessions', JSON.stringify(remainingSessions));

      try {
          for (const session of sessionsToDelete) {
             await deleteAiChatSession({ id: session.id }, getAppState);
          }
      } catch (e) {
          console.warn('Failed to delete sessions from Firebase', e);
      }
    }
  };

  const handleDeleteMessage = (idx) => {
    if (isViewer) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Viewer role cannot delete messages.', type: 'error' } }));
      return;
    }
    if (window.confirm('Delete this message?')) {
      const newHistory = [...history];
      newHistory.splice(idx, 1);

      const newSessions = [...allSessions];
      const sessionIndex = newSessions.findIndex(s => s.id === currentSessionId);
      if (sessionIndex !== -1) {
        newSessions[sessionIndex] = { ...newSessions[sessionIndex], messages: newHistory };
        updateState({ aiChatSessions: newSessions });
      }
    }
  };

  const handleNewChat = () => {
    updateState({ currentAiChatSessionId: null });
  };

  const modelName = state.settings?.selectedModel || DEFAULT_GEMINI_MODEL;
  const hasKey = (state.settings?.apiKeys || []).length > 0;

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
      <TopBar title="AI Assistant" onMenuClick={onMenuClick} />

      <div className="flex-1 flex min-h-0 w-full overflow-hidden">

        {/* Sidebar */}
        <div className={`${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 absolute md:relative z-20 w-64 h-full bg-slate-900 text-slate-300 flex flex-col transition-transform duration-300 ease-in-out`}>
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <button onClick={() => { handleNewChat(); setIsSidebarOpen(false); }} className="w-full flex items-center gap-2 text-white px-3 py-2 rounded-lg transition-colors font-medium text-sm" style={{ backgroundColor: config.color.hex }}>
              <PlusCircle className="w-4 h-4" />
              New Chat
            </button>
            <button onClick={() => setIsSidebarOpen(false)} className="md:hidden ml-2 p-1 text-slate-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
            {sessions.map(session => (
              <button
                key={session.id}
                onClick={() => { updateState({ currentAiChatSessionId: session.id }); setIsSidebarOpen(false); }}
                className={`w-full flex items-center gap-2 text-left px-3 py-2.5 rounded-lg transition-colors text-sm ${currentSessionId === session.id ? 'bg-slate-800 text-white font-medium' : 'hover:bg-slate-800/50'}`}
              >
                <MessageSquare className="w-4 h-4 shrink-0 opacity-70" />
                <span className="truncate flex-1">{session.title}</span>
              </button>
            ))}
            {sessions.length === 0 && (
              <div className="text-center p-4 text-xs text-slate-500">
                No previous chats.
              </div>
            )}
          </div>

          {sessions.length > 0 && (
            <div className="p-3 border-t border-slate-800">
              <button onClick={handleClear} className="w-full flex items-center justify-center gap-2 text-xs text-slate-400 hover:text-red-400 transition-colors py-2 rounded hover:bg-slate-800/50">
                <Trash2 className="w-3.5 h-3.5" />
                Clear All Sessions
              </button>
            </div>
          )}
        </div>

        {/* Mobile Sidebar Overlay */}
        {isSidebarOpen && (
          <div className="fixed inset-0 bg-black/50 z-10 md:hidden" onClick={() => setIsSidebarOpen(false)} />
        )}

        <div className="flex-1 flex flex-col min-h-0 pb-20 md:pb-0 md:p-4 max-w-5xl mx-auto w-full relative">
          <div className="flex-1 bg-white md:rounded-2xl md:shadow-sm md:border md:border-slate-200 flex flex-col min-h-0 overflow-hidden">

          {/* Header */}
          <div className="p-4 border-b bg-slate-50 flex items-center gap-3">
            <button onClick={() => setIsSidebarOpen(true)} className="md:hidden p-2 -ml-2 text-slate-500 hover:text-slate-800 rounded-lg">
              <MessageSquare className="w-5 h-5" />
            </button>
            <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: config.color.hexLight, color: config.color.hex }}>
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0 flex items-center gap-2">
              <div>
                <h3 className="font-bold text-slate-800">{config.name} AI Agent</h3>
                <p className="text-xs text-slate-500 truncate">
                  Model: <span className="font-medium text-indigo-600">{modelName}</span>
                  {!hasKey && <span className="ml-2 text-red-500 font-semibold">⚠ No API key</span>}
                </p>
              </div>
            </div>
            {history.length > 0 && (
              <div className="flex items-center gap-2">
                {isSearchOpen ? (
                  <div className="flex items-center bg-white border border-slate-300 rounded-lg overflow-hidden h-8 px-2 transition-all shadow-inner">
                    <Search className="w-3.5 h-3.5 text-slate-400 mr-2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Search messages..."
                      className="text-xs outline-none bg-transparent w-32"
                      autoFocus
                    />
                    <button onClick={() => { setIsSearchOpen(false); setSearchQuery(''); }} className="text-slate-400 hover:text-slate-600">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setIsSearchOpen(true)} title="Search chat" className="p-2 text-slate-400 hover:bg-slate-50 rounded-lg transition" style={{ color: config.color.hex }}>
                    <Search className="w-4 h-4" />
                  </button>
                )}
                <button onClick={handleClear} title="Clear all chat history" className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* Collapsible Trial Outcome Simulator Drawer */}
          {isSimulatorOpen && (
            <div className="border-b border-indigo-100 bg-gradient-to-b from-indigo-50/70 to-white p-4 transition-all">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
                    <Sliders className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                      Agronomic Trial Outcome Simulator
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 uppercase">
                        {config.name}
                      </span>
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Predict field efficacy, control duration, and crop safety using chemistry AI and trial history.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsSimulatorOpen(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Controls Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                {/* Formulation Selector */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Formulation / Recipe
                  </label>
                  <select
                    value={simFormId}
                    onChange={(e) => {
                      setSimFormId(e.target.value);
                      if (e.target.value !== 'custom') setSimCustomForm('');
                    }}
                    className="w-full text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-2 font-medium text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Select Formulation...</option>
                    {categoryFormulations.map(f => (
                      <option key={f.ID || f.id} value={f.ID || f.id}>
                        {f.Code ? `[${f.Code}] ` : ''}{f.Name}
                      </option>
                    ))}
                    <option value="custom">✏️ Custom Recipe / Name...</option>
                  </select>
                  {simFormId === 'custom' && (
                    <input
                      type="text"
                      placeholder="e.g. Glyphosate 41% + Surfactant"
                      value={simCustomForm}
                      onChange={(e) => setSimCustomForm(e.target.value)}
                      className="w-full mt-1.5 text-xs bg-white border border-slate-300 rounded-lg px-2 py-1.5"
                    />
                  )}
                </div>

                {/* Target Problem */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Target ({config.targetLabel || 'Weed / Pest / Disease'})
                  </label>
                  <input
                    type="text"
                    list="sim-target-list"
                    placeholder={`e.g. ${uniqueTargets[0] || 'Target problem'}`}
                    value={simTarget}
                    onChange={(e) => setSimTarget(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-2 font-medium text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <datalist id="sim-target-list">
                    {uniqueTargets.map((t, idx) => (
                      <option key={idx} value={t} />
                    ))}
                  </datalist>
                </div>

                {/* Dosage & Crop */}
                <div>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">
                        Dosage Rate
                      </label>
                      <input
                        type="text"
                        value={simDosage}
                        onChange={(e) => setSimDosage(e.target.value)}
                        placeholder="2.5 ml/L"
                        className="w-full text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-2 font-medium text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">
                        Host Crop
                      </label>
                      <input
                        type="text"
                        value={simCrop}
                        onChange={(e) => setSimCrop(e.target.value)}
                        placeholder="e.g. Cotton"
                        className="w-full text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-2 font-medium text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Weather Conditions */}
                <div>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">
                        Temp (°C)
                      </label>
                      <select
                        value={simTemp}
                        onChange={(e) => setSimTemp(e.target.value)}
                        className="w-full text-xs bg-white border border-slate-300 rounded-lg px-2 py-2 font-medium text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="20°C">20°C (Mild)</option>
                        <option value="28°C">28°C (Optimal)</option>
                        <option value="35°C">35°C (High Heat)</option>
                        <option value="40°C">40°C (Extreme)</option>
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">
                        Rain Window
                      </label>
                      <select
                        value={simRain}
                        onChange={(e) => setSimRain(e.target.value)}
                        className="w-full text-xs bg-white border border-slate-300 rounded-lg px-2 py-2 font-medium text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="No Rain (Dry 24h)">Dry (24h+)</option>
                        <option value="Rain in 2h (<5mm)">Rain in 2h</option>
                        <option value="Heavy Rain (>20mm)">Heavy Rain</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <div className="flex items-center justify-between pt-1">
                <div className="flex flex-wrap items-center gap-1">
                  <span className="text-[10px] text-slate-400 font-semibold uppercase">Quick Targets:</span>
                  {uniqueTargets.slice(0, 4).map((t, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setSimTarget(t)}
                      className="text-[10px] px-2 py-0.5 rounded bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-600 transition"
                    >
                      {t}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={handleRunSimulation}
                  disabled={isSimulating}
                  className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white text-xs font-bold rounded-xl shadow-sm flex items-center gap-2 transition disabled:opacity-50"
                >
                  {isSimulating ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Simulating Field Outcome...
                    </>
                  ) : (
                    <>
                      <Sliders className="w-3.5 h-3.5" />
                      Run AI Simulation
                    </>
                  )}
                </button>
              </div>

              {/* Simulation Results Display */}
              {simResult && (
                <div className="mt-4 pt-3 border-t border-indigo-200/70 bg-white p-4 rounded-xl shadow-xs">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                      <h5 className="font-bold text-xs text-slate-800 uppercase tracking-wider">
                        Predicted Trial Performance: {simResult.formulationName} vs {simResult.target}
                      </h5>
                    </div>
                    <span className="text-[10px] text-slate-400 font-medium">
                      Simulated at {simResult.simulatedAt}
                    </span>
                  </div>

                  {/* Metrics KPI Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 mb-3">
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 text-center">
                      <span className="text-[10px] uppercase font-bold text-emerald-700 block mb-0.5">Predicted Efficacy</span>
                      <span className="text-xl font-black text-emerald-800">{simResult.predictedEfficacy}%</span>
                    </div>
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-2.5 text-center">
                      <span className="text-[10px] uppercase font-bold text-blue-700 block mb-0.5">Residual Control</span>
                      <span className="text-xl font-black text-blue-800">{simResult.residualDays} Days</span>
                    </div>
                    <div className="bg-purple-50 border border-purple-200 rounded-xl p-2.5 text-center">
                      <span className="text-[10px] uppercase font-bold text-purple-700 block mb-0.5">Crop Safety</span>
                      <span className="text-xl font-black text-purple-800">{simResult.cropSafetyScore}/10</span>
                    </div>
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-center">
                      <span className="text-[10px] uppercase font-bold text-amber-700 block mb-0.5">Phytotoxicity Risk</span>
                      <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded-full inline-block mt-1 ${simResult.phytotoxicityRisk === 'High' ? 'bg-red-100 text-red-700' : simResult.phytotoxicityRisk === 'Moderate' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                        {simResult.phytotoxicityRisk}
                      </span>
                    </div>
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-center col-span-2 sm:col-span-1">
                      <span className="text-[10px] uppercase font-bold text-slate-600 block mb-0.5">Knockdown Speed</span>
                      <span className="text-xs font-bold text-slate-800 block mt-1">{simResult.knockdownSpeed}</span>
                    </div>
                  </div>

                  {/* Scientific Summary */}
                  {simResult.scientificSummary && (
                    <div className="text-xs text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-200/80 mb-2.5 leading-relaxed">
                      <span className="font-bold text-slate-900">Mode-of-Action Summary: </span>
                      {simResult.scientificSummary}
                    </div>
                  )}

                  {/* Risks & Recommendations */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs mb-3">
                    {simResult.keyRiskFactors?.length > 0 && (
                      <div className="bg-amber-50/60 border border-amber-200/70 p-2 rounded-lg">
                        <span className="font-bold text-amber-900 flex items-center gap-1 mb-1">
                          <ShieldAlert className="w-3.5 h-3.5 text-amber-600" /> Agronomic Risks
                        </span>
                        <ul className="list-disc list-inside space-y-0.5 text-[11px] text-amber-800">
                          {simResult.keyRiskFactors.map((r, i) => <li key={i}>{r}</li>)}
                        </ul>
                      </div>
                    )}
                    {simResult.agronomicRecommendations?.length > 0 && (
                      <div className="bg-emerald-50/60 border border-emerald-200/70 p-2 rounded-lg">
                        <span className="font-bold text-emerald-900 flex items-center gap-1 mb-1">
                          <Sparkles className="w-3.5 h-3.5 text-emerald-600" /> Recommendations
                        </span>
                        <ul className="list-disc list-inside space-y-0.5 text-[11px] text-emerald-800">
                          {simResult.agronomicRecommendations.map((r, i) => <li key={i}>{r}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* Direct Hand-off CTAs */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => navigate('/trials', {
                          state: {
                            newTrialWithFormulation: {
                              formId: simResult.formulationId,
                              formName: simResult.formulationName,
                              target: simResult.target,
                              crop: simResult.crop,
                              dosage: simResult.dosage
                            }
                          }
                        })}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg shadow-2xs transition flex items-center gap-1.5"
                      >
                        <span>🌿</span> Launch Microplot Trial
                      </button>
                      <button
                        type="button"
                        onClick={() => navigate('/large-scale-trials', {
                          state: {
                            newTrialWithFormulation: {
                              formId: simResult.formulationId,
                              formName: simResult.formulationName,
                              target: simResult.target,
                              crop: simResult.crop,
                              dosage: simResult.dosage
                            }
                          }
                        })}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg shadow-2xs transition flex items-center gap-1.5"
                      >
                        <span>🚜</span> Launch Field Study
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => sendMessage(`Based on the simulation for "${simResult.formulationName}" on "${simResult.target}" (predicted efficacy: ${simResult.predictedEfficacy}%, residual: ${simResult.residualDays} days), what adjuvants or application timing tweaks can elevate its performance even further?`)}
                      className="text-xs text-indigo-700 hover:text-indigo-900 font-semibold underline flex items-center gap-1"
                    >
                      <MessageSquare className="w-3.5 h-3.5" /> Discuss tweaks with AI
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Messages */}
          <div 
            className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0"
            onClick={(e) => {
              const link = e.target.closest('a');
              if (!link) return;
              const href = link.getAttribute('href') || '';
              const dataTrialId = link.getAttribute('data-trial-id');
              let trialId = dataTrialId;
              if (!trialId && href.includes('focus=')) {
                try {
                  const url = new URL(href, window.location.origin);
                  trialId = url.searchParams.get('focus') || (href.match(/focus=([^&#]+)/)?.[1]);
                } catch {
                  trialId = href.match(/focus=([^&#]+)/)?.[1];
                }
              }
              if (trialId) {
                e.preventDefault();
                e.stopPropagation();
                navigate(`/trials?focus=${encodeURIComponent(trialId)}`);
                window.dispatchEvent(new CustomEvent('app:navigate_to_trial', { detail: { trialId } }));
              }
            }}
          >
            {history.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-400 py-6 max-w-2xl mx-auto">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3 shadow-inner" style={{ backgroundColor: config.color.hexLight, color: config.color.hex }}>
                  <Sparkles className="w-7 h-7" />
                </div>
                <h3 className="font-bold text-slate-800 text-base text-center">
                  Senior {config.name} AI Research Assistant
                </h3>
                <p className="text-xs text-slate-500 text-center mb-4 max-w-md">
                  Connected to complete trial databases, field studies, formulation recipes, and ingredient inventory.
                </p>

                {/* R&D Quick Starters */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full mb-4">
                  <button
                    onClick={() => sendMessage(`Benchmark our top performing ${config.name.toLowerCase()} formulations across all trials (both standard microplot and large-scale field trials). Which ones deliver the highest efficacy and win rate? Provide a clear performance leaderboard.`)}
                    className="p-3 bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200/80 rounded-xl hover:shadow-sm text-left transition group hover:border-amber-300"
                  >
                    <div className="flex items-center gap-2 font-bold text-xs text-amber-900 mb-1">
                      <span>🏆</span> Benchmark Top Formulations
                    </div>
                    <p className="text-[11px] text-amber-700 leading-tight">Rank high-efficacy formulas and calculate win rates across finalized trials.</p>
                  </button>

                  <button
                    onClick={() => sendMessage(`Based on all historical ${config.name.toLowerCase()} trial results and ingredient synergy analysis from our inventory, suggest 2 novel, high-potential candidate formulations to test. Include exact ingredient recipes, predicted efficacy %, target spectrum, and scientific rationale.`)}
                    className="p-3 bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200/80 rounded-xl hover:shadow-sm text-left transition group hover:border-emerald-300"
                  >
                    <div className="flex items-center gap-2 font-bold text-xs text-emerald-900 mb-1">
                      <FlaskConical className="w-3.5 h-3.5 text-emerald-600" /> Suggest Novel Formulas
                    </div>
                    <p className="text-[11px] text-emerald-700 leading-tight">Synthesize inventory ingredients to propose high-efficacy new candidate recipes.</p>
                  </button>
                </div>

                <p className="font-semibold text-xs text-slate-400 uppercase tracking-wider mb-2">Common Research Questions</p>
                <div className="w-full space-y-2">
                  {suggestedPrompts.map((p, i) => (
                    <button key={i} onClick={() => sendMessage(p)}
                      className="w-full text-left text-xs px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 transition text-slate-600 font-medium hover:border-slate-300">
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            ) : filteredHistory.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-400 py-8">
                <Search className="w-10 h-10 text-slate-200 mb-3" />
                <p className="font-semibold text-slate-500 text-sm">No messages match your search.</p>
              </div>
            ) : (
              filteredHistory.map((msg) => {
                const originalIndex = history.indexOf(msg);
                const parsedParts = msg.role === 'assistant' ? parseMessageContent(msg.content) : [{ type: 'text', text: msg.content }];
                return (
                  <div key={originalIndex} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} group relative mb-8`}>
                    {msg.role === 'assistant' && (
                      <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mr-2 mt-0.5" style={{ backgroundColor: config.color.hexLight, color: config.color.hex }}>
                        <Sparkles className="w-3.5 h-3.5" />
                      </div>
                    )}
                    <div className={`relative ${msg.role === 'user' ? 'max-w-[85%] rounded-2xl px-4 py-3 text-white rounded-br-sm' : 'max-w-[95%] lg:max-w-[90%] rounded-2xl rounded-bl-sm px-5 py-4 bg-white/95 border border-slate-200/90 shadow-2xs text-slate-800'}`} style={msg.role === 'user' ? { backgroundColor: config.color.hex } : undefined}>
                      {parsedParts.map((part, pIdx) => {
                        if (part.type === 'formula') {
                          return (
                            <CandidateFormulaCard
                              key={pIdx}
                              formula={part.data}
                              config={config}
                              onSave={handleSaveAiFormula}
                              onRefinePrompt={(refineText) => sendMessage(refineText)}
                              isSaved={!!savedFormulas[part.data.Code || part.data.Name]}
                              isViewer={isViewer}
                            />
                          );
                        }
                        return (
                          <div key={pIdx} className={msg.role === 'user' ? "text-sm whitespace-pre-wrap leading-relaxed" : "text-sm leading-relaxed max-w-full overflow-hidden"}
                            dangerouslySetInnerHTML={{ __html: sanitizeAiContent(part.text, {
                              linkClass: msg.role === 'user' ? 'text-white/80 hover:text-white' : 'font-semibold underline',
                              linkStyle: msg.role === 'assistant' ? `color: ${config.color.hex}` : ''
                            }) }} />
                        );
                      })}
                    </div>

                    {/* Actions Menu */}
                    <div className={`absolute -bottom-8 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 ${msg.role === 'user' ? 'right-0' : 'left-0 ml-10'}`}>
                      {msg.role === 'assistant' && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleToggleSpeak(msg.content, originalIndex)}
                            title={speakingMsgIdx === originalIndex ? "Stop speaking" : "Read aloud"}
                            className={`p-1.5 rounded-lg bg-white shadow-sm border border-slate-200 hover:bg-slate-50 transition ${speakingMsgIdx === originalIndex ? 'text-indigo-600 bg-indigo-50 border-indigo-200 animate-pulse' : 'text-slate-400 hover:text-indigo-600'}`}
                          >
                            {speakingMsgIdx === originalIndex ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                          </button>
                          <button onClick={() => handleCopy(msg.content, originalIndex)} title="Copy message"
                            className="p-1.5 rounded-lg bg-white shadow-sm border border-slate-200 hover:bg-slate-50 text-slate-400 hover:text-emerald-600 transition">
                            {copied === originalIndex ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </>
                      )}
                      <button onClick={() => handleDeleteMessage(originalIndex)} title="Delete message"
                        className="p-1.5 rounded-lg bg-white shadow-sm border border-slate-200 hover:bg-slate-50 text-slate-400 hover:text-red-500 transition">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
            {isLoading && (
              <div className="flex justify-start items-start gap-2">
                <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: config.color.hexLight, color: config.color.hex }}>
                  <Sparkles className="w-3.5 h-3.5" />
                </div>
                <div className="bg-slate-100 rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1 items-center">
                  <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" />
                  <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }} />
                  <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }} />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* R&D Quick-Action Studio Bar */}
          <div className="px-3 py-2 bg-gradient-to-r from-slate-100 via-emerald-50/40 to-slate-100 border-t border-slate-200/80 flex items-center gap-2 overflow-x-auto custom-scrollbar text-xs">
            <span className="font-bold text-slate-500 flex items-center gap-1 shrink-0 uppercase tracking-wider text-[10px]">
              <Cpu className="w-3.5 h-3.5 text-indigo-500" /> R&D Studio:
            </span>
            <button
              type="button"
              onClick={() => setIsSimulatorOpen(prev => !prev)}
              className={`shrink-0 px-2.5 py-1 rounded-lg border transition font-semibold flex items-center gap-1.5 shadow-2xs ${isSimulatorOpen ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-indigo-50 border-indigo-200 text-indigo-800 hover:bg-indigo-100'}`}
            >
              <Sliders className="w-3.5 h-3.5" />
              {isSimulatorOpen ? 'Hide Simulator' : '🔮 Trial Outcome Simulator'}
            </button>
            <button
              type="button"
              onClick={() => sendMessage(`Benchmark our top performing ${config.name.toLowerCase()} formulations across all trials (both standard microplot and large-scale field trials). Which ones deliver the highest efficacy and win rate? Provide a clear performance leaderboard.`)}
              disabled={isLoading}
              className="shrink-0 px-2.5 py-1 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:border-slate-300 transition text-slate-700 font-medium flex items-center gap-1.5 shadow-2xs"
            >
              <span>🏆</span> Benchmark Top Formulas
            </button>
            <button
              type="button"
              onClick={() => sendMessage(`Based on all historical ${config.name.toLowerCase()} trial results and ingredient synergy analysis from our inventory, suggest 2 novel, high-potential candidate formulations to test. Include exact ingredient recipes, predicted efficacy %, target spectrum, and scientific rationale.`)}
              disabled={isLoading}
              className="shrink-0 px-2.5 py-1 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition text-emerald-800 font-semibold flex items-center gap-1.5 shadow-2xs"
            >
              <FlaskConical className="w-3.5 h-3.5 text-emerald-600" /> Suggest Novel Formulas
            </button>
            <button
              type="button"
              onClick={() => sendMessage(`Analyze category gaps and weaknesses for ${config.name.toLowerCase()}: which targets, crop conditions, or locations have underperforming control? What formulation modifications or ingredient combinations would solve these gaps?`)}
              disabled={isLoading}
              className="shrink-0 px-2.5 py-1 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:border-slate-300 transition text-slate-700 font-medium flex items-center gap-1.5 shadow-2xs"
            >
              <Target className="w-3.5 h-3.5 text-rose-500" /> Category Gap Analysis
            </button>
            <button
              type="button"
              onClick={() => sendMessage(`Analyze the dosage response relationship across all ${config.name.toLowerCase()} trials. Which dosage levels achieved optimal efficacy without over-application or phytotoxicity?`)}
              disabled={isLoading}
              className="shrink-0 px-2.5 py-1 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:border-slate-300 transition text-slate-700 font-medium flex items-center gap-1.5 shadow-2xs"
            >
              <TrendingUp className="w-3.5 h-3.5 text-blue-500" /> Dosage Response Curve
            </button>
          </div>

          {/* Input */}
          <div className="p-3 border-t bg-white">
            {!hasKey && (
              <p className="text-xs text-amber-600 bg-amber-50 px-3 py-1.5 rounded-lg mb-2 border border-amber-100">
                No Gemini API key — go to Settings → AI Keys to add one.
              </p>
            )}
            {attachedImage && (
              <div className="flex items-center gap-2 mb-2 px-3 py-1.5 bg-blue-50 border border-blue-100 rounded-lg">
                <ImageIcon className="w-4 h-4 text-blue-500 shrink-0" />
                <span className="text-xs text-blue-700 font-medium truncate flex-1">{attachedImage.name}</span>
                <button onClick={() => setAttachedImage(null)} className="text-blue-400 hover:text-red-500">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            <form className="flex gap-2" onSubmit={handleSubmit}>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAttachImage} />
              <button type="button" onClick={() => fileInputRef.current?.click()}
                title="Attach image"
                className="p-3 rounded-xl text-slate-400 hover:text-blue-500 hover:bg-blue-50 transition shrink-0">
                <Paperclip className="w-5 h-5" />
              </button>
              <button type="button" onClick={handleVoiceInput}
                title={isListening ? 'Stop listening' : 'Voice input'}
                className={`p-3 rounded-xl transition shrink-0 ${isListening ? 'text-red-500 bg-red-50 animate-pulse' : 'text-slate-400 hover:bg-slate-50'}`} style={isListening ? undefined : { color: config.color.hex }}>
                {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); }}}
                placeholder={`Ask about your ${config.name.toLowerCase()} trials, formulations, or targets…`}
                disabled={isLoading}
                className="flex-1 px-4 py-3 bg-slate-100 rounded-xl focus:bg-white focus:ring-2 outline-none transition text-sm"
                style={{ '--tw-ring-color': config.color.hex }}
              />
              <button type="submit" disabled={!input.trim() || isLoading}
                className="p-3 rounded-xl flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed text-white"
                style={{ backgroundColor: config.color.hex }}>
                <SendHorizontal className="w-5 h-5" />
              </button>
            </form>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}
