// src/services/rag/ragVector.js
// Client-Side Dense Semantic Vector Engine
// Supports 100% free offline deterministic semantic projections across all agronomic categories.
// Zero subscription fees, zero external vector database costs.

const VECTOR_DIM = 256;

// Agronomic Domain Semantic Concept Clusters (16 Specialized Categories)
// These clusters give semantic proximity to related concepts even when exact words differ
export const AGRONOMIC_CLUSTERS = [
  // Cluster 0: Grasses & Monocots
  ['grass', 'bermuda', 'cynodon', 'dactylon', 'echinochloa', 'goosegrass', 'crabgrass', 'poa', 'monocot', 'rhizome', 'stolon', 'digitaria'],
  // Cluster 1: Sedges & Tubers
  ['sedge', 'cyperus', 'rotundus', 'nutsedge', 'tuber', 'basal', 'bulb', 'purple nutsedge', 'yellow nutsedge'],
  // Cluster 2: Broadleaves & Dicots
  ['broadleaf', 'parthenium', 'amaranthus', 'trianthema', 'convolvulus', 'dicot', 'euphorbia', 'chenopodium', 'mallow', 'commelina'],
  // Cluster 3: Systemic Translocation & Phloem Movement
  ['systemic', 'translocation', 'phloem', 'symplastic', 'root kill', 'translocate', 'rhizome kill', 'perennial', 'crown', 'basipetal'],
  // Cluster 4: Contact Desiccation & Rapid Burndown
  ['contact', 'burndown', 'knockdown', 'foliar', 'desiccant', 'cell membrane', 'ppo', 'scorching', 'necrosis', 'fast action', 'bpd'],
  // Cluster 5: Synergy & Adjuvants
  ['synergy', 'colby', 'wadley', 'adjuvant', 'penetrant', 'surfactant', 'organosilicone', 'spreading', 'wetting', 'microweed', 'tank mix', 'mso', 'nis'],
  // Cluster 6: Longevity & Regrowth Prevention
  ['duration', 'control days', 'residual', 'regrowth', 'longevity', 'finalized', 'weeks', 'days control', 'suppression', 'sustained', 'pre-emergence'],
  // Cluster 7: Weather & Psychrometric Microclimate
  ['weather', 'rain', 'temperature', 'humidity', 'wind', 'delta-t', 'wet bulb', 'washoff', 'monsoon', 'inversion', 'drift', 'spray window', 'rh'],
  // Cluster 8: Crop Safety & Phytotoxicity
  ['crop safety', 'phytotoxicity', 'injury', 'selectivity', 'tolerance', 'chlorosis', 'stunting', 'vein clearing', 'safener', 'necrosis score'],
  // Cluster 9: Chemistry & Formulation Types
  ['formulation', 'ec', 'sc', 'sl', 'wdg', 'recipe', 'batch', 'active ingredient', 'concentration', 'dosage', 'rate', 'dilution', 'cost'],
  // Cluster 10: Fungal Pathogens & Diseases (Fungicides / FRAC)
  ['fungicide', 'fungal', 'mildew', 'powdery mildew', 'downy mildew', 'rust', 'blight', 'leaf spot', 'anthracnose', 'spores', 'frac'],
  // Cluster 11: Insect Pests & Vectors (Insecticides / IRAC)
  ['insecticide', 'pest', 'aphid', 'thrips', 'whitefly', 'bollworm', 'caterpillar', 'stem borer', 'mite', 'vector', 'irac'],
  // Cluster 12: Plant Growth Regulators & Biostimulants (PGR)
  ['pgr', 'biostimulant', 'growth regulator', 'gibberellin', 'cytokinin', 'auxin', 'rooting', 'tiller', 'flowering', 'vigor', 'yield'],
  // Cluster 13: Resistance Management & Biotypes
  ['resistance', 'hrac', 'moa', 'mode of action', 'cross-resistance', 'survivor', 'mutation', 'target site', 'multiple resistance', 'stewardship'],
  // Cluster 14: Soil Properties & Environmental Fate
  ['soil', 'clay', 'sandy', 'loam', 'organic carbon', 'ph', 'leaching', 'adsorption', 'half-life', 'persistence', 'microbial degradation'],
  // Cluster 15: Spray Application & Nozzle Technology
  ['nozzle', 'droplet', 'coarse', 'fine', 'air induction', 'spray volume', 'l/ha', 'boom', 'pressure', 'coverage', 'drift reduction']
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

  // 1. Agronomic Concept Cluster Activation (Dimensions 0 to 127)
  // 16 clusters * 8 dimensions each = 128 dimensions
  AGRONOMIC_CLUSTERS.forEach((cluster, clusterIdx) => {
    let matchCount = 0;
    cluster.forEach(keyword => {
      if (lower.includes(keyword)) matchCount++;
    });

    if (matchCount > 0) {
      const baseDim = clusterIdx * 8;
      for (let offset = 0; offset < 8; offset++) {
        vector[baseDim + offset] += (matchCount * 0.5) / (offset + 1);
      }
    }
  });

  // 2. Character Tri-gram & Word Hashed Projections (Dimensions 128 to 255)
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    // Hash full word
    const wDim = 128 + (hashString(word, 42) % 128);
    vector[wDim] += 1.0;

    // Hash character trigrams for typo-tolerance & morphological roots
    if (word.length >= 3) {
      for (let j = 0; j <= word.length - 3; j++) {
        const trigram = word.substring(j, j + 3);
        const tDim = 128 + (hashString(trigram, 101) % 128);
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
