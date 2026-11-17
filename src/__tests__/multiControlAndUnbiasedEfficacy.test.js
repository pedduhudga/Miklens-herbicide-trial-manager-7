import { describe, it, expect } from 'vitest';
import { calculateEfficacy, getRatingFromEfficacy } from '../utils/categoryConfig.js';
import { buildExecutiveSummary, buildReportData } from '../services/reportDataBuilder.js';

describe('Multi-Control Support & Unbiased Efficacy Calculations', () => {
  describe('calculateEfficacy: Zero-Bias Negative Values Preservation', () => {
    it('accurately calculates negative yield improvement when treatment yield is lower than Untreated Control', () => {
      // e.g. Treated yield = 80 kg/ha, Control yield = 100 kg/ha -> -20% improvement
      const eff = calculateEfficacy('nutrition', 80, 100);
      expect(eff).toBeCloseTo(-20.0, 1);
      expect(eff).toBeLessThan(0); // MUST NOT be clamped to 0!
    });

    it('accurately calculates negative growth index for biostimulant when treatment is stunted compared to control', () => {
      // e.g. Treated vigor = 6, Control vigor = 8 -> -25%
      const eff = calculateEfficacy('biostimulant', 6, 8);
      expect(eff).toBeCloseTo(-25.0, 1);
      expect(eff).toBeLessThan(0);
    });

    it('accurately calculates positive improvement when treatment outperforms Untreated Control', () => {
      // e.g. Treated yield = 120 kg/ha, Control yield = 100 kg/ha -> +20%
      const eff = calculateEfficacy('nutrition', 120, 100);
      expect(eff).toBeCloseTo(20.0, 1);
    });

    it('correctly maps negative efficacy values to "Negative / Depressed" rating', () => {
      expect(getRatingFromEfficacy('nutrition', -15)).toBe('Negative / Depressed');
      expect(getRatingFromEfficacy('biostimulant', -5)).toBe('Negative / Depressed');
      expect(getRatingFromEfficacy('herbicide', -10)).toBe('Negative Efficacy');
    });

    it('correctly maps positive efficacy values to appropriate tiers', () => {
      expect(getRatingFromEfficacy('nutrition', 25)).toBe('Excellent');
      expect(getRatingFromEfficacy('nutrition', 15)).toBe('Good');
      expect(getRatingFromEfficacy('nutrition', 7)).toBe('Fair');
      expect(getRatingFromEfficacy('nutrition', 2)).toBe('Poor');
    });
  });

  describe('Executive Summary: Objective Reporting When Untreated Control Performs Best', () => {
    it('generates unbiased narrative acknowledging untreated control superiority', () => {
      const reportDataWithTopControl = {
        meta: {
          projectName: 'Tomato Nutrition Trial Nov-2026',
          category: 'nutrition',
          designLabel: 'RCBD',
          treatments: 3,
          replications: 4,
          location: 'Research Farm',
          investigator: 'Agronomist',
          applicationDates: ['2026-11-13'],
          crop: 'Tomato',
          variety: 'Abhinav',
          reportDate: '2026-11-17',
        },
        primaryParameter: {
          key: 'visualVigor',
          label: 'Visual Vigor (0-10)',
          means: {
            'Untreated Control': { mean: 8.5, se: 0.2, cldLetter: 'a', efficacy_pct: 0 },
            'Standard Check': { mean: 6.8, se: 0.3, cldLetter: 'b', efficacy_pct: -20.0 },
            'High Dose Treatment': { mean: 5.2, se: 0.4, cldLetter: 'c', efficacy_pct: -38.8 }
          },
          anova: {
            f: [18.4],
            p: [0.001],
            cv: 8.5
          }
        },
        weather: [{ temp: 28 }]
      };

      const summary = buildExecutiveSummary(reportDataWithTopControl, 'standard');
      expect(summary).toBeDefined();
      expect(typeof summary).toBe('string');
      // Must state that the untreated control achieved highest mean and treatments did not outperform it
      expect(summary.toLowerCase()).toContain('untreated control');
      expect(summary.toLowerCase()).toContain('did not');
    });
  });

  describe('Report Generation with Multiple Controls & Untreated Superiority', () => {
    it('builds dataset without crashing and correctly identifies primary UTC even when a standard check is also present', async () => {
      const mockSubTrials = [
        // UTC Rep 1 & 2
        {
          ID: 't1',
          ProjectID: 'p1',
          FormulationName: 'Untreated Control',
          IsControl: true,
          Replication: '1',
          Category: 'nutrition',
          EfficacyDataJSON: JSON.stringify([{ daa: 7, visualVigor: 8.5 }])
        },
        {
          ID: 't2',
          ProjectID: 'p1',
          FormulationName: 'Untreated Control',
          IsControl: true,
          Replication: '2',
          Category: 'nutrition',
          EfficacyDataJSON: JSON.stringify([{ daa: 7, visualVigor: 8.2 }])
        },
        // Standard Check (Commercial Control) Rep 1 & 2
        {
          ID: 't3',
          ProjectID: 'p1',
          FormulationName: 'Commercial Standard Check',
          IsStandardCheck: true,
          Replication: '1',
          Category: 'nutrition',
          EfficacyDataJSON: JSON.stringify([{ daa: 7, visualVigor: 7.0 }])
        },
        {
          ID: 't4',
          ProjectID: 'p1',
          FormulationName: 'Commercial Standard Check',
          IsStandardCheck: true,
          Replication: '2',
          Category: 'nutrition',
          EfficacyDataJSON: JSON.stringify([{ daa: 7, visualVigor: 7.2 }])
        },
        // Experimental Treatment Rep 1 & 2 (with lower vigor due to test chemical phytotoxicity)
        {
          ID: 't5',
          ProjectID: 'p1',
          FormulationName: 'Experimental Formulation X',
          Replication: '1',
          Category: 'nutrition',
          EfficacyDataJSON: JSON.stringify([{ daa: 7, visualVigor: 5.0 }])
        },
        {
          ID: 't6',
          ProjectID: 'p1',
          FormulationName: 'Experimental Formulation X',
          Replication: '2',
          Category: 'nutrition',
          EfficacyDataJSON: JSON.stringify([{ daa: 7, visualVigor: 5.2 }])
        }
      ];

      const state = {
        projects: [{ ID: 'p1', Name: 'Multi-Control Nutrition Trial', Category: 'nutrition' }],
        trials: mockSubTrials,
        activeCategory: 'nutrition'
      };

      const dataset = await buildReportData('p1', mockSubTrials, { postHoc: 'lsd' }, state);

      expect(dataset).toBeDefined();
      expect(dataset.warnings.some(w => w.type === 'missing_control')).toBe(false);

      // Check primary parameter means
      const paramList = dataset.parameters || [];
      const paramData = paramList.find(p => p.key === 'visualVigor') || dataset.primaryParameter;
      expect(paramData).toBeDefined();

      const utcMean = paramData.means['Untreated Control'].mean;
      const expMean = paramData.means['Experimental Formulation X'].mean;

      // In this test case, Untreated Control mean is higher (approx 8.35) than Experimental (approx 5.10)
      expect(utcMean).toBeGreaterThan(expMean);

      // Efficacy percentage for Experimental Formulation X MUST be negative (treatment depression)
      const expEff = paramData.means['Experimental Formulation X'].efficacy_pct;
      expect(expEff).toBeLessThan(0);
      expect(expEff).toBeCloseTo(((expMean - utcMean) / utcMean) * 100, 1);
    });
  });
});
