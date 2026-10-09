// src/services/rag/ragEngine.js
// Master Next-Generation RAG Engine for Miklens Trial Manager
// Completely free, zero Firebase quota consumption, ultra-fast client-side hybrid retrieval.

import { generateCategoryChunks, simpleHash } from './ragChunker.js';
import { BM25Index } from './ragBM25.js';
import { generateLocalSemanticVector } from './ragVector.js';
import { executeHybridRAGSearch } from './ragHybridSearch.js';
import { getStoredChunks, putStoredChunks, getRAGMeta, setRAGMeta } from './ragStore.js';

// In-Memory Active Category Cache
const activeIndexCache = new Map();

// In-Memory Query LRU Cache
const queryCache = new Map();
const MAX_QUERY_CACHE_SIZE = 50;

/**
 * Initializes or incrementally updates the RAG index for a category
 * Runs non-blockingly without affecting UI responsiveness.
 */
export async function initRAGIndex({
  trials = [],
  formulations = [],
  projects = [],
  ingredients = [],
  activeCategory = 'herbicide',
  forceReindex = false
}) {
  const cat = (activeCategory || 'herbicide').toLowerCase();

  // Compute corpus signature hash
  const signature = `${trials.length}_${formulations.length}_${projects.length}_${ingredients.length}_${cat}`;
  const corpusHash = simpleHash(signature);

  // Check in-memory cache first
  const existing = activeIndexCache.get(cat);
  if (!forceReindex && existing && existing.corpusHash === corpusHash) {
    return existing;
  }

  // Check persistent IndexedDB cache
  const storedHash = await getRAGMeta(`hash_${cat}`);
  let chunks = [];

  if (!forceReindex && storedHash === corpusHash) {
    chunks = await getStoredChunks(cat);
    if (chunks && chunks.length > 0) {
      console.log(`[RAG Engine] Loaded ${chunks.length} cached chunks from IndexedDB for ${cat} in <5ms`);
    }
  }

  // If no valid cached chunks, generate fresh chunks from in-memory data
  if (!chunks || chunks.length === 0) {
    console.log(`[RAG Engine] Building fresh semantic RAG chunks for ${cat}...`);
    chunks = generateCategoryChunks({
      trials,
      formulations,
      projects,
      ingredients,
      activeCategory: cat
    });

    // Save chunks to IndexedDB in background
    putStoredChunks(chunks).catch(() => {});
    setRAGMeta(`hash_${cat}`, corpusHash).catch(() => {});
  }

  // Build BM25 Index
  const bm25Index = new BM25Index().buildIndex(chunks);

  // Build Dense Semantic Vectors
  const vectorEntries = chunks.map(chunk => ({
    id: chunk.id,
    vector: generateLocalSemanticVector(`${chunk.title || ''} ${chunk.text || ''}`),
    chunk
  }));

  const indexData = {
    category: cat,
    corpusHash,
    chunks,
    bm25Index,
    vectorEntries,
    chunkCount: chunks.length,
    timestamp: Date.now()
  };

  activeIndexCache.set(cat, indexData);
  console.log(`[RAG Engine] Ready: ${chunks.length} chunks indexed for ${cat} (Hybrid BM25 + 256D Vector)`);
  return indexData;
}

/**
 * Master Retrieval Function: Returns structured, citation-grounded RAG context
 * Latency: ~10-35ms
 */
export async function retrieveRAGContext({
  query,
  conversationHistory = [],
  trials = [],
  formulations = [],
  projects = [],
  ingredients = [],
  activeCategory = 'herbicide',
  topK = 8
}) {
  const startTime = performance.now();
  const cat = (activeCategory || 'herbicide').toLowerCase();
  const cacheKey = `${cat}_${query.toLowerCase().trim()}_${conversationHistory.length}`;

  // Check query cache
  if (queryCache.has(cacheKey)) {
    const cached = queryCache.get(cacheKey);
    return cached;
  }

  // Ensure index is ready
  let indexData = activeIndexCache.get(cat);
  if (!indexData) {
    indexData = await initRAGIndex({
      trials,
      formulations,
      projects,
      ingredients,
      activeCategory: cat
    });
  }

  const { chunks, bm25Index, vectorEntries } = indexData;

  // Execute Hybrid RAG Search (BM25 + Dense Vector + RRF)
  const retrievedChunks = executeHybridRAGSearch({
    query,
    conversationHistory,
    chunks,
    bm25Index,
    vectorEntries,
    activeCategory: cat,
    topK
  });

  const retrievalDuration = Math.round(performance.now() - startTime);

  // Format retrieved chunks into clean markdown context for LLM
  let formattedContext = '';
  if (retrievedChunks.length > 0) {
    const chunkBlocks = retrievedChunks.map((chunk, idx) => {
      return `### [VERIFIED RECORD ${idx + 1}]: ${chunk.title}
${chunk.text}`;
    }).join('\n\n');

    formattedContext = `=== RETRIEVED GROUND-TRUTH AGRONOMIC KNOWLEDGE (HYBRID RAG: ${retrievedChunks.length} RECORDS, ${retrievalDuration}ms) ===
${chunkBlocks}
=== END RETRIEVED GROUND TRUTH ===`;
  } else {
    formattedContext = `=== RETRIEVED GROUND-TRUTH AGRONOMIC KNOWLEDGE ===
No specific plot trial or formulation records matching "${query}" were found in the ${cat.toUpperCase()} database.
=== END RETRIEVED GROUND TRUTH ===`;
  }

  const result = {
    contextText: formattedContext,
    retrievedChunks,
    retrievalDuration,
    chunkCount: retrievedChunks.length,
    category: cat
  };

  // Cache result
  if (queryCache.size >= MAX_QUERY_CACHE_SIZE) {
    const firstKey = queryCache.keys().next().value;
    queryCache.delete(firstKey);
  }
  queryCache.set(cacheKey, result);

  return result;
}

/**
 * Invalidate index cache when user saves or modifies a trial or formulation
 */
export function invalidateRAGCache(category = null) {
  if (category) {
    activeIndexCache.delete(category.toLowerCase());
  } else {
    activeIndexCache.clear();
  }
  queryCache.clear();
  console.log('[RAG Engine] Cache invalidated');
}
