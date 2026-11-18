import { describe, it, expect } from 'vitest';
import {
  calculateAnovaRCB,
  selectIndependentAssessmentSlice,
  computeDataCompleteness
} from '../services/advancedReportGenerator.js';
import {
  AnalysisEngine,
  resolveProjectAnalysisContext,
  extractLatestValidTrialMetric
} from '../utils/analysisUtils.js';
import { performANOVA } from '../utils/statsUtils.js';
import { formatDate, formatDateTime, parseCustomDate } from '../utils/dateUtils.js';

/**
 * Helper: Build a realistic 4-treatment × 5-block RCBD Chilli Pot Trial
 * modeled directly on PROJ-1794568324462:
 *  - 20 independent pots (4 treatments × 5 replications)
 *  - 1 single PotTrial block record (BlockID = 'BLK-1')
 *  - 3 observation dates:
 *      1) 12-Nov-2026 (DAA 0): full visualVigor, canopyCoverage, plantHeight
 *      2) 17-Nov-2026 (DAA 4): full visualVigor, canopyCoverage, plantHeight
 *      3) 18-Nov-2026 (DAA 5): plant-height-ONLY mass walk (NO visualVigor, NO canopyCoverage)
 *  - NO yield recorded on any pot!
 */
function buildChilliPotTrialFixture() {
  const project = {
    ID: 'PROJ-1794568324462',
    Name: 'NEW NPK TRIALS NOV-26- Chilli-Open Field',
    Category: 'nutrition',
    Crop: 'Chilli',
    Design: 'PotTrial',
    PotRows: 5,
    PotCols: 4,
    PotLayout: 'stripe',
    Metric: 'Yield Improvement',
    StartDate: '2026-11-13'
  };

  const blocks = [{ ID: 'BLK-1', ProjectID: project.ID, Name: 'Pot Grid Block 1' }];

  const treatments = [
    { name: 'Untreated Control', num: 1, vigorBase: 7.5, canopyBase: 50, heightBase: 29 },
    { name: 'NPK POWDER NEW (with U)', num: 2, vigorBase: 8.4, canopyBase: 74, heightBase: 32 },
    { name: 'NPK POWDER NEW (without U)', num: 3, vigorBase: 7.8, canopyBase: 60, heightBase: 30 },
    { name: 'N 16', num: 4, vigorBase: 8.0, canopyBase: 64, heightBase: 31 }
  ];

  const trials = [];
  const flatObservations = [];

  for (let rep = 1; rep <= 5; rep++) {
    treatments.forEach((trt, idx) => {
      const plotNum = `R${rep}C${idx + 1}`;
      const repOffset = (rep - 3) * 0.25;
      const obsList = [
        {
          date: '12-Nov-2026',
          daa: 0,
          visualVigor: +(trt.vigorBase - 0.5 + repOffset).toFixed(2),
          canopyCoverage: +(trt.canopyBase - 10 + rep * 1.5).toFixed(1),
          plantHeight: +(trt.heightBase - 2 + rep * 0.6).toFixed(1)
        },
        {
          date: '17-Nov-2026',
          daa: 4,
          visualVigor: +(trt.vigorBase + repOffset).toFixed(2),
          canopyCoverage: +(trt.canopyBase + rep * 2.0).toFixed(1),
          plantHeight: +(trt.heightBase + rep * 0.8).toFixed(1)
        },
        {
          // Plant-height-only walk: visualVigor & canopyCoverage intentionally NOT recorded
          date: '18-Nov-2026',
          daa: 5,
          plantHeight: +(trt.heightBase + 1.2 + rep * 0.8).toFixed(1)
        }
      ];

      trials.push({
        ID: `TRIAL-${rep}-${trt.num}`,
        ProjectID: project.ID,
        BlockID: 'BLK-1',
        Category: 'nutrition',
        FormulationName: trt.name,
        Replication: String(rep),
        PlotNumber: plotNum,
        IsControl: trt.num === 1,
        Yield: '',
        YieldValue: '',
        EfficacyDataJSON: JSON.stringify(obsList),
        PhotoURLs: '[]'
      });

      obsList.forEach(o => {
        flatObservations.push({
          ...o,
          treatment: trt.name,
          treatmentNumber: trt.num,
          rep,
          replication: rep,
          plot: plotNum
        });
      });
    });
  }

  return { project, blocks, trials, flatObservations };
}

describe('Report Consistency, Statistical Independence & Data Integrity', () => {
  it('prevents pseudoreplication in calculateAnovaRCB (60 repeated rows across 3 dates -> n=20 independent RCBD plots, DF=3,4,12,19)', () => {
    const { flatObservations } = buildChilliPotTrialFixture();
    expect(flatObservations).toHaveLength(60);

    // Plant height has 60 rows (3 dates × 20 pots) — ANOVA MUST slice to the latest valid date (n=20)
    const heightAnova = calculateAnovaRCB(flatObservations, 'plantHeight', 'nutrition', 'PotTrial');
    expect(heightAnova.error).toBeUndefined();
    expect(heightAnova.modelType).toBe('RCBD');
    expect(heightAnova.nIndependentUnits).toBe(20);
    expect(heightAnova.df_treatment).toBe(3);
    expect(heightAnova.df_block).toBe(4);
    expect(heightAnova.df_error).toBe(12);
    expect(heightAnova.df_total).toBe(19);
    expect(heightAnova.isRepeatedMeasuresSliced).toBe(true);
    expect(heightAnova.analyzedDate).toBe('18-Nov-2026');

    // Visual vigor was NOT measured on 18-Nov-2026 — MUST slice to 17-Nov-2026 (n=20, DF=3,4,12,19) and NOT zero out
    const vigorAnova = calculateAnovaRCB(flatObservations, 'visualVigor', 'nutrition', 'PotTrial');
    expect(vigorAnova.error).toBeUndefined();
    expect(vigorAnova.nIndependentUnits).toBe(20);
    expect(vigorAnova.df_treatment).toBe(3);
    expect(vigorAnova.df_block).toBe(4);
    expect(vigorAnova.df_error).toBe(12);
    expect(vigorAnova.analyzedDate).toBe('17-Nov-2026');
    expect(vigorAnova.grandMean).toBeGreaterThan(7);
  });

  it('computes TRUE cell-level data completeness instead of hardcoded 100%', () => {
    const { flatObservations } = buildChilliPotTrialFixture();
    const activeFields = [
      { key: 'visualVigor', label: 'Visual Vigor Rating (0-10)' },
      { key: 'canopyCoverage', label: 'Canopy Coverage (%)' },
      { key: 'plantHeight', label: 'Plant Height (cm)' }
    ];

    const comp = computeDataCompleteness(flatObservations, activeFields);
    // 60 rows × 3 parameters = 180 expected cells
    // plantHeight: 60/60 valid (0 missing)
    // visualVigor: 40/60 valid (20 missing on 18-Nov-2026)
    // canopyCoverage: 40/60 valid (20 missing on 18-Nov-2026)
    expect(comp.totalExpectedCells).toBe(180);
    expect(comp.validCells).toBe(140);
    expect(comp.missingCells).toBe(40);
    expect(comp.parametersWithMissing).toBe(2);
    expect(comp.completenessPct).toBeCloseTo(77.8, 1);
    expect(comp.perParameter.plantHeight.missingCount).toBe(0);
    expect(comp.perParameter.visualVigor.missingCount).toBe(20);
    expect(comp.perParameter.canopyCoverage.missingCount).toBe(20);
  });

  it('resolves consistent blocks (5, not 1), yield absence, and analyzed metric across Excel & Regulatory PDF', () => {
    const { project, blocks, trials } = buildChilliPotTrialFixture();
    const ctx = resolveProjectAnalysisContext(project, trials, blocks, 'nutrition');

    expect(ctx.hasYield).toBe(false);
    expect(ctx.effectiveBlocks).toBe(5);
    expect(ctx.treatmentCount).toBe(4);
    expect(ctx.experimentalUnits).toBe(20);
    expect(ctx.designLabel).toBe('RCBD Pot Trial');
    expect(ctx.analyzedMetricKey).toBe('visualVigor');
    expect(ctx.analyzedMetricLabel).not.toMatch(/yield/i);
  });

  it('AnalysisEngine & performANOVA NEVER coerce missing yield or plant-height-only date to 0.00', async () => {
    const { project, blocks, trials } = buildChilliPotTrialFixture();
    const appState = { projects: [project], blocks, trials };
    const engine = new AnalysisEngine(project.ID, appState, () => appState);

    // 1. Yield was never recorded -> MUST return null, never 0
    trials.forEach(t => {
      expect(engine.getObservationValue(t, 'yield')).toBeNull();
      expect(extractLatestValidTrialMetric(t, 'yield', 'nutrition')).toBeNull();
    });

    // 2. Visual vigor on latest-valid lookup -> MUST pick 17-Nov-2026 (> 7.0), NOT 0 from 18-Nov-2026
    const vigorRes = await engine.analyze('visualVigor', null, null, { postHoc: 'lsd', persist: false });
    expect(vigorRes.grouping).toHaveLength(4);
    vigorRes.grouping.forEach(g => {
      expect(g.mean).toBeGreaterThan(7.0);
    });
    // RCBD PotTrial DF MUST match Excel: Trt=3, Block=4, Error=12, Total=19
    expect(vigorRes.anova.dfTreat).toBe(3);
    expect(vigorRes.anova.dfBlock).toBe(4);
    expect(vigorRes.anova.dfError).toBe(12);
    expect(vigorRes.anova.dfTotal).toBe(19);

    // 3. Direct performANOVA on PotTrial trials with shared BlockID='BLK-1' must block on Replication (5 blocks -> dfBlock=4)
    const directAnova = performANOVA(trials, { metric: 'visualVigor', design: 'RCBD' });
    expect(directAnova.error).toBeUndefined();
    expect(directAnova.anovaTable.df[0]).toBe(3);
    expect(directAnova.anovaTable.df[1]).toBe(4);
    expect(directAnova.anovaTable.df[2]).toBe(12);
    expect(directAnova.anovaTable.df[3]).toBe(19);

    // 4. Running AnalysisEngine on unharvested 'yield' MUST return empty grouping (NO fake 0.00 means!)
    const yieldRes = await engine.analyze('yield', null, null, { postHoc: 'lsd', persist: false });
    expect(yieldRes.grouping).toHaveLength(0);
    expect(Object.keys(yieldRes.means)).toHaveLength(0);
  });

  it('dateUtils NEVER outputs NaN-NaN-NaN on invalid dates or DD/MM/YYYY photo timestamps', () => {
    // Direct invalid date via Date.prototype.toLocaleDateString override
    expect(new Date('not-a-date').toLocaleDateString()).toBe('N/A');
    expect(new Date('18/11/2026').toLocaleDateString()).toBe('N/A'); // native JS Date('18/11/2026') is Invalid Date -> guarded!

    // Custom DD/MM/YYYY and DD/MM/YYYY, HH:mm strings parsed cleanly
    expect(formatDate('18/11/2026')).toBe('18-11-2026');
    expect(formatDate('18/11/2026, 10:49')).toBe('18-11-2026');
    expect(formatDateTime('18/11/2026, 10:49')).not.toContain('NaN');
    expect(formatDate('invalid-garbage')).toBe('N/A');
    expect(formatDateTime('invalid-garbage')).toBe('N/A');
    expect(parseCustomDate('bad-date')).toBeNull();
  });

  it('selectIndependentAssessmentSlice supports per-date independent slicing', () => {
    const { flatObservations } = buildChilliPotTrialFixture();
    const nov12 = selectIndependentAssessmentSlice(flatObservations, 'plantHeight', { targetDateKey: '2026-11-12' });
    const nov18 = selectIndependentAssessmentSlice(flatObservations, 'plantHeight', { targetDateKey: '2026-11-18' });

    expect(nov12.sliceData).toHaveLength(20);
    expect(nov18.sliceData).toHaveLength(20);
    expect(nov12.analyzedDate).toBe('2026-11-12');
    expect(nov18.analyzedDate).toBe('2026-11-18');
  });
});
