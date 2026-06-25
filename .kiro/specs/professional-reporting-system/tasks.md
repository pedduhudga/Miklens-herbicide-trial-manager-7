# Implementation Plan: Professional Reporting System

## Overview

This plan converts the Professional Reporting System design into an incremental series of coding tasks. Each task builds on the previous ones, wiring components together progressively until all 16 requirements are covered. The implementation language is **JavaScript (React + Vite PWA)**, matching the existing codebase.

Tasks are ordered to deliver core infrastructure first (data builder, utilities), then renderer fixes, then new renderer features, and finally UI wiring and tests.

---

## Tasks

- [x] 1. Infrastructure — utility modules and shared constants
  - [x] 1.1 Create `src/utils/reportUUID.js` with `generateReportUUID()` using `crypto.randomUUID()` and a `Math.random()` fallback
    - Export a single named function `generateReportUUID(): string`
    - _Requirements: 16.1_
  - [ ]* 1.2 Write property test for UUID uniqueness (Property 10)
    - **Property 10: Report UUID Uniqueness**
    - **Validates: Requirements 16.1**
  - [x] 1.3 Add `STATS_ENGINE_VERSION` constant export to `src/utils/statsUtils.js`
    - Define as a semver string, e.g. `export const STATS_ENGINE_VERSION = '1.0.0'`
    - _Requirements: 16.1_
  - [x] 1.4 Create `src/services/auditLogService.js` with `appendAuditEntry(record)` and `getAuditLog()` using the app's existing IndexedDB store under key `reportAuditLog`
    - _Requirements: 16.7_


- [x] 2. Extend `reportDataBuilder.js` — core ReportData fields
  - [x] 2.1 Add `residualDiagnostics`, `effectSizes`, and `powerAnalysis` fields to `buildReportData()` by calling `calculateResidualsDiagnostics()`, `calculateEffectSizes()`, and `calculatePower()` from `statsUtils.js` and storing results on the returned object
    - _Requirements: 6.4, 6.5, 6.6, 6.7, 6.8, 8.1_
  - [x] 2.2 Add `auditTrail` field to `buildReportData()`: call `generateReportUUID()`, read `STATS_ENGINE_VERSION`, read app version from `import.meta.env.VITE_APP_VERSION`, and persist to IndexedDB via `appendAuditEntry()`
    - _Requirements: 16.1, 16.7_
  - [x] 2.3 Add `dataCompleteness` field to `buildReportData()`: compute `expectedObservations` (treatments × replications × DAA points), `recordedObservations`, `missingObservations`, and `missingPct` (1 d.p.)
    - _Requirements: 14.7_
  - [x] 2.4 Build `photos` array in `buildReportData()`: for each trial parse `PhotoURLs`, call `resolvePhotoSrc()` from `photoUtils.js`, attach tag schema fields (`treatment`, `daa`, `plotNumber`, `observationId`, `direction`), and store `resolvedSrc`
    - _Requirements: 2.11, 4.11_
  - [x] 2.5 Ensure `buildExecutiveSummary()` is called inside `buildReportData()` and its result stored as `reportData.executiveSummary`; fix any code paths where it was not invoked
    - _Requirements: 4.9, 11.8_
  - [ ]* 2.6 Write property test for ReportData JSON round-trip (Property 6)
    - **Property 6: ReportData JSON Round-Trip Serialisation**
    - **Validates: Requirements 14.3, 14.6**
  - [ ]* 2.7 Write property test for Statistical Precision Preservation (Property 11)
    - **Property 11: Statistical Precision Preservation**
    - **Validates: Requirements 14.3**


- [x] 3. Extend `reportDataBuilder.js` — photo sort/group and phytotoxicity
  - [x] 3.1 Implement `sortAndGroupPhotos(photos)` helper inside `reportDataBuilder.js`: sort tagged photos by treatment → daa → plotNumber (numeric) → date ascending; collect photos missing any of the three tag fields into an `Untagged` group sorted by date
    - Export as a named function so renderers and tests can import it directly
    - _Requirements: 2.7_
  - [ ]* 3.2 Write property test for photo sort order correctness (Property 7)
    - **Property 7: Photo Sort Order Correctness**
    - **Validates: Requirements 2.7**
  - [x] 3.3 Fix `phytotoxicity` field population in `buildReportData()`: read `phytotoxicityPct` from each observation, compute per-treatment mean/SD, and store as `{ hasData, allZero, means }` — separate from primary efficacy metric
    - _Requirements: 4.2, 14.5_

- [x] 4. Checkpoint — Ensure `buildReportData()` unit tests pass
  - Ensure all tests pass, ask the user if questions arise.


- [x] 5. Fix `excelReportRenderer.js` — Sheet 7, Sheet 13, and Sheet 14
  - [x] 5.1 Fix Sheet 7 (Post-Hoc Comparisons): read `reportData.primaryParameter.anova.comparisons`; for each comparison write Treatment A, Treatment B, Mean A, Mean B, Mean Difference, Critical Value, and Significant Yes/No; remove the placeholder row
    - _Requirements: 6.13, 4.13_
  - [x] 5.2 Fix Sheet 13 (Photos): replace `photo.url` with `resolvePhotoSrc(photo)` for each photo; write `'Image unavailable'` when `resolvePhotoSrc` returns null
    - _Requirements: 2.11, 4.11_
  - [x] 5.3 Add Sheet 14 (Audit Trail): write `reportData.auditTrail` fields (field name in col A, value in col B) and protect the sheet (locked, no password)
    - _Requirements: 16.3_
  - [ ]* 5.4 Write unit test for Sheet 7 post-hoc row population
    - Verify row count equals `anova.comparisons.length` for a mocked ReportData with comparisons
    - _Requirements: 6.13_


- [x] 6. Fix `pptxReportRenderer.js` — multi-slide photos, diagnostics slide, audit trail slide
  - [x] 6.1 Replace the single photo slide with `renderPhotoSlides()`: loop through `reportData.photos` in batches of 6, `await toBase64(photo.resolvedSrc, 600)` sequentially per photo, place images in a 2×3 grid, subtitle each slide `"Trial Photos (N of M)"`
    - _Requirements: 2.12, 4.12, 9.3_
  - [ ]* 6.2 Write property test for PPTX photo slide count (Property 8)
    - **Property 8: PPTX Photo Slide Limit**
    - **Validates: Requirements 2.12, 9.3**
  - [x] 6.3 Add Statistical Diagnostics slide (after ANOVA slide): render three residual diagnostic chart images in a 1×3 grid when `reportData.residualDiagnostics.n >= 4`; omit the slide otherwise
    - _Requirements: 8.5_
  - [x] 6.4 Add Audit Trail slide as the final slide: table of field name / value pairs from `reportData.auditTrail`
    - _Requirements: 16.4_


- [x] 7. Fix `docxReportRenderer.js` — executive summary, appendices, audit trail
  - [x] 7.1 Ensure the DOCX executive summary section reads from `reportData.executiveSummary` (populated by `buildExecutiveSummary()` in `buildReportData()`); remove any placeholder paragraph fallbacks
    - _Requirements: 4.9, 11.8_
  - [x] 7.2 Add `renderAppendixB()` to `docxReportRenderer.js`: embed residual diagnostic chart images inline (histogram, Q-Q, fitted-vs-residuals) using `toBase64()` when `reportData.residualDiagnostics.n >= 4`; omit Appendix B otherwise
    - _Requirements: 8.4_
  - [x] 7.3 Add Audit Trail as the final section after Appendix D: heading "Report Audit Trail", horizontal rule, field-value table; embed Report UUID in `core.xml` `<dc:identifier>` via `Packer.toBlob()` custom properties
    - _Requirements: 16.2, 16.5_
  - [ ]* 7.4 Write unit test for DOCX executive summary non-empty guarantee
    - Given a mocked ReportData with `executiveSummary = 'test summary'`, assert the generated DOCX Blob is non-empty and no exception is thrown
    - _Requirements: 4.9_


- [x] 8. Implement shared PDF helper functions in `pdfReportRenderer.js`
  - [x] 8.1 Add `render2ColumnLayout(doc, leftContent, rightContent)` helper: left column x=14–98mm, right column x=110–196mm, gutter=12mm; used by the Scientific Journal template
    - _Requirements: 3.2, 3.3_
  - [x] 8.2 Add `paginate16Photos(doc, photos, y, ph, color, mode)` helper: process photos in batches of 16 per page in thumbnail mode (4×4 grid, ≤400px) or 1 per page in full-page mode (≤1200px); call `checkPageBreak()` between batches; substitute grey placeholder rect when `photo.resolvedSrc` is null
    - _Requirements: 2.8, 2.9, 2.14, 9.2_
  - [x] 8.3 Add `renderAuditTrailPage(doc, auditTrail, color)` helper: renders a final page with "Report Audit Trail" heading, horizontal rule, and field-value table; call `doc.setProperties({ keywords: auditTrail.reportUUID })` for PDF metadata embedding
    - _Requirements: 16.2, 16.5_
  - [x] 8.4 Add `addDecimalHeading(doc, text, y, ph, color)` helper for Regulatory Submission decimal-numbered section headings (1.0, 2.0, 2.1 format)
    - _Requirements: 3.6_


- [x] 9. Implement PDF shared section renderers (Sections 1–8)
  - [x] 9.1 Implement `renderTitlePage(doc, reportData, options)`: project name, investigator, organisation, location, GPS (6 d.p.), crop, variety, trial design, category, application date(s), logo placeholder, "Confidential — For Research Purposes Only" footer; embed Report UUID in `/Keywords` metadata
    - Apply category accent colour from `CATEGORY_COLORS`
    - _Requirements: 1.1, 1.4, 16.5_
  - [x] 9.2 Implement `renderTableOfContents(doc, sections, y)`: numbered section titles with page references; used in Standard, Regulatory, and Journal templates
    - _Requirements: 1.2, 7.2_
  - [x] 9.3 Implement `renderExecutiveSummary(doc, reportData, template, y)`: render `reportData.executiveSummary` text; apply word-limit-appropriate layout per template
    - _Requirements: 1.3, 7.3_
  - [x] 9.4 Implement `renderTrialDesignMethodology(doc, reportData, y)`: trial design type, treatments table (name, dosage, timing, replications, role with IsControl/IsStandardCheck), block layout, application dates/method, soil profile table, weather summary, Data Quality Summary block (from `dataCompleteness`, yellow background when `missingPct > 10%`)
    - _Requirements: 5.6, 7.4, 14.8_
  - [x] 9.5 Implement `renderObservationsSummary(doc, reportData, y)`: multi-row table — treatments as rows, each DAA as column, primary parameter value ± SD per cell; paginate wide tables (>12 DAA columns) into blocks of 8 with treatment column repeated
    - _Requirements: 7.5, 9.7_
  - [x] 9.6 Implement `renderStatisticalAnalysis(doc, reportData, y)`: ANOVA source table (design-appropriate rows per Requirement 10), SEm±/LSD/CV% block, effect sizes (η², ω², Cohen's f with labels), assumption tests (Shapiro-Wilk/Jarque-Bera + Levene), Kruskal-Wallis warning block when assumptions fail, selected post-hoc table (single test only), Power Analysis subsection
    - Use `meta.analysisModel` for heading label
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.12, 7.6, 10.1–10.8_
  - [x] 9.7 Implement `renderEfficacyRankings(doc, reportData, y)`: tier-classified ranking table (Rank, Treatment, Mean ± SE, efficacy%, CLD letter, Tier badge); apply `getTier()` thresholds; render efficacy% columns for all categories (WCE%, DCE%, PRE%, Yield Improvement%, Vigor Improvement%)
    - _Requirements: 6.10, 6.11, 7.7_
  - [x] 9.8 Implement `renderCharts(doc, reportData, options, y)`: (a) treatment means bar chart with ±1 SE error bars always; (b) time-series line chart if >1 DAA; (c) 4-PL dose-response curve if `doseResponse.success === true`; (d) correlation heatmap if ≥3 params; (e) residual diagnostic charts if `residualDiagnostics.n >= 4`; wrap each chart in try/catch rendering "Chart unavailable" on failure
    - _Requirements: 7.8, 8.1, 8.2, 8.3, 8.7, 8.8_


- [x] 10. Implement PDF shared section renderers (Sections 9–16)
  - [x] 10.1 Implement `renderPhytotoxicity(doc, reportData, y)`: treatment × DAA data table and bar chart; render "No phytotoxicity observed" note (no chart) when `phytotoxicity.allZero === true`; omit section entirely when `hasData === false` and template is Compact_Template
    - _Requirements: 4.2, 7.9_
  - [x] 10.2 Implement `renderCorrelation(doc, reportData, y)`: Pearson matrix heatmap table with r values, significance stars (* p<0.05, ** p<0.01), footnote; omit when correlation matrix has fewer than 3 variables
    - Wire to `computeCorrelationMatrix()` from `reportDataBuilder.js` (not a local helper)
    - _Requirements: 4.6, 7.10_
  - [x] 10.3 Implement `renderResidualDiagnostics(doc, reportData, y)`: embed histogram, Q-Q plot, and fitted-vs-residuals PNG images; omit section when `residualDiagnostics.n < 4`
    - _Requirements: 4.3, 7.11_
  - [x] 10.4 Implement `renderPhotoDocumentation(doc, reportData, options, y)`: call `sortAndGroupPhotos()`, render labelled group sub-headings, call `paginate16Photos()` for batched rendering; display AI analysis captions and direction sub-labels; omit when no photos
    - _Requirements: 2.3, 2.7, 2.10, 2.14, 7.12_
  - [x] 10.5 Implement `renderYieldAnalysis(doc, reportData, y)`: yield means table with ANOVA, yield improvement%, CLD letters; omit when `reportData.yield` is null
    - _Requirements: 7.13_
  - [x] 10.6 Implement `renderWeatherLog(doc, reportData, y)`: table with Date, DAA, Temperature, Humidity, Wind Speed, Rain columns; omit when no weather data
    - _Requirements: 7.14_
  - [x] 10.7 Implement `renderConclusions(doc, reportData, y)`: state statistical significance result, name top-performing treatment(s), recommend further replication if non-significant; include `Notes` and `Conclusion` fields verbatim or render "—" when both are null/empty
    - _Requirements: 1.8, 5.10, 7.15_
  - [x] 10.8 Implement `renderAppendices(doc, reportData, y)`: Appendix A (raw data matrix), Appendix B (descriptive stats + full post-hoc pairwise table + power analysis), Appendix C (photo index table — omit if no photos), Appendix D (experimental layout per design type), unnumbered Glossary appendix defining all abbreviations used in this report
    - _Requirements: 1.9, 1.11, 7.16_


- [x] 11. Checkpoint — Ensure Standard PDF template is complete and non-crashing
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Implement `renderScientificJournal()` in `pdfReportRenderer.js`
  - [x] 12.1 Create new `jsPDF` instance with 9pt body font; call `render2ColumnLayout()` to establish two-column geometry (left x=14–98mm, right x=110–196mm)
    - _Requirements: 3.2, 4.1, 4.13_
  - [x] 12.2 Render the structured abstract (four labelled paragraphs: Objective, Materials & Methods, Key Results, Conclusions) and decimal-numbered section headings
    - _Requirements: 1.3, 3.2_
  - [x] 12.3 Render treatment means table at ≤90mm width using `autoTable columnStyles.0.cellWidth: 88`; render ANOVA source table in second column (full-width on next page if too wide)
    - _Requirements: 3.3_
  - [x] 12.4 Apply category accent colour; include Appendices, Glossary, and Audit Trail page; set `doc.setProperties({ keywords: auditTrail.reportUUID })`
    - _Requirements: 1.6, 16.5_


- [x] 13. Implement `renderFieldSummaryCard()` in `pdfReportRenderer.js`
  - [x] 13.1 Enforce single A4 page constraint: set a `checkPageBreak()` limit of `ph - 20` to prevent overflow; render compact metadata header band (project name, investigator, location, date — 3pt font, 8mm height)
    - _Requirements: 3.4, 4.1_
  - [x] 13.2 Render treatment means table with top-5 non-control treatments + UTC (ranked by primary efficacy% descending); when >5 non-control treatments, add footnote stating how many were omitted
    - _Requirements: 3.5_
  - [x] 13.3 Render horizontal bar chart via `renderChartCanvas('bar', ...)` and tier badges row below chart; apply category accent colour
    - _Requirements: 3.4, 1.6_
  - [x] 13.4 Omit phytotoxicity, correlation, and residual diagnostic sections (Compact_Template rules); include executive summary text (80–120 words)
    - _Requirements: 1.3, 5.8_

- [x] 14. Implement `renderRegulatorySubmission()` in `pdfReportRenderer.js`
  - [x] 14.1 Render GLP/GEP cover page: protocol number, Study Director name and signature line, Sponsor, Site code, GLP compliance statement, Date field; Amendment History table (Version, Date, Description, Author — pre-populated v1.0 + current date); Report UUID and Generated On beneath Amendment History
    - _Requirements: 3.6, 3.7, 16.6_
  - [x] 14.2 Apply decimal-numbered headings throughout using `addDecimalHeading()` helper; include all 16 standard sections using the Regulatory-specific executive summary (250–350 words)
    - _Requirements: 3.6, 1.3_
  - [x] 14.3 Render signature block on the final body page before appendices
    - _Requirements: 3.6_
  - [x] 14.4 Append Audit Trail page as the last page; embed Report UUID in PDF `/Keywords` metadata
    - _Requirements: 16.2, 16.5_
  - [ ]* 14.5 Write unit tests verifying each stub template now produces a non-empty, non-corrupt PDF Blob for mocked ReportData
    - _Requirements: 3.1, 3.2, 3.4, 3.6, 4.1, 4.13, 4.14_


- [x] 15. Checkpoint — Ensure all four PDF templates render without errors
  - Ensure all tests pass, ask the user if questions arise.

- [x] 16. Implement parameter completeness in all renderers
  - [x] 16.1 In `reportDataBuilder.js` `getParametersWithData()` and the raw data matrix builder, ensure all category-specific observation fields are included: Herbicide (Req 5.1), Fungicide (Req 5.2), Pesticide (Req 5.3), Nutrition (Req 5.4), Biostimulant (Req 5.5), plus all trial-level metadata fields (Req 5.6)
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_
  - [x] 16.2 In `renderObservationsSummary()` and the Excel "All Parameters" sheet (Sheet 8), render "—" for empty parameter columns in Comprehensive_Templates; omit entirely empty columns in Compact_Templates (Field Summary Card, Scientific Journal)
    - _Requirements: 1.5, 5.8_
  - [x] 16.3 Add IsControl / IsStandardCheck "Role" column to the Treatment List table in all PDF, DOCX, and Excel renderers; display "UTC / Control" for IsControl, "Standard Check" for IsStandardCheck, "UTC / Control" when both are true
    - _Requirements: 5.9_
  - [x] 16.4 Render yield analysis section (Section 13) in PDF and yield sheet (Sheet 10) in Excel only when `YieldValue` is present for at least one treatment; include `YieldValue`, `YieldUnit`, `GrainMoisture`, `ThousandGrainWeight`, `HarvestDAA`
    - _Requirements: 5.7_


- [x] 17. Universal quality standards — cross-cutting fixes in PDF and DOCX renderers
  - [x] 17.1 Add sequential Table and Figure numbering to all PDF and DOCX outputs: maintain a counter per document; every table is labelled "Table N. [caption]" and every figure "Figure N. [caption]" in the order they appear
    - _Requirements: 1.11_
  - [x] 17.2 Fix ANOVA source table heading labels: use `meta.analysisModel` (from ReportData) to produce labels like "ANOVA Source Table (RCBD model)" or "ANOVA Source Table (Split-Plot model)"; label the CRD/Pot Trial model correctly when those designs are used
    - _Requirements: 1.7, 10.7_
  - [x] 17.3 Add the ANOVA guard check (fewer than 2 treatments) to every renderer section that attempts to render an ANOVA table: display a warning block and skip ANOVA/post-hoc rendering when the guard fails
    - _Requirements: 1.10_
  - [x] 17.4 Disable ANCOVA covariate selector in `ReportConfigPanel.jsx` when soil data fields (`SoilPH`, `SoilClay`, `SoilOC`) are absent; display "Soil covariate data not available for this project"
    - _Requirements: 4.15_
  - [ ]* 17.5 Write property test for Category Accent Colour Determinism (Property 2)
    - **Property 2: Category Accent Colour Determinism**
    - **Validates: Requirements 1.6, 11.3**
  - [ ]* 17.6 Write property test for Tier Classification Determinism (Property 3)
    - **Property 3: Tier Classification Determinism**
    - **Validates: Requirements 6.11, 11.4**
  - [ ]* 17.7 Write property test for ANOVA Degrees-of-Freedom Formula Correctness (Property 4)
    - **Property 4: ANOVA df Formula Correctness**
    - **Validates: Requirements 10.1, 10.2, 10.3**


- [x] 18. Scale handling — PDF pagination and memory guards
  - [x] 18.1 In `renderObservationsSummary()`, call `checkPageBreak()` before adding each row when treatment count > 20, repeating header rows on continuation pages
    - _Requirements: 9.1_
  - [x] 18.2 In `paginate16Photos()`, release each batch from memory before beginning the next; monitor `performance.memory.usedJSHeapSize` before each batch and switch to URL-only mode when heap estimate > 512 MB, dispatching a toast notification
    - _Requirements: 9.2, 9.6_
  - [x] 18.3 In `excelReportRenderer.js` Sheet 4 (Raw Data Matrix), confirm row streaming uses `ws.addRow()` per rep when treatment count > 30; if not, refactor to streaming
    - _Requirements: 9.5_
  - [x] 18.4 In `excelReportRenderer.js` Sheet 13, add a workbook size check: if projected size > 50 MB, limit photos to URL references only and add the header comment
    - _Requirements: 9.8_

- [x] 19. Photo management system — `PhotoGallery.jsx` tag editing UI
  - [x] 19.1 Add per-photo tag schema fields to the photo objects created in the `Trials.jsx` photo capture handler: auto-populate `treatment`, `daa`, `plotNumber`, `observationId` from observation context when `isObsModalOpen === true`; set remaining fields to null when context is partial
    - _Requirements: 2.1, 2.2, 2.4, 2.5_
  - [ ]* 19.2 Write property test for photo auto-tag population (Property 9)
    - **Property 9: Photo Auto-Tag Population**
    - **Validates: Requirements 2.4**
  - [x] 19.3 Add "Edit Tags" button to each photo card in `PhotoGallery.jsx`: opens an inline form with a `direction` dropdown (Nadir, Oblique, Close-Up, Panoramic) and text inputs for `treatment`, `daa`, `plotNumber`; Save calls `updateTrial()` to persist changes
    - _Requirements: 2.6_
  - [x] 19.4 Display the `direction` sub-label beneath each photo in `PhotoGallery.jsx` thumbnail view when `direction` is non-null
    - _Requirements: 2.3, 2.8, 4.8_


- [x] 20. Update `ReportConfigPanel.jsx` — new configuration controls
  - [x] 20.1 Add Photo Mode selector (visible when "Include Photos" is enabled): `<select>` with options "Thumbnail Grid (4×4, ≤400px)" and "Full Page (1 photo/page, ≤1200px)"; pass `photoMode` through `onGenerate()`
    - _Requirements: 2.9, 13.1_
  - [x] 20.2 Add Residual Diagnostics checkbox (default checked); add Dose-Response checkbox (visible only when `preflight.hasDoseResponseData === true`); add Sector Map checkbox (visible only when `preflight.hasLargeScaleTrials === true`)
    - Compute `hasDoseResponseData` and `hasLargeScaleTrials` in pre-flight; pass new flags through `onGenerate()`
    - _Requirements: 13.2, 13.3, 13.4_
  - [x] 20.3 Add photo count warning in pre-flight summary: compute `photoCount` across `subTrials`; display amber warning "This project has N photos — thumbnail mode recommended" when `photoCount > 50`
    - _Requirements: 13.7_
  - [x] 20.4 Add Dunnett α selector (options: 5%, 10%) visible when Dunnett is the selected post-hoc method; pass value through `onGenerate()`
    - _Requirements: 13.8_
  - [x] 20.5 Update `ReportProgressModal` to receive step status updates: display progress percentage and labelled steps ("Aggregating data", "Running statistics", "Embedding charts", "Processing photos", "Generating [format] file", "Preparing download"); render a red "Error" state with error message text when a step fails
    - _Requirements: 13.5, 13.6_


- [x] 21. Wire export entry points across all pages
  - [x] 21.1 In `Reports.jsx`, verify `exportTidyCSV()` is invoked with `(projectId, subTrials, state)` and that the "Tidy CSV" button click handler always triggers a file download
    - _Requirements: 4.7, 12.4_
  - [x] 21.2 In `Reports.jsx`, verify the LargeScale "Project Report" button routes through `handleGenerateProjectReport()` with `meta.isLargeScale = true`; fix the routing error; include sector/quadrant summary table in the generated report
    - _Requirements: 4.10, 12.12_
  - [x] 21.3 In `Trials.jsx`, fix the single-trial DOCX export handler to call `exportScientificReportAsDOC()` from `exportUtils.js` with a trial-scoped ReportData that includes `buildExecutiveSummary()`
    - _Requirements: 4.9, 12.2_
  - [x] 21.4 In `Trials.jsx`, wire JSON and HTML export buttons: JSON must include complete trial record (all observation arrays, photo metadata without base64 blobs, computed statistics); HTML must be a self-contained file with inline CSS
    - _Requirements: 12.5, 12.6_
  - [x] 21.5 In `Trials.jsx`, wire TXT (Field Report) export button: fixed-width columns for treatment, DAA, primary metric, CLD letter
    - _Requirements: 12.7_
  - [x] 21.6 In `Statistics.jsx`, fix `computeCorrelationMatrix()` call to use the function from `reportDataBuilder.js` (not a local `pearsonR` helper); add `getTier()` using thresholds from `pdfReportRenderer.js` to display tier badges in the treatment means table
    - _Requirements: 4.5, 4.6_
  - [x] 21.7 In `Statistics.jsx`, ensure exports include residual diagnostics in `statsExporter.js`
    - _Requirements: 12.8_
  - [x] 21.8 In `Analytics.jsx`, add an export handler using `window.print()` or `html2canvas` → jsPDF to capture currently rendered analytics charts in a single-page PDF
    - _Requirements: 12.9_
  - [x] 21.9 In `DoseResponse.jsx`, wire `generateDoseResponsePDF()` to call the PDF renderer's dose-response section with ED10/ED50/ED90, R², model equation table, and the 4-PL curve chart
    - _Requirements: 12.11_


- [x] 22. Single-trial report completeness
  - [x] 22.1 In `Trials.jsx` single-trial PDF export path, include all parameters for the trial's category with DAA observation values; run descriptive statistics across replications if `Replication` field is present
    - _Requirements: 15.1, 15.2_
  - [x] 22.2 In single-trial PDF, group photos by DAA; use thumbnail mode when total photo count > 20; include trial card section with plot layout, QR code, and all metadata fields from Requirement 5.6
    - _Requirements: 15.3, 15.4_
  - [x] 22.3 In single-trial DOCX export, ensure executive summary, methodology section, observations table, phytotoxicity section, weather log, and conclusions are all present — not just the means table
    - _Requirements: 15.6_

- [x] 23. Checkpoint — Ensure all export entry points produce valid downloads
  - Ensure all tests pass, ask the user if questions arise.


ification
  - [x] 24.1 Audit every renderer to confirm treatment means, SD, SE, and CLD letters are read exclusively from `reportData.primaryParameter.means` — no renderer recalculates them independently
    - _Requirements: 11.1, 11.2_
  - [x] 24.2 Verify significance star thresholds (NS / * / **) and treatment ordering (mean descending, UTC/control last) are consistently applied in PDF, Excel Sheet 5, DOCX, and PPTX Slide 5
    - _Requirements: 11.3, 11.5_
  - [x] 24.3 Verify "N/A*" efficacy display and footnote for adverse-effect parameters (phytotoxicity) is consistent in PDF, DOCX, Excel Sheet 5, and PPTX ranking slide
    - _Requirements: 11.6_
  - [x] 24.4 Verify weather data table rows are identical across PDF Section 14, DOCX Section 8, Excel Sheet 11, and PPTX Conclusions slide metadata
    - _Requirements: 11.7_
  - [ ]* 24.5 Write integration tests for cross-format treatment mean consistency (Property 5)
    - **Property 5: Cross-Format Treatment Mean Consistency**
    - **Validates: Requirements 11.1, 11.2**


- [x] 25. Create test files and install fast-check
  - [x] 25.1 Install `fast-check` as a dev dependency: `npm install --save-dev fast-check`
    - _Requirements: 14 (testing)_
  - [x] 25.2 Create `src/__tests__/statsCorrectness.test.js` with property tests for tier classification (Property 3), ANOVA df correctness (Property 4), UUID uniqueness (Property 10), and category accent colour determinism (Property 2)
    - _Requirements: 6.11, 10.1, 16.1, 1.6_
  - [x] 25.3 Create `src/__tests__/reportDataBuilder.test.js` with unit tests for `buildReportData()` (minimal 2-treatment RCBD — verify required keys, non-null UUID, non-empty executive summary), `buildExecutiveSummary()` word-count bounds, and `exportTidyCSV()` header columns
    - _Requirements: 14.1, 14.4_
  - [x] 25.4 Create `src/__tests__/photoUtils.test.js` with property tests for `sortAndGroupPhotos()` (Property 7) and unit tests for `resolvePhotoSrc()` with all input shapes (string URL, `{ url }`, `{ fileData }`, `{ driveId }`, `{ fileData: '[base64-removed]' }`)
    - _Requirements: 2.7_
  - [x] 25.5 Create `src/__tests__/crossFormat.test.js` with integration tests for cross-format treatment mean consistency (Property 5) and Tidy CSV round-trip
    - _Requirements: 11.1, 14.2_

- [x] 26. Final Checkpoint — Run full test suite and confirm all tests pass
  - Ensure all tests pass, ask the user if questions arise.


---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP; core correctness is achievable without them.
- Each task references the requirement(s) it satisfies for traceability.
- Checkpoints (tasks 4, 11, 15, 23, 26) ensure incremental validation at natural breaks.
- Property tests require `fast-check` (task 25.1). All property tests are sub-tasks marked `*`.
- Unit tests for no-crash guarantees (tasks 7.4, 14.5) are also marked `*` but are high-value smoke tests.
- The dependency graph below treats all checkpoint and top-level tasks as orchestration; only leaf sub-tasks appear in waves.


## Task Dependency Graph

```json
{
  "waves": [
    {
      "id": 0,
      "tasks": ["1.1", "1.3", "1.4"]
    },
    {
      "id": 1,
      "tasks": ["1.2", "2.1", "2.2", "2.3", "2.4", "2.5", "3.1", "3.3"]
    },
    {
      "id": 2,
      "tasks": ["2.6", "2.7", "3.2", "5.1", "5.2", "5.3", "6.1", "7.1", "7.2", "7.3", "8.1", "8.2", "8.3", "8.4"]
    },
    {
      "id": 3,
      "tasks": ["5.4", "6.2", "6.3", "6.4", "7.4", "9.1", "9.2", "9.3", "9.4", "9.5", "9.6", "9.7", "9.8"]
    },
    {
      "id": 4,
      "tasks": ["10.1", "10.2", "10.3", "10.4", "10.5", "10.6", "10.7", "10.8", "12.1", "13.1", "14.1", "19.1"]
    },
    {
      "id": 5,
      "tasks": ["12.2", "12.3", "12.4", "13.2", "13.3", "13.4", "14.2", "14.3", "14.4", "16.1", "17.1", "17.2", "17.3", "17.4", "19.2", "19.3", "19.4"]
    },
    {
      "id": 6,
      "tasks": ["14.5", "16.2", "16.3", "16.4", "17.5", "17.6", "17.7", "18.1", "18.2", "18.3", "18.4", "20.1", "20.2", "20.3", "20.4", "20.5"]
    },
    {
      "id": 7,
      "tasks": ["21.1", "21.2", "21.3", "21.4", "21.5", "21.6", "21.7", "21.8", "21.9", "22.1", "22.2", "22.3"]
    },
    {
      "id": 8,
      "tasks": ["24.1", "24.2", "24.3", "24.4", "25.1"]
    },
    {
      "id": 9,
      "tasks": ["24.5", "25.2", "25.3", "25.4", "25.5"]
    }
  ]
}
```
