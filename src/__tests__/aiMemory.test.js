import { describe, it, expect } from 'vitest';
import { buildAIMemoryContext } from '../utils/aiMemory.js';

describe('aiMemory - Super Knowledge Base Engine', () => {
  const formulations = [
    {
      ID: 'FORM-01',
      Name: 'Bio-Kill Contact Herbicide',
      Code: 'BK-5',
      Category: 'herbicide',
      Ingredients: [{ name: 'Pelargonic Acid', quantity: 150, unit: 'ml' }]
    }
  ];

  const projects = [
    { ID: 'PROJ-01', Name: 'Summer Weed Control 2026', Category: 'herbicide' }
  ];

  const trials = [
    // 1. Active trial with rich observation timeline and >= 70% efficacy
    {
      ID: 'TR-2026-ACTIVE',
      ProjectID: 'PROJ-01',
      FormulationID: 'FORM-01',
      FormulationName: 'Bio-Kill Contact Herbicide',
      Category: 'herbicide',
      Dosage: '2.5 ml/L',
      WeedSpecies: 'Echinochloa colona',
      IsCompleted: false,
      Status: 'Active',
      FinalEfficacy: 85,
      Result: 'Excellent',
      EfficacyDataJSON: JSON.stringify([
        { daa: 7, controlPct: 92, weedPressurePct: 8 },
        { daa: 14, controlPct: 88, weedPressurePct: 12 },
        { daa: 28, controlPct: 78, weedPressurePct: 22 },
        { daa: 45, controlPct: 50, weedPressurePct: 50 } // regrowth breakdown
      ])
    },
    // 2. Finalized trial with 75% efficacy (now classified as Excellent under >= 70% standard)
    {
      ID: 'TR-2026-FINAL',
      ProjectID: 'PROJ-01',
      FormulationID: 'BK-5',
      FormulationName: 'Bio-Kill Contact Herbicide @ 3.0 ml/L',
      Category: 'herbicide',
      Dosage: '3.0 ml/L',
      WeedSpecies: 'Amaranthus viridis',
      IsCompleted: true,
      Status: 'Finalized',
      FinalEfficacy: 75,
      FinalControlDuration: 30,
      Result: 'Good' // unrated or good, but efficacy is >= 70%
    },
    // 3. Poor trial (< 50%)
    {
      ID: 'TR-2026-POOR',
      ProjectID: 'PROJ-01',
      FormulationID: 'FORM-01',
      FormulationName: 'Bio-Kill Contact Herbicide',
      Category: 'herbicide',
      Dosage: '1.0 ml/L',
      WeedSpecies: 'Cyperus rotundus',
      IsCompleted: true,
      Status: 'Finalized',
      FinalEfficacy: 35,
      FinalControlDuration: 5,
      Result: 'Poor'
    }
  ];

  it('builds context and includes the 70%+ trials in the TOP PERFORMING & EXCELLENT section', () => {
    const { contextString, stats } = buildAIMemoryContext(trials, formulations, projects, [], 'herbicide');

    expect(stats.totalTrials).toBe(3);
    expect(contextString).toContain('TOP PERFORMING & EXCELLENT FIELD TRIALS');

    // Both TR-2026-ACTIVE (85%) and TR-2026-FINAL (75%) must be listed
    expect(contextString).toContain('TR-2026-ACTIVE');
    expect(contextString).toContain('TR-2026-FINAL');
    // TR-2026-POOR (35%) must not be in the Top Performing section
    const topSection = contextString.split('=== 🏆 TOP PERFORMING & EXCELLENT FIELD TRIALS')[1].split('\n=== ')[0];
    expect(topSection).toContain('TR-2026-ACTIVE');
    expect(topSection).toContain('TR-2026-FINAL');
    expect(topSection).not.toContain('TR-2026-POOR');
  });

  it('generates exact clickable markdown links to navigate directly to trials', () => {
    const { contextString } = buildAIMemoryContext(trials, formulations, projects, [], 'herbicide');

    // Check link pattern
    expect(contextString).toContain('[🔬 Trial: Bio-Kill Contact Herbicide @ 2.5 ml/L (TR-2026-ACTIVE)](#/trials?focus=TR-2026-ACTIVE)');
  });

  it('calculates demonstrated control days for active trials from observation timeline', () => {
    const { contextString } = buildAIMemoryContext(trials, formulations, projects, [], 'herbicide');

    // In TR-2026-ACTIVE, efficacy was >= 70% up to DAA 28 before regrowth at DAA 45
    expect(contextString).toContain('28d-DEMONSTRATED(active)');
    expect(contextString).toContain('30d-FINALIZED');
  });
});
