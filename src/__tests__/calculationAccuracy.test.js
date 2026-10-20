import { describe, it, expect } from 'vitest';
import { fitFourPLModel } from '../utils/doseResponseUtils.js';
import { getStudentTCritical, calculateStats } from '../utils/statsUtils.js';
import { calculateColbySynergy, calculateWadleyMixture } from '../utils/hracSynergy.js';
import { calculateCanopyIndices } from '../utils/phenotyping.js';
import { calculateAiToProductRate, calculatePlotSprayMix } from '../utils/costUtils.js';
import { calculateDeltaT, calculateWetBulb, getDeltaTCondition } from '../services/sprayAdvisor.js';

describe('Scientific Calculation & Mathematical Accuracy Engine', () => {

  // 1. Dose-Response 4PL & Exact 95% Confidence Bounds
  describe('Dose-Response 4PL Regression & Confidence Bounds', () => {
    it('fits 4PL sigmoidal curve and computes positive log-normal 95% confidence intervals', () => {
      const sampleDoseData = [
        { dose: 10, response: 5 },
        { dose: 30, response: 18 },
        { dose: 100, response: 50 },
        { dose: 300, response: 82 },
        { dose: 1000, response: 95 }
      ];

      const result = fitFourPLModel(sampleDoseData);

      expect(result.success).toBe(true);
      expect(result.parameters.ec50).toBeGreaterThan(0);
      expect(result.parameters.ec50Lower).toBeGreaterThan(0);
      expect(result.parameters.ec50Upper).toBeGreaterThan(result.parameters.ec50Lower);
      expect(result.parameters.seEc50).toBeDefined();
      expect(result.statistics.rSquared).toBeGreaterThan(0.90);
    });
  });

  // 2. Statistical Accuracy: Student-t critical values
  describe('Student-t Exact Critical Values', () => {
    it('calculates exact two-tailed Student-t critical values', () => {
      // df = 10, alpha = 0.05 => critical value ~ 2.228
      const tCrit10 = getStudentTCritical(0.05, 10);
      expect(tCrit10).toBeCloseTo(2.228, 2);

      // df = 30, alpha = 0.05 => critical value ~ 2.042
      const tCrit30 = getStudentTCritical(0.05, 30);
      expect(tCrit30).toBeCloseTo(2.042, 2);

      // Large df approaches normal critical 1.96
      const tCritLarge = getStudentTCritical(0.05, 1000);
      expect(tCritLarge).toBeCloseTo(1.96, 1);
    });
  });

  // 3. Colby's Formula (1967) Synergy/Antagonism
  describe("Colby's Formula (1967) & Wadley Mixture Models", () => {
    it('calculates 2-way Colby expected efficacy: E = X + Y - (X*Y)/100', () => {
      // Herbicide A = 70% control alone, Herbicide B = 60% control alone
      // Expected = 70 + 60 - (4200/100) = 88%
      const result = calculateColbySynergy([70, 60], 95);

      expect(result.expectedEfficacy).toBe(88);
      expect(result.observedEfficacy).toBe(95);
      expect(result.deltaEfficacy).toBe(7);
      expect(result.synergyFactor).toBeCloseTo(95 / 88, 2);
      expect(result.classification).toBe('Synergistic');
    });

    it('classifies antagonism when observed control is significantly less than Colby expectation', () => {
      // Expected = 70 + 60 - 42 = 88%
      // Observed = 65% (< 88 * 0.90 = 79.2%)
      const result = calculateColbySynergy([70, 60], 65);

      expect(result.classification).toBe('Antagonistic');
      expect(result.deltaEfficacy).toBe(-23);
    });

    it('calculates generalized Colby formula for 3+ actives', () => {
      // 3 actives: 50%, 40%, 30%
      // Survival = 0.5 * 0.6 * 0.7 = 0.21 => Expected = 79%
      const result = calculateColbySynergy([50, 40, 30]);
      expect(result.expectedEfficacy).toBe(79);
    });

    it('computes Wadley ED50 harmonic mean for herbicide mixture', () => {
      // Herbicide 1: 50% in mix, ED50 = 100 g/ha
      // Herbicide 2: 50% in mix, ED50 = 200 g/ha
      // Expected mix ED50 = 1 / (0.5/100 + 0.5/200) = 1 / (0.005 + 0.0025) = 1 / 0.0075 = 133.33 g/ha
      const result = calculateWadleyMixture([
        { name: 'Active A', proportion: 0.5, ed50: 100 },
        { name: 'Active B', proportion: 0.5, ed50: 200 }
      ], 100);

      expect(result.expectedEd50).toBeCloseTo(133.33, 1);
      expect(result.observedEd50).toBe(100);
      expect(result.classification).toContain('Synergistic');
    });
  });

  // 4. Advanced Phenotyping Canopy Indices
  describe('Vegetative Indices (VARI, GLI, ExR, ExG)', () => {
    it('computes canopy indices correctly for green leaf and desiccation pixels', () => {
      // Pure healthy green pixel: R=30, G=160, B=40
      const greenPixels = [{ r: 30, g: 160, b: 40 }];
      const indices = calculateCanopyIndices(greenPixels);

      expect(indices.exgMean).toBeGreaterThan(0); // 2*160 - 30 - 40 = 250 > 0
      expect(indices.variMean).toBeGreaterThan(0); // (160-30)/(160+30-40) = 130/150 > 0
      expect(indices.gliMean).toBeGreaterThan(0);
    });
  });

  // 5. Active Ingredient & Plot Tank-Mix Volume Engine
  describe('Chemical Dosage & Backpack Sprayer Calibration Engine', () => {
    it('converts target a.i. rate to commercial product volume', () => {
      // Target: 1080 g a.i./ha, Product: 54% SL, Density: 1.15 kg/L
      // Product g/ha = (1080 * 100) / 54 = 2000 g/ha (2.0 kg/ha)
      // Volume = 2.0 / 1.15 = 1.739 L/ha (1739.1 mL/ha)
      const res = calculateAiToProductRate({
        targetAiGramsHa: 1080,
        aiConcentrationPct: 54,
        densityKgL: 1.15
      });

      expect(res.productKgHa).toBe(2);
      expect(res.productLHa).toBeCloseTo(1.739, 2);
      expect(res.productMlHa).toBeCloseTo(1739.1, 1);
    });

    it('calculates knapsack plot sprayer tank-mix calibration', () => {
      // Plot: 20 m², Product: 2 L/ha, Water: 200 L/ha, Tank: 16 L, 4 reps
      // Single plot spray = (20 * 200 * 1000) / 10000 = 400 mL
      // Single plot product = (20 * 2 * 1000) / 10000 = 4 mL
      // Concentration = 2000 mL / 200 L = 10 mL/L
      const mix = calculatePlotSprayMix({
        plotAreaM2: 20,
        productRateLHa: 2,
        waterVolumeLHa: 200,
        tankCapacityL: 16,
        replications: 4
      });

      expect(mix.plotSprayVolumeMl).toBe(400);
      expect(mix.plotProductDoseMl).toBe(4);
      expect(mix.concentrationMlPerL).toBe(10);
      expect(mix.plotsPerFullTank).toBe(40); // 16,000 mL / 400 mL = 40 plots
    });
  });

  // 6. Psychrometric Wet-Bulb and Delta-T Engine
  describe("Stull's (2011) Thermodynamic Delta-T Engine", () => {
    it('calculates psychrometric wet-bulb and Delta-T with high precision', () => {
      // At T = 25°C, RH = 50%
      // Stull's Wet-Bulb is approximately 18.0°C
      // Delta-T is approximately 25 - 18.0 = 7.0°C (Optimal window 2-8°C)
      const tw = calculateWetBulb(25, 50);
      const deltaT = calculateDeltaT(25, 50);

      expect(tw).toBeCloseTo(18.0, 1);
      expect(deltaT).toBeCloseTo(7.0, 1);

      const condition = getDeltaTCondition(deltaT);
      expect(condition.status).toBe('Optimal');
      expect(condition.color).toBe('emerald');
    });

    it('warns on extreme Delta-T > 10°C (hot and dry conditions)', () => {
      // At T = 35°C, RH = 20%
      // High evaporation risk => Delta-T > 10
      const deltaT = calculateDeltaT(35, 20);
      expect(deltaT).toBeGreaterThan(10);

      const condition = getDeltaTCondition(deltaT);
      expect(condition.status).toBe('Unsuitable');
      expect(condition.color).toBe('red');
    });
  });

});
