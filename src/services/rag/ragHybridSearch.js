// src/services/rag/ragHybridSearch.js
// Next-Generation Hybrid RAG Retrieval Engine with Reciprocal Rank Fusion (RRF)
// and Multi-Turn Conversational Coreference Resolution.

import { BM25Index } from './ragBM25.js';
import { generateLocalSemanticVector, searchVectorIndex } from './ragVector.js';

/**
 * Resolves conversational pronouns and coreferences from past dialogue turns
 */
export function expandConversationalQuery(currentQuery = '', conversationHistory = []) {
  const q = String(currentQuery || '').trim();
  if (!q) return '';

  const lowerQ = q.toLowerCase();

  // Pronouns or demonstratives indicating follow-up dependency
  const hasPronoun = /\b(it|this|that|these|those|its|the first one|the second one|the winner|between them|among these|which one|the formulation|the candidate)\b/i.test(lowerQ);
  const isBriefEllipsis = lowerQ.split(/\s+/).length <= 4 && (lowerQ.includes('?') || lowerQ.startsWith('and ') || lowerQ.startsWith('what about '));

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
      'cynodon', 'bermuda', 'cyperus', 'nutsedge', 'parthenium', 'echinochloa', 'broadleaf'
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
 * Merges rankings using Reciprocal Rank Fusion (RRF)
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

  // 1. Expand query with multi-turn conversation memory
  const expandedQuery = expandConversationalQuery(query, conversationHistory);

  // 2. Run BM25 Sparse Keyword Search
  let bm25Results = [];
  if (bm25Index) {
    bm25Results = bm25Index.search(expandedQuery, topK * 2);
  } else {
    const tempBM25 = new BM25Index().buildIndex(chunks);
    bm25Results = tempBM25.search(expandedQuery, topK * 2);
  }

  // 3. Run Dense Semantic Vector Search
  const queryVector = generateLocalSemanticVector(expandedQuery);
  const vectorResults = searchVectorIndex(queryVector, vectorEntries, topK * 2);

  // 4. Reciprocal Rank Fusion (RRF)
  // RRF(d) = w_bm25 / (60 + rank_bm25) + w_vec / (60 + rank_vec)
  const rrfScores = new Map();
  const chunkMap = new Map();

  chunks.forEach(c => chunkMap.set(c.id, c));

  // Score BM25 ranks
  bm25Results.forEach((res, rank) => {
    const docId = res.docId;
    const score = 0.6 / (60 + rank + 1);
    rrfScores.set(docId, (rrfScores.get(docId) || 0) + score);
  });

  // Score Vector ranks
  vectorResults.forEach((res, rank) => {
    const docId = res.docId;
    const score = 0.4 / (60 + rank + 1);
    rrfScores.set(docId, (rrfScores.get(docId) || 0) + score);
  });

  // 5. Build final ranked list filtered by active category
  const targetCategory = activeCategory.toLowerCase();

  const rankedChunks = Array.from(rrfScores.entries())
    .map(([docId, rrfScore]) => {
      const chunk = chunkMap.get(docId);
      return {
        id: docId,
        score: rrfScore,
        chunk
      };
    })
    .filter(item => {
      if (!item.chunk) return false;
      const chunkCat = (item.chunk.category || 'herbicide').toLowerCase();
      return chunkCat === targetCategory;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(item => item.chunk);

  return rankedChunks;
}
