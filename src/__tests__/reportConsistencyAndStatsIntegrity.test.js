import { describe, it, expect } from 'vitest';
import {
  AdvancedReportGenerator,
  calculateAnovaRCB,
  selectIndependentAssessmentSlice,
  computeDataCompleteness,
  detectAnomalousObservations,
  validateMeasurementScale,
  isOrdinalOrStageField,
  isValidNarrativeConclusion,
  compileAgronomicInterpretation,
  sanitizeExcelNarrativeText,
  runReportQualityControlAudit
} from '../services/advancedReportGenerator.js';
import { SOFTWARE_BUILD_ID } from '../utils/version.js';
import {
  AnalysisEngine,
  resolveProjectAnalysisContext,
  extractLatestValidTrialMetric
} from '../utils/analysisUtils.js';
import { performANOVA } from '../utils/statsUtils.js';
import { formatDate, formatDateTime, parseCustomDate, calculateDAA, formatDaaLabel } from '../utils/dateUtils.js';

/**
 * Realistic 4-treatment × 5-block RCBD Chilli Pot Trial fixture (PROJ-1794568324462):
 *  - 20 independent pots (4 treatments × 5 replications), 1 PotTrial Block record
 *  - GPS coordinates on Project.Location ('12.9716, 77.5946')
 *  - Trial Start Date: 2026-11-13
 *  - 3 assessment dates (60 plot-date rows):
 *      1) 12-Nov-2026 (Pre-Application Baseline -> DAA -1): vigor, leafColor, canopy, height
 *      2) 17-Nov-2026 (DAA 4): vigor, leafColor, canopy, height, deficiencySeverity (Control=0),
 *         tillerCount (sparse: only 6 plots across 2 treatments -> ineligible!),
 *         allZeroMetric (constant 0 across all 20 pots -> constant/zero variance!),
 *         flowerStage (mostly 0/1 across 18 plots + extreme outlier Plot 204 = 61!)
 *      3) 18-Nov-2026 (DAA 5): plantHeight ONLY (missing vigor, leafColor, canopy, etc.)
 *  - Yield NOT harvested (empty on all 20 pots)
 */
function buildComprehensiveChilliFixture() {
  const project = {
    ID: 'PROJ-1794568324462',
    Name: 'NEW NPK TRIALS NOV-26- Chilli-Open Field',
    Category: 'nutrition',
    Crop: 'Chilli',
    Location: '12.9716, 77.5946',
    Investigator: 'Dr. Agronomist',
    Design: 'PotTrial',
    PotRows: 5,
    PotCols: 4,
    PotLayout: 'stripe',
    Metric: 'Yield Improvement',
    StartDate: '2026-11-13'
  };

  const blocks = [{ ID: 'BLK-1', ProjectID: project.ID, Name: 'Pot Grid Block 1' }];

  const treatments = [
    { name: 'Untreated Control', num: 1, vigor: [7, 8, 8, 9, 8], canopy: [45, 50, 52, 55, 53], height: [28, 29, 30, 31, 30], defSev: [0, 0, 0, 0, 0] },
    { name: 'NPK POWDER NEW (with U)', num: 2, vigor: [8, 9, 9, 8, 9], canopy: [70, 78, 80, 82, 90], height: [31, 32, 33, 32, 34], defSev: [2, 0, 3, 1, 2] },
    { name: 'NPK POWDER NEW (without U)', num: 3, vigor: [8, 7, 8, 8, 8], canopy: [55, 60, 62, 58, 65], height: [29, 30, 31, 30, 31], defSev: [1, 2, 0, 1, 1] },
    { name: 'N 16', num: 4, vigor: [8, 8, 9, 9, 8], canopy: [60, 65, 68, 66, 71], height: [30, 31, 32, 31, 32], defSev: [1, 0, 2, 1, 0] }
  ];

  const trials = [];
  const flatObservations = [];

  for (let rep = 1; rep <= 5; rep++) {
    treatments.forEach((trt, idx) => {
      const plotNum = `${rep}0${idx + 1}`;
      const effectivePlot = (rep === 2 && trt.num === 2) ? '204' : (rep === 1 && trt.num === 4) ? '103' : plotNum;
      const rIdx = rep - 1;

      const nov17Obs = {
        date: '17-Nov-2026',
        daa: 4,
        visualVigor: trt.vigor[rIdx],
        leafColor: trt.num === 1 ? 3.8 : 4.0,
        canopyCoverage: trt.canopy[rIdx],
        plantHeight: (rep === 1 && trt.num === 4) ? 0 : trt.height[rIdx], // genuine 0 cm anomaly on Plot 104 / Rep1 N16
        deficiencySeverity: trt.defSev[rIdx],
        chlorosisIncidence: 0, // constant 0 across all 20 pots
        leafGlossScore: 7,
        // SPAD: single record only (n=1 -> CV must be "N/A – Insufficient observations", NEVER 0% Excellent!)
        ...(rep === 1 && trt.num === 4 ? { chlorophyllIndex: 0 } : {}),
        // Tiller count: sparse (only 3 plots in Trt 1 and 3 in Trt 2 -> missing Trt 3 & Trt 4!)
        ...(trt.num <= 2 && rep <= 3 ? { tillerCount: 0 } : {}),
        // Flower stage: 18 valid plots (missing rep 5 on Trt 1 and Trt 4) with mixed BBCH code 61 on Plot 204!
        ...((rep === 5 && (trt.num === 1 || trt.num === 4))
          ? {}
          : { flowerStage: effectivePlot === '204' ? 61 : (rep % 2 === 0 ? 1 : 0) })
      };

      const obsList = [
        {
          // Pre-application baseline: 1 day BEFORE 13-Nov-2026 start date (stored with legacy clamped daa: 0)
          date: '12-Nov-2026',
          daa: 0,
          visualVigor: +(trt.vigor[rIdx] - 0.5).toFixed(1),
          leafColor: 3.5,
          canopyCoverage: trt.canopy[rIdx] - 10,
          plantHeight: trt.height[rIdx] - 2,
          // Sparse baseline Tiller Count (n=2) & Leaf Gloss (n=1) to verify incomplete longitudinal coverage guard
          ...(rep === 1 && trt.num <= 2 ? { tillerCount: 0 } : {}),
          ...(rep === 1 && trt.num === 2 ? { leafGlossScore: 7, flowerStage: 1 } : {})
        },
        nov17Obs,
        {
          // Plant-height-ONLY walk on 18-Nov-2026 (NO vigor, leafColor, canopy, etc.)
          date: '18-Nov-2026',
          daa: 5,
          plantHeight: +(trt.height[rIdx] + 1.5).toFixed(1)
        }
      ];

      trials.push({
        ID: `TRIAL-${rep}-${trt.num}`,
        ProjectID: project.ID,
        BlockID: 'BLK-1',
        Category: 'nutrition',
        FormulationName: trt.name,
        Replication: String(rep),
        PlotNumber: effectivePlot,
        IsControl: trt.num === 1,
        Date: '2026-11-13',
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
          plot: effectivePlot
        });
      });
    });
  }

  return { project, blocks, trials, flatObservations };
}

function getWorksheetRows(ws) {
  const rows = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    rows.push(row.values.slice(1));
  });
  return rows;
}

describe('Final Report Integrity Audit — All 10 Regression Scenarios & Excel vs PDF Cross-Verification', () => {
  it('Scenario 1 & 10: Latest assessment has only plant height -> NO zero coercion in Chartwork or DAA Trends', async () => {
    const { project, trials } = buildComprehensiveChilliFixture();
    const gen = new AdvancedReportGenerator(trials, 'nutrition', project);
    await gen.processObservationsWithAI();
    gen.validationWarnings = gen.validateData();
    await gen.createAssessmentSummarySheet();
    await gen.createChartworkSheet();

    // Verify Chartwork: 18-Nov-2026 column MUST be null (blank), NEVER 0 for visualVigor / leafColor / canopyCoverage
    const chartwork = gen.workbook.getWorksheet('Chartwork');
    const headerRow = chartwork.getRow(3).values.slice(1);
    const nov18ColIdx = headerRow.findIndex(v => String(v).includes('18-Nov-2026')) + 1;
    expect(nov18ColIdx).toBeGreaterThan(1);

    let inVigorSection = false;
    let checkedVigorNov18 = 0;
    chartwork.eachRow((row, rowNum) => {
      if (rowNum <= 3) return;
      const label = String(row.getCell(1).value || '');
      if (label.includes('Visual Vigor')) {
        inVigorSection = true;
        return;
      }
      if (inVigorSection && !label.startsWith('  ')) {
        inVigorSection = false;
        return;
      }
      if (inVigorSection) {
        const val = row.getCell(nov18ColIdx).value;
        // Must be null (blank), NEVER 0 or { result: 0 }
        expect(val).toBeNull();
        checkedVigorNov18++;
      }
    });
    expect(checkedVigorNov18).toBeGreaterThanOrEqual(4);

    // Verify Assessment Summary Section 4 (DAA Trends): Visual Vigor MUST compare 12-Nov -> 17-Nov (NOT 0 / false decline!)
    const summaryWs = gen.workbook.getWorksheet('Assessment Summary');
    const summaryRows = getWorksheetRows(summaryWs);
    const trendHeaderIdx = summaryRows.findIndex(r => String(r[0] || '').includes('4. DAA-WISE DEVELOPMENTAL TRENDS'));
    expect(trendHeaderIdx).toBeGreaterThan(-1);
    const trendRows = summaryRows.slice(trendHeaderIdx + 2);
    const vigorTrend = trendRows.find(r => String(r[0] || '').includes('Visual Vigor'));
    expect(vigorTrend).toBeDefined();
    expect(String(vigorTrend[3])).toContain('17-Nov-2026');
    expect(vigorTrend[4]).toBeGreaterThan(7.5); // NOT 0!
    expect(String(vigorTrend[6])).not.toContain('Decreased');
  });

  it('Scenario 2: Unrecorded yield produces NO fake 0.00 means or yield ANOVA', async () => {
    const { project, blocks, trials } = buildComprehensiveChilliFixture();
    const appState = { projects: [project], blocks, trials };
    const engine = new AnalysisEngine(project.ID, appState, () => appState);

    trials.forEach(t => {
      expect(engine.getObservationValue(t, 'yield')).toBeNull();
      expect(extractLatestValidTrialMetric(t, 'yield', 'nutrition')).toBeNull();
    });

    const yieldRes = await engine.analyze('yield', null, null, { postHoc: 'lsd', persist: false });
    expect(yieldRes.grouping).toHaveLength(0);
    expect(Object.keys(yieldRes.means)).toHaveLength(0);
  });

  it('Scenario 3: Incomplete replication (Tiller Count) -> NOT ANALYSED – Insufficient valid observations (no fake F/p/LSD/rankings)', async () => {
    const { project, trials, flatObservations } = buildComprehensiveChilliFixture();

    const tillerAnova = calculateAnovaRCB(flatObservations, 'tillerCount', 'nutrition', 'PotTrial', {
      trialStartDate: project.StartDate,
      expectedTreatments: 4
    });
    expect(tillerAnova.ineligible).toBe(true);
    expect(tillerAnova.error).toBe('NOT ANALYSED – Insufficient valid observations');
    expect(tillerAnova.f_value).toBeUndefined();
    expect(tillerAnova.lsd).toBeUndefined();

    // Direct performANOVA must also reject incomplete treatments
    const directTiller = performANOVA(trials, { metric: 'tillerCount', design: 'RCBD', trialStartDate: project.StartDate });
    expect(directTiller.ineligible).toBe(true);
    expect(directTiller.error).toBe('NOT ANALYSED – Insufficient valid observations');

    // Verify Excel ANOVA Summary & Assessment Summary rankings do NOT fabricate F=0, P=1.000, LSD=0, or rankings
    const gen = new AdvancedReportGenerator(trials, 'nutrition', project);
    await gen.processObservationsWithAI();
    await gen.createAssessmentSummarySheet();
    await gen.createANOVASummarySheet();

    const anovaRows = getWorksheetRows(gen.workbook.getWorksheet('ANOVA Summary'));
    const tillerRow = anovaRows.find(r => String(r[0] || '').toLowerCase().includes('tiller'));
    expect(tillerRow).toBeDefined();
    expect(tillerRow[2]).toBe('NOT ANALYSED');
    expect(tillerRow[5]).toBe('—'); // F-Value NOT 0.00
    expect(tillerRow[6]).toBe('—'); // P-Value NOT 1.000
    expect(tillerRow[13]).toBe('NOT ANALYSED – Insufficient valid observations');
  });

  it('Scenario 4: Parameter containing only zeros -> NOT ANALYSED (zero variance), NO fake F=0 / P=1.000 / All Treatments: a', async () => {
    const { project, trials, flatObservations } = buildComprehensiveChilliFixture();

    const zeroAnova = calculateAnovaRCB(flatObservations, 'chlorosisIncidence', 'nutrition', 'PotTrial', {
      trialStartDate: project.StartDate,
      expectedTreatments: 4
    });
    expect(zeroAnova.ineligible).toBe(true);
    expect(zeroAnova.ineligibleReason).toBe('constant');
    expect(zeroAnova.error).toMatch(/NOT ANALYSED/i);

    const directZero = performANOVA(trials, { metric: 'chlorosisIncidence', design: 'RCBD', trialStartDate: project.StartDate });
    expect(directZero.ineligible).toBe(true);
    expect(directZero.ineligibleReason).toBe('constant');
  });

  it('Scenario 5: Mixed Flower Stage coding (0/1 + BBCH 61) blocks parametric ANOVA & +2420%, emits stage frequency distributions, and flags continuous anomalies without altering raw values', async () => {
    const { project, trials, flatObservations } = buildComprehensiveChilliFixture();

    // 1. Scale validator detects mixed 0/1 + BBCH 61 on Plot 204 without deleting/modifying 61
    expect(isOrdinalOrStageField({ key: 'flowerStage', label: 'Flower Stage' })).toBe(true);
    const scaleRep = validateMeasurementScale(flatObservations, { key: 'flowerStage', label: 'Flower Stage' });
    expect(scaleRep.hasMixedCoding).toBe(true);
    expect(scaleRep.detectedScale).toBe('mixed-ordinal-and-bbch');
    expect(scaleRep.warningMessage).toContain('Plot 204');
    expect(scaleRep.warningMessage).toContain('61');
    expect(scaleRep.warningMessage).toContain('NOT altered or deleted');

    // 2. Parametric ANOVA & +2420% ratio improvement MUST be blocked for Flower Stage
    const flowerAnova = calculateAnovaRCB(flatObservations, 'flowerStage', 'nutrition', 'PotTrial', {
      trialStartDate: project.StartDate,
      expectedTreatments: 4,
      fieldLabel: 'Flower Stage'
    });
    expect(flowerAnova.ineligible).toBe(true);
    expect(flowerAnova.ineligibleReason).toBe('mixed-scale');
    expect(flowerAnova.error).toContain('Mixed/inconsistent coding scale');

    // 3. Continuous anomaly detector flags genuine Plant Height = 0 cm without deleting it
    const anomalies = detectAnomalousObservations(flatObservations, [{ key: 'plantHeight', label: 'Plant Height (cm)' }]);
    expect(anomalies.some(a => a.value === 0 && a.fieldKey === 'plantHeight')).toBe(true);

    // 4. Verify Excel workbook sheets: no +2420%, stage frequency distribution present, CV handling fixed,
    //    incomplete longitudinal trends flagged, no duplicate 17-Nov rows, and no bogus Post-Harvest sheet!
    const gen = new AdvancedReportGenerator(trials, 'nutrition', project);
    await gen.processObservationsWithAI();
    gen.validationWarnings = gen.validateData();
    await gen.createTrialInfoSheet();
    await gen.createAssessmentSummarySheet();
    await gen.createChartworkSheet();
    await gen.createAOVMeansTable();
    await gen.createANOVASummarySheet();

    // Scale verification warning present; pre-app baseline grouped into 1 concise warning (not 40 duplicates!)
    expect(gen.validationWarnings.some(w => w.includes('Measurement Scale Verification Required') && w.includes('Plot 204'))).toBe(true);
    const baselineWarnings = gen.validationWarnings.filter(w => w.includes('Pre-Application Baseline Date'));
    expect(baselineWarnings).toHaveLength(1);

    // Assessment Summary checks:
    const summaryRows = getWorksheetRows(gen.workbook.getWorksheet('Assessment Summary'));
    // (a) NO "+2420%" anywhere in Assessment Summary
    const allSummaryText = summaryRows.flat().map(v => String(v ?? '')).join(' | ');
    expect(allSummaryText).not.toContain('2420');
    // (b) Section 3c stage frequency distribution exists for Flower Stage
    expect(allSummaryText).toContain('3c. ORDINAL / PHENOLOGICAL STAGE FREQUENCY DISTRIBUTIONS');
    expect(allSummaryText).toContain('Stage 61');
    // (c) CV handling: SPAD (n=1) -> "N/A – Insufficient observations"; Tiller Count (all 0s) -> "N/A – Constant observations" (NEVER 0% Excellent!)
    const spadDescRow = summaryRows.find(r => String(r[0] || '').includes('SPAD'));
    expect(spadDescRow).toBeDefined();
    expect(spadDescRow[6]).toBe('N/A – Insufficient observations');
    expect(spadDescRow[11]).toBe('N/A – Insufficient observations');
    // Prevent invalid descriptive treatment rankings on SPAD (n=1) & Tiller Count (constant 0s)
    expect(spadDescRow[12]).toBe('NOT RANKED – Insufficient valid observations');
    expect(spadDescRow[13]).toBe('—');
    expect(spadDescRow[14]).toBe('NOT RANKED – Insufficient valid observations');
    expect(spadDescRow[15]).toBe('—');

    const tillerDescRow = summaryRows.find(r => String(r[0] || '').includes('Tiller Count'));
    expect(tillerDescRow).toBeDefined();
    expect(tillerDescRow[6]).toBe('N/A – Constant observations');
    expect(tillerDescRow[11]).toBe('N/A – Constant observations');
    expect(tillerDescRow[12]).toBe('NOT RANKED – Constant observations');
    expect(tillerDescRow[13]).toBe('—');
    expect(tillerDescRow[14]).toBe('NOT RANKED – Constant observations');
    expect(tillerDescRow[15]).toBe('—');

    // (c2) Flagged unverified observation (Plant Height Plot 104 = 0 cm): Raw row + Validated benchmark row + Footnote
    expect(summaryRows.some(r => String(r[0] || '').includes('Plant Height') && String(r[0] || '').includes('Raw Recorded — includes unverified readings'))).toBe(true);
    expect(summaryRows.some(r => String(r[0] || '').includes('Plant Height') && String(r[0] || '').includes('Validated Benchmark'))).toBe(true);
    expect(summaryRows.some(r => String(r[0] || '').includes('* Data Quality Note: Plant Height') && String(r[0] || '').includes('unverified observation'))).toBe(true);

    // (d) Incomplete longitudinal trends: Tiller Count (n=2 vs n=6) & Leaf Gloss (n=1 vs n=20) NOT classified as Stable!
    const trendStart = summaryRows.findIndex(r => String(r[0] || '').includes('4. DAA-WISE DEVELOPMENTAL TRENDS'));
    const trendRows = summaryRows.slice(trendStart + 2);
    const tillerTrend = trendRows.find(r => String(r[0] || '').includes('Tiller Count'));
    expect(tillerTrend).toBeDefined();
    expect(String(tillerTrend[6])).toContain('Insufficient paired observations');
    expect(String(tillerTrend[6])).not.toBe('Stable');

    const glossTrend = trendRows.find(r => String(r[0] || '').includes('Leaf Gloss'));
    expect(glossTrend).toBeDefined();
    expect(String(glossTrend[6])).toContain('Insufficient paired observations');

    // Chartwork: NO 2420 improvement for Flower Stage!
    const chartworkRows = getWorksheetRows(gen.workbook.getWorksheet('Chartwork'));
    const chartworkText = chartworkRows.flat().map(v => typeof v === 'object' && v ? String(v.result ?? '') : String(v ?? '')).join(' | ');
    expect(chartworkText).not.toContain('2420');

    // ANOVA Summary: Per-Assessment-Date breakdown NEVER duplicates 17-Nov-2026 Visual Vigor twice!
    const anovaRows = getWorksheetRows(gen.workbook.getWorksheet('ANOVA Summary'));
    const breakdownIdx = anovaRows.findIndex(r => String(r[0] || '').includes('PER-ASSESSMENT-DATE INDEPENDENT ANOVA BREAKDOWN'));
    expect(breakdownIdx).toBeGreaterThan(-1);
    const breakdownRows = anovaRows.slice(breakdownIdx + 2);
    const nov17VigorRows = breakdownRows.filter(r => r[0] === '17-Nov-2026' && String(r[1] || '').includes('Visual Vigor'));
    expect(nov17VigorRows).toHaveLength(1);

    // Baseline ANOVA breakdown (12-Nov-2026, DAA -1) is explicitly labelled PRE-APPLICATION BASELINE COMPARABILITY
    const baselineRow = breakdownRows.find(r => String(r[0] || '').includes('12-Nov-2026'));
    expect(baselineRow).toBeDefined();
    expect(baselineRow[0]).toContain('DAA -1 (Pre-App Baseline) — Baseline Comparability');
    expect(String(baselineRow[10])).toContain('PRE-APPLICATION BASELINE UNIFORMITY');

    // Post-Harvest regex check: leafGlossScore MUST NOT match post-harvest loss!
    const postHarvestRe = /harvest|yield|storage|firmness|\bloss\b|weightLoss|postHarvest/i;
    expect(postHarvestRe.test('leafGlossScore')).toBe(false);
    expect(postHarvestRe.test('weightLoss')).toBe(true);
    expect(postHarvestRe.test('yield')).toBe(true);

    // Flower Stage agronomic interpretation: Stage 0 is most frequent; mixed coding stated neutrally
    const flowerInterp = compileAgronomicInterpretation(
      flatObservations,
      [{ key: 'flowerStage', label: 'Flower Stage' }],
      ['Untreated Control', 'NPK POWDER NEW (with U)', 'NPK POWDER NEW (without U)', 'N 16'],
      'nutrition',
      'PotTrial',
      project.StartDate
    );
    expect(flowerInterp).toContain('Stage 0 is the most frequent value');
    expect(flowerInterp).toContain('mixed coding scale');
    expect(flowerInterp).not.toContain("dominant stage '1'");

    // AI Narrative completion validator: rejects truncated text e.g. "Based on the statistical"
    expect(isValidNarrativeConclusion('Based on the statistical')).toBe(false);
    expect(isValidNarrativeConclusion('In conclusion, the')).toBe(false);
    expect(isValidNarrativeConclusion('Based on the statistical analysis, all treatment groups demonstrated equivalent vegetative vigor without significant phytotoxicity.')).toBe(true);
  });

  it('Scenario 6: Zero control baseline displays "N/A – Control baseline is zero" instead of fake percentages', async () => {
    const { project, trials } = buildComprehensiveChilliFixture();
    const gen = new AdvancedReportGenerator(trials, 'nutrition', project);
    await gen.processObservationsWithAI();
    await gen.createAssessmentSummarySheet();
    await gen.createAOVMeansTable();
    await gen.createANOVASummarySheet();

    // Deficiency severity has Control mean = 0, treated > 0
    const defAnova = calculateAnovaRCB(gen.observations, 'deficiencySeverity', 'nutrition', 'PotTrial', {
      trialStartDate: project.StartDate,
      expectedTreatments: 4
    });
    expect(defAnova.control_mean).toBe(0);
    expect(defAnova.controlBaselineZero).toBe(true);
    expect(defAnova.efficacy_percent).toBeNull();

    const summaryRows = getWorksheetRows(gen.workbook.getWorksheet('Assessment Summary'));
    const defRankingRows = summaryRows.filter(r =>
      String(r[0] || '').includes('Deficiency Severity') &&
      String(r[6] || '').includes('N/A – Control baseline is zero')
    );
    expect(defRankingRows.length).toBeGreaterThanOrEqual(1);
  });

  it('Scenario 7: Pre-application baseline (12-Nov vs 13-Nov start) gets signed DAA = -1 and stays separate from post-app ANOVA without mutating dates', () => {
    expect(calculateDAA('2026-11-12', '2026-11-13')).toBe(-1);
    expect(calculateDAA('2026-11-17', '2026-11-13')).toBe(4);
    expect(calculateDAA('2026-11-18', '2026-11-13')).toBe(5);
    expect(formatDaaLabel(-1)).toBe('-1 (Pre-App Baseline)');

    const { project, trials } = buildComprehensiveChilliFixture();
    const gen = new AdvancedReportGenerator(trials, 'nutrition', project);
    const baselineRows = gen.observations.filter(o => o.date === '12-Nov-2026');
    expect(baselineRows).toHaveLength(20);
    baselineRows.forEach(o => {
      expect(o.daa).toBe(-1);
      expect(o.date).toBe('12-Nov-2026'); // original date preserved!
    });

    // Post-application ANOVA on visualVigor excludes 12-Nov baseline and selects 17-Nov (DAA 4)
    const slice = selectIndependentAssessmentSlice(gen.observations, 'visualVigor', {
      trialStartDate: project.StartDate
    });
    expect(slice.analyzedDate).toBe('2026-11-17');
    expect(slice.analyzedDaa).toBe(4);
    expect(slice.isPreApplicationBaseline).toBe(false);
    expect(slice.baselineDatesExcluded).toBe(1);
  });

  it('Scenario 8 & 9: Independent cross-verification — Excel Workbook and Regulatory PDF / AnalysisEngine agree 100% on metadata, units, means & RCBD ANOVA', async () => {
    const { project, blocks, trials } = buildComprehensiveChilliFixture();
    const appState = { projects: [project], blocks, trials };

    // 1. Regulatory PDF / Dashboard pipeline
    const ctx = resolveProjectAnalysisContext(project, trials, blocks, 'nutrition');
    const engine = new AnalysisEngine(project.ID, appState, () => appState);
    const pdfAnalysis = await engine.analyze(ctx.analyzedMetricKey, null, null, { postHoc: 'lsd', persist: false });

    // 2. Advanced Excel workbook pipeline
    const gen = new AdvancedReportGenerator(trials, 'nutrition', project);
    await gen.processObservationsWithAI();
    gen.validationWarnings = gen.validateData();
    await gen.createTrialInfoSheet();
    await gen.createAssessmentSummarySheet();
    await gen.createAOVMeansTable();
    await gen.createANOVASummarySheet();

    const excelVigorAnova = calculateAnovaRCB(gen.observations, 'visualVigor', 'nutrition', 'PotTrial', {
      trialStartDate: project.StartDate,
      expectedTreatments: 4
    });

    // Metadata exact agreement (Design, Location, Blocks, Treatments, Independent Units, Plot-Date Records)
    const trialInfoRows = getWorksheetRows(gen.workbook.getWorksheet('Trial Information'));
    const metaMap = Object.fromEntries(trialInfoRows.filter(r => r.length >= 2).map(r => [String(r[0]), r[1]]));

    expect(ctx.designLabel).toBe('RCBD Pot Trial');
    expect(metaMap['Design Type']).toBe('RCBD Pot Trial');
    expect(ctx.location).toBe('12.9716, 77.5946');
    expect(metaMap['Location']).toBe('12.9716, 77.5946');
    expect(ctx.effectiveBlocks).toBe(5);
    expect(metaMap['Replications / Blocks']).toBe(5);
    expect(ctx.treatmentCount).toBe(4);
    expect(metaMap['Treatments']).toBe(4);
    expect(ctx.independentUnits).toBe(20);
    expect(metaMap['Independent Units Used per ANOVA']).toBe(20);
    expect(ctx.plotDateRecords).toBe(60);
    expect(metaMap['Total Plot-Date Records']).toBe(60);
    // Must NEVER label 60 plot-date records as "Independent Statistical Observations"
    expect(metaMap['Independent Statistical Observations']).toBeUndefined();
    // Build/Commit identifier and dynamic worksheets documented
    expect(metaMap['Software Version']).toBe(SOFTWARE_BUILD_ID);
    expect(metaMap['Software Version']).toMatch(/build/);
    expect(metaMap['Worksheets Included']).toContain('Worksheets dynamically tailored');

    // Numerical exact agreement between Excel and PDF on Visual Vigor RCBD ANOVA
    expect(pdfAnalysis.anova.dfTreat).toBe(excelVigorAnova.df_treatment);
    expect(pdfAnalysis.anova.dfBlock).toBe(excelVigorAnova.df_block);
    expect(pdfAnalysis.anova.dfError).toBe(excelVigorAnova.df_error);
    expect(pdfAnalysis.anova.dfTotal).toBe(excelVigorAnova.df_total);
    expect(pdfAnalysis.anova.dfTreat).toBe(3);
    expect(pdfAnalysis.anova.dfBlock).toBe(4);
    expect(pdfAnalysis.anova.dfError).toBe(12);
    expect(pdfAnalysis.anova.dfTotal).toBe(19);

    expect(pdfAnalysis.anova.fVal).toBeCloseTo(excelVigorAnova.f_value, 4);
    expect(pdfAnalysis.anova.pVal).toBeCloseTo(excelVigorAnova.p_value, 4);
    expect(pdfAnalysis.anova.cv).toBeCloseTo(excelVigorAnova.cv, 2);
    expect(pdfAnalysis.postHoc.value).toBeCloseTo(excelVigorAnova.lsd, 3);

    // Treatment means match verbatim
    expect(pdfAnalysis.means['Untreated Control']).toBeCloseTo(excelVigorAnova.treatmentMeans[1].mean, 4);
    expect(pdfAnalysis.means['NPK POWDER NEW (with U)']).toBeCloseTo(excelVigorAnova.treatmentMeans[2].mean, 4);
    expect(pdfAnalysis.means['NPK POWDER NEW (without U)']).toBeCloseTo(excelVigorAnova.treatmentMeans[3].mean, 4);
    expect(pdfAnalysis.means['N 16']).toBeCloseTo(excelVigorAnova.treatmentMeans[4].mean, 4);

    // Non-significant Visual Vigor ranking must NEVER say "Best Performer"
    const summaryRows = getWorksheetRows(gen.workbook.getWorksheet('Assessment Summary'));
    const vigorRankRow = summaryRows.find(r =>
      String(r[0] || '').includes('Visual Vigor') &&
      Number(r[5]) === 1
    );
    expect(vigorRankRow).toBeDefined();
    expect(String(vigorRankRow[7])).not.toContain('Best Performer');
    expect(String(vigorRankRow[7])).toContain('No statistically significant difference');
  });

  it('Date safety & true cell-level completeness guarantees remain intact', () => {
    expect(new Date('not-a-date').toLocaleDateString()).toBe('N/A');
    expect(new Date('18/11/2026').toLocaleDateString()).toBe('N/A');
    expect(formatDate('18/11/2026')).toBe('18-11-2026');
    expect(formatDateTime('18/11/2026, 10:49')).not.toContain('NaN');
    expect(parseCustomDate('bad-date')).toBeNull();

    const { flatObservations } = buildComprehensiveChilliFixture();
    const comp = computeDataCompleteness(flatObservations, [
      { key: 'visualVigor', label: 'Visual Vigor' },
      { key: 'canopyCoverage', label: 'Canopy Coverage' },
      { key: 'plantHeight', label: 'Plant Height' }
    ]);
    expect(comp.totalExpectedCells).toBe(180);
    expect(comp.validCells).toBe(140);
    expect(comp.missingCells).toBe(40);
    expect(comp.completenessPct).toBeCloseTo(77.8, 1);
    expect(comp.trueZeroCells).toBe(1); // Plot 103 = 0 cm plant height
    expect(comp.measuredNonZeroCells).toBe(139);
  });

  it('Scenario 11: Scientific audit verification — p-value typo sanitization, no "equivalent performance" bias, Chartwork mixed stage suppression, and granular data completeness', async () => {
    // 1. P-value typo sanitization
    expect(sanitizeExcelNarrativeText('Leaf Color Score p = 6181')).toBe('Leaf Color Score p = 0.6181');
    expect(sanitizeExcelNarrativeText('Deficiency severity (p = 4262)')).toBe('Deficiency severity (p = 0.4262)');
    expect(sanitizeExcelNarrativeText('Plant Height p = .6375')).toBe('Plant Height p = 0.6375');
    expect(sanitizeExcelNarrativeText('Significant treatment effect with p < 001')).toBe('Significant treatment effect with p < 0.001');

    // 2. Regulatory standard wording on equivalence
    const biasText = 'Statistical analysis showed no significant difference (p > 0.05), suggesting equivalent performance or higher replication variability under field conditions.';
    const sanitized = sanitizeExcelNarrativeText(biasText);
    expect(sanitized).not.toContain('equivalent performance');
    expect(sanitized).not.toContain('suggesting equivalence');
    expect(sanitized).toContain('indicating that no statistically significant treatment differences were detected');

    // 3. Generate complete workbook for inspection
    const { project, trials, flatObservations } = buildComprehensiveChilliFixture();
    const gen = new AdvancedReportGenerator(trials, 'nutrition', project);
    await gen.processObservationsWithAI();
    gen.validationWarnings = gen.validateData();
    await gen.createNarrativeSheet();
    await gen.createTrialInfoSheet();
    await gen.createAssessmentSummarySheet();
    await gen.createChartworkSheet();

    // 4. Chartwork: Flower stage must NEVER show ratio mean 12.60
    const chartworkWs = gen.workbook.getWorksheet('Chartwork');
    expect(chartworkWs).toBeDefined();
    const chartRows = getWorksheetRows(chartworkWs);
    const flowerTrtRows = chartRows.filter(r =>
      String(r[0] || '').includes('NPK POWDER NEW (with U) (Trt 2)')
    );
    expect(flowerTrtRows.length).toBeGreaterThan(0);
    chartRows.forEach(r => {
      // Check that no cell in Chartwork has the value 12.6 or 12.60 for flower stage
      r.forEach(cellVal => {
        if (typeof cellVal === 'number') {
          expect(cellVal).not.toBeCloseTo(12.6, 2);
        }
      });
    });

    // 5. Assessment Summary: Granular data completeness breakdown
    const summaryWs = gen.workbook.getWorksheet('Assessment Summary');
    const summaryRows = getWorksheetRows(summaryWs);
    const totalMatrixRow = summaryRows.find(r => String(r[0] || '').includes('Total Matrix Cells Evaluated'));
    const validObsRow = summaryRows.find(r => String(r[0] || '').includes('Valid Recorded Observations'));
    const genuineZeroRow = summaryRows.find(r => String(r[0] || '').includes('Genuine Zero Measurements'));
    const unmeasuredRow = summaryRows.find(r => String(r[0] || '').includes('Unmeasured / Missing Cells'));
    const definitionRow = summaryRows.find(r => String(r[0] || '').includes('Data Completeness Definition'));

    expect(totalMatrixRow).toBeDefined();
    expect(validObsRow).toBeDefined();
    expect(genuineZeroRow).toBeDefined();
    expect(unmeasuredRow).toBeDefined();
    expect(definitionRow).toBeDefined();

    // 6. Narrative: Observation timeline & zero "equivalent performance"
    const narrativeWs = gen.workbook.getWorksheet('Narrative');
    const narrativeRows = getWorksheetRows(narrativeWs);
    const timelineRow = narrativeRows.find(r => String(r[0] || '').includes('Observation Timeline'));
    expect(timelineRow).toBeDefined();
    expect(String(timelineRow[1])).toContain('DAA -1');
    expect(String(timelineRow[1])).toContain('DAA 5');

    const keyFindingsCell = narrativeWs.getCell('A6').value;
    expect(typeof keyFindingsCell === 'string' ? keyFindingsCell : '').not.toContain('equivalent performance');

    // 7. Anomaly detection audit trail
    const anomalies = detectAnomalousObservations(flatObservations, [{ key: 'plantHeight', label: 'Plant Height (cm)' }]);
    const plot103Anomaly = anomalies.find(a => a.fieldKey === 'plantHeight' && String(a.plot) === '103');
    expect(plot103Anomaly).toBeDefined();
    expect(plot103Anomaly.message).toContain('Anomalous Value Flag (Audit Trail Preserved)');
    expect(plot103Anomaly.message).toContain('Value is preserved in the raw dataset without alteration');
  });

  it('Scenario 12: Automated Quality Control Suite (8/8 Rules) & Low-Mean CV qualification', async () => {
    const { project, trials, flatObservations } = buildComprehensiveChilliFixture();
    const gen = new AdvancedReportGenerator(trials, 'nutrition', project);
    await gen.processObservationsWithAI();
    gen.validationWarnings = gen.validateData();
    await gen.createNarrativeSheet();
    await gen.createTrialInfoSheet();
    await gen.createAssessmentSummarySheet();
    await gen.createChartworkSheet();
    await gen.createAOVMeansTable();
    await gen.createANOVASummarySheet();

    // 1. Programmatic Quality Control Audit Suite (8/8 Rules)
    const qcAudit = runReportQualityControlAudit(
      gen.observations,
      gen.activeFields,
      gen.treatmentNames,
      gen.design,
      gen.primaryAnovaResults,
      gen.trial
    );
    expect(qcAudit.allPassed).toBe(true);
    expect(qcAudit.score).toBe('8/8');
    expect(qcAudit.rules).toHaveLength(8);

    // 2. Trial Information sheet renders the 8-rule QC Audit Table
    const infoWs = gen.workbook.getWorksheet('Trial Information');
    const infoRows = getWorksheetRows(infoWs);
    const qcHeaderRow = infoRows.find(r => String(r[0] || '').includes('AUTOMATED REPORT QUALITY CONTROL & REGULATORY AUDIT'));
    expect(qcHeaderRow).toBeDefined();
    expect(String(qcHeaderRow[0])).toContain('8/8 PASSED');

    const rule1Row = infoRows.find(r => String(r[0] || '').includes('Rule 1: P-Value Concordance'));
    const rule8Row = infoRows.find(r => String(r[0] || '').includes('Rule 8: Low-Mean CV Safeguard'));
    expect(rule1Row).toBeDefined();
    expect(rule8Row).toBeDefined();
    expect(String(rule1Row[1])).toContain('PASS');
    expect(String(rule8Row[1])).toContain('PASS');

    // 3. Low-Mean CV qualification in per-assessment-date ANOVA breakdown
    const anovaWs = gen.workbook.getWorksheet('ANOVA Summary');
    const anovaRows = getWorksheetRows(anovaWs);
    const chlorosisDateRows = anovaRows.filter(r =>
      String(r[1] || '').includes('Chlorosis')
    );
    chlorosisDateRows.forEach(r => {
      const cvCell = String(r[8] || '');
      expect(cvCell).not.toContain('210.82%');
      if (Number(r[9] || 0) < 5.0) {
        expect(cvCell).toContain('CV not meaningful due to low mean');
      }
    });

    // 4. Assessment Summary sheet qualifies near-zero mean CVs
    const summaryWs = gen.workbook.getWorksheet('Assessment Summary');
    const summaryRows = getWorksheetRows(summaryWs);
    const chlorosisSummaryRow = summaryRows.find(r =>
      String(r[0] || '').includes('Chlorosis Incidence')
    );
    if (chlorosisSummaryRow) {
      expect(String(chlorosisSummaryRow[6])).toContain('CV not meaningful due to low mean');
      expect(String(chlorosisSummaryRow[11])).toContain('Low incidence / near-zero mean');
    }
  });
});
