import { describe, it, expect } from 'vitest';
import { buildAiObservationPayload } from '../utils/categoryObservationUtils.js';
import { CATEGORIES, getPrimaryObservationField } from '../utils/categoryConfig.js';

describe('Non-Herbicide AI Photo Automatic Observation & Clinical Diagnostics', () => {

  describe('False Info Prevention & Non-Plot Image Rejection', () => {
    it('should invalidate observation when AI detects a non-plot photo (packaging, bottle, flyer, blur)', () => {
      const mockAiNonPlot = {
        isValidPlotPhoto: false,
        invalidationReason: 'Commercial chemical bottle and label detected instead of field crop canopy.',
        efficacyAssessment: 'Precluded - Non-plot subject',
        metrics: {
          diseaseSeverity: 0,
          leafChlorosis: 0
        },
        targets: [],
        confidence: 95
      };

      const result = buildAiObservationPayload('fungicide', mockAiNonPlot, '7');

      expect(result.isInvalid).toBe(true);
      expect(result.status).toBe('Invalid (Non-plot)');
      expect(result.diseaseSeverity).toBeNull();
      expect(result.sporulationScore).toBeNull();
      expect(result.notes).toContain('NON-PLOT IMAGE REJECTED');
      expect(result.notes).toContain('Commercial chemical bottle and label');
    });

    it('should reject pesticide observation with invalid non-plot photo', () => {
      const mockAiPackaging = {
        isValidPlotPhoto: false,
        invalidationReason: 'Fertilizer bag / packaging foreground with no visible crop canopy.',
        confidence: 90
      };

      const result = buildAiObservationPayload('pesticide', mockAiPackaging, '14');

      expect(result.isInvalid).toBe(true);
      expect(result.status).toBe('Invalid (Non-plot)');
      expect(result.pestCount).toBeNull();
      expect(result.feedingDamagePct).toBeNull();
      expect(result.damageRating).toBeNull();
    });
  });

  describe('Fungicide Clinical Plant Pathology Accuracy', () => {
    it('should accurately capture publication-grade foliar pathology metrics', () => {
      const mockPathologyData = {
        isValidPlotPhoto: true,
        primaryEfficacyValue: 12.5,
        confidence: 94,
        metrics: {
          diseaseSeverity: 12.5,
          sporulationScore: 2,
          chlorosisCoveragePct: 18.0,
          pustuleDensity: 34,
          lesionCountPerLeaf: 4.2,
          greenLeafArea: 82.0
        },
        targets: [
          {
            species: 'Puccinia striiformis (Yellow Rust)',
            cover: 12.5,
            severityScore: 12.5,
            status: 'Active Sporulation',
            sporulationState: 'Active orange-yellow urediniospores in linear foliar stripes',
            tissueDistribution: 'Middle and upper canopy leaves',
            confidence: 94,
            notes: 'Parallel uredinial striae with necrotic chlorosis'
          }
        ],
        bbchStage: 39,
        details: {
          pathogenStage: 'Active uredinial sporulation',
          leafZonesAffected: 'Flag leaf -1 and flag leaf',
          canopyGreenLeafAreaPct: 82.0
        }
      };

      const result = buildAiObservationPayload('fungicide', mockPathologyData, '14');

      expect(result.isInvalid).toBe(false);
      expect(result.diseaseSeverity).toBe(12.5);
      expect(result.sporulationScore).toBe(2);
      expect(result.chlorosisCoveragePct).toBe(18.0);
      expect(result.pustuleDensity).toBe(34);
      expect(result.lesionCountPerLeaf).toBe(4.2);
      expect(result.greenLeafArea).toBe(82.0);
      expect(result.aiConfidence).toBe(94);
      expect(result.bbchStage).toBe(39);
      expect(result.targets).toHaveLength(1);
      expect(result.targets[0].species).toBe('Puccinia striiformis (Yellow Rust)');
      expect(result.targets[0].cover).toBe(12.5);
    });

    it('should correctly record clean, healthy crop canopy without hallucinating diseases', () => {
      const mockCleanCrop = {
        isValidPlotPhoto: true,
        primaryEfficacyValue: 0,
        confidence: 98,
        metrics: {
          diseaseSeverity: 0,
          sporulationScore: 0,
          chlorosisCoveragePct: 0,
          greenLeafArea: 100
        },
        targets: [
          {
            species: 'Healthy Crop (No Symptoms)',
            cover: 0,
            status: 'Healthy',
            confidence: 98,
            notes: 'Zero fungal pustules or necrotic lesions observed.'
          }
        ],
        bbchStage: 51
      };

      const result = buildAiObservationPayload('fungicide', mockCleanCrop, '21');

      expect(result.isInvalid).toBe(false);
      expect(result.diseaseSeverity).toBe(0);
      expect(result.sporulationScore).toBe(0);
      expect(result.greenLeafArea).toBe(100);
      expect(result.targets[0].species).toContain('Healthy Crop');
      expect(result.targets[0].cover).toBe(0);
    });
  });

  describe('Pesticide Economic Entomology & Damage Diagnostics', () => {
    it('should capture insect life stages, damage mode, and beneficial predators', () => {
      const mockEntomologyData = {
        isValidPlotPhoto: true,
        primaryEfficacyValue: 8.0,
        confidence: 92,
        metrics: {
          pestInfestationLevel: 8.0,
          pestCountPerPlant: 3.5,
          foliarDamagePct: 12.0,
          instarStage: 'L2-L3',
          beneficialPredatorCount: 2,
          frassScore: 1
        },
        targets: [
          {
            species: 'Spodoptera frugiperda (Fall Armyworm)',
            cover: 8.0,
            lifeStage: 'L2-L3 larvae',
            feedingDamageType: 'Window-pane leaf skeletonization & whorl feeding',
            confidence: 92,
            notes: 'Early instar larvae observed in whorl with slight frass deposit'
          }
        ],
        bbchStage: 32
      };

      const result = buildAiObservationPayload('pesticide', mockEntomologyData, '7');

      expect(result.isInvalid).toBe(false);
      expect(result.pestInfestationLevel).toBe(8.0);
      expect(result.pestCountPerPlant).toBe(3.5);
      expect(result.foliarDamagePct).toBe(12.0);
      expect(result.instarStage).toBe('L2-L3');
      expect(result.beneficialPredatorCount).toBe(2);
      expect(result.frassScore).toBe(1);
      expect(result.targets[0].species).toContain('Spodoptera frugiperda');
    });
  });

  describe('Nutrition Mobility-Based Diagnostics', () => {
    it('should capture spatial nutrient deficiency signs and canopy coverage', () => {
      const mockNutritionData = {
        isValidPlotPhoto: true,
        primaryEfficacyValue: 25.0,
        confidence: 91,
        metrics: {
          nutrientDeficiencyScore: 25.0,
          chlorosisIncidencePct: 30.0,
          canopyCoveragePct: 74.0,
          deficiencySign: 'N'
        },
        targets: [
          {
            species: 'Nitrogen (N) Deficiency',
            cover: 25.0,
            deficiencySign: 'N',
            leafZonation: 'Basal / older leaves exhibiting uniform pale yellow V-shaped chlorosis',
            confidence: 91,
            notes: 'Mobile nutrient symptom localized on lower canopy'
          }
        ],
        bbchStage: 25
      };

      const result = buildAiObservationPayload('nutrition', mockNutritionData, '14');

      expect(result.isInvalid).toBe(false);
      expect(result.nutrientDeficiencyScore).toBe(25.0);
      expect(result.chlorosisIncidencePct).toBe(30.0);
      expect(result.canopyCoveragePct).toBe(74.0);
      expect(result.deficiencySign).toBe('N');
      expect(result.targets[0].species).toContain('Nitrogen (N)');
    });
  });

  describe('Biostimulant Physiological & Vigor Dynamics', () => {
    it('should capture calibrated visual vigor, stress recovery, and foliar uniformity', () => {
      const mockBiostimData = {
        isValidPlotPhoto: true,
        primaryEfficacyValue: 8.5,
        confidence: 93,
        metrics: {
          vigorScore: 8.5,
          stressIndex: 1.5,
          canopyGreennessPct: 88.0,
          foliarUniformityScore: 9.0
        },
        targets: [
          {
            species: 'Canopy Vegetative Vigor',
            cover: 85,
            confidence: 93,
            notes: 'High turgor, deep green pigmentation, uniform tillering'
          }
        ],
        bbchStage: 30
      };

      const result = buildAiObservationPayload('biostimulant', mockBiostimData, '10');

      expect(result.isInvalid).toBe(false);
      expect(result.vigorScore).toBe(8.5);
      expect(result.stressIndex).toBe(1.5);
      expect(result.canopyGreennessPct).toBe(88.0);
      expect(result.foliarUniformityScore).toBe(9.0);
    });
  });

  describe('Category Isolation & Herbicide Invariance', () => {
    it('should keep herbicide configuration isolated and unaltered', () => {
      const herbicideConfig = CATEGORIES.herbicide;
      const fieldKeys = herbicideConfig.observationFields.map(f => f.key || f);
      expect(fieldKeys).toContain('weedCover');
      expect(getPrimaryObservationField('herbicide')).toBe('weedCover');
      expect(herbicideConfig.aiFeatures).toContain('Weed species identification');
      expect(herbicideConfig.aiFeatures).toContain('Weed cover estimation');
    });

    it('should ensure all non-herbicide categories have specialized clinical observation fields', () => {
      const fungKeys = CATEGORIES.fungicide.observationFields.map(f => f.key || f);
      expect(fungKeys).toContain('sporulationScore');
      expect(fungKeys).toContain('diseaseSeverity');

      const pestKeys = CATEGORIES.pesticide.observationFields.map(f => f.key || f);
      expect(pestKeys).toContain('pestCount');
      expect(pestKeys).toContain('feedingDamagePct');

      const nutKeys = CATEGORIES.nutrition.observationFields.map(f => f.key || f);
      expect(nutKeys).toContain('canopyCoveragePct');
      expect(nutKeys).toContain('chlorosisIncidencePct');

      const bioKeys = CATEGORIES.biostimulant.observationFields.map(f => f.key || f);
      expect(bioKeys).toContain('canopyGreennessPct');
      expect(bioKeys).toContain('foliarUniformityScore');
    });
  });
});
