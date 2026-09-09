import { describe, it, expect, vi } from 'vitest';
import {
  parseContextSections,
  analyzeUserQuery,
  compressAIContext
} from '../utils/aiContextCompressor.js';
import { callGeminiApiStream } from '../services/ai.js';

describe('AI Context Compressor & Query Analyzer', () => {
  const sampleContext = [
    '=== DATABASE OVERVIEW ===',
    'Category: HERBICIDE',
    'Total Trials: 45 (40 Standard, 5 Large Field)',
    'Unique Targets: 8 | Unique Formulas: 12',
    '',
    '=== TRIAL TYPES & FIELD-SCALE VALIDATION ===',
    'Standard Trials: Microplot/pot trials.',
    'Large Field Trials: Real-world farm studies.',
    '',
    '=== 🏆 TOP PERFORMING & EXCELLENT FIELD TRIALS (KILL RATE >= 70% OR EXCELLENT RATING) ===',
    '[🔬 Trial: Glycyl @ 10ml (1783319817942)](#/trials?focus=1783319817942) | Bermudagrass | 100% | 38d',
    '[🔬 Trial: BPD @ 5ml (1783319822111)](#/trials?focus=1783319822111) | Parthenium | 98% | 35d',
    '',
    '=== INGREDIENT INVENTORY & FIELD SYNERGY MATRIX ===',
    'Pelargonic Acid (85% purity) - Rapid contact burndown',
    'Glufosinate technical (95%) - GS inhibitor',
    'Ethoxylated tallow amine - Penetration surfactant',
    '',
    '=== FORMULATION KNOWLEDGE BASE ===',
    'Glycyl (Code: GLY-1): Pelargonic Acid 150ml, Glufosinate 100ml. Est Cost: $4.20/L.',
    'BPD (Code: BPD-3): Bio-penetrant blend. Est Cost: $5.10/L.',
    'CL-5 (Code: CL-5): Contact emulsifiable concentrate. Est Cost: $3.80/L.',
    '',
    '=== FORMULA PERFORMANCE OVERVIEW (Demonstrated Control Days from Efficacy & Regrowth) ===',
    'Glycyl: 100% kill rate, 38 days control',
    'BPD: 98% kill rate, 35 days control',
    '',
    '=== TARGET-BASED FORMULA RANKINGS (Top 5 per target, based on Efficacy & Sustained Control) ===',
    '  TARGET: Bermudagrass (12 trials)',
    '    #1 Glycyl @ 10ml | avgEff: 100%',
    '  TARGET: Parthenium hysterophorus (15 trials)',
    '    #1 BPD @ 5ml | avgEff: 98%',
    '',
    '=== SAME-FORMULA VARIABLE OUTCOMES — Weather/Timing Analysis ===',
    'FORMULA: Glycyl on TARGET: Bermudagrass: low efficacy under heavy rain',
    '',
    '=== INVESTIGATOR SUMMARY ===',
    'Dr. Smith: 20 trials, 95% avg efficacy',
    'Dr. Patel: 15 trials, 92% avg efficacy',
    '',
    '=== COMPLETE TRIAL INDEX (ALL 45 TRIALS WITH CLICKABLE LINKS) ===',
    'TR-01: Glycyl @ 10ml on Bermudagrass (1783319817942) - 100%',
    'TR-02: BPD @ 5ml on Parthenium (1783319822111) - 98%',
    'TR-03: CL-5 @ 2.5ml on Cyperus (1783319833222) - 75%',
    'TR-04: Generic @ 15ml on Broadleaf (1783319844333) - 60%',
    'TR-05: Untreated Check on Mixed (1783319855444) - 0%',
    '',
    '=== CRITICAL RULES FOR FORMULATION & TRIAL EVALUATIONS ===',
    '1. STRICT DATABASE GROUNDING: quote verified numbers only.',
    '2. Clickable markdown links required for every trial and formula.',
    '',
    '=== GUIDELINES FOR NOVEL FORMULATION RECOMMENDATIONS ===',
    'Always provide candidate formula in ```formula code block.'
  ].join('\n');

  it('parses structured markdown into distinct section objects', () => {
    const sections = parseContextSections(sampleContext);
    expect(sections['DATABASE OVERVIEW']).toContain('Total Trials: 45');
    expect(sections['FORMULATION KNOWLEDGE BASE']).toContain('Glycyl');
    expect(sections['COMPLETE TRIAL INDEX (ALL 45 TRIALS WITH CLICKABLE LINKS)']).toContain('TR-01');
  });

  it('detects query entities and intent accurately', () => {
    const q1 = analyzeUserQuery('What were the results of trial 1783319817942?');
    expect(q1.trialIds).toContain('1783319817942');
    expect(q1.mentionsTrialExplicitly).toBe(true);

    const q2 = analyzeUserQuery('Compare Glycyl versus BPD on Bermudagrass');
    expect(q2.formulaMentions).toContain('glycyl');
    expect(q2.formulaMentions).toContain('bpd');
    expect(q2.targetMentions).toContain('bermuda');
    expect(q2.isBenchmark).toBe(true);

    const q3 = analyzeUserQuery('Suggest a novel recipe with high synergy');
    expect(q3.isNovelFormula).toBe(true);

    const q4 = analyzeUserQuery('hi');
    expect(q4.isGreetingOrMeta).toBe(true);
  });

  it('compresses context significantly for targeted queries while keeping rules and overview', () => {
    const { compressedContext, compressionRatio, originalSize, compressedSize } = compressAIContext(
      sampleContext,
      'Tell me more about Glycyl'
    );

    expect(compressedSize).toBeLessThan(originalSize);
    expect(compressionRatio).toBeGreaterThan(0);
    expect(compressedContext).toContain('=== DATABASE OVERVIEW ===');
    expect(compressedContext).toContain('=== CRITICAL RULES FOR FORMULATION & TRIAL EVALUATIONS ===');
    expect(compressedContext).toContain('Glycyl');
    // Unrelated sections like full investigator summary should be omitted on formula query
    expect(compressedContext).not.toContain('=== INVESTIGATOR SUMMARY ===');
  });

  it('drastically compresses context for simple greetings', () => {
    const { compressedContext, compressionRatio } = compressAIContext(
      sampleContext,
      'Hello!'
    );

    expect(compressionRatio).toBeGreaterThan(50);
    expect(compressedContext).toContain('=== DATABASE OVERVIEW ===');
    expect(compressedContext).toContain('=== CRITICAL RULES FOR FORMULATION & TRIAL EVALUATIONS ===');
    expect(compressedContext).not.toContain('=== COMPLETE TRIAL INDEX');
  });

  it('preserves full context when user explicitly requests all trials', () => {
    const { compressedContext, compressionRatio, detectedIntents } = compressAIContext(
      sampleContext,
      'Show me all trials in the full database'
    );

    expect(compressionRatio).toBe(0);
    expect(compressedContext).toBe(sampleContext);
    expect(detectedIntents).toContain('full_database_request');
  });
});

describe('Streaming & Key Rotation Service', () => {
  it('callGeminiApiStream yields chunks and accumulates text', async () => {
    const mockChunks = [
      { text: 'Based on our trials, ' },
      { text: 'Glycyl demonstrated 100% control ' },
      { text: 'across 38 days.' }
    ];

    async function* makeChunkStream() {
      for (const chunk of mockChunks) {
        yield chunk;
      }
    }

    const mockGenAI = {
      models: {
        generateContentStream: vi.fn().mockResolvedValue(makeChunkStream())
      }
    };

    // Test streamed chunks
    const chunksReceived = [];
    const fullTextHistory = [];

    const mockGetAppState = () => ({
      settings: {
        apiKeys: ['mock-test-key-123'],
        currentApiKeyIndex: 0,
        apiModel: 'gemini-2.0-flash'
      }
    });

    // Provide client getter mock if window isn't set
    let accumulated = '';
    const stream = await mockGenAI.models.generateContentStream({
      model: 'gemini-2.0-flash',
      contents: [{ role: 'user', parts: [{ text: 'Hello' }] }]
    });

    for await (const c of stream) {
      accumulated += c.text;
      chunksReceived.push(c.text);
      fullTextHistory.push(accumulated);
    }

    expect(chunksReceived.length).toBe(3);
    expect(fullTextHistory[fullTextHistory.length - 1]).toBe('Based on our trials, Glycyl demonstrated 100% control across 38 days.');
  });
});
