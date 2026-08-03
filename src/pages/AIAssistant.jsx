import { useState, useRef, useEffect, useCallback } from 'react';
import { useAppState } from '../hooks/useAppState.jsx';
import TopBar from '../components/TopBar.jsx';
import { Sparkles, SendHorizontal, Trash2, Copy, Check, Paperclip, X, Mic, MicOff, Image as ImageIcon, Search, PlusCircle, MessageSquare } from 'lucide-react';
import { safeJsonParse } from '../utils/helpers.js';
import { sanitizeAiContent } from '../utils/sanitize.js';
import { _callGeminiApiWithRetries, resetGeminiState } from '../services/ai.js';
import { getAiChatSessions, saveAiChatSession, deleteAiChatSession } from '../services/dataLayer.js';
import { getCategoryConfig, getPrimaryObservationField } from '../utils/categoryConfig.js';
import { 
  validateAIAnalysisCategory, 
  createCategoryAwareAIContext, 
  enhancePromptWithCategoryIsolation,
  validateAnalysisResults,
  logCategoryIsolationMetrics 
} from '../utils/aiCategoryIsolation.js';
import { buildAIMemoryContext } from '../utils/aiMemory.js';

const CATEGORY_PROMPTS = {
  herbicide: [
    'Which formula gave the best weed control and how many days of control did it provide?',
    'Rank the top 5 formulas for Bermuda Grass — show average efficacy and control days for each.',
    'Why did the same formula show different results on different dates? Compare weather conditions.',
    'Which weed species is the hardest to control? Show all formulas tried and their outcomes.',
    'Show me all trials done by each investigator and compare their average efficacy results.',
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
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [attachedImage, setAttachedImage] = useState(null); // { base64, mimeType, name }
  const [isListening, setIsListening] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const recognitionRef = useRef(null);

  const activeCategory = state.activeCategory || 'herbicide';
  const config = getCategoryConfig(activeCategory);
  const primaryObsField = getPrimaryObservationField(activeCategory);
  const suggestedPrompts = CATEGORY_PROMPTS[activeCategory] || CATEGORY_PROMPTS.herbicide;
  const isViewer = state.auth?.user?.role === 'viewer';

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

      const systemCtx = `You are a Senior ${config.name} Scientist and expert AI research assistant with complete access to this organization's entire ${config.name} trial database.

YOUR ROLE: Answer ANY question about trials, formulations, weeds/targets, weather effects, control days, investigators, locations, or experiment history using ONLY the data provided below. NEVER hallucinate — every fact you state must come from the database.

CRITICAL RULES:
1. You are analyzing ${activeCategory.toUpperCase()} category data ONLY.
2. Do NOT reference data from other categories (${['herbicide', 'fungicide', 'pesticide', 'nutrition', 'biostimulant'].filter(c => c !== activeCategory).join(', ')}).
3. NEVER invent data. If something is not in the database, say "No data found for that query."
4. For EVERY trial you mention, wrap it in a clickable link: [Formula - Dosage](#/trials?focus=TRIAL_ID)
5. For simple greetings ("hi", "hello"), respond warmly as a Senior ${config.name} Scientist and ask what they'd like to analyze.

CONTROL DAYS — CRITICAL DISTINCTION (read carefully):
- "Finalized" trials (status=Finalized, ctrl shows as "Xd-FINALIZED"): have REAL measured control duration. Use these for all comparisons and rankings.
- "Active" trials (status=Active, ctrl shows as "Xd-ELAPSED(active,not-final)"): are STILL RUNNING. Their elapsed days is just how long since the trial started — it is NOT the control duration achieved. NEVER report Active trial elapsed days as "control days" or "days of control achieved." Always mention they are still active.
- When answering questions about "which formula gave longest control", only count FINALIZED control days. Skip Active trials for this metric.
- In rankings, "avgCtrlDays (finalized-only)" means the average only over completed trials — this is the correct metric to cite.

ANALYSIS GUIDELINES:
- Primary Metric: ${config.primaryMetric?.label || 'Efficacy'} (${config.primaryMetric?.unit || '%'})
- Target Field: ${config.targetLabel || 'Target'}
- When comparing formulas: always cite trial count (finalized vs active), avg efficacy, avg finalized control days, and result breakdown (Excellent/Good/Fair/Poor)
- When analyzing failures: cite weather conditions (temp, humidity, rain) at application time
- For rankings: use the pre-computed rankings from the database below (ctrl days from finalized trials only)
- DAA = Days After Application. Baseline is DAA=0, post-treatment is DAA>0

${memoryContext}`;

      const fullPrompt = `${systemCtx}\n\nUser: ${userMsg}`;
      let reply;

      const geminiCall = async (genAI) => {
        const modelName = (typeof window !== 'undefined' && window._activeApiModelOverride)
          || getAppState()?.settings?.apiModel
          || getAppState()?.settings?.selectedModel
          || 'gemini-3.1-flash-lite';
          
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

      reply = await _callGeminiApiWithRetries(geminiCall, getAppState);

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

  const modelName = state.settings?.selectedModel || 'gemini-3.1-flash-lite';
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

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
            {history.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-400 py-8">
                <Sparkles className="w-12 h-12 text-slate-200 mb-4" />
                <p className="font-semibold text-slate-500 text-center mb-6">Ask me anything about your {config.name.toLowerCase()} trial data</p>
                <div className="w-full max-w-lg space-y-2">
                  {suggestedPrompts.map((p, i) => (
                    <button key={i} onClick={() => sendMessage(p)}
                      className="w-full text-left text-sm px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 transition text-slate-600 font-medium hover:border-slate-300">
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
                return (
                  <div key={originalIndex} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} group relative mb-8`}>
                    {msg.role === 'assistant' && (
                      <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mr-2 mt-0.5" style={{ backgroundColor: config.color.hexLight, color: config.color.hex }}>
                        <Sparkles className="w-3.5 h-3.5" />
                      </div>
                    )}
                    <div className={`relative max-w-[80%] rounded-2xl px-4 py-3 ${msg.role === 'user' ? 'text-white rounded-br-sm' : 'bg-slate-100 text-slate-800 rounded-bl-sm'}`} style={msg.role === 'user' ? { backgroundColor: config.color.hex } : undefined}>
                      <div className="text-sm whitespace-pre-wrap leading-relaxed"
                        dangerouslySetInnerHTML={{ __html: sanitizeAiContent(msg.content, {
                          linkClass: msg.role === 'user' ? 'text-white/80 hover:text-white' : 'font-semibold underline',
                          linkStyle: msg.role === 'assistant' ? `color: ${config.color.hex}` : ''
                        }) }} />
                    </div>

                    {/* Actions Menu */}
                    <div className={`absolute -bottom-8 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 ${msg.role === 'user' ? 'right-0' : 'left-0 ml-10'}`}>
                      {msg.role === 'assistant' && (
                        <button onClick={() => handleCopy(msg.content, originalIndex)} title="Copy message"
                          className="p-1.5 rounded-lg bg-white shadow-sm border border-slate-200 hover:bg-slate-50 text-slate-400 hover:text-emerald-600 transition">
                          {copied === originalIndex ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
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
