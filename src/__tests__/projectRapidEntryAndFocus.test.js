import { describe, it, expect } from 'vitest';
import { getPrimaryObservationField } from '../utils/categoryConfig.js';
import { calculateDAA } from '../utils/dateUtils.js';

describe('Project Grouped Focus Mode & Rapid Entry logic', () => {
  it('correctly identifies primary observation field key for different categories', () => {
    expect(getPrimaryObservationField('herbicide')).toBe('weedCover');
    expect(getPrimaryObservationField('nutrition')).toBe('visualVigor');
    expect(getPrimaryObservationField('fungicide')).toBe('diseaseSeverity');
    expect(getPrimaryObservationField('pesticide')).toBe('pestCount');
    expect(getPrimaryObservationField('biostimulant')).toBe('overallVigor');
  });

  it('correctly calculates DAA from trial initiation date to observation date', () => {
    const trialDate = '2026-07-01';
    const obsDate = '2026-07-15';
    expect(calculateDAA(obsDate, trialDate)).toBe(14);
  });

  it('categorizes trial designs correctly between pot trials and standard field designs', () => {
    const isProjectDesignMatch = (designStr, nameStr, tabKey) => {
      if (!tabKey || tabKey === 'all') return true;
      const d = String(designStr || '').toLowerCase();
      const n = String(nameStr || '').toLowerCase();
      if (tabKey === 'pot') {
        return d.includes('pot') || n.includes('pot');
      }
      if (tabKey === 'rcbd') {
        return (d === 'rcbd' || d.includes('randomized complete block') || d.includes('block')) && !d.includes('pot') && !n.includes('pot');
      }
      if (tabKey === 'crd') {
        return (d === 'crd' || d.includes('completely randomized')) && !d.includes('pot') && !n.includes('pot');
      }
      if (tabKey === 'split') {
        return d.includes('split');
      }
      if (tabKey === 'other') {
        return !d.includes('pot') && !n.includes('pot') && d !== 'rcbd' && d !== 'crd' && !d.includes('split');
      }
      return true;
    };

    // Single pot trials
    expect(isProjectDesignMatch('Pot Trial', 'zn c b trilas', 'pot')).toBe(true);
    expect(isProjectDesignMatch('RCBD', 'Tomato Trials June 2026-Open Field (Pot Trial)', 'pot')).toBe(true);
    expect(isProjectDesignMatch('CRD', 'Chilli trial june 2026 (Pot Trial)', 'pot')).toBe(true);

    // RCBD Field (non-pot)
    expect(isProjectDesignMatch('RCBD', 'Wheat Herbicide Efficacy Field A', 'rcbd')).toBe(true);
    expect(isProjectDesignMatch('Pot Trial', 'Wheat Pot Test', 'rcbd')).toBe(false);

    // CRD
    expect(isProjectDesignMatch('CRD', 'Greenhouse Petri Dish Bioassay', 'crd')).toBe(true);
  });
});
