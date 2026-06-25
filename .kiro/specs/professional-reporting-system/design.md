# Design Document: Professional Reporting System

## Overview

The Professional Reporting System is a complete overhaul of the existing multi-format report generation pipeline in the Miklens Agrochemical Trial Manager (React + Vite PWA). It produces scientifically rigorous, regulator-ready reports across PDF (four templates), Excel (14-sheet workbook), DOCX, PPTX, CSV, JSON, HTML, and TXT formats.

The overhaul addresses five confirmed classes of defects found in direct source analysis:
1. Scaffolded/stub PDF templates (Scientific Journal, Field Summary Card, Regulatory Submission render empty PDFs)
2. Photo-at-scale crash (no batching, all base64 blobs loaded simultaneously)
3. Missing statistical chart embeddings (residual diagnostics, dose-response curve)
4. Broken export entry points (Tidy CSV, DOCX from Trials page, Statistics page export, LargeScale report button)
5. Missing/incorrect data flow (Sheet 7 Post-Hoc placeholder, `resolvePhotoSrc()` not called in Excel Photos sheet, `buildExecutiveSummary()` not called in DOCX renderer)

### Design Goals
- **Single ReportData object**: `buildReportData()` computes everything once; all renderers are pure consumers.
- **Correctness by construction**: Treatment ordering, tier labels, statistical values, and executive summary text are determined once and passed through—no renderer recalculates independently.
- **Graceful degradation**: Every section uses conditional rendering; a missing data block produces a placeholder row, not a crash.
- **Memory safety**: Photos are batched (16/page PDF, 6/slide PPTX), Excel rows are streamed for >30 treatments.
- **Audit traceability**: Every generated file carries a v4 UUID, generation timestamp, user identity, and stats engine version.

---

## Architecture

### High-Level Data Flow

```
Raw Trial Records (IndexedDB / Firestore)
         │
         ▼
  buildReportData(projectId, subTrials, options, state)
         │ AnalysisEngine (analysisUtils.js)
         │ statsUtils.js  (ANOVA, post-hoc, effect sizes, diagnostics)
         │ doseResponseUtils.js
         │ computeCorrelationMatrix()
         │ buildExecutiveSummary()
         │
         ▼
  ┌─────────────────────────────────────────────┐
  │              ReportData Object               │
  │  meta · treatmentMap · rawMatrix · anova     │
  │  postHoc · means · timeSeries · parameters   │
  │  effectSizes · powerAnalysis · residuals     │
  │  correlationMatrix · doseResponse            │
  │  phytotoxicity · yield · weather · photos    │
  │  dataCompleteness · auditTrail · executiveSummary │
  └─────────────────────────────────────────────┘
         │
    ┌────┼────────┬────────────┬──────────────┐
    ▼    ▼        ▼            ▼              ▼
  PDF  Excel    DOCX         PPTX          CSV/JSON/HTML/TXT
(jsPDF)(ExcelJS)(docx.js)  (pptxgenjs)   (browser Blob API)
    │
  4 Templates:
  Standard | Scientific Journal | Field Summary Card | Regulatory
```

### Module Interaction Diagram

```
Pages (Reports.jsx, Trials.jsx, Statistics.jsx, Analytics.jsx,
        CompareTrials.jsx, DoseResponse.jsx, LargeScaleTrials.jsx)
   │
   │ handleGenerateProjectReport(options) / handleExport*()
   ▼
advancedReportGenerator.js  ──────────────────────────┐
   │ buildReportData()                                 │
   ▼                                                   │
reportDataBuilder.js                                   │
   ├── AnalysisEngine (analysisUtils.js)               │
   │     └── performANOVA / postHoc / etc (statsUtils) │
   ├── computeCorrelationMatrix()                       │
   ├── buildExecutiveSummary()                          │
   ├── exportTidyCSV()                                  │
   └── fbGetLargeScaleData() (largeScaleService.js)    │
                                                        │
   ▼ ReportData object                                  │
pdfReportRenderer.js    ◄──────────────────────────────┘
excelReportRenderer.js  ◄
docxReportRenderer.js   ◄
pptxReportRenderer.js   ◄
exportUtils.js          ◄ (single-trial exports only)
statsExporter.js        ◄ (Statistics page PDF/Excel)
```

---

## Components and Interfaces

### 1. `reportDataBuilder.js` — Central Aggregation Service

**Current state**: Has `buildReportData()`, `computeTreatmentMeans()`, `computeCorrelationMatrix()`, `buildExecutiveSummary()`, `exportTidyCSV()`. Needs additional fields in the ReportData output.

**Changes required**:
- Add `residualDiagnostics`, `effectSizes`, `powerAnalysis`, `auditTrail`, `dataCompleteness` to the returned object.
- Call `calculateResidualsDiagnostics()` from `statsUtils.js` and store the result.
- Call `calculateEffectSizes()` and `calculatePower()` and store results.
- Generate a `Report_UUID` (v4) at build time and embed it in `auditTrail`.
- Compute `dataCompleteness` (expectedObservations, recordedObservations, missingObservations, missingPct).
- Read `STATS_ENGINE_VERSION` from `statsUtils.js` and include in `auditTrail`.
- Build `photos` array: for each trial, parse `PhotoURLs`, call `resolvePhotoSrc()`, attach photo tag schema (treatment, daa, plotNumber, observationId, direction).
- Properly populate `phytotoxicity` from `phytotoxicityPct` field (already separated but must be stored as `{ hasData, allZero, means }` consistently).

**Public API** (existing, no signature changes needed):
```js
export async function buildReportData(projectId, subTrials, options, state) → ReportData
export function buildExecutiveSummary(reportData) → string
export function computeCorrelationMatrix(subTrials, paramsWithData, categoryId) → { matrix, params }
export function computeTreatmentMeans(subTrials, paramKey, daa, categoryId) → { [treatment]: stats }
export function exportTidyCSV(projectId, subTrials, state)
export function getParametersWithData(subTrials, categoryId) → string[]
```

### 2. `pdfReportRenderer.js` — PDF Generator

**Current state**: `renderStandard()` is functional. `renderScientificJournal()`, `renderFieldSummaryCard()`, `renderRegulatorySubmission()` are stubs.

**Section rendering pipeline** (16 sections):
Each section is a pure function `renderSection_N(doc, reportData, state) → { doc, y }` that accepts current y-position and returns updated y.

| Section | Function | Template scope |
|---------|----------|---------------|
| 1 | `renderTitlePage()` | All |
| 2 | `renderTableOfContents()` | Standard, Regulatory, Journal |
| 3 | `renderExecutiveSummary()` | All (word limit varies) |
| 4 | `renderTrialDesignMethodology()` | All |
| 5 | `renderObservationsSummary()` | All |
| 6 | `renderStatisticalAnalysis()` | All |
| 7 | `renderEfficacyRankings()` | All |
| 8 | `renderCharts()` | All (conditional sub-charts) |
| 9 | `renderPhytotoxicity()` | Comprehensive only if data |
| 10 | `renderCorrelation()` | If ≥3 params |
| 11 | `renderResidualDiagnostics()` | If n≥4 |
| 12 | `renderPhotoDocumentation()` | If photos present |
| 13 | `renderYieldAnalysis()` | If yield data present |
| 14 | `renderWeatherLog()` | If weather data present |
| 15 | `renderConclusions()` | All |
| 16 | `renderAppendices()` | Standard, Regulatory |

**Key helper functions**:
```js
function checkPageBreak(doc, y, ph, needed) → y   // existing — keep
function addSectionHeading(doc, text, y, ph, color) → y  // existing — keep
async function renderChartCanvas(type, data, options, w, h) → base64PNG
function paginate16Photos(doc, photos, y, ph, color, mode) → y  // NEW: batched
function render2ColumnLayout(doc, leftContent, rightContent) → void  // NEW: Journal
function renderAuditTrailPage(doc, auditTrail, color) → void  // NEW
```

**Template routing** (existing `generateProjectPDF()` switch — keep signature):
```js
export async function generateProjectPDF(reportData, options)
  switch(options.template):
    'scientific-journal' → renderScientificJournal(reportData, options)
    'field-summary'      → renderFieldSummaryCard(reportData, options)
    'regulatory'         → renderRegulatorySubmission(reportData, options)
    default              → renderStandard(reportData, options)
```

**Scientific Journal template design**:
- `renderScientificJournal()` creates a new `jsPDF` instance with 9pt body font.
- Uses `render2ColumnLayout()` helper: left column x=14–98mm, right column x=110–196mm, gutter=12mm.
- Structured abstract four paragraphs: Objective, Materials & Methods, Key Results, Conclusions.
- Treatment means table rendered at ≤90mm width using `autoTable` `columnStyles.0.cellWidth: 88`.
- ANOVA source table rendered in right column; if too wide, spans full width on next page.

**Field Summary Card template design**:
- Single A4 page constraint enforced by `checkPageBreak()` returning `ph - 20` limit that triggers a final trim.
- Compact metadata header band: project name, investigator, location, date — 3pt font, 8mm height.
- Treatment means table: top 5 non-control treatments + UTC, sorted by primary efficacy% descending.
- When >5 non-control treatments: footnote "X additional treatments omitted from this card".
- Horizontal bar chart: rendered via `renderChartCanvas('bar', ...)`, width=pw-28, height=55mm.
- Tier badges row: rendered as coloured rect cells below the bar chart.

**Regulatory Submission template design**:
- GLP/GEP cover page: protocol number, Study Director name, Sponsor, Site code, GLP compliance statement, date.
- Amendment History table: Version | Date | Description | Author — pre-populated with v1.0 and current date.
- Decimal-numbered section headings: `1.0`, `2.0`, `2.1` format via `addDecimalHeading()` helper.
- Signature block on final body page before appendices.
- All 16 standard sections with Regulatory-specific executive summary (250–350 words).
- Report UUID and Generated On shown on cover page beneath Amendment History table.

### 3. `excelReportRenderer.js` — Excel Generator

**Current state**: 13 sheets implemented. Sheet 7 has a placeholder row when no comparisons data. Sheet 13 writes raw `photo.url` without calling `resolvePhotoSrc()`.

**Changes required**:
- **Sheet 7 (Post-Hoc)**: Read `reportData.primaryParameter.anova.comparisons` (populated when Tukey/Duncan/SNK/LSD was run in `buildReportData()`). Map `comp.diff` → Mean Diff, `comp.hsd || comp.lsd || comp.range` → Critical Value. Remove placeholder row.
- **Sheet 13 (Photos)**: Replace `photo.url` with `resolvePhotoSrc(photo)`. Write `'Image unavailable'` when `resolvePhotoSrc` returns null.
- **Sheet 14 (Audit Trail)**: New sheet — field name in col A, value in col B. Sheet protected (locked, no password).
- **Streaming rows for >30 treatments**: `buildSheet4RawData()` uses direct `ws.addRow()` per rep already; confirm no pre-built array when count > 30.
- **Photo URL limit**: When workbook would exceed 50MB from base64, auto-switch to URL-only mode with comment.

**Sheet map** (final 14 sheets):
1. Cover — 2. Trial Info — 3. Treatment List — 4. Raw Data Matrix — 5. Treatment Means — 6. ANOVA Table — 7. Post-Hoc Comparisons — 8. All Parameters — 9. Time-Series Data — 10. Yield — 11. Weather — 12. Charts (data ranges) — 13. Photos — 14. Audit Trail

**Export function** (keep existing signature):
```js
export async function generateProjectExcel(reportData, options)
```

### 4. `docxReportRenderer.js` — DOCX Generator

**Current state**: Has most sections but executive summary reads `reportData.executiveSummary` directly (which may be null if `buildExecutiveSummary()` was not called upstream). Appendix B (residual diagnostics images) is absent.

**Changes required**:
- Ensure `buildReportData()` always sets `reportData.executiveSummary` by calling `buildExecutiveSummary()` internally.
- Add `renderAppendixB()`: embeds residual diagnostic chart images inline (histogram, Q-Q, fitted-vs-residuals) when `reportData.residualDiagnostics.n >= 4`. Images are fetched via `toBase64()` from canvas-rendered chart PNGs.
- Add Audit Trail as final section after Appendix D.
- Embed Report UUID in `core.xml` `<dc:identifier>` via a `docxProperties` option passed to `Packer.toBlob()`.
- Ensure all 16 sections are present (current code has sections 1–9 and some appendices).

**Export function** (keep existing signature):
```js
export async function generateProjectDocx(reportData, options)
```

### 5. `pptxReportRenderer.js` — PPTX Generator

**Current state**: 7 slides (Title, Trial Design, Bar Chart, ANOVA Table, Treatment Ranking, Conclusions, Photos). Photo slide limited to 6 photos — no multi-slide distribution.

**Changes required**:
- **Multi-slide photo distribution**: Replace the single photo slide with a `renderPhotoSlides()` function that loops through photos in batches of 6, calling `await toBase64(photo.url, 600)` for each photo sequentially (not in parallel — one `await` at a time to avoid memory spike). Each slide gets a `"Trial Photos (N of M)"` subtitle.
- **Statistical Diagnostics slide**: New slide 5 (inserted between ANOVA Results and Treatment Ranking) — renders three residual diagnostic chart images in 1×3 grid when `reportData.residualDiagnostics.n >= 4`.
- **Audit Trail slide**: Final slide — table of field name / value pairs.
- Sequential photo processing pseudocode:
  ```js
  for (let i = 0; i < photos.length; i += 6) {
    const batch = photos.slice(i, i + 6);
    const slide = prs.addSlide();
    for (let j = 0; j < batch.length; j++) {
      const imgData = await toBase64(batch[j].url, 600); // sequential
      // place image at grid position j
    }
  }
  ```

**Export function** (keep existing signature):
```js
export async function generateProjectPPTX(reportData, options)
```

### 6. Photo Management System

**Current state**: `photoUtils.js` has `resolvePhotoSrc()`, `getPhotoThumbnailSrc()`. `PhotoGallery.jsx` displays photos but has no tag editing UI. Photos stored as JSON array in `trial.PhotoURLs`.

**Tag schema** (to be added to each photo object):
```js
{
  // existing fields
  url: string | null,
  fileData: string | null,   // base64 (may be '[base64-removed]')
  driveId: string | null,
  date: string,              // ISO datetime
  label: string,
  aiResult: object | null,

  // NEW tag fields
  treatment: string | null,     // FormulationName of the trial at capture time
  daa: number | null,           // DAA of the observation at capture time
  plotNumber: string | null,    // PlotNumber of the trial
  observationId: string | null, // ID or index of the observation record
  direction: 'Nadir' | 'Oblique' | 'Close-Up' | 'Panoramic' | null,
}
```

**Auto-population at capture time** (in `Trials.jsx` photo capture flow):
When a photo is captured within an observation entry (`isObsModalOpen === true`), the capture handler fills:
- `treatment` ← `activeTrial.FormulationName`
- `daa` ← `parseInt(obsForm.daa)`
- `plotNumber` ← `activeTrial.PlotNumber`
- `observationId` ← index of current observation in `EfficacyDataJSON`

When observation context is partial, only the available fields are set; null for the rest.

**Manual tag editing UI** (`PhotoGallery.jsx`): A per-photo "Edit Tags" button opens an inline form with dropdowns for `direction`, text inputs for `treatment` / `daa` / `plotNumber`, and a Save button that calls `updateTrial()` to persist.

**Photo sort/group logic** (used by all renderers):
```
sortedPhotos = photos.sort by:
  1. treatment (alphabetical, nulls last)
  2. daa (ascending, nulls last)
  3. plotNumber (numeric ascending, nulls last)
  4. date (ascending)

Untagged group (treatment==null || daa==null || plotNumber==null) → collected last, sorted by date
```

### 7. `ReportConfigPanel.jsx` — Configuration UI

**Changes required** (new UI controls added to existing panel):
1. **Photo Mode selector** — shown when `includePhotos === true`:
   ```jsx
   <select value={photoMode} onChange={e => setPhotoMode(e.target.value)}>
     <option value="thumbnail">Thumbnail Grid (4×4, ≤400px)</option>
     <option value="fullpage">Full Page (1 photo/page, ≤1200px)</option>
   </select>
   ```
2. **Residual Diagnostics checkbox** — default `true`.
3. **Dose-Response checkbox** — shown only when `preflight.hasDoseResponseData === true`.
4. **Sector Map checkbox** — shown only when `preflight.hasLargeScaleTrials === true`.
5. **Photo count warning** — in the pre-flight summary: when `preflight.photoCount > 50`, show amber warning "This project has N photos — thumbnail mode recommended".
6. **Dunnett α selector** — additional button for α = 10% when Dunnett is selected as post-hoc.
7. Pass new options through `onGenerate({ ..., photoMode, includeResiduals, includeDoseResponse, includeSectorMap })`.

Pre-flight now additionally computes:
- `photoCount`: count of all photos across `subTrials`
- `hasDoseResponseData`: `subTrials.some(t => t.DosageValue && ...)` 
- `hasLargeScaleTrials`: `subTrials.some(t => t.TrialDesign === 'LargeScale' || t.SectorID)`

### 8. Audit Trail System

**UUID generation**: Use `crypto.randomUUID()` (available in all modern browsers). Fallback: construct from `Math.random()` bytes for older browsers.

**Audit trail block structure**:
```js
{
  reportUUID: string,           // v4 UUID
  generatedOn: string,          // ISO 8601 with timezone offset
  generatedBy: { name, email }, // from useAuth() user object
  appVersion: string,           // from package.json via import.meta.env.VITE_APP_VERSION
  statsEngineVersion: string,   // STATS_ENGINE_VERSION from statsUtils.js
  reportTemplate: string,       // options.template value
  projectName: string,
  projectId: string,
}
```

**IndexedDB audit log**: Key `reportAuditLog` in the app's existing IndexedDB store. Each entry is the audit trail block above. Append on every report generation. Queryable from the app's settings/admin screen.

**PDF embedding**: `doc.setProperties({ keywords: auditTrail.reportUUID })` before saving.
**DOCX embedding**: Pass `{ identifier: auditTrail.reportUUID }` in `Packer.toBlob()` custom properties (or write to `core.xml` via a document property helper).

### 9. Export Entry Points — Wire-Up Map

| Entry point | Page | Current state | Fix |
|---|---|---|---|
| Tidy CSV button | Reports.jsx | Calls `exportTidyCSV()` — **already wired** | Verify parameters passed correctly |
| DOCX export | Trials.jsx (single trial) | Calls `exportScientificReportAsDOC()` — has stub summary | Call `buildExecutiveSummary()` using trial-scoped ReportData |
| Statistics PDF/Excel | Statistics.jsx | `exportStatsPDF()` / `exportStatsExcel()` — **already wired** | Add residual diagnostics to statsExporter |
| Analytics export | Analytics.jsx | Missing | Add canvas capture → PDF using `html2canvas` or `window.print()` |
| CompareTrials export | CompareTrials.jsx | `compareReports.js` — partial | Complete side-by-side table and chart embed |
| DoseResponse export | DoseResponse.jsx | Missing | Wire `generateDoseResponsePDF()` calling pdfReportRenderer's dose-response section |
| LargeScale report | LargeScaleTrials.jsx | "Project Report" button wired but throws routing error | Use same `handleGenerateProjectReport()` pattern with `meta.isLargeScale = true` |

---

## Data Models

### ReportData Schema

```typescript
interface ReportData {
  // ── Metadata ───────────────────────────────────────────────────
  meta: {
    projectId: string;
    projectName: string;
    category: string;                   // 'herbicide' | 'fungicide' | ...
    design: string;                     // 'RCBD' | 'CRD' | 'Factorial' | ...
    designLabel: string;                // human-readable design name
    analysisModel: string;              // model used in ANOVA heading
    treatments: number;
    replications: number;
    applicationDates: string[];
    crop: string;
    variety: string;
    location: string;
    investigator: string;
    organisation: string;
    gps: string;                        // "lat, lon" formatted string
    targetSpecies: string;
    reportDate: string;                 // YYYY-MM-DD
    daa: number | null;
    isLargeScale: boolean;
    largescaleSectors: SectorRecord[];
    spatialSummary: { [sectorName: string]: { spatialCV: number } };
    previousCrop: string;
    irrigationMethod: string;
    plantPopulation: string;
    categoryConfig: CategoryConfig;     // from getCategoryConfig()
  };

  // ── Treatment structure ────────────────────────────────────────
  treatmentMap: {
    [groupKey: string]: { name: string; dosage: string; trials: Trial[] };
  };
  treatmentList: TreatmentListItem[];   // ordered array for tables

  // ── Raw data matrix ────────────────────────────────────────────
  rawMatrix: {
    [treatmentName: string]: {
      [repId: string]: {
        daa: number | null;
        trialID: string;
        plotNumber: string;
        [paramKey: string]: number | null | string;
      };
    };
  };

  // ── Primary parameter analysis ─────────────────────────────────
  primaryParameter: ParameterResult;

  // ── All parameters ─────────────────────────────────────────────
  parameters: ParameterResult[];

  // ── Time series ────────────────────────────────────────────────
  timeSeries: {
    daas: number[];
    [treatmentName: string]: { [daa: number]: DescStats };
  };

  // ── Statistical outputs ────────────────────────────────────────
  effectSizes: {
    etaSquared: number | null;          // η²
    omegaSquared: number | null;        // ω²
    cohensF: number | null;
    etaLabel: string;
    omegaLabel: string;
    cohensLabel: string;
  };
  powerAnalysis: {
    achievedPower: number;
    requiredN: number;
    powerTable: { n: number; power: number }[];
    interpretation: 'Insufficient' | 'Acceptable' | 'Good' | 'Excellent';
  };
  residualDiagnostics: {
    n: number;
    residuals: number[];
    shapiroW: number | null;
    shapiroP: number | null;
    normality: 'pass' | 'fail';
    leveneF: number | null;
    leveneP: number | null;
    homogeneity: 'pass' | 'fail';
    recommendation: string | null;
  };
  correlationMatrix: { matrix: object; params: string[] };

  // ── Specialised sections ───────────────────────────────────────
  doseResponse: DoseResponseResult | null;
  phytotoxicity: {
    hasData: boolean;
    allZero: boolean;
    means: { [treatment: string]: { mean: number; sd: number; safetyClass: string } };
  };
  yield: YieldResult | null;
  weather: WeatherRecord[];

  // ── Photos ────────────────────────────────────────────────────
  photos: PhotoRecord[];

  // ── Data integrity ────────────────────────────────────────────
  dataCompleteness: {
    expectedObservations: number;
    recordedObservations: number;
    missingObservations: number;
    missingPct: number;
  };

  // ── Executive summary ─────────────────────────────────────────
  executiveSummary: string;

  // ── Audit trail ───────────────────────────────────────────────
  auditTrail: AuditTrailRecord;

  // ── Application log ───────────────────────────────────────────
  applicationLog: ApplicationLogRecord[];

  // ── Warnings ─────────────────────────────────────────────────
  warnings: { type: string; message: string }[];
}
```

### ParameterResult Schema

```typescript
interface ParameterResult {
  key: string;                          // observation field key e.g. 'weedCover'
  label: string;                        // display label e.g. 'Weed Cover %'
  unit: string;
  efficacyExcluded: boolean;            // true for phytotoxicity etc.
  postHocMethod: string;
  means: {
    [treatmentName: string]: {
      n: number;
      mean: number | null;              // 4 d.p. precision preserved
      sd: number | null;
      se: number | null;
      cv: number | null;
      min: number | null;
      max: number | null;
      ci95Lower: number | null;
      ci95Upper: number | null;
      efficacy_pct: number | null;      // relative to UTC
      cldLetter: string;
      tier: 'Excellent' | 'Good' | 'Fair' | 'Poor' | null;
    };
  };
  anova: AnovaResult | null;            // shape from performANOVA() / buildAnovaShape()
}
```

### Photo Tag Schema

```typescript
interface PhotoRecord {
  // Source resolution (existing)
  url: string | null;
  fileData: string | null;
  driveId: string | null;
  date: string;
  label: string;
  aiResult: AIResult | null;

  // Tag fields (new)
  treatment: string | null;
  daa: number | null;
  plotNumber: string | null;
  observationId: string | null;
  direction: 'Nadir' | 'Oblique' | 'Close-Up' | 'Panoramic' | null;

  // Computed at build time
  resolvedSrc: string | null;           // result of resolvePhotoSrc()
}
```

### Audit Trail Schema

```typescript
interface AuditTrailRecord {
  reportUUID: string;                   // v4 UUID
  generatedOn: string;                  // ISO 8601 + timezone
  generatedBy: {
    name: string;
    email: string;
  };
  appVersion: string;
  statsEngineVersion: string;           // STATS_ENGINE_VERSION constant
  reportTemplate: string;
  projectName: string;
  projectId: string;
}
```

### Category Accent Colours

```typescript
const CATEGORY_COLORS: Record<string, { hex: string; rgb: [number, number, number] }> = {
  herbicide:    { hex: '#0D9488', rgb: [13, 148, 136] },
  fungicide:    { hex: '#4F46E5', rgb: [79, 70, 229] },
  pesticide:    { hex: '#DC2626', rgb: [220, 38, 38] },
  nutrition:    { hex: '#D97706', rgb: [217, 119, 6] },
  biostimulant: { hex: '#D97706', rgb: [217, 119, 6] },
};
```

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Executive Summary Word Count Invariant

*For any* valid ReportData object and any template value, the string returned by `buildExecutiveSummary(reportData, template)` SHALL contain a word count that falls within the word limit defined for that template: Field Summary Card = 80–120 words, Standard = 150–250 words, Regulatory Submission = 250–350 words.

**Validates: Requirements 1.3**

---

### Property 2: Category Accent Colour Determinism

*For any* category string in the set `{ 'herbicide', 'fungicide', 'pesticide', 'nutrition', 'biostimulant' }`, the `getPrimaryColor(category)` (PDF) and `getCategoryHex(category)` (PPTX) functions SHALL return the same hex/RGB value on every call with the same input — and the returned values SHALL match the specification: teal for herbicide, indigo for fungicide, red for pesticide, amber for nutrition and biostimulant.

**Validates: Requirements 1.6, 11.3**

---

### Property 3: Tier Classification Determinism

*For any* mean efficacy percentage value, the tier classification function SHALL return a deterministic, single label: Excellent for ≥ 80%, Good for 60–79%, Fair for 40–59%, Poor for < 40%. The classification SHALL be identical regardless of which renderer calls it.

**Validates: Requirements 6.11, 11.4**

---

### Property 4: ANOVA Degrees-of-Freedom Formula Correctness

*For any* valid ANOVA result produced by `performANOVA()` or the AnalysisEngine for a given design type (RCBD, CRD, Factorial, Split-Plot), the sum of all source degrees of freedom in the ANOVA table SHALL equal df_Total (= N − 1), where N is the total number of observations. Specifically:

- RCBD: df_Treatments + df_Blocks + df_Error = N − 1
- CRD: df_Treatments + df_Error = N − 1
- Factorial (a×b): (a−1) + (b−1) + (a−1)(b−1) + ab(r−1) = abr − 1

**Validates: Requirements 10.1, 10.2, 10.3**

---

### Property 5: Cross-Format Treatment Mean Consistency

*For any* valid ReportData object produced by `buildReportData()`, the treatment mean value stored in `reportData.primaryParameter.means[treatment].mean` SHALL appear numerically identical (to 2 decimal places when displayed) in the output of `generateProjectPDF()`, `generateProjectExcel()`, `generateProjectDocx()`, and `generateProjectPPTX()` when all four are called with the same ReportData object.

**Validates: Requirements 11.1, 11.2**

---

### Property 6: ReportData JSON Round-Trip Serialisation

*For any* valid ReportData object `R` produced by `buildReportData()`, the object obtained by `JSON.parse(JSON.stringify(R))` SHALL be deep-equal to `R` for all numeric fields (means, SDs, SEs, ANOVA table values), all CLD letter strings, and all ANOVA source/ss/df/ms/f/p arrays — i.e. no value SHALL become `undefined`, `NaN`, or `Infinity` after round-trip serialisation.

**Validates: Requirements 14.3, 14.6**

---

### Property 7: Photo Sort Order Correctness

*For any* array of `PhotoRecord` objects with mixed tag values (some null, some populated), the `sortAndGroupPhotos(photos)` function SHALL produce an ordering where: (a) all photos with non-null `treatment`, `daa`, and `plotNumber` appear before any photo missing one of those tags; (b) within tagged photos, the sort order is Treatment ascending → DAA ascending → plotNumber numeric ascending → date ascending; (c) untagged photos are sorted by date ascending within the untagged group.

**Validates: Requirements 2.7**

---

### Property 8: PPTX Photo Slide Limit

*For any* array of photos with length N > 0, `generateProjectPPTX()` SHALL produce exactly `Math.ceil(N / 6)` photo slides, and each photo slide SHALL contain no more than 6 photos.

**Validates: Requirements 2.12, 9.3**

---

### Property 9: Photo Auto-Tag Population

*For any* photo captured while `isObsModalOpen === true` with a non-null `activeTrial` and non-null `obsForm.daa`, the created `PhotoRecord` SHALL have `treatment === activeTrial.FormulationName`, `daa === parseInt(obsForm.daa)`, and `plotNumber === activeTrial.PlotNumber`.

**Validates: Requirements 2.4**

---

### Property 10: Report UUID Uniqueness

*For any* two separate calls to `buildReportData()` (or to the UUID generation function), the `auditTrail.reportUUID` values produced SHALL be distinct — no two generated reports SHALL share the same UUID.

**Validates: Requirements 16.1**

---

### Property 11: Statistical Precision Preservation

*For any* computed mean, SD, SE, or effect size value in a `ParameterResult.means` object, the stored value SHALL have at least 4 significant decimal places of precision (i.e. not rounded to fewer than 4 d.p. internally, even though renderers may display fewer).

**Validates: Requirements 14.3**

---

**Property Reflection (Redundancy Check):**
- Properties 3 and 5 both concern consistent tier values across formats. However, Property 3 tests the classification function in isolation (pure function correctness) while Property 5 tests the full pipeline (data flows from buildReportData through to all four renderers). They validate different layers and are not redundant.
- Properties 6 and 11 both concern numerical precision. Property 6 is a round-trip JSON test (serialization correctness), while Property 11 tests precision of the stored value before serialization. They are complementary, not redundant.
- Properties 7 and 9 concern photos. Property 7 tests the sort/group logic; Property 9 tests tag auto-population at capture. No overlap.
- All 11 properties address distinct concerns. No consolidation needed.

---

## Error Handling

### Renderer-Level Errors

Every renderer wraps its generation in a try/catch. On failure at any step:
- Log a `console.warn('[Renderer] Section failed:', err.message)`.
- Continue rendering remaining sections.
- Add a visible inline error block in the output (red border box with the message).
- Never throw an uncaught exception that would abort the file download.

Chart rendering specifically:
```js
try {
  const png = await renderChartCanvas(...);
  if (png) doc.addImage(png, ...);
} catch (e) {
  console.warn('[PDF] Chart embed failed:', e.message);
  // render a text placeholder: "Chart unavailable"
}
```

### buildReportData Error Handling

- **Unparseable EfficacyDataJSON**: Wrapped in try/catch per trial. On JSON.parse failure: skip that trial, push `{ type: 'parse_error', message: 'Trial ${trial.ID}: EfficacyDataJSON unparseable' }` to `warnings`.
- **AnalysisEngine failure**: Wrapped per parameter. On failure: store `{ error: err.message }` in `analysisResults[paramKey]`.
- **Missing UTC/control**: Non-fatal warning added; efficacy% fields set to null.
- **Fewer than 2 treatments**: Warning added; ANOVA not run; renderers check `anova === null` or `anova.error` before rendering.
- **Large-scale data fetch failure**: `fbGetLargeScaleData()` failure is caught; `meta.isLargeScale = false`; proceed with regular data.

### Photo Resolution Errors

- `resolvePhotoSrc()` returns `null` → renderer substitutes a grey placeholder rect with label "Image unavailable".
- `toBase64()` failure (network/CORS) → returns `null` → same placeholder substitution.
- Memory guard (>512MB heap estimate): monitored via `performance.memory.usedJSHeapSize` (Chrome) before each photo batch. If heap > 512MB, switch to URL-only mode and dispatch toast: "Switching to URL-only photo mode to prevent memory overflow."

### Progress Modal Error States

`ReportProgressModal` receives step status updates via `setProgressSteps`. When a step's async block throws, the orchestrator sets that step to `{ status: 'error', errorMessage: err.message }`. The modal renders an error state for that step (red icon, error text) and remains open rather than auto-closing.

---

## Testing Strategy

### Unit Tests (Example-Based)

Framework: **Vitest** (already available via Vite ecosystem). Test files in `src/__tests__/`.

**Key example tests**:
- `buildReportData()` with a minimal 2-treatment, 2-rep RCBD dataset → verify all required keys present, no null UUID, executive summary non-empty.
- `buildExecutiveSummary()` with mocked ReportData → verify word count within bounds for each template.
- `exportTidyCSV()` → verify CSV header row contains all required columns, no undefined values.
- `resolvePhotoSrc()` with various input shapes (string URL, `{ url }`, `{ fileData }`, `{ driveId }`, `{ fileData: '[base64-removed]' }`) → verify correct resolution or null.
- `generateProjectPDF()` with stub ReportData → verify no uncaught exception thrown, output is a non-empty Blob.
- Sheet 7 post-hoc population → given ReportData with `anova.comparisons` array, verify Sheet 7 has rows equal to comparisons count.
- Photo sort order: mixed tagged/untagged array → verify correct grouping boundary.

### Property-Based Tests

Framework: **fast-check** (to be added: `npm install --save-dev fast-check`).

Each property test uses 100+ iterations. Tests are tagged with a comment referencing the design property number.

**Property test implementations**:

```
// Feature: professional-reporting-system, Property 3: Tier Classification Determinism
// For any number in [0, 100], getTier(n) should return a consistent label
fc.assert(fc.property(fc.float({ min: 0, max: 100 }), (mean) => {
  const tier = getTier(mean, false);
  if (mean >= 80) expect(tier.label).toBe('Excellent');
  else if (mean >= 60) expect(tier.label).toBe('Good');
  else if (mean >= 40) expect(tier.label).toBe('Fair');
  else expect(tier.label).toBe('Poor');
}), { numRuns: 200 });
```

```
// Feature: professional-reporting-system, Property 4: ANOVA df Correctness
// For any t (2-10), b (2-6), r (2-8) in RCBD: sum of df = N-1
fc.assert(fc.property(
  fc.integer({ min: 2, max: 10 }),
  fc.integer({ min: 2, max: 6 }),
  fc.integer({ min: 2, max: 8 }),
  (t, b, r) => {
    const N = t * b * r;
    const dfTrt = t - 1;
    const dfBlk = b - 1;
    const dfErr = (t - 1) * (b - 1);
    const dfTotal = N - 1;
    expect(dfTrt + dfBlk + dfErr).toBe(dfTotal);
  }
), { numRuns: 200 });
```

```
// Feature: professional-reporting-system, Property 6: ReportData JSON Round-Trip
// For any numeric stat value, JSON parse/stringify must preserve it
fc.assert(fc.property(fc.float({ noNaN: true, noDefaultInfinity: true }), (val) => {
  const obj = { mean: val, sd: val * 0.1, n: 4 };
  const roundTripped = JSON.parse(JSON.stringify(obj));
  expect(roundTripped.mean).toBe(obj.mean);
  expect(roundTripped.sd).toBe(obj.sd);
}), { numRuns: 500 });
```

```
// Feature: professional-reporting-system, Property 7: Photo Sort Order Correctness
// For any array of photos, tagged photos always precede untagged
fc.assert(fc.property(fc.array(photoArb, { minLength: 1, maxLength: 30 }), (photos) => {
  const sorted = sortAndGroupPhotos(photos);
  const firstUntaggedIdx = sorted.findIndex(p => !p.treatment || !p.daa || !p.plotNumber);
  if (firstUntaggedIdx === -1) return; // all tagged — pass
  for (let i = firstUntaggedIdx + 1; i < sorted.length; i++) {
    // all photos after first untagged should also be untagged
    expect(!sorted[i].treatment || !sorted[i].daa || !sorted[i].plotNumber).toBe(true);
  }
}), { numRuns: 100 });
```

```
// Feature: professional-reporting-system, Property 8: PPTX Photo Slide Count
// For any N photos, should produce ceil(N/6) photo slides
fc.assert(fc.property(fc.integer({ min: 1, max: 60 }), (n) => {
  const expectedSlides = Math.ceil(n / 6);
  const photoSlides = computePhotoSlides(n); // pure helper extracted from renderer
  expect(photoSlides).toBe(expectedSlides);
}), { numRuns: 100 });
```

```
// Feature: professional-reporting-system, Property 10: UUID Uniqueness
// Any two generated UUIDs must be different
fc.assert(fc.property(fc.integer({ min: 1, max: 1 }), (_) => {
  const uuid1 = generateReportUUID();
  const uuid2 = generateReportUUID();
  expect(uuid1).not.toBe(uuid2);
  expect(uuid1).toMatch(/^[0-9a-f-]{36}$/);
}), { numRuns: 200 });
```

### Integration Tests

- **Tidy CSV round-trip**: Export CSV from a project, re-parse the CSV, verify numeric observation values match original `EfficacyDataJSON` values.
- **Audit trail IndexedDB**: Generate a report, verify IndexedDB `reportAuditLog` contains the report UUID.
- **Statistics page exports**: Set up Statistics page state with known ANOVA results, trigger export, verify download initiated.

### Manual Testing Checklist

- Generate each PDF template (Standard, Journal, Field Summary, Regulatory) with a project that has ≥3 treatments, ≥3 reps, photos, weather data, and dose-response data.
- Verify Journal template uses 2-column layout and fits treatment means table in single column.
- Verify Field Summary Card is exactly 1 page with top-5 treatments and footnote when >5 exist.
- Verify Regulatory cover page has GLP statement, Amendment History table, and signature block.
- Verify residual diagnostic charts appear in PDF Section 11, DOCX Appendix B, and PPTX Statistical Diagnostics slide.
- Generate Excel report and verify Sheet 7 has actual post-hoc comparison rows (not the placeholder).
- Generate PPTX for a project with >6 photos and verify multiple photo slides are created.
- Test photo capture in an open observation entry and verify tags auto-populate.

---

## File / Module Modification Map

### Modified Files

| File | Type of change |
|------|---------------|
| `src/services/reportDataBuilder.js` | Add: `residualDiagnostics`, `effectSizes`, `powerAnalysis`, `auditTrail`, `dataCompleteness`, `photos` (with `resolvePhotoSrc`), `phytotoxicity` struct. Call `buildExecutiveSummary()` internally. |
| `src/services/pdfReportRenderer.js` | Implement: `renderScientificJournal()`, `renderFieldSummaryCard()`, `renderRegulatorySubmission()`. Add: `renderResidualDiagnostics()`, `renderDoseResponse()`, `renderAuditTrailPage()`, `paginate16Photos()`, `render2ColumnLayout()`, `renderCorrelation()`. |
| `src/services/excelReportRenderer.js` | Fix: Sheet 7 comparisons population, Sheet 13 `resolvePhotoSrc()` call. Add: Sheet 14 Audit Trail (protected). |
| `src/services/docxReportRenderer.js` | Add: Appendix B (residual images), Audit Trail section, Report UUID in document properties. Ensure `executiveSummary` field always set. |
| `src/services/pptxReportRenderer.js` | Fix: multi-slide sequential photo distribution. Add: Statistical Diagnostics slide, Audit Trail slide. |
| `src/components/ReportConfigPanel.jsx` | Add: Photo mode selector, Residual Diagnostics checkbox, Dose-Response checkbox, Sector Map checkbox, photo count warning, Dunnett α selector. |
| `src/components/PhotoGallery.jsx` | Add: "Edit Tags" per-photo UI with treatment/daa/plotNumber/direction fields. |
| `src/pages/Trials.jsx` | Fix: Photo capture handler auto-populates tag fields. Fix: single-trial export entry points for DOCX, PPTX, JSON, HTML, TXT. |
| `src/pages/Reports.jsx` | Verify: `exportTidyCSV()` invocation passes correct args. Verify: LargeScale report button wired. |
| `src/pages/Statistics.jsx` | Fix: `computeCorrelationMatrix()` called from `reportDataBuilder.js` (not local `pearsonR`). Add: `getTier()` using `pdfReportRenderer`'s thresholds. |
| `src/utils/statsUtils.js` | Add: `STATS_ENGINE_VERSION` constant export. |

### New Files

| File | Purpose |
|------|---------|
| `src/services/auditLogService.js` | `appendAuditEntry(record)`, `getAuditLog()` — IndexedDB operations for report audit history. |
| `src/utils/reportUUID.js` | `generateReportUUID()` — v4 UUID via `crypto.randomUUID()` with fallback. |
| `src/__tests__/reportDataBuilder.test.js` | Unit + property tests for buildReportData, buildExecutiveSummary. |
| `src/__tests__/pdfRenderer.test.js` | Unit tests for PDF template rendering (no-crash guarantee). |
| `src/__tests__/photoUtils.test.js` | Property tests for sortAndGroupPhotos, resolvePhotoSrc. |
| `src/__tests__/statsCorrectness.test.js` | Property tests for ANOVA df, tier classification, UUID uniqueness. |
| `src/__tests__/crossFormat.test.js` | Integration tests for cross-format consistency (same ReportData → same values). |
