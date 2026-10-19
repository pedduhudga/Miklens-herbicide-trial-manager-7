// src/services/rag/ragBM25.js
// High-Performance Client-Side BM25 Probabilistic Search Engine
// Optimized for agronomic technical terms, formulation names, chemical codes, bigram phrases, and trial IDs.

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
 * Light agronomic suffix stemmer
 * Strips inflectional suffixes while protecting chemical symbols & short IDs
 */
export function stemAgronomicWord(word = '') {
  if (word.length <= 3) return word;
  // Do not stem IDs or chemical codes
  if (/\d/.test(word) || word.includes('-') || word.includes('/')) return word;

  let w = word.toLowerCase();

  if (w.endsWith('ies') && w.length > 4) return w.slice(0, -3) + 'y';
  if (w.endsWith('ing') && w.length > 5) return w.slice(0, -3);
  if (w.endsWith('tion') && w.length > 5) return w.slice(0, -4);
  if (w.endsWith('ated') && w.length > 5) return w.slice(0, -2);
  if (w.endsWith('ed') && w.length > 4) return w.slice(0, -2);
  if (w.endsWith('ment') && w.length > 5) return w.slice(0, -4);
  if (w.endsWith('ness') && w.length > 5) return w.slice(0, -4);
  if (w.endsWith('es') && w.length > 4) return w.slice(0, -2);
  if (w.endsWith('s') && !w.endsWith('ss') && w.length > 3) return w.slice(0, -1);

  return w;
}

/**
 * Tokenizes text preserving agronomic codes, trial IDs, and hyphenated chemical names
 * Generates both unigrams and contiguous bigram phrases
 */
export function tokenizeAgronomicText(text = '', includeBigrams = true) {
  if (!text || typeof text !== 'string') return [];

  const rawTokens = text
    .toLowerCase()
    .replace(/[^\w\s\-\.\/%]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOP_WORDS.has(t));

  const tokens = [];

  for (let i = 0; i < rawTokens.length; i++) {
    const raw = rawTokens[i];
    tokens.push(raw);

    const stemmed = stemAgronomicWord(raw);
    if (stemmed !== raw) {
      tokens.push(stemmed);
    }

    // Contiguous bigram phrase generation (e.g. "cynodon_dactylon", "crop_injury")
    if (includeBigrams && i < rawTokens.length - 1) {
      const nextRaw = rawTokens[i + 1];
      if (!STOP_WORDS.has(nextRaw)) {
        tokens.push(`${raw}_${nextRaw}`);
      }
    }
  }

  return tokens;
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
    this.invertedIndex = {}; // term -> [{ docId, tf, isTitle }]
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
      const titleTokens = tokenizeAgronomicText(chunk.title || '', true);
      const bodyTokens = tokenizeAgronomicText(chunk.text || '', true);
      const allTokens = [...titleTokens, ...bodyTokens];

      const docLength = allTokens.length;
      totalLength += docLength;

      const docId = chunk.id;
      this.docLengths[docId] = docLength;

      // Calculate term frequencies with title boost
      const tfMap = new Map();
      const titleSet = new Set(titleTokens);

      bodyTokens.forEach(term => {
        tfMap.set(term, (tfMap.get(term) || 0) + 1.0);
      });

      // Title tokens receive higher frequency weighting
      titleTokens.forEach(term => {
        tfMap.set(term, (tfMap.get(term) || 0) + 2.0);
      });

      // Update inverted index and document frequencies
      tfMap.forEach((tf, term) => {
        this.termDocFreq[term] = (this.termDocFreq[term] || 0) + 1;
        if (!this.invertedIndex[term]) {
          this.invertedIndex[term] = [];
        }
        this.invertedIndex[term].push({
          docId,
          tf,
          isTitle: titleSet.has(term)
        });
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

    const queryTokens = tokenizeAgronomicText(query, true);
    if (queryTokens.length === 0) return [];

    const scores = new Map();

    queryTokens.forEach(term => {
      const postings = this.invertedIndex[term];
      if (!postings) return;

      const idfWeight = this.idf(term);

      // Boost specific IDs, chemical codes, or bigrams
      const isIdOrCode = /\d{4,}/.test(term) || /^[a-z]{1,4}-\d+/.test(term);
      const isBigram = term.includes('_');
      let termBoost = 1.0;
      if (isIdOrCode) termBoost = 2.5;
      else if (isBigram) termBoost = 1.8;

      postings.forEach(({ docId, tf, isTitle }) => {
        const docLength = this.docLengths[docId] || this.avgDocLength;
        const normFactor = 1 - this.b + this.b * (docLength / this.avgDocLength);
        const titleMultiplier = isTitle ? 1.5 : 1.0;

        const termScore = idfWeight * ((tf * (this.k1 + 1)) / (tf + this.k1 * normFactor)) * termBoost * titleMultiplier;

        scores.set(docId, (scores.get(docId) || 0) + termScore);
      });
    });

    const docMap = new Map(this.docs.map(d => [d.id, d.chunk]));

    const results = Array.from(scores.entries())
      .map(([docId, rawScore]) => {
        const chunk = docMap.get(docId);
        const type = chunk?.metadata?.chunkType;
        const typeBoost = (type === 'trial_summary' || type === 'formulation_recipe' || type === 'ingredient_profile') ? 1.25 : 1.0;

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
