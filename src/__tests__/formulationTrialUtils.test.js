import { describe, it, expect } from 'vitest';
import { 
  getTrialCalculatedEfficacy, 
  getTrialTargetSpecies, 
  isTrialLinkedToFormulation, 
  getFormulationTrialStats, 
  getEfficacyRatingBadge 
} from '../utils/formulationTrialUtils.js';

describe('formulationTrialUtils', () => {
  describe('isTrialLinkedToFormulation', () => {
    const form = { ID: 'form-101', Name: 'CL-5', Code: 'CL5-CODE' };

    it('matches by FormulationID', () => {
      expect(isTrialLinkedToFormulation({ FormulationID: 'form-101' }, form)).toBe(true);
      expect(isTrialLinkedToFormulation({ FormulationID: 'other' }, form)).toBe(false);
    });

    it('matches by exact Name or Code', () => {
      expect(isTrialLinkedToFormulation({ FormulationName: 'CL-5' }, form)).toBe(true);
      expect(isTrialLinkedToFormulation({ FormulationName: 'cl-5' }, form)).toBe(true);
      expect(isTrialLinkedToFormulation({ FormulationName: 'CL5-CODE' }, form)).toBe(true);
    });

    it('matches by dosage prefix or suffix', () => {
      expect(isTrialLinkedToFormulation({ FormulationName: 'CL-5 @ 2.5 ml/L' }, form)).toBe(true);
      expect(isTrialLinkedToFormulation({ FormulationName: 'CL-5 (Standard Test)' }, form)).toBe(true);
      expect(isTrialLinkedToFormulation({ FormulationName: 'CL-5@3ml' }, form)).toBe(true);
      expect(isTrialLinkedToFormulation({ FormulationName: 'Other CL-5 Mixture' }, form)).toBe(true);
      expect(isTrialLinkedToFormulation({ FormulationName: 'Different Formula' }, form)).toBe(false);
    });
  });

  describe('getTrialCalculatedEfficacy', () => {
    it('returns direct FinalEfficacy if provided', () => {
      expect(getTrialCalculatedEfficacy({ FinalEfficacy: 88 })).toBe(88);
    });

    it('calculates true efficacy from baseline and latest observations in EfficacyDataJSON', () => {
      const trial = {
        Category: 'herbicide',
        EfficacyDataJSON: JSON.stringify([
          { daa: 0, weedCoverage: 80 },
          { daa: 7, weedCoverage: 40 },
          { daa: 14, weedCoverage: 12 }
        ])
      };
      // (80 - 12) / 80 * 100 = 85%
      expect(getTrialCalculatedEfficacy(trial, 'herbicide')).toBe(85);
    });

    it('extracts embedded controlPct if available', () => {
      const trial = {
        Category: 'herbicide',
        EfficacyDataJSON: JSON.stringify([
          { daa: 0, controlPct: 0 },
          { daa: 14, controlPct: 92 }
        ])
      };
      expect(getTrialCalculatedEfficacy(trial, 'herbicide')).toBe(92);
    });

    it('falls back to qualitative Result score if no observations', () => {
      expect(getTrialCalculatedEfficacy({ Result: 'Excellent' })).toBe(90);
      expect(getTrialCalculatedEfficacy({ Result: 'Good' })).toBe(75);
      expect(getTrialCalculatedEfficacy({ Result: 'Fair' })).toBe(55);
      expect(getTrialCalculatedEfficacy({ Result: 'Poor' })).toBe(25);
      expect(getTrialCalculatedEfficacy({ Result: 'Unknown' })).toBe(null);
    });
  });

  describe('getTrialTargetSpecies', () => {
    it('extracts target species by category config', () => {
      expect(getTrialTargetSpecies({ WeedSpecies: 'Cyperus rotundus' }, 'herbicide')).toBe('Cyperus rotundus');
      expect(getTrialTargetSpecies({ DiseaseTarget: 'Powdery Mildew' }, 'fungicide')).toBe('Powdery Mildew');
      expect(getTrialTargetSpecies({ PestTarget: 'Aphids' }, 'pesticide')).toBe('Aphids');
      expect(getTrialTargetSpecies({}, 'herbicide')).toBe('General');
    });
  });

  describe('getFormulationTrialStats', () => {
    const form = { ID: 'F-1', Name: 'GOWEED ULTRA' };
    const projects = [
      { ID: 'P-1', Name: 'Microplot Screen', Design: 'Standard' },
      { ID: 'P-2', Name: 'Punjab Field Trial', Design: 'LargeScale' }
    ];
    const trials = [
      {
        ID: 'T-1',
        FormulationID: 'F-1',
        ProjectID: 'P-1',
        Category: 'herbicide',
        WeedSpecies: 'Barnyard Grass',
        Dosage: '2.5 ml/L',
        Result: 'Excellent',
        IsCompleted: true,
        FinalControlDuration: 42,
        EfficacyDataJSON: JSON.stringify([{ daa: 0, weedCoverage: 80 }, { daa: 14, weedCoverage: 8 }]) // 90%
      },
      {
        ID: 'T-2',
        FormulationName: 'GOWEED ULTRA @ 3.0 ml/L',
        ProjectID: 'P-2',
        Category: 'herbicide',
        WeedSpecies: 'Barnyard Grass',
        Dosage: '3.0 ml/L',
        Result: 'Good',
        IsCompleted: true,
        FinalControlDuration: 35,
        EfficacyDataJSON: JSON.stringify([{ daa: 0, weedCoverage: 100 }, { daa: 21, weedCoverage: 20 }]) // 80%
      },
      {
        ID: 'T-3',
        FormulationID: 'F-OTHER',
        Category: 'herbicide',
        Result: 'Poor'
      }
    ];

    it('calculates comprehensive stats with microplot vs field breakdown', () => {
      const stats = getFormulationTrialStats(form, trials, projects, 'herbicide');
      expect(stats.total).toBe(2);
      expect(stats.microplotCount).toBe(1);
      expect(stats.fieldCount).toBe(1);
      expect(stats.winCount).toBe(2);
      expect(stats.winRate).toBe(100);
      expect(stats.avgEfficacy).toBe(85); // (90 + 80) / 2
      expect(stats.peakEfficacy).toBe(90);
      expect(stats.avgCtrlDays).toBe(39); // (42 + 35) / 2
      expect(stats.targetMap['Barnyard Grass']).toBeDefined();
      expect(stats.targetMap['Barnyard Grass'].count).toBe(2);
      expect(stats.dosageMap['2.5 ml/L']).toBeDefined();
      expect(stats.dosageMap['3.0 ml/L']).toBeDefined();
    });
  });

  describe('getEfficacyRatingBadge', () => {
    it('returns formatted rating badge for numeric avg efficacy', () => {
      const badge90 = getEfficacyRatingBadge(90);
      expect(badge90.label).toContain('90% • Excellent');
      expect(badge90.isUntested).toBe(false);

      const badge70 = getEfficacyRatingBadge(70);
      expect(badge70.label).toContain('70% • Excellent');

      const badge60 = getEfficacyRatingBadge(60);
      expect(badge60.label).toContain('60% • Good');

      const badge45 = getEfficacyRatingBadge(45);
      expect(badge45.label).toContain('45% • Fair');

      const badge30 = getEfficacyRatingBadge(30);
      expect(badge30.label).toContain('30% • Poor');
    });

    it('returns Untested badge when null and no fallback', () => {
      const untested = getEfficacyRatingBadge(null);
      expect(untested.label).toBe('Untested');
      expect(untested.isUntested).toBe(true);
    });
  });

  describe('Legacy compatibility and dynamic control duration', () => {
    const formulation = {
      ID: 'FORM-001',
      Name: 'Contact Bio-Herbi 5',
      Code: 'CB-5',
      Category: 'herbicide'
    };

    it('links legacy trial without Code, using original Name or ID', () => {
      // Legacy trial with only legacy FormulationName
      const legacyTrial = {
        ID: 'LEGACY-01',
        FormulationName: 'Contact Bio-Herbi 5',
        Category: 'herbicide'
      };
      expect(isTrialLinkedToFormulation(formulation, legacyTrial)).toBe(true);

      // Legacy trial with FormulationID pointing directly to formulation ID
      const legacyTrialById = {
        ID: 'LEGACY-02',
        FormulationID: 'FORM-001',
        FormulationName: 'Old Custom Batch',
        Category: 'herbicide'
      };
      expect(isTrialLinkedToFormulation(formulation, legacyTrialById)).toBe(true);
    });

    it('links new trials with formulation code, dosage suffix, and variation syntax', () => {
      const trialWithDosage = {
        ID: 'TR-NEW-01',
        FormulationName: 'Contact Bio-Herbi 5 @ 2.5 ml/L',
        Category: 'herbicide'
      };
      expect(isTrialLinkedToFormulation(formulation, trialWithDosage)).toBe(true);

      const trialWithCode = {
        ID: 'TR-NEW-02',
        FormulationID: 'CB-5',
        Category: 'herbicide'
      };
      expect(isTrialLinkedToFormulation(formulation, trialWithCode)).toBe(true);
    });

    it('computes control days from observation timeline based on efficacy and weed regrowth', () => {
      // Active trial with rich observation timeline, no FinalControlDuration filled
      const activeTrialWithTimeline = {
        ID: 'TR-ACTIVE-TIMELINE',
        FormulationID: 'FORM-001',
        FormulationName: 'Contact Bio-Herbi 5',
        IsCompleted: false,
        FinalEfficacy: 95,
        EfficacyDataJSON: JSON.stringify({
          observations: [
            { daa: 7, controlPct: 95, weedPressurePct: 5 },
            { daa: 14, controlPct: 90, weedPressurePct: 10 },
            { daa: 28, controlPct: 75, weedPressurePct: 25 },
            { daa: 42, controlPct: 40, weedPressurePct: 60 } // regrowth breakdown (< 70%)
          ]
        })
      };

      const stats = getFormulationTrialStats(formulation, [activeTrialWithTimeline], [], 'herbicide');
      expect(stats.total).toBe(1);
      // Efficacy was >= 70% up to DAA 28 before regrowth breakdown at DAA 42
      expect(stats.avgCtrlDays).toBe(28);
      expect(stats.peakEfficacy).toBe(95);
      expect(stats.winCount).toBe(1); // >= 70% counts as win
    });
  });
});
