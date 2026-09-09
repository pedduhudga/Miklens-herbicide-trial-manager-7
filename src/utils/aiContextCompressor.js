/**
 * aiContextCompressor.js
 * Smart Query-Aware Context Compressor for Miklens AI Assistant.
 *
 * Problem: The raw AI context from aiMemory.js is ~40KB (8,000-10,000 tokens) on EVERY message.
 * This rapidly exhausts free-tier Gemini rate limits (TPM / RPM) and slows down time-to-first-token.
 *
 * Solution: Dynamically analyze the user's prompt, extract query intent and target entities
 * (trial IDs, formula names, target weeds, benchmarks, novel recipes), and selectively
 * include only the relevant sections and filtered trial rows.
 */

/**
 * Splits a structured markdown/text context string into named sections based on '=== TITLE ===' headers.
 */
export function parseContextSections(contextString) {
  if (!contextString || typeof contextString !== 'string') return {};
  
  const lines = contextString.split('\n');
  const sections = {};
  let currentTitle = '__HEADER__';
  let currentLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^=== (.+?) ===$/);
    if (match) {
      if (currentLines.length > 0 || currentTitle !== '__HEADER__') {
        sections[currentTitle] = currentLines.join('\n').trim();
      }
      currentTitle = match[1].trim();
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }

  if (currentLines.length > 0) {
    sections[currentTitle] = currentLines.join('\n').trim();
  }

  return sections;
}

/**
 * Extracts entities and intents from the user prompt.
 */
export function analyzeUserQuery(query = '') {
  const q = String(query || '').toLowerCase().trim();
  
  // Specific trial ID search: numbers with 5+ digits or "trial #123"
  const trialIdMatches = query.match(/\b(17\d{8,14}|\d{6,15})\b/g) || [];
  const mentionsTrialExplicitly = trialIdMatches.length > 0 || /\btrial\s*(id|#|number|\b\d+)/i.test(query);

  // Common formulation names & code patterns
  const formulaMentions = [];
  const knownKeywords = [
    'glycyl', 'bpd', 'cl-5', 'cl5', 'goweed', 'ultra', 'g5', 'g-5', 'herb-x', 
    'roundup', 'gramoxone', 'bastion', 'tornado', 'cleanweed', 'm-shield',
    'miklens', 'formula', 'recipe', 'formulation'
  ];
  for (const kw of knownKeywords) {
    if (new RegExp(`\\b${kw.replace('-', '[- ]?')}\\b`, 'i').test(q)) {
      formulaMentions.push(kw);
    }
  }

  // Targets / Weeds / Pathogens / Crops
  const targetKeywords = [
    'weed', 'grass', 'sedge', 'broadleaf', 'parthenium', 'bermuda', 'cynodon',
    'cyperus', 'echinochloa', 'trianthema', 'amaranthus', 'convolvulus', 'target',
    'pest', 'disease', 'fungus', 'crop', 'soybean', 'cotton', 'rice', 'wheat', 'corn', 'maize'
  ];
  const targetMentions = targetKeywords.filter(tk => q.includes(tk));

  // Benchmark / Comparison / Top Performers
  const isBenchmark = /\b(benchmark|top|best|leaderboard|highest|rank|ranking|compare|comparison|win rate|versus|vs)\b/i.test(q);

  // Follow-up decision query (e.g. "among these which is the best", "which one would you pick")
  const isFollowUpDecision = /\b(among these|between these|which is the best|which one is best|which one should i choose|pick one|which is better|which one would you recommend|who wins|which one)\b/i.test(q);

  // Novel formulation / Recipe creation / Chemistry synergy
  const isNovelFormula = /\b(novel|suggest|new formula|new recipe|candidate|invent|create|synergy|ingredients?|upgrade recipe|potential candidate)\b/i.test(q);

  // Failure / Weather / Anomalies
  const isWeatherOrFailure = /\b(fail|failure|weather|rain|temperature|humidity|poor|inconsistent|variable|low efficacy)\b/i.test(q);

  // Investigator / Location
  const isInvestigator = /\b(investigator|researcher|who tested|who ran|who conducted|location|station|field site)\b/i.test(q);

  // Conversational / Greeting
  const isGreetingOrMeta = /^(hi|hello|hey|greetings|help|who are you|what can you do)\b/i.test(q) && q.length < 35;

  // General "all" request
  const requestsAll = /\b(all\s+(historical\s+)?(herbicide\s+|fungicide\s+|pesticide\s+)?trials?|all\s+(historical\s+)?results?|everything|full\s+database|entire\s+dataset|complete\s+index|based on all|complete\s+(formula|trial|database|dataset|history)|all\s+trials)\b/i.test(q);

  return {
    rawQuery: query,
    trialIds: trialIdMatches,
    mentionsTrialExplicitly,
    formulaMentions,
    targetMentions,
    isBenchmark,
    isFollowUpDecision,
    isNovelFormula,
    isWeatherOrFailure,
    isInvestigator,
    isGreetingOrMeta,
    requestsAll
  };
}

/**
 * Filter trial index lines to only those matching target entities.
 */
function filterTrialIndex(trialIndexText, queryAnalysis) {
  if (!trialIndexText) return '';
  const lines = trialIndexText.split('\n');
  
  // If specific trial IDs searched, find exact matches first
  if (queryAnalysis.trialIds.length > 0) {
    const matched = lines.filter(line => 
      queryAnalysis.trialIds.some(id => line.includes(id))
    );
    if (matched.length > 0) {
      return matched.join('\n');
    }
  }

  // If specific formula searched, filter trials matching formula name
  if (queryAnalysis.formulaMentions.length > 0) {
    const matched = lines.filter(line => {
      const lower = line.toLowerCase();
      return queryAnalysis.formulaMentions.some(f => lower.includes(f));
    });
    if (matched.length > 0) {
      return matched.slice(0, 30).join('\n');
    }
  }

  // If specific target searched, filter trials matching target
  if (queryAnalysis.targetMentions.length > 0) {
    const matched = lines.filter(line => {
      const lower = line.toLowerCase();
      return queryAnalysis.targetMentions.some(t => lower.includes(t));
    });
    if (matched.length > 0) {
      return matched.slice(0, 30).join('\n');
    }
  }

  // If user is asking a follow-up decision ("among these which is the best"):
  if (queryAnalysis.isFollowUpDecision) {
    return lines.slice(0, 5).join('\n');
  }

  // If user is asking for novel formulation candidate design:
  // Provide all trials with high efficacy or excellent results across all targets (up to 80 trials)
  if (queryAnalysis.isNovelFormula) {
    const highEffTrials = lines.filter(line => /100%eff|[89]\d%eff|result:Excellent/i.test(line));
    if (highEffTrials.length > 0) {
      return highEffTrials.slice(0, 80).join('\n');
    }
    return lines.slice(0, 80).join('\n');
  }

  // Default: return top 25 trials to keep context concise
  return lines.slice(0, 25).join('\n') + (lines.length > 25 ? `\n... [${lines.length - 25} older trials omitted for brevity. Ask for specific trial ID or formula to inspect]` : '');
}

/**
 * Main compression entrypoint.
 * Intelligently prunes and formats the AI memory context for the specific query.
 */
export function compressAIContext(contextString, userQuery, options = {}) {
  if (!contextString) {
    return {
      compressedContext: '',
      originalSize: 0,
      compressedSize: 0,
      compressionRatio: 0,
      detectedIntents: []
    };
  }

  const originalSize = contextString.length;
  const analysis = analyzeUserQuery(userQuery);

  // If user explicitly asks for full dump or query is unspecified, return original with safety cap
  if (analysis.requestsAll) {
    return {
      compressedContext: contextString,
      originalSize,
      compressedSize: originalSize,
      compressionRatio: 0,
      detectedIntents: ['full_database_request']
    };
  }

  const sections = parseContextSections(contextString);
  const includedSections = [];
  const detectedIntents = [];

  // 1. ALWAYS INCLUDE: Database Overview (vital summary stats)
  const overviewKey = Object.keys(sections).find(k => k.includes('DATABASE OVERVIEW'));
  if (overviewKey && sections[overviewKey]) {
    includedSections.push(`=== ${overviewKey} ===\n${sections[overviewKey]}`);
  }

  // 2. ALWAYS INCLUDE: Trial Types & Field-Scale Validation context (brief & crucial)
  const trialTypesKey = Object.keys(sections).find(k => k.includes('TRIAL TYPES & FIELD-SCALE VALIDATION'));
  if (trialTypesKey && sections[trialTypesKey]) {
    includedSections.push(`=== ${trialTypesKey} ===\n${sections[trialTypesKey]}`);
  }

  // 3. Greeting / Conversational query: give minimal lightweight summary
  if (analysis.isGreetingOrMeta) {
    detectedIntents.push('greeting_or_meta');
    const topKey = Object.keys(sections).find(k => k.includes('TOP PERFORMING'));
    if (topKey && sections[topKey]) {
      const topLines = sections[topKey].split('\n').slice(0, 10).join('\n');
      includedSections.push(`=== ${topKey} ===\n${topLines}`);
    }
    const rulesKey = Object.keys(sections).find(k => k.includes('CRITICAL RULES'));
    if (rulesKey && sections[rulesKey]) {
      includedSections.push(`=== ${rulesKey} ===\n${sections[rulesKey]}`);
    }
    const resultText = includedSections.join('\n\n');
    return {
      compressedContext: resultText,
      originalSize,
      compressedSize: resultText.length,
      compressionRatio: Math.round((1 - resultText.length / originalSize) * 100),
      detectedIntents
    };
  }

  // 4. TOP PERFORMING TRIALS: Include for benchmark, top performers, or default general questions
  const topTrialsKey = Object.keys(sections).find(k => k.includes('TOP PERFORMING'));
  if (topTrialsKey && sections[topTrialsKey]) {
    if (analysis.isBenchmark || analysis.isNovelFormula || !analysis.mentionsTrialExplicitly) {
      includedSections.push(`=== ${topTrialsKey} ===\n${sections[topTrialsKey]}`);
      if (analysis.isBenchmark) detectedIntents.push('benchmark_or_top');
    }
  }

  // 5. INGREDIENT INVENTORY & FIELD SYNERGY MATRIX:
  // Crucial when discussing novel formulations, recipes, chemistry, or upgrades
  const ingredientKey = Object.keys(sections).find(k => k.includes('INGREDIENT INVENTORY & FIELD SYNERGY MATRIX'));
  if (ingredientKey && sections[ingredientKey]) {
    if (analysis.isNovelFormula || analysis.formulaMentions.length > 0 || analysis.isBenchmark) {
      includedSections.push(`=== ${ingredientKey} ===\n${sections[ingredientKey]}`);
      detectedIntents.push('ingredient_synergy');
    }
  }

  // 5b. HISTORICAL MULTI-INGREDIENT SYNERGY BENCHMARKS:
  const multiKey = Object.keys(sections).find(k => k.includes('HISTORICAL MULTI-INGREDIENT SYNERGY BENCHMARKS'));
  if (multiKey && sections[multiKey]) {
    if (analysis.isNovelFormula || analysis.formulaMentions.length > 0 || analysis.isBenchmark) {
      includedSections.push(`=== ${multiKey} ===\n${sections[multiKey]}`);
      detectedIntents.push('multi_ingredient_synergy');
    }
  }

  // 5c. WEED TARGET SPECIES TRIAL COVERAGE MATRIX:
  const targetCovKey = Object.keys(sections).find(k => k.includes('WEED TARGET SPECIES TRIAL COVERAGE MATRIX'));
  if (targetCovKey && sections[targetCovKey]) {
    if (analysis.isNovelFormula || analysis.targetMentions.length > 0 || analysis.isBenchmark) {
      includedSections.push(`=== ${targetCovKey} ===\n${sections[targetCovKey]}`);
      detectedIntents.push('target_coverage_matrix');
    }
  }

  // 6. FORMULATION KNOWLEDGE BASE:
  const formBaseKey = Object.keys(sections).find(k => k.includes('FORMULATION KNOWLEDGE BASE'));
  if (formBaseKey && sections[formBaseKey]) {
    // If specific formulas mentioned (and not asking for novel formula or benchmark), filter formulation blocks
    if (analysis.formulaMentions.length > 0 && !analysis.isBenchmark && !analysis.isNovelFormula) {
      const rawText = sections[formBaseKey];
      const blocks = rawText.split(/\n(?=[A-Z0-9_-]+\s*\(Code:|\bName:)/i);
      const matchedBlocks = blocks.filter(b => 
        analysis.formulaMentions.some(f => b.toLowerCase().includes(f))
      );
      if (matchedBlocks.length > 0) {
        includedSections.push(`=== ${formBaseKey} (Filtered for queried formulations) ===\n${matchedBlocks.join('\n\n')}`);
        detectedIntents.push('filtered_formulations');
      } else {
        includedSections.push(`=== ${formBaseKey} ===\n${rawText}`);
      }
    } else {
      includedSections.push(`=== ${formBaseKey} ===\n${sections[formBaseKey]}`);
    }
  }

  // 7. FORMULA PERFORMANCE OVERVIEW:
  const formPerfKey = Object.keys(sections).find(k => k.includes('FORMULA PERFORMANCE OVERVIEW'));
  if (formPerfKey && sections[formPerfKey]) {
    includedSections.push(`=== ${formPerfKey} ===\n${sections[formPerfKey]}`);
  }

  // 8. TARGET-BASED FORMULA RANKINGS:
  const rankKey = Object.keys(sections).find(k => k.includes('TARGET-BASED FORMULA RANKINGS'));
  if (rankKey && sections[rankKey]) {
    if (analysis.targetMentions.length > 0) {
      detectedIntents.push('target_rankings');
      const rawRank = sections[rankKey];
      const targetBlocks = rawRank.split(/\n(?=  TARGET:)/);
      const matched = targetBlocks.filter(tb => 
        analysis.targetMentions.some(t => tb.toLowerCase().includes(t))
      );
      if (matched.length > 0) {
        includedSections.push(`=== ${rankKey} (Filtered for matching targets) ===\n${matched.join('\n\n')}`);
      } else {
        includedSections.push(`=== ${rankKey} ===\n${rawRank}`);
      }
    } else {
      includedSections.push(`=== ${rankKey} ===\n${sections[rankKey]}`);
    }
  }

  // 9. SAME-FORMULA VARIABLE OUTCOMES (Weather/Timing Analysis):
  const failKey = Object.keys(sections).find(k => k.includes('SAME-FORMULA VARIABLE OUTCOMES'));
  if (failKey && sections[failKey]) {
    if (analysis.isWeatherOrFailure || analysis.formulaMentions.length > 0) {
      includedSections.push(`=== ${failKey} ===\n${sections[failKey]}`);
      detectedIntents.push('weather_or_failure_cases');
    }
  }

  // 10. INVESTIGATOR SUMMARY:
  const invKey = Object.keys(sections).find(k => k.includes('INVESTIGATOR SUMMARY'));
  if (invKey && sections[invKey]) {
    if (analysis.isInvestigator) {
      includedSections.push(`=== ${invKey} ===\n${sections[invKey]}`);
      detectedIntents.push('investigator_summary');
    }
  }

  // 11. COMPLETE TRIAL INDEX:
  // This is typically the single largest section (~20KB-25KB).
  // Dynamically filter it to matching trials rather than dumping all 100+ trials!
  const trialIndexKey = Object.keys(sections).find(k => k.includes('COMPLETE TRIAL INDEX'));
  if (trialIndexKey && sections[trialIndexKey]) {
    const filteredTrials = filterTrialIndex(sections[trialIndexKey], analysis);
    includedSections.push(`=== ${trialIndexKey} ===\n${filteredTrials}`);
    detectedIntents.push('smart_filtered_trials');
  }

  // 12. CRITICAL RULES & GUIDELINES: ALWAYS INCLUDE
  const rulesKey = Object.keys(sections).find(k => k.includes('CRITICAL RULES'));
  if (rulesKey && sections[rulesKey]) {
    includedSections.push(`=== ${rulesKey} ===\n${sections[rulesKey]}`);
  }

  const novelKey = Object.keys(sections).find(k => k.includes('GUIDELINES FOR NOVEL FORMULATION RECOMMENDATIONS'));
  if (novelKey && sections[novelKey]) {
    includedSections.push(`=== ${novelKey} ===\n${sections[novelKey]}`);
  }

  const compressedContext = includedSections.join('\n\n');
  const compressedSize = compressedContext.length;
  const compressionRatio = Math.max(0, Math.round((1 - compressedSize / originalSize) * 100));

  return {
    compressedContext,
    originalSize,
    compressedSize,
    compressionRatio,
    detectedIntents
  };
}
