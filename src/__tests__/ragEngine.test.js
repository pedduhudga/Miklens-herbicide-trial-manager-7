import { describe, it, expect, beforeEach } from 'vitest';
import { generateCategoryChunks } from '../services/rag/ragChunker.js';
import { BM25Index, tokenizeAgronomicText } from '../services/rag/ragBM25.js';
import { generateLocalSemanticVector, cosineSimilarity } from '../services/rag/ragVector.js';
import { expandConversationalQuery, executeHybridRAGSearch } from '../services/rag/ragHybridSearch.js';
import { initRAGIndex, retrieveRAGContext, invalidateRAGCache } from '../services/rag/ragEngine.js';

describe('Next-Generation Agronomic RAG Engine', () => {
  const mockTrials = [
    {
      ID: '1783319817942',
      FormulationName: 'Glycyl',
      Category: 'herbicide',
      Dosage: '35 ml/L',
      WeedSpecies: 'Cynodon dactylon',
      Location: 'Plot 4A, Nashik Station',
      InvestigatorName: 'Dr. Ramesh Patil',
      Date: '2026-03-15',
      IsCompleted: true,
      FinalControlDuration: 38,
      Temperature: 29,
      Humidity: 55,
      EfficacyDataJSON: JSON.stringify([
        { daa: 0, controlPct: 0, notes: 'Baseline' },
        { daa: 7, controlPct: 85, notes: 'Foliar yellowing and wilting' },
        { daa: 14, controlPct: 98, notes: 'Complete rhizome desiccation' },
        { daa: 38, controlPct: 100, notes: 'Zero regrowth, finalized' }
      ])
    },
    {
      ID: '1783405027091',
      FormulationName: 'Goweed Ultra + Microweed',
      Category: 'herbicide',
      Dosage: '25 ml/L',
      WeedSpecies: 'Parthenium hysterophorus',
      Location: 'Plot 2B, Pune Field',
      InvestigatorName: 'S. Sharma',
      Date: '2026-04-10',
      IsCompleted: true,
      FinalControlDuration: 26,
      EfficacyDataJSON: JSON.stringify([
        { daa: 0, controlPct: 0 },
        { daa: 7, controlPct: 95, notes: 'Rapid broadleaf knockdown' },
        { daa: 26, controlPct: 100, notes: 'Finalized' }
      ])
    },
    {
      ID: '999000111222',
      FormulationName: 'BioFung-X',
      Category: 'fungicide', // DIFFERENT CATEGORY
      Dosage: '2 ml/L',
      DiseaseTarget: 'Powdery Mildew',
      Location: 'Grape Vineyard 1',
      IsCompleted: true
    }
  ];

  const mockFormulations = [
    {
      ID: '1783319817942',
      Name: 'Glycyl',
      Category: 'herbicide',
      Code: 'GLY-01',
      Dosage: '35 ml/L',
      Ingredients: [
        { name: 'Glyphosate 41% IPA', quantity: 350, unit: 'ml' },
        { name: 'Microweed Bio-Penetrant', quantity: 50, unit: 'ml' }
      ],
      Description: 'Ultra systemic grass translocation formula'
    },
    {
      ID: '1783405027091',
      Name: 'Goweed Ultra + Microweed',
      Category: 'herbicide',
      Code: 'GWU-02',
      Dosage: '25 ml/L',
      Ingredients: [
        { name: 'Pelargonic Acid Bio-Desiccant', quantity: 200, unit: 'ml' },
        { name: 'Microweed Bio-Penetrant', quantity: 50, unit: 'ml' }
      ]
    }
  ];

  const mockIngredients = [
    { Name: 'Glyphosate 41% IPA', Category: 'herbicide', CostPerUnit: 420, Unit: 'L', HRAC: 'Group 9' },
    { Name: 'Microweed Bio-Penetrant', Category: 'herbicide', CostPerUnit: 680, Unit: 'L', HRAC: 'Adjuvant' }
  ];

  beforeEach(() => {
    invalidateRAGCache();
  });

  describe('Agronomic Semantic Chunker', () => {
    it('creates descriptive trial summary and observation timeline chunks with deep links', () => {
      const chunks = generateCategoryChunks({
        trials: mockTrials,
        formulations: mockFormulations,
        ingredients: mockIngredients,
        activeCategory: 'herbicide'
      });

      expect(chunks.length).toBeGreaterThanOrEqual(4);

      // Check Trial Summary Chunk
      const glycylSummary = chunks.find(c => c.id === 'trial_1783319817942_summary');
      expect(glycylSummary).toBeDefined();
      expect(glycylSummary.text).toContain('[🔬 Trial: Glycyl @ 35 ml/L (1783319817942)](#/trials?focus=1783319817942)');
      expect(glycylSummary.text).toContain('[🧪 Formula: Glycyl](#/formulations?focus=Glycyl)');
      expect(glycylSummary.text).toContain('38 Days');
      expect(glycylSummary.text).toContain('Cynodon dactylon');

      // Check Observation Timeline Chunk
      const glycylObs = chunks.find(c => c.id === 'trial_1783319817942_obs');
      expect(glycylObs).toBeDefined();
      expect(glycylObs.text).toContain('DAA 14');
      expect(glycylObs.text).toContain('Complete rhizome desiccation');

      // Strict Category Isolation: Fungicide trial must NOT exist in herbicide chunks
      const fungicideChunk = chunks.find(c => c.entityId === '999000111222');
      expect(fungicideChunk).toBeUndefined();
    });

    it('generates formulation recipe chunks with active ingredients and costs', () => {
      const chunks = generateCategoryChunks({
        trials: mockTrials,
        formulations: mockFormulations,
        ingredients: mockIngredients,
        activeCategory: 'herbicide'
      });

      const formulaChunk = chunks.find(c => c.id === 'form_1783319817942_recipe');
      expect(formulaChunk).toBeDefined();
      expect(formulaChunk.text).toContain('Glyphosate 41% IPA: 350 ml');
      expect(formulaChunk.text).toContain('Microweed Bio-Penetrant: 50 ml');
      expect(formulaChunk.text).toContain('[🧪 Formula: Glycyl]');
    });
  });

  describe('BM25 Probabilistic Search Engine', () => {
    it('tokenizes agronomic codes and technical terms while preserving hyphens and numbers', () => {
      const tokens = tokenizeAgronomicText('Trial 1783319817942 tested GLY-01 at 35ml/L for Cynodon dactylon');
      expect(tokens).toContain('1783319817942');
      expect(tokens).toContain('gly-01');
      expect(tokens).toContain('35ml/l');
      expect(tokens).toContain('cynodon');
      expect(tokens).toContain('dactylon');
    });

    it('ranks exact trial ID and formula name at the top with high relevance score', () => {
      const chunks = generateCategoryChunks({
        trials: mockTrials,
        formulations: mockFormulations,
        ingredients: mockIngredients,
        activeCategory: 'herbicide'
      });

      const bm25 = new BM25Index().buildIndex(chunks);
      const results = bm25.search('1783319817942 Glycyl', 5);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].docId).toBe('trial_1783319817942_summary');
      expect(results[0].score).toBeGreaterThan(0);
    });
  });

  describe('Dense Semantic Vector Engine', () => {
    it('generates normalized 256D vector and assigns high cosine similarity to related concepts', () => {
      const vecA = generateLocalSemanticVector('Cynodon dactylon bermudagrass root translocation systemic kill');
      const vecB = generateLocalSemanticVector('Grass perennial rhizome suppression systemic herbicide duration');
      const vecC = generateLocalSemanticVector('Powdery mildew fungal spore fruit rot fungicide');

      expect(vecA.length).toBe(256);
      expect(vecB.length).toBe(256);

      const simRelated = cosineSimilarity(vecA, vecB);
      const simUnrelated = cosineSimilarity(vecA, vecC);

      expect(simRelated).toBeGreaterThan(simUnrelated);
      expect(simRelated).toBeGreaterThan(0.2);
    });
  });

  describe('Conversational Coreference & Multi-Turn Expansion', () => {
    it('expands follow-up query pronouns using recent dialogue entities', () => {
      const history = [
        { role: 'user', content: 'Tell me about trial 1783319817942 with Glycyl.' },
        { role: 'assistant', content: 'Trial 1783319817942 tested Glycyl against Cynodon dactylon.' }
      ];

      const expanded = expandConversationalQuery('What was its dosage and how many days did it control?', history);
      expect(expanded).toContain('1783319817942');
      expect(expanded.toLowerCase()).toContain('glycyl');
    });
  });

  describe('Master RAG Engine Master Pipeline', () => {
    it('indexes data and retrieves verified ground truth context in milliseconds', async () => {
      await initRAGIndex({
        trials: mockTrials,
        formulations: mockFormulations,
        ingredients: mockIngredients,
        activeCategory: 'herbicide',
        forceReindex: true
      });

      const ragResult = await retrieveRAGContext({
        query: 'Which formulation is best for Bermudagrass rhizome kill?',
        trials: mockTrials,
        formulations: mockFormulations,
        ingredients: mockIngredients,
        activeCategory: 'herbicide',
        topK: 5
      });

      expect(ragResult.chunkCount).toBeGreaterThan(0);
      expect(ragResult.contextText).toContain('=== RETRIEVED GROUND-TRUTH AGRONOMIC KNOWLEDGE');
      expect(ragResult.contextText).toContain('Glycyl');
      expect(ragResult.contextText).toContain('1783319817942');
      expect(ragResult.retrievalDuration).toBeLessThan(100); // Super fast <100ms
    });
  });
});
