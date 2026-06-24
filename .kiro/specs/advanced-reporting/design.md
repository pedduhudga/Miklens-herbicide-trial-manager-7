# Design: Advanced Multi-Treatment Professional Reporting System

## Overview

This design restructures the reporting pipeline around a unified `ReportDataBuilder` that aggregates project-level data correctly — treatment means across replications, full multi-parameter ANOVA via the existing `AnalysisEngine`, and design-aware statistics — then feeds that data into three independent format renderers (PDF, Excel, DOCX). The Reports page UI is extended to support project-level report generation with pre-flight validation.

---

## Architecture

```
Reports Page (UI)
      │
      ▼
ReportDataBuilder           ← NEW — aggregates all project/trial data
      │  uses:
      ├─ AnalysisEngine       (existing — statsUtils.js + analysisUtils.js)
      ├─ categoryConfig.js    (existing — observation field definitions)
      └─ largeScaleService.js (existing — for LargeScale projects)
      │
      ▼
ReportData object           ← shared data model for all formats
      │
      ├──► PdfReportRenderer      ← extends/replaces trialReports.js master fns
      ├──► ExcelReportRenderer    ← extends AdvancedReportGenerator
      └──► DocxReportRenderer     ← extends exportUtils.js exportScientificReportAsDOC
```

---

## New Files

| File | Purpose |
|---|---|
| `src/services/reportDataBuilder.js` | Core data aggregation — treatment means, ANOVA, multi-parameter |
| `src/services/pdfReportRenderer.js` | Professional PDF generation using jsPDF + autoTable |
| `src/services/excelReportRenderer.js` | Multi-sheet Excel using ExcelJS (wraps AdvancedReportGenerator) |
| `src/services/docxReportRenderer.js` | DOCX generation using docx.js |
| `src/components/ReportConfigPanel.jsx` | Pre-generation UI: scope, options, validation warnings |
| `src/components/ReportProgressModal.jsx` | Step-by-step progress modal during generation |

## Modified Files

| File | Change |
|---|---|
| `src/pages/Reports.jsx` | Add "Project Report" tab, wire ReportConfigPanel, call new renderers |
| `src/services/advancedReportGenerator.js` | Expose `setExternalAnovaResults()` so Excel renderer can inject pre-computed stats |
| `src/utils/analysisUtils.js` | Add `analyzeAllParameters()` batch method |

---

## Data Model: ReportData Object

```js
ReportData = {
  meta: {
    projectName, crop, location, investigator, organisation,
    gps, targetSpecies, applicationDates, reportDate,
    design, designLabel, replications, treatments,
    category, categoryConfig
  },
  treatmentList: [
    { name, dosage, unit, timing, isControl, isStandard, replicationCount, plotNumbers }
  ],
  // Treatment × Replication raw data matrix
  rawMatrix: {
    [treatmentName]: {
      [repId]: { [paramKey]: value, daa: number }
    }
  },
  // Time-series data: means at each DAA per treatment
  timeSeries: {
    daas: [7, 15, 30, 45],
    [treatmentName]: { [daa]: { mean, sd, se, n } }
  },
  // Per-parameter aggregated stats
  parameters: [
    {
      key, label, unit,
      means: {
        [treatmentName]: { mean, sd, se, cv, n, cldLetter, efficacy_pct }
      },
      anova: {
        source: ['Treatments', 'Blocks', 'Error', 'Total'],
        ss: [...], df: [...], ms: [...], f: [...], p: [...],
        grandMean, cv, sem, lsd5, lsd1,
        significant, significance_label  // 'NS', '*', '**'
      },
      postHocMethod,  // 'LSD' | 'Tukey' | 'Duncan'
      transformation  // 'none' | 'arcsine' | 'log' | 'sqrt'
    }
  ],
  primaryParameter: { ... },  // Reference to the primary efficacy parameter
  yield: { means: {...}, anova: {...} } | null,
  weather: [ { date, daa, temp, humidity, wind, rain } ],
  photos: [ { url, treatment, daa, date, label } ],
  warnings: [ { type, message } ],
  dataCompleteness: { expected, actual, pct }
}
```

---

## Component: ReportDataBuilder

**File:** `src/services/reportDataBuilder.js`

### Method: `build(projectId, subTrials, options)`

```
INPUT:
  projectId   — string
  subTrials   — Trial[] from state.trials filtered by ProjectID
  options = {
    daa: number | null,       // null = use final observation
    postHoc: 'lsd' | 'tukey' | 'duncan',
    alpha: 0.05 | 0.01,
    transformation: 'none' | 'arcsine' | 'log' | 'sqrt',
    includePhotos: boolean,
    includeWeather: boolean,
    category: string,
    project: object,
    state: AppState
  }

OUTPUT: ReportData
```

### Internal steps:

1. **Build treatment groups**: Group `subTrials` by `FormulationName + Dosage`. Identify UTC.
2. **Build raw matrix**: For each trial, extract observation values at target DAA (or final).
3. **For each observation parameter in `categoryConfig.observationFields`**:
   - Check if any trial has data for this key → skip if none
   - Compute per-treatment mean, SD, SE, CV, n
   - Call `AnalysisEngine.analyze(paramKey)` → get ANOVA results
   - Apply data transformation if selected
   - Extract CLD letters from post-hoc grouping
4. **Build time-series**: For each DAA present across all trials, compute treatment means.
5. **Compute efficacy %**: vs. UTC for each treatment for primary parameter.
6. **Collect weather**: aggregate from trial fields.
7. **Collect photos**: from `PhotoURLs` across all trials.
8. **Validate & flag warnings**: unbalanced design, missing reps, insufficient data.

---

## Component: PdfReportRenderer

**File:** `src/services/pdfReportRenderer.js`

Uses jsPDF + jspdf-autotable (already installed). Replaces `generateMasterComprehensivePdf` for the new flow while keeping backward compatibility.

### Sections (in order):

```
1. Cover Page
   - Logo placeholder, project name, crop, location, dates, investigator, org
   - Design label + confidence note

2. Table of Contents (auto-generated from sections present)

3. Trial Design & Methodology
   - Design type, block count, treatment count, plot size, spray volume
   - Application dates and timings

4. Treatment List Table
   | # | Treatment | Dosage | Timing | Replications | Role |

5. Raw Data Table (Treatment × Replication)
   | Treatment | Rep1 | Rep2 | Rep3 | ... |

6. Treatment Means & Statistics (primary parameter)
   | Treatment | Mean | SD | SE | Efficacy% | CLD |
   + ANOVA source table below
   + Grand Mean, CV%, SEm±, LSD 5%, LSD 1% block

7. Time-Series Means Table
   | Treatment | 7 DAA | 15 DAA | 30 DAA | 45 DAA |

8. Additional Parameters (one mini-table per parameter with data)

9. Yield Analysis (if yield data present)

10. Weather Summary Table

11. Photo Grid (organized by treatment, then by DAA)

12. Conclusions & Recommendations
```

---

## Component: ExcelReportRenderer

**File:** `src/services/excelReportRenderer.js`

Wraps `AdvancedReportGenerator` but injects pre-computed `ReportData` to avoid recomputing stats. Adds a new sheet: "All Parameters" that the original generator does not have.

Sheet list (13 sheets for project reports):
1. Cover / Summary
2. Trial Info
3. Treatment List
4. Raw Data Matrix
5. Treatment Means (primary)
6. ANOVA Table
7. Post-Hoc Comparisons
8. All Parameters Data
9. Time-Series Data
10. Yield
11. Weather
12. Charts
13. Photos

---

## Component: ReportConfigPanel

**File:** `src/components/ReportConfigPanel.jsx`

Renders inside Reports.jsx when "Project Report" mode is active.

```
[Project selector]
[Format: PDF | Excel | DOCX]
[Post-hoc test: LSD | Tukey HSD | Duncan's MRT]
[Alpha level: 5% | 1%]
[Observation timing: Final | 7 DAA | 15 DAA | 30 DAA | ...]
[Data transformation: None | Arcsine | Log | Sqrt]
[☑ Include photos]  [☑ Include weather]

─── Data Summary (pre-flight) ───
Treatments: 6  |  Replications: 4  |  Parameters with data: 7
⚠ Treatment "T4 - 300g/ha" has only 2 replications (unbalanced)
⚠ No yield data found in this project

[Generate Report ▼]
```

---

## Component: ReportProgressModal

**File:** `src/components/ReportProgressModal.jsx`

Shows a full-screen modal during generation:
```
Generating Project Report...
━━━━━━━━━━━━━━━━━━━━━━░░░░  68%

✓ Aggregating treatment data
✓ Running ANOVA (primary metric)
✓ Running ANOVA (6 additional parameters)
▶ Building PDF tables...
  Building charts...
  Embedding photos...
```

---

## Reports Page Changes

The Reports page (`src/pages/Reports.jsx`) gains two tabs:

**Tab 1: "Project Report"** — new, uses `ReportDataBuilder` + new renderers
**Tab 2: "Single Trial Report"** — existing cards (Scientific DOCX, Trial Cards PDF, Advanced Excel, ARM Export) unchanged

The "Project Report" tab renders `ReportConfigPanel` and triggers generation through a unified handler `handleGenerateProjectReport(format)`.

---

## AnalysisEngine Extension

Add to `src/utils/analysisUtils.js`:

```js
async analyzeAllParameters(paramKeys, options = {}) {
  // Runs analyze() for each paramKey in paramKeys
  // Returns { [paramKey]: AnalysisResult }
  const results = {};
  for (const key of paramKeys) {
    try {
      results[key] = await this.analyze(key, null, options.daa, options);
    } catch (e) {
      results[key] = { error: e.message };
    }
  }
  return results;
}
```

---

## Data Flow for Project Report

```
User clicks "Generate Report"
      │
      ▼
ReportConfigPanel validates input
  → Project selected? ✓
  → ≥ 2 treatments? ✓
  → ≥ 2 reps per treatment? ✓
      │
      ▼
ReportProgressModal opens
      │
      ▼
ReportDataBuilder.build(projectId, trials, options)
  → groups treatments
  → AnalysisEngine.analyzeAllParameters(paramKeys)
  → computes time-series
  → collects photos + weather
  → returns ReportData
      │
      ▼
Format renderer called (PDF / Excel / DOCX)
  → receives complete ReportData
  → renders all sections
  → triggers browser download
      │
      ▼
ReportProgressModal closes
Toast: "Report downloaded successfully"
```

---

## Backward Compatibility

- All existing single-trial report functions in `trialReports.js` and `exportUtils.js` are kept unchanged.
- The existing "Single Trial Report" cards in the Reports page are kept exactly as-is.
- `AdvancedReportGenerator` is kept intact; `ExcelReportRenderer` wraps it and injects pre-computed data when available.
- No existing data model changes — `ReportDataBuilder` reads from existing `state.trials`, `state.projects`, `state.blocks`.

---

## Design Decisions

**Why a shared `ReportData` object?**
Currently PDF, Excel, and DOCX each recompute their own stats independently, causing numbers to differ across formats. A single pre-computed `ReportData` ensures consistency.

**Why keep `AnalysisEngine` instead of replacing it?**
`AnalysisEngine` already handles CRD/RCBD/Pot/Factorial detection, handles backend data fallback, and has outlier detection. Replacing it would risk regressions. Instead we expose a batch `analyzeAllParameters()` method.

**Why not just fix `calculateAnovaRCB` in `advancedReportGenerator.js`?**
That function hard-codes treatment numbers 1 and 2. Fixing it to handle N treatments would require a full rewrite that duplicates what `AnalysisEngine` already does correctly. The better path is to use the existing engine and inject results into the report.

**Why separate `pdfReportRenderer.js` from `trialReports.js`?**
`trialReports.js` is 4400+ lines and handles both single-trial and project-level generation in the same file. Adding more complexity risks breaking the existing working single-trial path. A new file that imports helpers from `trialReports.js` is safer and more maintainable.
