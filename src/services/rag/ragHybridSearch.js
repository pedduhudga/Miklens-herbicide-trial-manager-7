// src/services/rag/ragHybridSearch.js
// Next-Generation Hybrid RAG Retrieval Engine with Reciprocal Rank Fusion (RRF),
// Query Intent Classification, and Multi-Turn Conversational Coreference Resolution.

import { BM25Index } from './ragBM25.js';
import { generateLocalSemanticVector, searchVectorIndex } from './ragVector.js';

/**
 * Classifies semantic intent of the agronomist's inquiry to dynamically adjust retrieval weights
 */
export function classifyQueryIntent(query = '') {
  const q = query.toLowerCase();

  if (/\b(recipe|ingredient|ingredients|composition|make|formulate|cost per l|batch|dilution|how much|formula)\b/i.test(q)) {
    return 'FORMULATION_RECIPE';
  }
  if (/\b(synergy|colby|wadley|antagonism|hrac|frac|irac|mode of action|moa|tank mix|mix|compatible|compatibility)\b/i.test(q)) {
    return 'SYNERGY_RESISTANCE';
  }
  if (/\b(timeline|daa|day|days after|symptom|progression|weather impact|over time|microclimate|rainfast)\b/i.test(q)) {
    return 'TIMELINE_OBSERVATION';
  }
  if (/\b(best|winner|compare|top|highest|leaderboard|ranking|most effective|longevity|longest|sustained|duration)\b/i.test(q)) {
    return 'BENCHMARK_COMPARISON';
  }
  if (/\b(inventory|stock|raw material|cost of|price of|adjuvant|surfactant|penetrant|technical active)\b/i.test(q)) {
    return 'INGREDIENT_POOL';
  }

  return 'GENERAL_TRIAL_QUERY';
}

/**
 * Resolves conversational pronouns and coreferences from past dialogue turns
 */
export function expandConversationalQuery(currentQuery = '', conversationHistory = []) {
  const q = String(currentQuery || '').trim();
  if (!q) return '';

  const lowerQ = q.toLowerCase();

  // Pronouns or demonstratives indicating follow-up dependency
  const hasPronoun = /\b(it|this|that|these|those|its|the first one|the second one|the winner|between them|among these|which one|the formulation|the candidate|tell me more|how about it)\b/i.test(lowerQ);
  const isBriefEllipsis = lowerQ.split(/\s+/).length <= 4 && (lowerQ.includes('?') || lowerQ.startsWith('and ') || lowerQ.startsWith('what about ') || lowerQ.startsWith('why '));

  if (!hasPronoun && !isBriefEllipsis && conversationHistory.length === 0) {
    return q;
  }

  // Extract recent entities mentioned in the last 2-4 turns
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

  if (uniqueEntities.length > 0) {
    const expanded = `${q} ${uniqueEntities.join(' ')}`;
    return expanded;
  }

  return q;
}

/**
 * Performs Hybrid Search across BM25 sparse index and Dense Semantic vector index
 * Merges rankings using Reciprocal Rank Fusion (RRF) with Dynamic Query Intent Boosts
 */
export function executeHybridRAGSearch({
  query,
  conversationHistory = [],
  chunks = [],
  bm25Index = null,
  vectorEntries = [],
  activeCategory = 'herbicide',
  topK = 8
}) {
  if (!chunks || chunks.length === 0) return [];

  // 1. Detect query intent
  const intent = classifyQueryIntent(query);

  // 2. Expand query with multi-turn conversation memory
  const expandedQuery = expandConversationalQuery(query, conversationHistory);

  // Dynamic weights based on query specificity
  const hasSpecificIdOrCode = /\d{4,}/.test(expandedQuery) || /^[a-z]{1,4}-\d+/i.test(expandedQuery);
  const bm25Weight = hasSpecificIdOrCode ? 0.75 : 0.60;
  const vectorWeight = 1.0 - bm25Weight;

  // 3. Run BM25 Sparse Keyword Search
  let bm25Results = [];
  if (bm25Index) {
    bm25Results = bm25Index.search(expandedQuery, topK * 3);
  } else {
    const tempBM25 = new BM25Index().buildIndex(chunks);
    bm25Results = tempBM25.search(expandedQuery, topK * 3);
  }

  // 4. Run Dense Semantic Vector Search
  const queryVector = generateLocalSemanticVector(expandedQuery);
  const vectorResults = searchVectorIndex(queryVector, vectorEntries, topK * 3);

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

  // 6. Cross-Encoder Intent Multipliers and Title Matching
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
      if (intent === 'FORMULATION_RECIPE') {
        if (type === 'formulation_recipe') scoreMultiplier *= 1.6;
        else if (type === 'ingredient_profile') scoreMultiplier *= 1.4;
      } else if (intent === 'SYNERGY_RESISTANCE') {
        if (type === 'formulation_synergy') scoreMultiplier *= 1.9;
        else if (type === 'formulation_recipe') scoreMultiplier *= 1.4;
      } else if (intent === 'TIMELINE_OBSERVATION') {
        if (type === 'trial_observations') scoreMultiplier *= 1.8;
      } else if (intent === 'BENCHMARK_COMPARISON') {
        if (type === 'benchmark_leaderboard') scoreMultiplier *= 1.7;
        else if (type === 'trial_summary') scoreMultiplier *= 1.35;
      } else if (intent === 'INGREDIENT_POOL') {
        if (type === 'ingredient_profile') scoreMultiplier *= 1.8;
        else if (type === 'ingredient_inventory') scoreMultiplier *= 1.5;
      }

      // Title exact phrase match bonus
      if (titleLower && queryLower.includes(titleLower)) {
        scoreMultiplier *= 1.4;
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
  // Prevents near-duplicate chunks from crowding out recipes, timelines, or benchmarks
  const vectorMap = new Map();
  vectorEntries.forEach(ve => vectorMap.set(ve.id, ve.vector));

  const diversifiedChunks = applyMaximalMarginalRelevance(
    candidateList,
    vectorMap,
    queryVector,
    topK,
    0.70
  );

  return diversifiedChunks;
}

/**
 * Maximal Marginal Relevance (MMR) Selector
 * Balances relevance with information novelty/diversity across entity types and documents
 */
export function applyMaximalMarginalRelevance(candidates = [], vectorMap = new Map(), queryVector = null, topK = 8, lambda = 0.70) {
  if (candidates.length <= topK) return candidates.map(c => c.chunk);

  const selected = [];
  const remaining = [...candidates];

  // Helper cosine function
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

      // Penalty if multiple chunks from the exact same entity are already selected
      const entityId = cand.chunk?.entityId;
      const sameEntityCount = selected.filter(s => s.chunk?.entityId === entityId).length;
      const entityPenalty = sameEntityCount * 0.12;

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

