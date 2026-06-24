# Design Document — Professional Stats and Reporting

## Overview

This design describes the technical architecture and implementation plan for upgrading the Miklens Herbicide Trial Manager's statistical analysis engine and report export pipeline. The upgrade spans 19 requirements across six layers: statistical computation (`statsUtils.js`), analysis orchestration (`analysisUtils.js`), data building (`reportDataBuilder.js`), three existing report renderers (PDF, Excel, DOCX), a new PowerPoint renderer, and two UI pages (Statistics and Reports).

The stack is: React 19 + Vite + TailwindCSS 4, jsPDF + jspdf-autotable, ExcelJS, docx, pptxgenjs, Chart.js 4, jStat, firebase/firestore backend. All code is ES module JavaScript running in-browser.

---

## Architecture

The upgrade follows a layered pipeline. UI components call analysis utilities which produce a `ReportData` object consumed by four renderer modules.

```
UI Layer         → statsUtils.js, analysisUtils.js
                 → reportDataBuilder.js (ReportData)
                 → pdfReportRenderer.js | excelReportRenderer.js | docxReportRenderer.js | pptxReportRenderer.js (NEW)
```

All new functions are added to existing files where applicable. Four new files are created: `pptxReportRenderer.js`, `statsExporter.js`, `StatsChartPanel.jsx`, `ResidualDiagnosticsPanel.jsx`, `PowerAnalysisPanel.jsx`.

---

## Components and Interfaces

### statsUtils.js — New Exports

```js
// Shapiro-Wilk normality test (Royston 1992 approximation, n = 3..5000)
export function performShapiroWilk(residuals: number[]): {
  W: number | null;
  pValue: number | null;
  passed: boolean | null;
  note?: string;
}

// Bartlett's homogeneity-of-variance test (chi-squared distribution)
export function performBartlettsTest(groups: { [trtName: string]: number[] }): {
  chiSquared: number;
  df: number;
  pValue: number;
  passed: boolean;
}

// Student-Newman-Keuls step-down post-hoc test
export function performSNKTest(trials: Trial[], options: AnalysisOptions): SNKResult

// Bonferroni pairwise t-test with adjusted alpha
export function performBonferroniTest(trials: Trial[], options: AnalysisOptions): BonferroniResult

// Extended power analysis — accepts effectSize (Cohen's f) and targetPower
export function calculatePower(params: {
  alpha: number; kGroups: number; nPerGroup: number;
  effectSize?: number; targetPower?: number;
}): { achievedPower: number; minNForTarget: number; powerCurve: {n: number, power: number}[]; interpretation: string }

// Residual diagnostics for ANOVA assumption checking
export function calculateResidualsDiagnostics(anovaResult: ANOVAResult): {
  residuals: number[]; fittedValues: number[];
  qqData: { theoretical: number; sample: number }[]; n: number;
}

// Extended effect sizes — adds omega-squared and per-pair Cohen's d
export function calculateEffectSizes(anovaResult: ANOVAResult): {
  etaSquared: number; omegaSquared: number; cohensF: number;
  cohensD: { [pairKey: string]: number };
  interpretation: { etaSquared: string; omegaSquared: string; cohensF: string }
}
```


### reportDataBuilder.js — New Exports

```js
// Pearson correlation matrix from treatment-level means
export function computeCorrelationMatrix(
  subTrials: Trial[], paramsWithData: string[], category: string
): { matrix: { [pA: string]: { [pB: string]: { r: number; p: number; stars: string } } }; params: string[] }

// Plain-text executive summary (no AI, <= 250 words)
export function buildExecutiveSummary(reportData: ReportData): string

// Tidy-format CSV download (one row per trial × DAA observation)
export function exportTidyCSV(projectId: string, subTrials: Trial[], state: AppState): void
```

### New Files — Component Interfaces

```jsx
// src/services/pptxReportRenderer.js
export async function generateProjectPPTX(reportData: ReportData, options: ReportOptions): Promise<void>

// src/services/statsExporter.js
export async function exportStatsPDF(results: StatResults, options: ExportOptions): Promise<void>
export async function exportStatsExcel(results: StatResults, options: ExportOptions): Promise<void>

// src/components/StatsChartPanel.jsx
export default function StatsChartPanel({ results, test, metric, alpha }): JSX.Element

// src/components/ResidualDiagnosticsPanel.jsx
export default function ResidualDiagnosticsPanel({ results }): JSX.Element

// src/components/PowerAnalysisPanel.jsx
export default function PowerAnalysisPanel({ initialK, alpha, onResultChange }): JSX.Element
```

### ReportOptions Interface (extended)

```js
interface ReportOptions {
  format: 'pdf' | 'excel' | 'docx' | 'pptx';  // 'pptx' is NEW
  template: 'standard' | 'scientific-journal' | 'field-summary' | 'regulatory'; // NEW
  postHoc: 'lsd' | 'tukey' | 'duncan' | 'snk' | 'bonferroni'; // snk/bonferroni NEW
  alpha: number;
  daa: number | null;
  transformation: 'none' | 'arcsine' | 'log' | 'sqrt';
  includePhotos: boolean;
  includeWeather: boolean;
}
```


---

## Data Models

### ReportData Object — Extended Fields

The existing `ReportData` object returned by `buildReportData` gains these new top-level fields:

```js
{
  // existing fields...
  meta, treatmentList, rawMatrix, timeSeries, primaryParameter,
  parameters, yield, weather, photos, dataCompleteness, warnings,

  // NEW fields added by this upgrade:
  executiveSummary: string,          // plain-text ≤ 250 words
  correlationMatrix: {
    params: string[],
    matrix: { [paramA]: { [paramB]: { r, p, stars } } }
  },
  doseResponse: {                    // null if < 3 distinct dosages
    success: boolean,
    ed50: number, ed90: number, r2: number,
    model: string, doseUnit: string,
    curvePoints: { dose, response }[]
  } | null,
  phytotoxicity: {
    hasData: boolean,
    allZero: boolean,
    means: { [trtName]: { mean, sd, se, n, cldLetter, safetyClass } },
    anova: AnovaShape | null
  },
  residualDiagnostics: {
    residuals: number[],
    fittedValues: number[],
    qqData: { theoretical: number, sample: number }[],
    n: number
  } | null
}
```

### Structured Plot Fields on Trial Records

New optional fields added to trial documents (non-breaking, backward compatible):

| Field | Type | Validation |
|-------|------|-----------|
| `PlotNumber` | integer | > 0, unique per project |
| `BBCHCode` | string | validated via `eppoBBCHData.js` |
| `GPSLatitude` | number | −90 to 90 |
| `GPSLongitude` | number | −180 to 180 |
| `SoilPH` | number | 0.0 – 14.0 |
| `SoilClay` | number | 0 – 100 (%) |
| `PhytotoxicityPct` | number | 0 – 100 |
| `PhytotoxicityNotes` | string | free text |
| `BaselineObservations` | JSON array | same schema as EfficacyDataJSON, daa = 0 |
| `YieldDetails` | JSON object | `{ unit, moisture, thousandGrainWeight, notes }` |

---

## Correctness Properties

These formal properties must hold for any valid implementation. They form the basis of property-based tests.

### Property 1: ANOVA Identity
`|ssTreatments + ssBlocks + ssError − ssTotal| < 1e-6` for any balanced or unbalanced input.

**Validates: Requirements 1.1, 1.2**

### Property 2: CLD Consistency
If two treatments share at least one CLD letter, their pairwise comparison result must be non-significant.

**Validates: Requirements 4.2, 4.3**

### Property 3: CV Formula
`CV% = (√MSError / grandMean) × 100` — computed from ANOVA components, not raw data.

**Validates: Requirements 1.2, 10.2**

### Property 4: Efficacy Non-Negative
For reduction-direction categories, `efficacy_pct = max(0, (1 − treated/control) × 100) ≥ 0` always. Phytotoxicity is excluded from this formula.

**Validates: Requirements 18.3**

### Property 5: LSD Formula
`LSD = t(α/2, dfError) × √(2 × MSError / n)` — verified against known-value reference tables.

**Validates: Requirements 1.2, 10.2**

### Property 6: SNK Conservatism
For identical data, SNK must produce fewer or equal significant pairs compared to LSD.

**Validates: Requirements 4.2**

### Property 7: Bonferroni Adjustment
`adjustedAlpha === alpha / m` where `m = k×(k−1)/2` — exact equality, not approximation.

**Validates: Requirements 4.3, 4.6**

### Property 8: Power Monotonicity
`powerCurve[i+1].power ≥ powerCurve[i].power` for all i in the returned curve array.

**Validates: Requirements 5.4**

### Property 9: Shapiro-Wilk Bounds
`W ∈ (0, 1]` and `pValue ∈ [0, 1]` for any valid input residual array of length ≥ 3.

**Validates: Requirements 3.2, 3.3**

### Property 10: Pearson Bounds
`r ∈ [−1, 1]` for any pair of same-length numeric arrays; `r² ≤ 1` always.

**Validates: Requirements 12.2**


---

## Error Handling

| Scenario | Handling |
|----------|---------|
| Canvas API unavailable (chart rendering) | Log warning, skip chart, continue PDF generation |
| `performDoseResponseAnalysis` returns R² < 0.70 | Include caution note in report; do not skip section |
| Insufficient data for ANOVA (< 2 treatments or < 2 reps) | Render descriptive means only; include "Insufficient replication" note |
| Shapiro-Wilk on n < 3 residuals | Return `{ W: null, pValue: null, passed: null, note: 'N/A — insufficient data' }` |
| PPTX generation with < 2 treatments | Show error toast; do not generate file |
| statsExporter called with `results.error` set | Silently return without download; show toast |
| Correlation on < 4 treatment pairs | Show "N/A" in cell; do not compute unreliable coefficient |
| Bonferroni with m > 20 comparisons | Show advisory note recommending Tukey HSD instead |

---

## Testing Strategy

### Unit Tests (statsUtils.js)
- Known-value ANOVA: 4 treatments × 4 reps RCBD with manual computed SS → compare to within 0.001
- Shapiro-Wilk: known normal data (n=20) should pass (p > 0.05); known non-normal data should fail
- Bartlett's: equal-variance groups should pass; artificially unequal groups should fail
- SNK: verify step-down stops correctly for non-significant ranges
- Bonferroni: verify `adjustedAlpha = alpha / m` exactly
- Power curve: verify monotonicity for k=3, effect=0.4, alpha=0.05

### Integration Tests (reportDataBuilder)
- Build `ReportData` from 3 herbicide treatments × 4 reps → verify all 10 new fields are populated
- Correlation matrix: 3 params, 4 treatments → verify matrix shape and r² ≤ 1
- Tidy CSV export: 2 treatments × 2 reps × 3 DAA = 12 rows expected

### Snapshot / Visual Tests
- Generate a Standard PDF → verify file size > 5KB and filename pattern
- Generate a PPTX → verify file size > 3KB and slide count = 6 (or 7 with photos)

### Property-Based Tests
- See Correctness Properties section; each property maps to one parameterized test function

