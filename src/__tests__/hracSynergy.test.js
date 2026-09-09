import { describe, it, expect } from 'vitest';
import { identifyHrac, analyzeFormulationSynergy } from '../utils/hracSynergy.js';

describe('hracSynergy - Mode of Action & Chemical Interaction Engine', () => {
  it('accurately identifies HRAC and WSSA groups for major herbicide active ingredients', () => {
    const gly = identifyHrac('Glyphosate 41% SL');
    const aux = identifyHrac('2,4-D Ethyl Ester');
    const gram = identifyHrac('Clethodim 240 EC');
    const glu = identifyHrac('Glufosinate Ammonium 13.5%');

    expect(gly.group).toBe('HRAC 9');
    expect(gly.wssa).toBe('Group 9');

    expect(aux.group).toBe('HRAC 4');
    expect(aux.wssa).toBe('Group 4');

    expect(gram.group).toBe('HRAC 1');
    expect(gram.wssa).toBe('Group 1');

    expect(glu.group).toBe('HRAC 10');
    expect(glu.wssa).toBe('Group 10');
  });

  it('detects Group 1 + Group 4 chemical antagonism risk', () => {
    const tankMix = [
      { name: 'Clethodim 240 EC', quantity: 2, unit: 'ml' },
      { name: '2,4-D Amine Salt', quantity: 3, unit: 'ml' }
    ];

    const analysis = analyzeFormulationSynergy(tankMix);

    expect(analysis.isMultiMoa).toBe(true);
    expect(analysis.antagonismAlerts.length).toBeGreaterThan(0);
    expect(analysis.antagonismAlerts[0].title).toContain('Antagonism');
  });

  it('identifies synergistic multi-site mode of action combinations', () => {
    const synergisticMix = [
      { name: 'Glyphosate 41% SL', quantity: 10, unit: 'ml' },
      { name: 'Oxyfluorfen 23.5% EC', quantity: 2, unit: 'ml' }
    ];

    const analysis = analyzeFormulationSynergy(synergisticMix);

    expect(analysis.hracGroups).toContain('HRAC 9');
    expect(analysis.hracGroups).toContain('HRAC 14');
    expect(analysis.uniqueHracGroups).toContain('HRAC 9');
    expect(analysis.multiSiteScore).toContain('Dual MOA');
    expect(analysis.synergies.length).toBeGreaterThan(0);
    expect(analysis.adjuvantTips.some(t => t.name.includes('Ammonium Sulfate'))).toBe(true);
    expect(analysis.adjuvantRecommendations.some(r => r.includes('Ammonium Sulfate'))).toBe(true);
  });

  it('provides rich active ingredient metadata for modal and UI cards', () => {
    const mix = [
      { name: 'Clethodim 240 EC', quantity: 30, unit: 'ml' },
      { name: '2,4-D Amine Salt', quantity: 50, unit: 'ml' }
    ];

    const analysis = analyzeFormulationSynergy(mix);
    expect(analysis.hasAntagonism).toBe(true);
    expect(analysis.antagonismWarnings.length).toBeGreaterThan(0);
    expect(analysis.antagonismWarnings[0].recommendation).toBeDefined();
    expect(analysis.activeIngredients.length).toBe(2);
    expect(analysis.activeIngredients[0].hracGroup).toBe('1');
    expect(analysis.activeIngredients[0].chemicalFamily).toBe('Cyclohexanedione');
    expect(analysis.moaSummary).toBeDefined();
  });
});
