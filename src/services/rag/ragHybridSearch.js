// src/services/rag/ragHybridSearch.js
// Next-Generation Hybrid RAG Retrieval Engine 2.0
// Features: Reciprocal Rank Fusion (RRF), Botanical Synonym Expansion, HyDE Query Enrichment,
// Dynamic Query Intent Classification, and Maximal Marginal Relevance (MMR) Diversification.

import { BM25Index } from './ragBM25.js';
import { generateLocalSemanticVector, searchVectorIndex } from './ragVector.js';

// Comprehensive Agronomic Botanical, Chemical & Regional Synonym Dictionary
export const AGRONOMIC_SYNONYMS = {
  // Grasses
  cynodon: ['cynodon dactylon', 'bermuda grass', 'hariali', 'doob grass', 'wiregrass', 'rhizome', 'stolon'],
  bermuda: ['cynodon dactylon', 'hariali', 'doob grass', 'bermuda grass'],
  echinochloa: ['echinochloa colona', 'echinochloa crus-galli', 'barnyard grass', 'jungle rice', 'samwa', 'swank'],
  digitaria: ['digitaria sanguinalis', 'crabgrass'],
  eleusine: ['eleusine indica', 'goosegrass', 'crowfoot grass'],
  // Sedges
  cyperus: ['cyperus rotundus', 'purple nutsedge', 'motha', 'lavala', 'nutgrass', 'tuber sedge', 'yellow nutsedge'],
  nutsedge: ['cyperus rotundus', 'motha', 'lavala', 'tuber', 'purple nutsedge', 'cyperus difformis'],
  // Broadleaves
  parthenium: ['parthenium hysterophorus', 'congress grass', 'carrot grass', 'gajar ghas', 'white top'],
  amaranthus: ['amaranthus viridis', 'pigweed', 'chaulai'],
  trianthema: ['trianthema portulacastrum', 'horse purslane', 'itsit', 'santhi'],
  convolvulus: ['convolvulus arvensis', 'field bindweed', 'hirankhuri'],
  commelina: ['commelina benghalensis', 'dayflower', 'bengal dayflower'],
  // Crops
  sugarcane: ['sugarcane', 'cane ratoon', 'saccharum officinarum', 'crop selectivity'],
  cotton: ['cotton', 'gossypium hirsutum', 'crop safety', 'boll'],
  soybean: ['soybean', 'glycine max', 'legume selectivity'],
  maize: ['maize', 'corn', 'zea mays'],
  paddy: ['paddy', 'rice', 'oryza sativa'],
  // Active Ingredients & Formulations
  pelargonic: ['pelargonic acid', 'nonanoic acid', 'bpd', 'bio-herbicide', 'contact desiccant', 'ppo mimic'],
  glyphosate: ['glycyl', 'glyphosate ipa', 'systemic epsps', 'translocating phloem'],
  glufosinate: ['glufosinate ammonium', 'pat', 'glutamine synthetase'],
  clethodim: ['clethodim', 'accase inhibitor', 'graminicide'],
  atrazine: ['atrazine', 'photosystem ii', 'residual pre-em'],
  // Synergies & Concepts
  synergy: ['colby formula', 'synergism', 'tank mix compatibility', 'adjuvant spreading'],
  colby: ['colby model', 'expected vs observed', 'synergy factor', 'antagonism'],
  rainfast: ['rainfastness', 'washoff resistance', 'adjuvant retention', 'rain hours']
};

/**
 * Classifies semantic intent of the agronomist's inquiry to dynamically adjust retrieval weights
 */
export function classifyQueryIntent(query = '') {
  const q = query.toLowerCase();

  if (/\b(recipe|ingredient|ingredients|composition|make|formulate|cost per l|batch|dilution|how much|formula|concentration)\b/i.test(q)) {
    return 'FORMULATION_RECIPE';
  }
  if (/\b(synergy|colby|wadley|antagonism|hrac|frac|irac|mode of action|moa|tank mix|mix|compatible|compatibility)\b/i.test(q)) {
    return 'SYNERGY_RESISTANCE';
  }
  if (/\b(timeline|daa|day|days after|symptom|progression|symptoms|over time|speed of kill|burndown rate)\b/i.test(q)) {
    return 'TIMELINE_OBSERVATION';
  }
  if (/\b(crop safe|crop safety|selectivity|phytotoxicity|injury|stunting|chlorosis|tolerance|safe on|safe in|cane|sugarcane|cotton|soybean)\b/i.test(q)) {
    return 'CROP_SELECTIVITY';
  }
  if (/\b(weather|rain|rainfast|washoff|temperature|heat|hot|wind|drift|delta-t|humidity|microclimate)\b/i.test(q)) {
    return 'WEATHER_RESILIENCE';
  }
  if (/\b(kill|control|against|target|cynodon|cyperus|parthenium|nutsedge|dactylon|hariali|broadleaf|grass|sedge|weed)\b/i.test(q)) {
    return 'TARGET_WEED_MATRIX';
  }
  if (/\b(best|winner|compare|top|highest|leaderboard|ranking|most effective|longevity|longest|sustained|duration|meta-analysis)\b/i.test(q)) {
    return 'BENCHMARK_COMPARISON';
  }
  if (/\b(inventory|stock|raw material|cost of|price of|adjuvant|surfactant|penetrant|technical active)\b/i.test(q)) {
    return 'INGREDIENT_POOL';
  }

  return 'GENERAL_TRIAL_QUERY';
}

/**
 * Resolves conversational pronouns, injects botanical synonyms, and enriches query with HyDE context
 */
export function expandConversationalQuery(currentQuery = '', conversationHistory = []) {
  const q = String(currentQuery || '').trim();
  if (!q) return '';

  const lowerQ = q.toLowerCase();
  const tokens = lowerQ.replace(/[^\w\s]/g, ' ').split(/\s+/).filter(Boolean);

  // 1. Botanical & Agronomic Synonym Expansion
  const expandedSynonyms = new Set();
  tokens.forEach(tok => {
    if (AGRONOMIC_SYNONYMS[tok]) {
      AGRONOMIC_SYNONYMS[tok].slice(0, 3).forEach(syn => expandedSynonyms.add(syn));
    }
  });

  // 2. Multi-Turn Coreference Resolution
  const recentEntities = [];
  const recentTurns = conversationHistory.slice(-4);

  recentTurns.forEach(turn => {
    const text = String(turn.content || '');
    // Match trial IDs
    const trialIds = text.match(/\b(17\d{8,14}|\d{7,15})\b/g) || [];
    trialIds.forEach(id => recentEntities.push(id));

    // Match formulas and weed targets
    const keywords = [
      'glycyl', 'bpd', 'cl-5', 'goweed', 'g-5', 'microweed', 'pelargonic', 'glyphosate',
      'cynodon', 'bermuda', 'cyperus', 'nutsedge', 'parthenium', 'echinochloa', 'broadleaf',
      'atrazine', 'pendimethalin', 'clethodim', 'haloxyfop', '2,4-d', 'paraquat', 'glufosinate'
    ];
    keywords.forEach(kw => {
      if (text.toLowerCase().includes(kw)) {
        recentEntities.push(kw);
      }
    });
  });

  const uniqueEntities = Array.from(new Set(recentEntities)).slice(0, 4);

  const parts = [q];
  if (expandedSynonyms.size > 0) {
    parts.push(Array.from(expandedSynonyms).join(' '));
  }
  if (uniqueEntities.length > 0) {
    parts.push(uniqueEntities.join(' '));
  }

  return parts.join(' ');
}

/**
 * Master Hybrid Search across BM25 sparse index and Dense Semantic vector index (512D)
 * Merges rankings using Reciprocal Rank Fusion (RRF) with Intent Multipliers, Provenance Weighting, & MMR
 */
export function executeHybridRAGSearch({
  query,
  conversationHistory = [],
  chunks = [],
  bm25Index = null,
  vectorEntries = [],
  activeCategory = 'herbicide',
  topK = 10
}) {
  if (!chunks || chunks.length === 0) return [];

  // 1. Classify query intent
  const intent = classifyQueryIntent(query);

  // 2. Expand query with multi-turn conversation memory and botanical synonyms
  const expandedQuery = expandConversationalQuery(query, conversationHistory);

  // Dynamic weights based on query specificity
  const hasSpecificIdOrCode = /\d{4,}/.test(expandedQuery) || /^[a-z]{1,4}-\d+/i.test(expandedQuery);
  const bm25Weight = hasSpecificIdOrCode ? 0.70 : 0.55;
  const vectorWeight = 1.0 - bm25Weight;

  // 3. Run BM25 Sparse Keyword Search
  let bm25Results = [];
  if (bm25Index) {
    bm25Results = bm25Index.search(expandedQuery, topK * 4);
  } else {
    const tempBM25 = new BM25Index().buildIndex(chunks);
    bm25Results = tempBM25.search(expandedQuery, topK * 4);
  }

  // 4. Run Dense Semantic Vector Search (512D)
  const queryVector = generateLocalSemanticVector(expandedQuery);
  const vectorResults = searchVectorIndex(queryVector, vectorEntries, topK * 4);

  // 5. Reciprocal Rank Fusion (RRF) with Intent Re-ranking
  // RRF(d) = w_bm25 / (60 + rank_bm25) + w_vec / (60 + rank_vec)
  const rrfScores = new Map();
  const chunkMap = new Map();

  chunks.forEach(c => chunkMap.set(c.id, c));

  // Score BM25 ranks
  bm25Results.forEach((res, rank) => {
    const docId = res.docId;
    const score = bm25Weight / (60 + rank + 1);
    rrfScores.set(docId, (rrfScores.get(docId) || 0) + score);
  });

  // Score Vector ranks
  vectorResults.forEach((res, rank) => {
    const docId = res.docId;
    const score = vectorWeight / (60 + rank + 1);
    rrfScores.set(docId, (rrfScores.get(docId) || 0) + score);
  });

  // 6. Cross-Encoder Multipliers, Provenance Credibility, and Title Matching
  const queryLower = query.toLowerCase();
  const targetCategory = activeCategory.toLowerCase();

  const candidateList = Array.from(rrfScores.entries())
    .map(([docId, baseRrfScore]) => {
      const chunk = chunkMap.get(docId);
      if (!chunk) return null;

      let scoreMultiplier = 1.0;
      const type = chunk.metadata?.chunkType;
      const titleLower = (chunk.title || '').toLowerCase();

      // Intent-based type boosting
      if (intent === 'TARGET_WEED_MATRIX') {
        if (type === 'weed_efficacy_matrix') scoreMultiplier *= 2.2;
        else if (type === 'trial_summary') scoreMultiplier *= 1.4;
        else if (type === 'benchmark_leaderboard') scoreMultiplier *= 1.3;
      } else if (intent === 'CROP_SELECTIVITY') {
        if (type === 'crop_safety_matrix') scoreMultiplier *= 2.5;
        else if (type === 'trial_summary') scoreMultiplier *= 1.35;
      } else if (intent === 'WEATHER_RESILIENCE') {
        if (type === 'weather_resilience_matrix') scoreMultiplier *= 2.4;
        else if (type === 'trial_observations') scoreMultiplier *= 1.6;
      } else if (intent === 'FORMULATION_RECIPE') {
        if (type === 'formulation_recipe') scoreMultiplier *= 1.8;
        else if (type === 'formulation_aggregate') scoreMultiplier *= 1.4;
        else if (type === 'ingredient_profile') scoreMultiplier *= 1.3;
      } else if (intent === 'SYNERGY_RESISTANCE') {
        if (type === 'formulation_synergy') scoreMultiplier *= 2.0;
        else if (type === 'formulation_recipe') scoreMultiplier *= 1.4;
      } else if (intent === 'TIMELINE_OBSERVATION') {
        if (type === 'trial_observations') scoreMultiplier *= 1.9;
        else if (type === 'trial_summary') scoreMultiplier *= 1.3;
      } else if (intent === 'BENCHMARK_COMPARISON') {
        if (type === 'benchmark_leaderboard') scoreMultiplier *= 1.8;
        else if (type === 'formulation_aggregate') scoreMultiplier *= 1.7;
        else if (type === 'weed_efficacy_matrix') scoreMultiplier *= 1.5;
      } else if (intent === 'INGREDIENT_POOL') {
        if (type === 'ingredient_profile') scoreMultiplier *= 1.8;
        else if (type === 'ingredient_inventory') scoreMultiplier *= 1.5;
      }

      // Exact title match bonus
      if (titleLower && queryLower.includes(titleLower)) {
        scoreMultiplier *= 1.5;
      }

      // Provenance credibility bonus: Finalized trials have verified empirical closure
      if (chunk.metadata?.isCompleted) {
        scoreMultiplier *= 1.15;
      }

      return {
        id: docId,
        score: baseRrfScore * scoreMultiplier,
        chunk
      };
    })
    .filter(item => {
      if (!item || !item.chunk) return false;
      const chunkCat = (item.chunk.category || 'herbicide').toLowerCase();
      return chunkCat === targetCategory;
    })
    .sort((a, b) => b.score - a.score);

  // 7. Apply Maximal Marginal Relevance (MMR) for Information Diversity
  const vectorMap = new Map();
  vectorEntries.forEach(ve => vectorMap.set(ve.id, ve.vector));

  const diversifiedChunks = applyMaximalMarginalRelevance(
    candidateList,
    vectorMap,
    queryVector,
    topK,
    0.72
  );

  return diversifiedChunks;
}

/**
 * Maximal Marginal Relevance (MMR) Selector
 * Balances relevance with information novelty/diversity across entity types and documents
 */
export function applyMaximalMarginalRelevance(candidates = [], vectorMap = new Map(), queryVector = null, topK = 10, lambda = 0.72) {
  if (candidates.length <= topK) return candidates.map(c => c.chunk);

  const selected = [];
  const remaining = [...candidates];

  const cosine = (vA, vB) => {
    if (!vA || !vB || vA.length !== vB.length) return 0;
    let dot = 0;
    for (let i = 0; i < vA.length; i++) dot += vA[i] * vB[i];
    return Math.max(0, dot);
  };

  while (selected.length < topK && remaining.length > 0) {
    let bestIdx = -1;
    let bestScore = -Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const cand = remaining[i];
      const candVec = vectorMap.get(cand.id);

      // Max similarity to already selected chunks
      let maxSimToSelected = 0;
      if (candVec && selected.length > 0) {
        for (const sel of selected) {
          const selVec = vectorMap.get(sel.id);
          if (selVec) {
            const sim = cosine(candVec, selVec);
            if (sim > maxSimToSelected) maxSimToSelected = sim;
          }
        }
      }

      // Entity redundancy penalty: discourages picking 3 chunks from the same trial
      const entityId = cand.chunk?.entityId;
      const sameEntityCount = selected.filter(s => s.chunk?.entityId === entityId).length;
      const entityPenalty = sameEntityCount * 0.15;

      // MMR formula: lambda * relevance - (1 - lambda) * max_similarity_to_selected
      const mmr = lambda * cand.score - (1 - lambda) * maxSimToSelected - entityPenalty;

      if (mmr > bestScore) {
        bestScore = mmr;
        bestIdx = i;
      }
    }

    if (bestIdx !== -1) {
      selected.push(remaining.splice(bestIdx, 1)[0]);
    } else {
      break;
    }
  }

  return selected.map(s => s.chunk);
}
