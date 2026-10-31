import { describe, it, expect } from 'vitest';
import {
  normalizeApplicationItem,
  parseAgronomicInputLog,
  getInputCategoryBadge,
  INPUT_CATEGORIES,
  DOSAGE_UNITS,
  APPLICATION_METHODS,
  CATEGORY_INPUT_PRESETS,
} from '../utils/agronomicInputs.js';
import {
  normalizePickingItem,
  calculateHarvestTotals,
  aggregateProjectHarvest,
  exportHarvestCSV,
  HARVEST_YIELD_UNITS,
  CULL_REASONS,
} from '../utils/harvestUtils.js';

describe('Agronomic Management & Trial Inputs Utils', () => {
  it('normalizes complete agronomic application item correctly', () => {
    const raw = {
      code: 'APP-01',
      inputType: 'fertilizer',
      productName: 'NPK 10-26-26',
      activeIngredient: '10% N, 26% P2O5, 26% K2O',
      date: '2025-05-10T08:30',
      dosage: '150',
      dosageUnit: 'kg/ha',
      cropStage: 'Vegetative (BBCH 21)',
      targetStage: 'Basal Soil',
      method: 'Basal Soil Application',
      targetPurpose: 'Primary root establishment and nutrition',
      operator: 'Dr. Jane Agronomist',
      appliedScope: 'Blanket / Entire Project',
      notes: 'Applied with precision tractor spreader',
    };

    const item = normalizeApplicationItem(raw);
    expect(item.code).toBe('APP-01');
    expect(item.inputType).toBe('fertilizer');
    expect(item.productName).toBe('NPK 10-26-26');
    expect(item.activeIngredient).toBe('10% N, 26% P2O5, 26% K2O');
    expect(item.dosage).toBe('150');
    expect(item.dosageUnit).toBe('kg/ha');
    expect(item.method).toBe('Basal Soil Application');
    expect(item.cropStage).toBe('Vegetative (BBCH 21)');
    expect(item.targetPurpose).toBe('Primary root establishment and nutrition');
    expect(item.operator).toBe('Dr. Jane Agronomist');
    expect(item.appliedScope).toBe('Blanket / Entire Project');
  });

  it('normalizes partial/legacy application item with sensible defaults and extracts packed units', () => {
    const rawLegacy = {
      code: 'App 1',
      date: '2025-06-01',
      dosage: '2.5 L/ha',
      method: 'Foliar Spray',
    };

    const item = normalizeApplicationItem(rawLegacy);
    expect(item.code).toBe('App 1');
    expect(item.date).toBe('2025-06-01');
    expect(item.method).toBe('Foliar Spray');
    expect(item.dosage).toBe('2.5');
    expect(item.dosageUnit).toBe('L/ha');
    expect(item.inputType).toBe('other');
  });

  it('parses JSON string log into normalized items', () => {
    const jsonStr = JSON.stringify([
      { code: 'FERT-01', productName: 'Urea 46%', dosage: '100', dosageUnit: 'kg/ha' },
      { code: 'FUNG-01', inputType: 'fungicide', productName: 'Azoxystrobin', dosage: '1', dosageUnit: 'L/ha' },
    ]);

    const parsed = parseAgronomicInputLog(jsonStr);
    expect(parsed.length).toBe(2);
    expect(parsed[0].productName).toBe('Urea 46%');
    expect(parsed[1].inputType).toBe('fungicide');
  });

  it('handles empty or malformed input logs safely', () => {
    expect(parseAgronomicInputLog(null)).toEqual([]);
    expect(parseAgronomicInputLog('')).toEqual([]);
    expect(parseAgronomicInputLog('not a json')).toEqual([]);
    expect(parseAgronomicInputLog({})).toEqual([]);
  });

  it('provides correct category badge styling', () => {
    const fertBadge = getInputCategoryBadge('fertilizer');
    expect(fertBadge.label).toBe('Fertilizer / Nutrient');
    expect(fertBadge.color).toContain('amber');

    const fungBadge = getInputCategoryBadge('fungicide');
    expect(fungBadge.label).toBe('Fungicide / Bactericide');
    expect(fungBadge.color).toContain('indigo');

    const pestBadge = getInputCategoryBadge('pesticide');
    expect(pestBadge.label).toBe('Insecticide / Pesticide');
    expect(pestBadge.color).toContain('red');

    const bioBadge = getInputCategoryBadge('biostimulant');
    expect(bioBadge.label).toBe('Biostimulant / Growth Promoter');
    expect(bioBadge.color).toContain('teal');
  });

  it('provides presets for non-herbicide categories', () => {
    expect(CATEGORY_INPUT_PRESETS.nutrition.length).toBeGreaterThan(0);
    expect(CATEGORY_INPUT_PRESETS.fungicide.length).toBeGreaterThan(0);
    expect(CATEGORY_INPUT_PRESETS.pesticide.length).toBeGreaterThan(0);
    expect(CATEGORY_INPUT_PRESETS.biostimulant.length).toBeGreaterThan(0);
  });
});

describe('Multi-Harvest & Yield Utils', () => {
  it('normalizes picking item and calculates total weight and yield extrapolations', () => {
    const raw = {
      pickingNumber: 1,
      harvestDate: '2025-07-15',
      cropStage: 'BBCH 85',
      actualMarketableWeight: 450,
      actualUnmarketableWeight: 50,
      yieldUnit: 'kg/plot',
      plotAreaM2: 20, // 20 m2
      actualFruitCount: 120,
      moisturePct: 14.2,
      brixScore: 11.5,
      cullReason: 'Insect Damage (Borer / Puncture)',
      notes: 'First picking, healthy canopy',
    };

    const item = normalizePickingItem(raw);
    expect(item.pickingNumber).toBe(1);
    expect(item.actualMarketableWeight).toBe(450);
    expect(item.actualUnmarketableWeight).toBe(50);
    expect(item.totalWeight).toBe(500);
    expect(item.plotAreaM2).toBe(20);
    // Extrapolations: 500 kg total on 20 m2 -> 25 kg/m2 -> 250,000 kg/ha -> 250 t/ha
    expect(item.extrapolatedYieldKgHa).toBe('250000.0');
    expect(item.moisturePct).toBe(14.2);
    expect(item.brixScore).toBe(11.5);
    expect(item.cullReason).toBe('Insect Damage (Borer / Puncture)');
  });

  it('calculates cumulative harvest totals across multiple pickings correctly', () => {
    const pickings = [
      {
        pickingNumber: 1,
        harvestDate: '2025-07-01',
        actualMarketableWeight: 300,
        actualUnmarketableWeight: 30,
        actualFruitCount: 80,
        moisturePct: 14.0,
        brixScore: 10.0,
      },
      {
        pickingNumber: 2,
        harvestDate: '2025-07-15',
        actualMarketableWeight: 500,
        actualUnmarketableWeight: 50,
        actualFruitCount: 120,
        moisturePct: 14.4,
        brixScore: 12.0,
      },
      {
        pickingNumber: 3,
        harvestDate: '2025-08-01',
        actualMarketableWeight: 200,
        actualUnmarketableWeight: 20,
        actualFruitCount: 50,
        moisturePct: 14.2,
        brixScore: 11.0,
      },
    ];

    const totals = calculateHarvestTotals(pickings, 10); // 10 m2 plot
    expect(totals.pickingsCount).toBe(3);
    expect(totals.totalMarketableWeight).toBe(1000);
    expect(totals.totalUnmarketableWeight).toBe(100);
    expect(totals.totalWeight).toBe(1100);
    expect(totals.totalFruitCount).toBe(250);
    expect(totals.marketablePercentage).toBeCloseTo((1000 / 1100) * 100, 1);
    expect(totals.unmarketablePercentage).toBeCloseTo((100 / 1100) * 100, 1);
    expect(totals.averageBrix).toBeCloseTo(11.0, 1);
    expect(totals.averageMoisture).toBeCloseTo(14.2, 1);
    expect(totals.latestHarvestDate).toBe('2025-08-01');
  });

  it('aggregates multi-plot project harvest data across treatments and blocks', () => {
    const trials = [
      {
        ID: 'T1',
        PlotNumber: '101',
        BlockID: 'B1',
        FormulationName: 'Nutri-Pro 20-20-20',
        IsControl: false,
        Yield: 600,
        YieldUnit: 'kg/plot',
        PlotArea: 10,
        HarvestDataJSON: JSON.stringify({
          pickings: [
            { pickingNumber: 1, actualMarketableWeight: 350, actualUnmarketableWeight: 20, brixScore: 12 },
            { pickingNumber: 2, actualMarketableWeight: 250, actualUnmarketableWeight: 10, brixScore: 13 },
          ],
        }),
      },
      {
        ID: 'T2',
        PlotNumber: '102',
        BlockID: 'B1',
        FormulationName: 'Untreated Check',
        IsControl: true,
        Yield: 300,
        YieldUnit: 'kg/plot',
        PlotArea: 10,
        HarvestDataJSON: JSON.stringify({
          pickings: [
            { pickingNumber: 1, actualMarketableWeight: 200, actualUnmarketableWeight: 50, brixScore: 9 },
            { pickingNumber: 2, actualMarketableWeight: 100, actualUnmarketableWeight: 30, brixScore: 9.5 },
          ],
        }),
      },
    ];

    const agg = aggregateProjectHarvest(trials);
    expect(agg.totalPlots).toBe(2);
    expect(agg.plotsWithHarvest).toBe(2);
    expect(agg.totalPickingsCount).toBe(4);
    expect(agg.totalMarketableWeight).toBe(900);
    expect(agg.totalUnmarketableWeight).toBe(110);
    expect(agg.avgMarketablePerPlot).toBe(450);
    expect(agg.marketablePct).toBeCloseTo((900 / 1010) * 100, 1);
  });

  it('exports harvest CSV with proper headers', () => {
    const trials = [
      {
        ID: 'T1',
        PlotNumber: '101',
        BlockID: 'B1',
        FormulationName: 'Nutri-Pro',
        IsControl: false,
        YieldUnit: 'kg/plot',
        PlotArea: 10,
        HarvestDataJSON: JSON.stringify({
          pickings: [
            { pickingNumber: 1, harvestDate: '2025-07-01', actualMarketableWeight: 300, actualUnmarketableWeight: 20, actualFruitCount: 50, brixScore: 11, moisturePct: 14, cullReason: 'None / Grade A Clean' },
          ],
        }),
      },
    ];

    const agg = aggregateProjectHarvest(trials);
    const csv = exportHarvestCSV(agg, 'Test_Project');
    expect(typeof csv).toBe('string');
    expect(csv).toContain('PlotNumber,Treatment,IsControl,PickingNumber,HarvestDate,MarketableWeight');
    expect(csv).toContain('101');
    expect(csv).toContain('Nutri-Pro');
  });

  it('supports quintals per hectare (q_ha) and computes ANOVA variance across reps', () => {
    // 1. Check unit definition
    const qHaUnit = HARVEST_YIELD_UNITS.find(u => u.id === 'q_ha');
    expect(qHaUnit).toBeDefined();
    expect(qHaUnit.factorToKg).toBe(100);

    // 2. Normalization with plot area
    const item = normalizePickingItem({
      pickingNumber: 1,
      actualMarketableWeight: 200,
      actualUnmarketableWeight: 20,
      yieldUnit: 'kg/plot',
      plotAreaM2: 20, // 220 kg on 20 m2 = 11 kg/m2 -> 110,000 kg/ha -> 1,100 q/ha -> 110 t/ha
    });
    expect(item.extrapolatedYieldKgHa).toBe('110000.0');
    expect(item.extrapolatedYieldQHa).toBe('1100.00');
    expect(item.extrapolatedYieldTHa).toBe('110.00');

    // 3. Multi-replication ANOVA variance check
    const multiRepTrials = [
      {
        ID: 'T_R1',
        FormulationName: 'BioBoost-100',
        Replication: 'R1',
        HarvestDataJSON: JSON.stringify({
          pickings: [{ pickingNumber: 1, actualMarketableWeight: 100 }],
        }),
      },
      {
        ID: 'T_R2',
        FormulationName: 'BioBoost-100',
        Replication: 'R2',
        HarvestDataJSON: JSON.stringify({
          pickings: [{ pickingNumber: 1, actualMarketableWeight: 120 }],
        }),
      },
      {
        ID: 'T_R3',
        FormulationName: 'BioBoost-100',
        Replication: 'R3',
        HarvestDataJSON: JSON.stringify({
          pickings: [{ pickingNumber: 1, actualMarketableWeight: 110 }],
        }),
      },
    ];

    const agg = aggregateProjectHarvest(multiRepTrials);
    const trt = agg.cumulativeTable.find(t => t.treatmentName === 'BioBoost-100');
    expect(trt).toBeDefined();
    expect(trt.replicationsCount).toBe(3);
    // Mean = (100 + 120 + 110) / 3 = 110
    expect(trt.meanMarketable).toBe(110);
    // Sample variance = ((100-110)^2 + (120-110)^2 + (110-110)^2) / (3-1) = (100 + 100 + 0) / 2 = 100
    // SD = 10
    expect(trt.sdMarketable).toBe(10);
    // SE = 10 / sqrt(3) ~ 5.77
    expect(trt.seMarketable).toBeCloseTo(5.77, 2);
    // CV% = (10 / 110) * 100 ~ 9.09%
    expect(trt.cvMarketable).toBeCloseTo(9.1, 1);
  });
});

