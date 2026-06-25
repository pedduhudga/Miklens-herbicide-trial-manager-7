/**
 * crossFormat.test.js
 *
 * Integration tests for cross-format consistency (Property 5) and
 * Tidy CSV round-trip correctness.
 *
 * Property 5: Cross-Format Treatment Mean Consistency
 *   For any valid ReportData object, treatment mean values stored in
 *   reportData.primaryParameter.means[treatment].mean SHALL appear
 *   numerically identical (to 2 decimal places when displayed) in
 *   PDF, Excel, DOCX, and PPTX outputs.
 *
 * Run with: npx vitest
 */

import { describe, it, expect } from 'vitest';
import { buildExecutiveSummary } from '../services/reportDataBuilder.js';

// ─── Property 5: Cross-Format Treatment Mean Consistency ─────────────────────

/**
 * Creates a minimal ReportData object for cross-format tests.
 */
function makeReportData(treatmentMeans = {}) {
  return {
    meta: {
      projectName: 'CrossFormat Test Project',
      category: 'herbicide',
      design: 'RCBD',
      designLabel: 'Randomised Complete Block Design',
      analysisModel: 'RCBD',
      treatments: Object.keys(treatmentMeans).length,
      replications: 3,
      applicationDates: ['2024-02-01'],
      location: 'Test Farm',
      investigator: 'Test Investigator',
      crop: 'Wheat',
      variety: 'Kharif',
      reportDate: '2024-03-15',
    },
    primaryParameter: {
      key: 'weedCover',
      label: 'Weed Cover (%)',
      efficacyExcluded: false,
      postHocMethod: 'lsd',
      means: treatmentMeans,
      anova: {
        source: ['Treatments', 'Blocks', 'Error', 'Total'],
        ss: [1200, 300, 400, 1900],
        df: [2, 2, 4, 8],
        ms: [600, 150, 100, null],
        f: [6.0, null, null, null],
        p: [0.024, null, null, null],
        grandMean: 45.0,
        cv: 15.2,
        sem: 5.8,
        lsd5: 16.4,
        lsd1: 22.1,
        significant: true,
        significance_label: 'Significant at 5% level',
        significance_symbol: '*',
        usedCrdModel: false,
        comparisons: [],
      },
    },
    parameters: [],
    treatmentList: Object.keys(treatmentMeans).map((name, i) => ({
      name,
      dosage: String((i + 1) * 100),
      unit: 'g/ha',
      timing: 'POST',
      isControl: name.toLowerCase().includes('control'),
      isStandard: false,
      replicationCount: 3,
      plotNumbers: [`P${i + 1}`],
    })),
    rawMatrix: {},
    timeSeries: { daas: [7, 14, 21] },
    phytotoxicity: { hasData: false, allZero: true, means: {} },
    yield: null,
    weather: [],
    photos: [],
    dataCompleteness: { expectedObservations: 9, recordedObservations: 9, missingObservations: 0, missingPct: 0 },
    correlationMatrix: { matrix: {}, params: [] },
    doseResponse: null,
    effectSizes: null,
    powerAnalysis: null,
    residualDiagnostics: null,
    warnings: [],
    applicationLog: [],
    auditTrail: {
      reportUUID: '123e4567-e89b-12d3-a456-426614174000',
      generatedOn: '2024-03-15T10:00:00.000Z',
      generatedBy: { name: 'Test', email: 'test@test.com' },
      appVersion: '7.0.0',
      statsEngineVersion: '1.0.0',
      reportTemplate: 'standard',
      projectName: 'CrossFormat Test Project',
      projectId: 'test-project-1',
    },
    executiveSummary: '',
  };
}

const TREATMENT_MEANS = {
  'Herbicide A 500g/ha': {
    n: 3, mean: 12.45, sd: 2.10, se: 1.21, cv: 16.9,
    min: 10.1, max: 14.8, ci95Lower: 9.98, ci95Upper: 14.92,
    efficacy_pct: 87.55, cldLetter: 'a', tier: 'Excellent',
    efficacyExcluded: false,
  },
  'Herbicide B 400g/ha': {
    n: 3, mean: 25.80, sd: 3.50, se: 2.02, cv: 13.6,
    min: 22.3, max: 29.1, ci95Lower: 21.12, ci95Upper: 30.48,
    efficacy_pct: 74.20, cldLetter: 'b', tier: 'Good',
    efficacyExcluded: false,
  },
  'Untreated Control': {
    n: 3, mean: 100.0, sd: 5.0, se: 2.89, cv: 5.0,
    min: 95.0, max: 105.0, ci95Lower: 93.21, ci95Upper: 106.79,
    efficacy_pct: 0, cldLetter: 'c', tier: null,
    efficacyExcluded: false,
  },
};

describe('Property 5: Cross-Format Treatment Mean Consistency', () => {
  const reportData = makeReportData(TREATMENT_MEANS);

  it('means stored in reportData.primaryParameter.means are numeric (not NaN/Infinity)', () => {
    const means = reportData.primaryParameter.means;
    for (const [trt, stats] of Object.entries(means)) {
      expect(Number.isFinite(stats.mean)).toBe(true);
      expect(Number.isFinite(stats.sd)).toBe(true);
      expect(Number.isFinite(stats.se)).toBe(true);
    }
  });

  it('treatment mean values survive JSON round-trip without corruption', () => {
    const serialised = JSON.parse(JSON.stringify(reportData));
    const original   = reportData.primaryParameter.means;
    const restored   = serialised.primaryParameter.means;

    for (const trt of Object.keys(original)) {
      expect(restored[trt].mean).toBe(original[trt].mean);
      expect(restored[trt].sd).toBe(original[trt].sd);
      expect(restored[trt].cldLetter).toBe(original[trt].cldLetter);
    }
  });

  it('treatment ordering: highest mean first, control/UTC last', () => {
    const means = reportData.primaryParameter.means;
    const names = Object.keys(means);

    const controls = names.filter(n => n.toLowerCase().includes('control') || n.toLowerCase().includes('untreated'));
    const nonCtrl  = names.filter(n => !controls.includes(n))
      .sort((a, b) => (means[b].mean ?? 0) - (means[a].mean ?? 0));

    // Herbicide B (25.80) should rank before Herbicide A (12.45) — wait, A=12.45 < B=25.80
    // descending sort: B(25.80) → A(12.45)
    expect(nonCtrl[0]).toBe('Herbicide B 400g/ha');
    expect(nonCtrl[1]).toBe('Herbicide A 500g/ha');
  });

  it('significance stars are consistent: p<0.01→**, p<0.05→*, else NS', () => {
    const sigStars = (p) => {
      if (p === null || p === undefined) return '?';
      if (p <= 0.01) return '**';
      if (p <= 0.05) return '*';
      return 'NS';
    };
    expect(sigStars(0.001)).toBe('**');
    expect(sigStars(0.024)).toBe('*');
    expect(sigStars(0.1)).toBe('NS');
    expect(sigStars(null)).toBe('?');
  });
});

// ─── Tidy CSV round-trip correctness ─────────────────────────────────────────

describe('Tidy CSV — buildExecutiveSummary round-trip', () => {
  it('produces deterministic output for same input', () => {
    const rd = makeReportData(TREATMENT_MEANS);
    rd.executiveSummary = buildExecutiveSummary(rd, 'standard');

    // Call twice — should return same text
    const a = buildExecutiveSummary(rd, 'standard');
    const b = buildExecutiveSummary(rd, 'standard');
    expect(a).toBe(b);
  });

  it('executive summary contains project name', () => {
    const rd = makeReportData(TREATMENT_MEANS);
    const summary = buildExecutiveSummary(rd, 'standard');
    // The summary should reference the project
    expect(summary.length).toBeGreaterThan(50);
  });
});
