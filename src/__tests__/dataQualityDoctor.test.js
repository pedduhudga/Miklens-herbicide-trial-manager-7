import { describe, it, expect } from 'vitest';
import { scanProjectDataHealth, applyDataCorrection } from '../utils/dataQualityDoctor.js';

describe('Data Quality Doctor & Interactive Correction Engine', () => {
  const mockConfig = {
    observationFields: [
      { key: 'plantHeight', label: 'Plant Height (cm)', type: 'number', unit: 'cm' },
      { key: 'visualVigor', label: 'Visual Vigor (0-10)', type: 'number', min: 0, max: 10 },
      { key: 'flowerStage', label: 'Flower Stage', type: 'select' },
      { key: 'spad', label: 'SPAD Chlorophyll Index', type: 'number' }
    ]
  };

  const mockProject = {
    ID: 'PROJ-1794568324462',
    Name: 'Chilli RCBD Pot Trial',
    Category: 'nutrition',
    Design: 'RCBD'
  };

  // 20 plots (4 treatments × 5 reps)
  const buildMockTrials = () => {
    const treatments = ['Control', 'NPK with U', 'NPK without U', 'N 16'];
    const trials = [];
    let idCounter = 100;

    treatments.forEach((trt, tIdx) => {
      for (let rep = 1; rep <= 5; rep++) {
        idCounter++;
        const plotNum = `${tIdx + 1}0${rep}`;
        const isCtrl = trt === 'Control';

        // Base observation on 17-Nov-2026
        let heightVal = 25.0 + (rep * 0.5) + (tIdx * 0.2);
        let flowerVal = 1; // Stage 1 ordinal

        // Inject the known field issues:
        // 1. Plot 103 (N 16) has Plant Height = 0 cm
        if (plotNum === '103') {
          heightVal = 0;
        }

        // 2. Plot 204 (NPK with U) has Flower Stage = 61 (BBCH code)
        if (plotNum === '204') {
          flowerVal = 61;
        }

        const effList = [
          {
            date: '2026-11-17',
            daa: 0,
            plantHeight: heightVal,
            potHeights: [heightVal],
            visualVigor: 8.0,
            flowerStage: flowerVal
          }
        ];

        // On 18-Nov-2026, leave plot 101 missing visualVigor to test missing data detection
        if (plotNum !== '101') {
          effList.push({
            date: '2026-11-18',
            daa: 1,
            plantHeight: heightVal + 1.2,
            potHeights: [heightVal + 1.2],
            visualVigor: 8.2,
            flowerStage: flowerVal === 61 ? 61 : 1
          });
        } else {
          effList.push({
            date: '2026-11-18',
            daa: 1,
            plantHeight: heightVal + 1.2,
            potHeights: [heightVal + 1.2],
            // visualVigor intentionally omitted
          });
        }

        trials.push({
          ID: `TRIAL-${idCounter}`,
          ProjectID: mockProject.ID,
          Plot: plotNum,
          PlotNumber: plotNum,
          Replication: rep,
          TreatmentNumber: tIdx + 1,
          FormulationName: trt,
          IsControl: isCtrl,
          EfficacyDataJSON: JSON.stringify(effList)
        });
      }
    });

    return trials;
  };

  it('scans and accurately identifies Plant Height = 0 anomaly in Plot 103', () => {
    const trials = buildMockTrials();
    const report = scanProjectDataHealth(trials, mockProject, mockConfig);

    expect(report.anomalies.length).toBeGreaterThan(0);
    const heightAnomaly = report.anomalies.find(a => a.plot === '103' && a.metricKey === 'plantHeight');
    expect(heightAnomaly).toBeDefined();
    expect(heightAnomaly.currentValue).toBe(0);
    expect(heightAnomaly.severity).toBe('high');
    expect(heightAnomaly.median).toBeGreaterThan(20);
    expect(heightAnomaly.explanation).toContain('Zero reading on plant height');
  });

  it('scans and accurately identifies Flower Stage = 61 BBCH scale mismatch in Plot 204', () => {
    const trials = buildMockTrials();
    const report = scanProjectDataHealth(trials, mockProject, mockConfig);

    expect(report.scaleInconsistencies.length).toBeGreaterThan(0);
    const flowerMismatch = report.scaleInconsistencies.find(s => s.plot === '204' && s.metricKey === 'flowerStage');
    expect(flowerMismatch).toBeDefined();
    expect(flowerMismatch.currentValue).toBe(61);
    expect(flowerMismatch.severity).toBe('high');
    expect(flowerMismatch.explanation).toContain('Mixing BBCH codes with ordinal values');
    expect(flowerMismatch.suggestedValues).toBeDefined();
    expect(flowerMismatch.suggestedValues.length).toBeGreaterThan(0);
  });

  it('scans and flags missing observation for Plot 101 on 18-Nov-2026', () => {
    const trials = buildMockTrials();
    const report = scanProjectDataHealth(trials, mockProject, mockConfig);

    expect(report.missingObservations.length).toBeGreaterThan(0);
    const missingVigor = report.missingObservations.find(m => m.plot === '101' && m.metricKey === 'visualVigor' && m.date === '2026-11-18');
    expect(missingVigor).toBeDefined();
    expect(missingVigor.currentValue).toBeNull();
    expect(missingVigor.explanation).toContain('no reading for "Visual Vigor (0-10)"');
  });

  it('allows user to correct Plant Height from 0 to 24.5 cm with audit reason and clears anomaly', () => {
    const trials = buildMockTrials();
    const plot103 = trials.find(t => t.Plot === '103');

    const { updatedTrial, updatedTrialsList } = applyDataCorrection({
      projectTrials: trials,
      trialId: plot103.ID,
      date: '2026-11-17',
      metricKey: 'plantHeight',
      newValue: 24.5,
      action: 'correct_value',
      auditReason: 'Typo corrected: field sheet recorded 24.5 cm instead of 0',
      author: 'Senior Agronomist'
    });

    const parsedEff = JSON.parse(updatedTrial.EfficacyDataJSON);
    const nov17 = parsedEff.find(o => o.date === '2026-11-17');
    expect(nov17.plantHeight).toBe(24.5);
    expect(nov17.potHeights).toEqual([24.5]);
    expect(nov17.auditTrail).toHaveLength(1);
    expect(nov17.auditTrail[0].action).toBe('update_value');
    expect(nov17.auditTrail[0].previousValue).toBe(0);
    expect(nov17.auditTrail[0].newValue).toBe(24.5);
    expect(nov17.auditTrail[0].reason).toContain('Typo corrected');

    // Re-scan with updated trials: 2026-11-17 anomaly should now be resolved
    const reReport = scanProjectDataHealth(updatedTrialsList, mockProject, mockConfig);
    const stillFlagged103Date17 = reReport.anomalies.find(a => a.plot === '103' && a.date === '2026-11-17' && a.metricKey === 'plantHeight');
    expect(stillFlagged103Date17).toBeUndefined();
  });

  it('allows user to confirm legitimate true zero / seedling mortality with audit note', () => {
    const trials = buildMockTrials();
    const plot103 = trials.find(t => t.Plot === '103');

    const { updatedTrial, updatedTrialsList } = applyDataCorrection({
      projectTrials: trials,
      trialId: plot103.ID,
      date: '2026-11-17',
      metricKey: 'plantHeight',
      action: 'confirm_true_zero',
      auditReason: 'Confirmed seedling mortality (damping off). Plant completely dead at 0 cm.',
      author: 'Field Investigator'
    });

    const parsedEff = JSON.parse(updatedTrial.EfficacyDataJSON);
    const nov17 = parsedEff.find(o => o.date === '2026-11-17');
    expect(nov17.isConfirmedTrueZero).toBe(true);
    expect(nov17.mortalityNote).toContain('damping off');

    // Re-scan: the anomaly on 2026-11-17 should now be moved to resolvedIssues
    const reReport = scanProjectDataHealth(updatedTrialsList, mockProject, mockConfig);
    const stillAnomalyDate17 = reReport.anomalies.find(a => a.plot === '103' && a.date === '2026-11-17' && a.metricKey === 'plantHeight');
    expect(stillAnomalyDate17).toBeUndefined();

    const resolved = reReport.resolvedIssues.find(r => r.plot === '103' && r.date === '2026-11-17' && r.metricKey === 'plantHeight');
    expect(resolved).toBeDefined();
    expect(resolved.resolvedType).toBe('confirmed_zero');
  });

  it('allows user to standardize Flower Stage from 61 to Stage 1 and clears scale warning', () => {
    const trials = buildMockTrials();
    const plot204 = trials.find(t => t.Plot === '204');

    // Standardize 17-Nov observation
    let result = applyDataCorrection({
      projectTrials: trials,
      trialId: plot204.ID,
      date: '2026-11-17',
      metricKey: 'flowerStage',
      newValue: 1,
      action: 'correct_value',
      auditReason: 'Standardized BBCH 61 to ordinal Stage 1 (flowering begun)',
      author: 'Regulatory Officer'
    });

    // Standardize 18-Nov observation
    result = applyDataCorrection({
      projectTrials: result.updatedTrialsList,
      trialId: plot204.ID,
      date: '2026-11-18',
      metricKey: 'flowerStage',
      newValue: 1,
      action: 'correct_value',
      auditReason: 'Standardized BBCH 61 to ordinal Stage 1',
      author: 'Regulatory Officer'
    });

    const reReport = scanProjectDataHealth(result.updatedTrialsList, mockProject, mockConfig);
    const flowerMismatches = reReport.scaleInconsistencies.filter(s => s.metricKey === 'flowerStage');
    expect(flowerMismatches).toHaveLength(0);
  });

  it('allows user to fill missing observation for Plot 101 on 18-Nov-2026', () => {
    const trials = buildMockTrials();
    const plot101 = trials.find(t => t.Plot === '101');

    const { updatedTrial, updatedTrialsList } = applyDataCorrection({
      projectTrials: trials,
      trialId: plot101.ID,
      date: '2026-11-18',
      metricKey: 'visualVigor',
      newValue: 8.5,
      action: 'correct_value',
      auditReason: 'Entered field log measurement from notebook',
      author: 'Field Investigator'
    });

    const parsedEff = JSON.parse(updatedTrial.EfficacyDataJSON);
    const nov18 = parsedEff.find(o => o.date === '2026-11-18');
    expect(nov18.visualVigor).toBe(8.5);

    const reReport = scanProjectDataHealth(updatedTrialsList, mockProject, mockConfig);
    const missingVigor = reReport.missingObservations.find(m => m.plot === '101' && m.metricKey === 'visualVigor');
    expect(missingVigor).toBeUndefined();
  });

  it('allows user to delete an erroneous observation value and preserves audit note', () => {
    const trials = buildMockTrials();
    const plot103 = trials.find(t => t.Plot === '103');

    const { updatedTrial, updatedTrialsList } = applyDataCorrection({
      projectTrials: trials,
      trialId: plot103.ID,
      date: '2026-11-17',
      metricKey: 'plantHeight',
      action: 'delete_value',
      auditReason: 'Removed spurious zero reading pending field re-measurement',
      author: 'Data Auditor'
    });

    const parsedEff = JSON.parse(updatedTrial.EfficacyDataJSON);
    const nov17 = parsedEff.find(o => o.date === '2026-11-17');
    expect(nov17.plantHeight).toBeUndefined();
    expect(nov17.potHeights).toBeUndefined();
    expect(nov17.auditTrail).toHaveLength(1);
    expect(nov17.auditTrail[0].action).toBe('delete_value');
    expect(nov17.auditTrail[0].reason).toContain('Removed spurious zero');
  });

  it('progresses to 100% clean health score once all identified issues are resolved', () => {
    let currentTrials = buildMockTrials();

    // 1. Correct Plot 103 on both 17-Nov and 18-Nov
    const plot103 = currentTrials.find(t => t.Plot === '103');
    let res = applyDataCorrection({
      projectTrials: currentTrials,
      trialId: plot103.ID,
      date: '2026-11-17',
      metricKey: 'plantHeight',
      newValue: 25.5,
      action: 'correct_value',
      auditReason: 'Corrected typo to 25.5 cm',
      author: 'Agronomist'
    });
    res = applyDataCorrection({
      projectTrials: res.updatedTrialsList,
      trialId: plot103.ID,
      date: '2026-11-18',
      metricKey: 'plantHeight',
      newValue: 26.7,
      action: 'correct_value',
      auditReason: 'Corrected typo to 26.7 cm',
      author: 'Agronomist'
    });
    currentTrials = res.updatedTrialsList;

    // 2. Standardize Plot 204 on both dates
    const plot204 = currentTrials.find(t => t.Plot === '204');
    res = applyDataCorrection({
      projectTrials: currentTrials,
      trialId: plot204.ID,
      date: '2026-11-17',
      metricKey: 'flowerStage',
      newValue: 1,
      action: 'correct_value',
      auditReason: 'Standardized BBCH 61 to Stage 1',
      author: 'Agronomist'
    });
    res = applyDataCorrection({
      projectTrials: res.updatedTrialsList,
      trialId: plot204.ID,
      date: '2026-11-18',
      metricKey: 'flowerStage',
      newValue: 1,
      action: 'correct_value',
      auditReason: 'Standardized BBCH 61 to Stage 1',
      author: 'Agronomist'
    });
    currentTrials = res.updatedTrialsList;

    // 3. Fill missing observation for Plot 101
    const plot101 = currentTrials.find(t => t.Plot === '101');
    res = applyDataCorrection({
      projectTrials: currentTrials,
      trialId: plot101.ID,
      date: '2026-11-18',
      metricKey: 'visualVigor',
      newValue: 8.2,
      action: 'correct_value',
      auditReason: 'Entered missing field observation',
      author: 'Agronomist'
    });
    res = applyDataCorrection({
      projectTrials: res.updatedTrialsList,
      trialId: plot101.ID,
      date: '2026-11-18',
      metricKey: 'flowerStage',
      newValue: 1,
      action: 'correct_value',
      auditReason: 'Entered missing flower stage observation',
      author: 'Agronomist'
    });
    currentTrials = res.updatedTrialsList;

    const finalReport = scanProjectDataHealth(currentTrials, mockProject, mockConfig);
    expect(finalReport.totalIssuesCount).toBe(0);
    expect(finalReport.anomalies).toHaveLength(0);
    expect(finalReport.scaleInconsistencies).toHaveLength(0);
    expect(finalReport.missingObservations).toHaveLength(0);
    expect(finalReport.healthScore).toBe(100);
    expect(finalReport.isHealthy).toBe(true);
  });
});
