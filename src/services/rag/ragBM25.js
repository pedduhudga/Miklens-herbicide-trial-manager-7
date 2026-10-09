// src/services/rag/ragBM25.js
// High-Performance Client-Side BM25 Probabilistic Search Engine
// Optimized for agronomic technical terms, formulation names, chemical codes, and trial IDs.

const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'aren',
  'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by',
  'did', 'do', 'does', 'doing', 'down', 'during', 'each', 'few', 'for', 'from', 'further', 'had',
  'has', 'have', 'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself', 'his', 'how',
  'i', 'if', 'in', 'into', 'is', 'isn', 'it', 'its', 'itself', 'just', 'me', 'more', 'most', 'my',
  'myself', 'no', 'nor', 'not', 'now', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'our',
  'ours', 'ourselves', 'out', 'over', 'own', 'same', 'she', 'should', 'so', 'some', 'such', 'than',
  'that', 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'these', 'they', 'this',
  'those', 'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was', 'wasn', 'we', 'were',
  'weren', 'what', 'when', 'where', 'which', 'while', 'who', 'whom', 'why', 'with', 'won', 'would',
  'you', 'your', 'yours', 'yourself', 'yourselves'
]);

/**
 * Tokenizes text preserving agronomic codes, trial IDs, and hyphenated chemical names
 */
export function tokenizeAgronomicText(text = '') {
  if (!text || typeof text !== 'string') return [];

  // Match words, numbers, hyphenated codes (e.g. CL-5, TR-2024, 1783319817942, 35ml/L)
  const rawTokens = text
    .toLowerCase()
    .replace(/[^\w\s\-\.\/%]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOP_WORDS.has(t));

  return rawTokens;
}

export class BM25Index {
  constructor(k1 = 1.2, b = 0.75) {
    this.k1 = k1;
    this.b = b;
    this.docs = []; // { id, chunk, length, tokens }
    this.docLengths = {};
    this.avgDocLength = 0;
    this.docCount = 0;
    this.termDocFreq = {}; // term -> count of docs containing term
    this.invertedIndex = {}; // term -> [{ docId, tf }]
  }

  /**
   * Build the inverted index from an array of chunks
   */
  buildIndex(chunks = []) {
    this.docs = [];
    this.docLengths = {};
    this.termDocFreq = {};
    this.invertedIndex = {};
    this.docCount = chunks.length;

    let totalLength = 0;

    chunks.forEach(chunk => {
      const textToTokenize = `${chunk.title || ''} ${chunk.text || ''}`;
      const tokens = tokenizeAgronomicText(textToTokenize);
      const docLength = tokens.length;
      totalLength += docLength;

      const docId = chunk.id;
      this.docLengths[docId] = docLength;

      // Calculate term frequencies in this document
      const tfMap = new Map();
      tokens.forEach(term => {
        tfMap.set(term, (tfMap.get(term) || 0) + 1);
      });

      // Update inverted index and document frequencies
      tfMap.forEach((tf, term) => {
        this.termDocFreq[term] = (this.termDocFreq[term] || 0) + 1;
        if (!this.invertedIndex[term]) {
          this.invertedIndex[term] = [];
        }
        this.invertedIndex[term].push({ docId, tf });
      });

      this.docs.push({ id: docId, chunk, length: docLength });
    });

    this.avgDocLength = this.docCount > 0 ? totalLength / this.docCount : 1;
    return this;
  }

  /**
   * Calculate Robertson-Sparck Jones IDF
   */
  idf(term) {
    const df = this.termDocFreq[term] || 0;
    if (df === 0) return 0;
    return Math.log(1 + (this.docCount - df + 0.5) / (df + 0.5));
  }

  /**
   * Search BM25 index with a natural language query
   * Returns sorted array of { docId, score, chunk }
   */
  search(query, topK = 10) {
    if (!query || this.docCount === 0) return [];

    const queryTokens = tokenizeAgronomicText(query);
    if (queryTokens.length === 0) return [];

    const scores = new Map();

    queryTokens.forEach(term => {
      const postings = this.invertedIndex[term];
      if (!postings) return;

      const idfWeight = this.idf(term);

      // Boost specific IDs or high-value chemical terms
      const isIdOrCode = /\d{4,}/.test(term) || /^[a-z]{1,4}-\d+/.test(term);
      const termBoost = isIdOrCode ? 2.5 : 1.0;

      postings.forEach(({ docId, tf }) => {
        const docLength = this.docLengths[docId] || this.avgDocLength;
        const normFactor = 1 - this.b + this.b * (docLength / this.avgDocLength);
        const termScore = idfWeight * ((tf * (this.k1 + 1)) / (tf + this.k1 * normFactor)) * termBoost;

        scores.set(docId, (scores.get(docId) || 0) + termScore);
      });
    });

    const docMap = new Map(this.docs.map(d => [d.id, d.chunk]));

    const results = Array.from(scores.entries())
      .map(([docId, rawScore]) => {
        const chunk = docMap.get(docId);
        const typeBoost = (chunk?.metadata?.chunkType === 'trial_summary' || chunk?.metadata?.chunkType === 'formulation_recipe') ? 1.25 : 1.0;
        return {
          docId,
          score: rawScore * typeBoost,
          chunk
        };
      })
      .filter(r => r.chunk !== undefined)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    return results;
  }
}
