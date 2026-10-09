// src/services/rag/ragVector.js
// Client-Side Dense Semantic Vector Engine
// Supports 100% free offline deterministic semantic projections & optional Gemini text-embedding-004
// Zero subscription fees, zero external vector database costs.

const VECTOR_DIM = 256;

// Agronomic Domain Semantic Concept Clusters
// These clusters give semantic proximity to related concepts even when exact words differ
const AGRONOMIC_CLUSTERS = [
  // Cluster 0: Grasses & Monocots
  ['grass', 'bermuda', 'cynodon', 'dactylon', 'echinochloa', 'goosegrass', 'crabgrass', 'poa', 'monocot', 'rhizome', 'stolon'],
  // Cluster 1: Sedges & Tubers
  ['sedge', 'cyperus', 'rotundus', 'nutsedge', 'tuber', 'basal', 'bulb', 'purple nutsedge', 'yellow nutsedge'],
  // Cluster 2: Broadleaves & Dicots
  ['broadleaf', 'parthenium', 'amaranthus', 'trianthema', 'convolvulus', 'dicot', 'euphorbia', 'chenopodium', 'mallow'],
  // Cluster 3: Systemic Translocation & Phloem Movement
  ['systemic', 'translocation', 'phloem', 'symplastic', 'root kill', 'translocate', 'rhizome kill', 'perennial', 'crown'],
  // Cluster 4: Contact Desiccation & Rapid Burndown
  ['contact', 'burndown', 'knockdown', 'foliar', 'desiccant', 'cell membrane', 'ppo', 'scorching', 'necrosis', 'fast action'],
  // Cluster 5: Synergy & Adjuvants
  ['synergy', 'colby', 'adjuvant', 'penetrant', 'surfactant', 'organosilicone', 'spreading', 'wetting', 'microweed', 'bpd', 'tank mix'],
  // Cluster 6: Longevity & Regrowth Prevention
  ['duration', 'control days', 'residual', 'regrowth', 'longevity', 'finalized', 'weeks', 'days control', 'suppression', 'sustained'],
  // Cluster 7: Weather & Rainfastness
  ['weather', 'rain', 'temperature', 'humidity', 'wind', 'delta-t', 'washoff', 'monsoon', 'inversion', 'drift', 'spray window'],
  // Cluster 8: Crop Safety & Phytotoxicity
  ['crop safety', 'phytotoxicity', 'injury', 'selectivity', 'tolerance', 'chlorosis', 'stunting', 'vein clearing', 'safener'],
  // Cluster 9: Chemistry & Formulation Types
  ['formulation', 'ec', 'sc', 'sl', 'recipe', 'batch', 'active ingredient', 'concentration', 'dosage', 'rate', 'dilution', 'cost']
];

/**
 * Fast deterministic string hash into an integer range [0, max - 1]
 */
function hashString(str, seed = 0) {
  let h = seed ^ 0x12345678;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 2654435761);
  }
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Generates an L2-normalized 256-dimensional semantic dense vector purely in browser
 */
export function generateLocalSemanticVector(text = '') {
  const vector = new Float32Array(VECTOR_DIM);
  if (!text || typeof text !== 'string') return vector;

  const lower = text.toLowerCase();
  const words = lower.replace(/[^\w\s\-\.]/g, ' ').split(/\s+/).filter(w => w.length > 1);

  // 1. Agronomic Concept Cluster Activation (Dimensions 0 to 99)
  AGRONOMIC_CLUSTERS.forEach((cluster, clusterIdx) => {
    let matchCount = 0;
    cluster.forEach(keyword => {
      if (lower.includes(keyword)) matchCount++;
    });

    if (matchCount > 0) {
      const baseDim = clusterIdx * 10;
      for (let offset = 0; offset < 10; offset++) {
        vector[baseDim + offset] += (matchCount * 0.4) / (offset + 1);
      }
    }
  });

  // 2. Character Tri-gram Hashed Projections (Dimensions 100 to 255)
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    // Hash full word
    const wDim = 100 + (hashString(word, 42) % 156);
    vector[wDim] += 1.0;

    // Hash character trigrams for typo-tolerance & morphological roots
    if (word.length >= 3) {
      for (let j = 0; j <= word.length - 3; j++) {
        const trigram = word.substring(j, j + 3);
        const tDim = 100 + (hashString(trigram, 101) % 156);
        vector[tDim] += 0.35;
      }
    }
  }

  // 3. L2-Normalize vector to unit sphere so dot product equals cosine similarity
  let norm = 0;
  for (let i = 0; i < VECTOR_DIM; i++) {
    norm += vector[i] * vector[i];
  }

  if (norm > 0) {
    const sqrtNorm = Math.sqrt(norm);
    for (let i = 0; i < VECTOR_DIM; i++) {
      vector[i] /= sqrtNorm;
    }
  }

  return vector;
}

/**
 * Fast cosine similarity between two normalized vectors
 */
export function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dotProduct = 0;
  const len = vecA.length;
  for (let i = 0; i < len; i++) {
    dotProduct += vecA[i] * vecB[i];
  }
  return Math.max(0, dotProduct);
}

/**
 * Searches an array of vector entries against a query vector
 * Each entry: { id, vector, chunk }
 * Returns sorted array of { docId, score, chunk }
 */
export function searchVectorIndex(queryVector, vectorEntries = [], topK = 10) {
  if (!queryVector || vectorEntries.length === 0) return [];

  const scored = [];
  for (let i = 0; i < vectorEntries.length; i++) {
    const entry = vectorEntries[i];
    const score = cosineSimilarity(queryVector, entry.vector);
    if (score > 0.05) {
      scored.push({
        docId: entry.id,
        score,
        chunk: entry.chunk
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}
