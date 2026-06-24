# Implementation Plan: Professional Stats and Reporting

## Overview

This plan implements all 19 requirements across 13 task groups, in dependency order. Tasks within Phase 4 and Phase 6 (marked as independent) may be executed in parallel.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 1, "tasks": ["T1"] },
    { "id": 2, "tasks": ["T2"] },
    { "id": 3, "tasks": ["T3"] },
    { "id": 4, "tasks": ["T4", "T13"] },
    { "id": 5, "tasks": ["T5", "T6"] },
    { "id": 6, "tasks": ["T7", "T8", "T9", "T10"] },
    { "id": 7, "tasks": ["T11", "T12"] }
  ]
}
```

## Tasks

- [x] 1. Implement `performShapiroWilk(residuals)` in `statsUtils.js` using Royston (1992) polynomial approximation for n = 3..5000; return `{ W, pValue, passed }` or `{ W: null, pValue: null, note: 'N/A' }` for n < 3
  - Requirements: R3
  - Files: `src/utils/statsUtils.js`

- [x] 2. Implement `performBartlettsTest(groups)` in `statsUtils.js` using chi-squared distribution via `jStat.chisquare.cdf`; `groups` is `{ [trtName]: number[] }`; return `{ chiSquared, df, pValue, passed }`
  - Requirements: R3
  - Files: `src/utils/statsUtils.js`

- [x] 3. Implement `performSNKTest(trials, options)` in `statsUtils.js` as a step-down test using Studentized Range Q-tables; reuse `assignLetterGroups` for CLD; return same shape as `performTukeyHSD`
  - Requirements: R4
  - Files: `src/utils/statsUtils.js`

- [x] 4. Implement `performBonferroniTest(trials, options)` in `statsUtils.js`; compute all pairwise t-tests with adjusted alpha = alpha / m; include advisory note when m > 20; assign CLD letters; return `{ comparisons[], adjustedAlpha, m, groups, test: 'Bonferroni' }`
  - Requirements: R4
  - Files: `src/utils/statsUtils.js`

- [x] 5. Extend `calculatePower` in `statsUtils.js` to accept `effectSize` (Cohen's f, default 0.4) and `targetPower` (default 0.80); use `jStat` non-central F to compute power; return `{ achievedPower, minNForTarget, powerCurve: [{n, power}], interpretation }`
  - Requirements: R5
  - Files: `src/utils/statsUtils.js`

- [x] 6. Implement `calculateResidualsDiagnostics(anovaResult)` in `statsUtils.js`; compute residuals and fitted values per plot; compute Q-Q data using `jStat.normal.inv` theoretical quantiles; return `{ residuals[], fittedValues[], qqData: [{theoretical, sample}], n }`
  - Requirements: R19
  - Files: `src/utils/statsUtils.js`

- [x] 7. Extend `calculateEffectSizes(anovaResult)` in `statsUtils.js` to add omega-squared (formula: `(ssTreatments - dfTreatments * msError) / (ssTotal + msError)`) and per-pair Cohen's d; update return shape to include `omegaSquared` and `cohensD`
  - Requirements: R1
  - Files: `src/utils/statsUtils.js`


- [x] 8. Export `calculateBartlettsTest` as a named export from `analysisUtils.js`; extend `AnalysisEngine.analyze()` to route `options.postHoc === 'snk'` to `performSNKTest` and `'bonferroni'` to `performBonferroniTest`; attach `calculateResidualsDiagnostics` result to `ar.residualDiagnostics` after every ANOVA run
  - Requirements: R3, R4, R10, R19
  - Files: `src/utils/analysisUtils.js`

- [x] 9. Add `computeCorrelationMatrix(subTrials, paramsWithData, category)` helper to `reportDataBuilder.js`; compute Pearson r from treatment-level means; two-tailed p-value via t-test (df = k-2); return `{ matrix, params }`; attach as `reportData.correlationMatrix`
  - Requirements: R12
  - Files: `src/services/reportDataBuilder.js`

- [x] 10. Add `buildExecutiveSummary(reportData)` function to `reportDataBuilder.js`; pure string-template function (no AI); enforce ≤ 250 words; include project details, top treatment, ANOVA significance sentence, CV% quality indicator, weather sentence if available; attach as `reportData.executiveSummary`
  - Requirements: R11
  - Files: `src/services/reportDataBuilder.js`

- [x] 11. Integrate dose-response analysis into `buildReportData`; call `performDoseResponseAnalysis` only when `distinctDosages(subTrials).length >= 3`; attach full result as `reportData.doseResponse`; omit section entirely when fewer than 3 dosage levels exist
  - Requirements: R13
  - Files: `src/services/reportDataBuilder.js`

- [x] 12. Build phytotoxicity section data in `buildReportData`; when any trial has `phytotoxicityPct > 0` compute treatment means and ANOVA for phytotoxicity; compute safety classification per treatment (Safe < 5%, Minor 5-10%, Moderate 10-25%, Severe > 25%); attach as `reportData.phytotoxicity`; set `allZero: true` when all values are zero
  - Requirements: R18
  - Files: `src/services/reportDataBuilder.js`

- [x] 13. Attach residual diagnostics to `reportData.residualDiagnostics` after primary parameter ANOVA is computed in `buildReportData`; call `calculateResidualsDiagnostics` from statsUtils; only attach when n >= 6
  - Requirements: R19
  - Files: `src/services/reportDataBuilder.js`

- [x] 14. Implement `exportTidyCSV(projectId, subTrials, state)` in `reportDataBuilder.js`; build tidy-format CSV with one row per trial × DAA observation; include all columns: ProjectID, ProjectName, TrialID, PlotNumber, BlockID, TreatmentName, DosageValue, DosageUnit, BBCH, GPSLatitude, GPSLongitude, SoilPH, SoilClay, DAA, ObservationDate plus one column per observation parameter; use empty string for missing values; trigger browser download with filename `[ProjectName]_tidy_data_[YYYY-MM-DD].csv`
  - Requirements: R15
  - Files: `src/services/reportDataBuilder.js`

- [x] 15. Create `src/services/statsExporter.js` with `exportStatsPDF(results, options)` that builds a 1-3 page PDF (config header, treatment means + CLD, ANOVA table, precision stats, 4-test assumptions table, effect sizes η²/ω²/f, pairwise comparisons); file naming: `stats_[ProjectName]_[TestType]_[YYYY-MM-DD].pdf`; silently return without file when `results.error` is set
  - Requirements: R1
  - Files: `src/services/statsExporter.js` (NEW)

- [x] 16. Add `exportStatsExcel(results, options)` to `src/services/statsExporter.js`; two-sheet workbook (Sheet 1: treatment means + ANOVA with 4dp numeric format; Sheet 2: assumptions + effect sizes); file naming: `stats_[ProjectName]_[TestType]_[YYYY-MM-DD].xlsx`; silently return without file when `results.error` is set
  - Requirements: R1
  - Files: `src/services/statsExporter.js`


- [x] 17. Add Export PDF and Export Excel buttons to `Statistics.jsx` next to the existing Export CSV button; wire to `exportStatsPDF` and `exportStatsExcel` from statsExporter; disable both buttons when `results === null` or `results.error`; show loading spinner during export; name files per pattern `stats_[ProjectName]_[TestType]_[YYYY-MM-DD]`
  - Requirements: R1
  - Files: `src/pages/Statistics.jsx`

- [x] 18. Add SNK and Bonferroni to the Statistical Test dropdown in `Statistics.jsx` under the Post-Hoc Comparisons group; wire SNK case to `performSNKTest` and Bonferroni case to `performBonferroniTest` in the `runAnalysis` callback
  - Requirements: R4
  - Files: `src/pages/Statistics.jsx`

- [x] 19. Replace the 2-test Assumptions Validation card in `Statistics.jsx` with a 4-test table showing Jarque-Bera, Shapiro-Wilk, Levene's, and Bartlett's; wire Shapiro-Wilk from `performShapiroWilk(residuals)` and Bartlett from `performBartlettsTest(groups)` computed from ANOVA result; show conflict advisory when JB and SW disagree; show heteroscedasticity advisory when both Levene and Bartlett fail
  - Requirements: R3
  - Files: `src/pages/Statistics.jsx`

- [~] 20. Build dedicated Power Analysis input panel in `Statistics.jsx` shown when `test === 'power'`; fields: k (pre-populated from selected project's treatment count), n, effectSize (default 0.4), targetPower (0.70/0.80/0.90); live-recompute on every field change; display achieved power, min-n result, interpretation badge; render power curve chart via `<PowerAnalysisPanel>`
  - Requirements: R5
  - Files: `src/pages/Statistics.jsx`

- [~] 21. Add Tier Classification badges to the treatment means table in `Statistics.jsx` post-hoc results; thresholds for control-pct metrics: Excellent >= 80% (green), Good 60-79% (yellow), Fair 40-59% (orange), Poor < 40% (red); for non-percentage metrics show rank number only; apply same thresholds as the Report_Engine ranking table
  - Requirements: R9
  - Files: `src/pages/Statistics.jsx`

- [~] 22. Add Correlation Panel to `Statistics.jsx` below the precision stats card; show Pearson r and p-value between primary metric and each secondary metric; only render when >= 2 parameters are present; display significance stars (* p < 0.05, ** p < 0.01)
  - Requirements: R12
  - Files: `src/pages/Statistics.jsx`

- [~] 23. Show `results.effectSizes.omegaSquared` in the Effect Sizes card in `Statistics.jsx` alongside existing eta-squared and Cohen's f
  - Requirements: R1
  - Files: `src/pages/Statistics.jsx`

- [~] 24. Create `src/components/StatsChartPanel.jsx`; render horizontal bar chart (means + SE error bars + CLD labels) and box plot using Chart.js; render dose-response scatter + 4PL curve when `test === 'doseresp'`; provide "Download PNG" button per chart using `canvas.toDataURL`; display informational message when < 2 groups have sufficient data
  - Requirements: R2
  - Files: `src/components/StatsChartPanel.jsx` (NEW)

- [~] 25. Create `src/components/ResidualDiagnosticsPanel.jsx`; collapsible panel below ANOVA results; renders residuals histogram (normal curve overlay), Q-Q plot (45° reference line), fitted vs residuals scatter using Chart.js; shows normality test annotation beneath Q-Q plot; shows "Insufficient data" message when n < 6
  - Requirements: R19
  - Files: `src/components/ResidualDiagnosticsPanel.jsx` (NEW)

- [~] 26. Create `src/components/PowerAnalysisPanel.jsx`; controlled inputs for k, n, effectSize, alpha, targetPower; renders power curve chart with dashed target-power horizontal line and min-n vertical line; interpretation badge (Insufficient < 0.70, Acceptable 0.70-0.79, Good 0.80-0.89, Excellent >= 0.90)
  - Requirements: R5
  - Files: `src/components/PowerAnalysisPanel.jsx` (NEW)


- [~] 27. Refactor `pdfReportRenderer.js` entry point to a template router; `generateProjectPDF(reportData, options)` routes to `renderStandard`, `renderScientificJournal`, `renderFieldSummaryCard`, or `renderRegulatorySubmission` based on `options.template`; all four functions receive the same `reportData` object
  - Requirements: R6
  - Files: `src/services/pdfReportRenderer.js`

- [~] 28. Add Executive Summary section to `pdfReportRenderer.js` Standard and Regulatory templates; position on page 2 immediately after the cover page; render `reportData.executiveSummary` text; maximum 250 words enforced during build phase
  - Requirements: R11
  - Files: `src/services/pdfReportRenderer.js`

- [~] 29. Add Treatment Ranking Table section to `pdfReportRenderer.js` Standard, Scientific Journal, and Regulatory templates; columns: Rank, Treatment Name, Mean ± SE, Efficacy %, CLD, Tier; colour-coded tier fills (Excellent green, Good yellow, Fair orange, Poor red); UTC/control listed last; position after ANOVA table and before time-series
  - Requirements: R9
  - Files: `src/services/pdfReportRenderer.js`

- [~] 30. Embed treatment means bar chart PNG in `pdfReportRenderer.js` Standard and Regulatory templates immediately after the treatment means table; render Chart.js horizontal bar chart on off-screen canvas (1200x500px), export to base64 PNG, embed via `doc.addImage`; on Canvas API failure log error and skip chart without aborting report
  - Requirements: R8
  - Files: `src/services/pdfReportRenderer.js`

- [~] 31. Embed time-series line chart PNG in `pdfReportRenderer.js` when time-series data has >= 2 DAA timepoints; one line per treatment with DAA on x-axis; rendered and embedded same way as bar chart; skip on failure
  - Requirements: R8
  - Files: `src/services/pdfReportRenderer.js`

- [~] 32. Add Correlation Matrix section to `pdfReportRenderer.js`; table with parameter labels on both axes; highlight significant cells with asterisks; show "N/A" when fewer than 4 treatment pairs available; position after multi-parameter ANOVA summary and before dose-response
  - Requirements: R12
  - Files: `src/services/pdfReportRenderer.js`

- [~] 33. Add Dose-Response section to `pdfReportRenderer.js`; include results table (ED10, ED50, ED90, slope, min, max, R², model, dose unit); embed dose-response curve PNG; include caution note when R² < 0.70; omit entirely when `reportData.doseResponse === null`
  - Requirements: R13
  - Files: `src/services/pdfReportRenderer.js`

- [~] 34. Add Phytotoxicity and Crop Safety section to `pdfReportRenderer.js`; render when `reportData.phytotoxicity.hasData === true`; treatment means table with safety classification column (colour-coded); render single "no phytotoxic effects" sentence when `allZero === true`; in Regulatory template position immediately after main efficacy section
  - Requirements: R18
  - Files: `src/services/pdfReportRenderer.js`

- [~] 35. Add Residual Diagnostic Plots section to `pdfReportRenderer.js` for Standard and Regulatory templates; embed 3 Chart.js canvas PNGs: residuals histogram, Q-Q plot (with normality test annotation), fitted vs residuals scatter; show "Insufficient data" note when n < 6; skip in Field Summary Card template
  - Requirements: R19
  - Files: `src/services/pdfReportRenderer.js`

- [~] 36. Implement Scientific Journal template in `pdfReportRenderer.js`; two-column A4 layout (left col 14-96mm, right col 110-195mm); 8pt body text, 9pt bold section headings; no decorative colour bands; monochrome table headers; charts at 82mm single-column width; table of contents when > 50 pages
  - Requirements: R6
  - Files: `src/services/pdfReportRenderer.js`

- [~] 37. Implement Field Summary Card template in `pdfReportRenderer.js`; single A4 page; large project name header + location + date; top-ranked treatment callout box (name, mean, CLD, tier badge); first available photo (40x30mm); horizontal stat strip with CV%, LSD 5%, grand mean; one plain-language conclusion paragraph ≤ 100 words
  - Requirements: R6
  - Files: `src/services/pdfReportRenderer.js`

- [~] 38. Implement Regulatory Submission template in `pdfReportRenderer.js`; cover page with study number, protocol reference, sponsor, test facility, GLP/GEP compliance statement; decimal heading numbering (1.0, 1.1, etc.); investigator signature block on last page; page numbering "Page N of M" bottom-right
  - Requirements: R6
  - Files: `src/services/pdfReportRenderer.js`

- [~] 39. Add Sheet 14 Correlation Matrix to `excelReportRenderer.js`; parameter labels on row 1 and column A; Pearson r values with significance star annotations; conditional fill: green when |r| > 0.7 and p < 0.05
  - Requirements: R12
  - Files: `src/services/excelReportRenderer.js`

- [~] 40. Add Sheet 15 Tidy Data to `excelReportRenderer.js`; full tidy-format with all columns from Requirement 15; one row per trial × DAA observation; empty string for missing values
  - Requirements: R15
  - Files: `src/services/excelReportRenderer.js`


- [~] 41. Add Executive Summary section to `docxReportRenderer.js` inserted after title page as Section 1; renumber existing sections; render `reportData.executiveSummary` as body paragraph
  - Requirements: R11
  - Files: `src/services/docxReportRenderer.js`

- [~] 42. Add Treatment Ranking Table section to `docxReportRenderer.js` after ANOVA table and before time-series; same content as PDF ranking table (rank, treatment, mean ± SE, efficacy %, CLD, tier with shading)
  - Requirements: R9
  - Files: `src/services/docxReportRenderer.js`

- [~] 43. Add Phytotoxicity and Crop Safety section to `docxReportRenderer.js`; safety classification table with shading; all-zero sentence; positioned after main efficacy section
  - Requirements: R18
  - Files: `src/services/docxReportRenderer.js`

- [~] 44. Add Correlation Matrix table section to `docxReportRenderer.js` using `makeTable` helper; position after multi-parameter ANOVA summary
  - Requirements: R12
  - Files: `src/services/docxReportRenderer.js`

- [~] 45. Add Dose-Response results table section to `docxReportRenderer.js` (no embedded chart; text note references the Excel output for curve visualization); position after correlation matrix
  - Requirements: R13
  - Files: `src/services/docxReportRenderer.js`

- [~] 46. Create `src/services/pptxReportRenderer.js`; import pptxgenjs; implement `generateProjectPPTX(reportData, options)`; apply category accent colour to slide header backgrounds and chart bar fills
  - Requirements: R7
  - Files: `src/services/pptxReportRenderer.js` (NEW)

- [~] 47. Add Title slide to `pptxReportRenderer.js`; project name (44pt bold), category + date (24pt), trial count subtitle
  - Requirements: R7
  - Files: `src/services/pptxReportRenderer.js`

- [~] 48. Add Trial Design slide to `pptxReportRenderer.js`; info card with design type, n treatments x n reps, application dates, target species
  - Requirements: R7
  - Files: `src/services/pptxReportRenderer.js`

- [~] 49. Add Treatment Means Bar Chart slide to `pptxReportRenderer.js` using `prs.addChart`; horizontal bar chart with treatment means as data series; category colour fill; mean value data labels
  - Requirements: R7
  - Files: `src/services/pptxReportRenderer.js`

- [~] 50. Add ANOVA Results Table slide to `pptxReportRenderer.js` using `prs.addTable`; F and p cells highlighted green if significant, grey if NS
  - Requirements: R7
  - Files: `src/services/pptxReportRenderer.js`

- [~] 51. Add Treatment Ranking slide to `pptxReportRenderer.js`; numbered list with tier badge rectangles (colour per tier); add Conclusions slide with 3 auto-generated bullet sentences from reportData
  - Requirements: R7
  - Files: `src/services/pptxReportRenderer.js`

- [~] 52. Add optional Photos slide to `pptxReportRenderer.js` (up to 6 photos, 2x3 grid) when `options.includePhotos === true` and photos exist; convert photo URLs to base64 before adding; add error guard: when < 2 treatments throw error and show toast without generating file; filename: `[ProjectName]_[Category]_Trial_Summary_[YYYY-MM-DD].pptx`
  - Requirements: R7
  - Files: `src/services/pptxReportRenderer.js`

- [~] 53. Add Report Template selector to `ReportConfigPanel.jsx` with 4 options: Standard, Scientific Journal, Field Summary Card, Regulatory Submission; pass `template` in `onGenerate` options; add SNK and Bonferroni to the Post-hoc Test dropdown; add PPTX as 4th format button alongside PDF, Excel, DOCX
  - Requirements: R4, R6, R7
  - Files: `src/components/ReportConfigPanel.jsx`

- [ ] 54. Wire PPTX format in `Reports.jsx` by adding `case 'pptx'` to `handleGenerateProjectReport` calling `generateProjectPPTX(reportData, reportOptions)` from pptxReportRenderer; add Tidy Data Export CSV button in Single Trial Export Hub calling `exportTidyCSV(selectedProjectId, projectTrials, state)` from reportDataBuilder
  - Requirements: R7, R15
  - Files: `src/pages/Reports.jsx`

- [ ] 55. Add optional structured plot-level input fields to the trial edit form: PlotNumber (integer, unique per project), BBCHCode (validated via eppoBBCHData.js with inline growth stage description tooltip), GPSLatitude (-90 to 90), GPSLongitude (-180 to 180), SoilPH (0-14), SoilClay (0-100); validate all fields and show per-field error messages; show duplicate PlotNumber warning
  - Requirements: R14
  - Files: `src/pages/Trials.jsx` (or relevant trial edit component)

- [ ] 56. Add PhytotoxicityPct (0-100 slider + numeric input) and PhytotoxicityNotes fields to the observation entry form within the trial record
  - Requirements: R18
  - Files: `src/pages/Trials.jsx` or PlotScanner observation entry

- [ ] 57. Add baseline observation support: store in `BaselineObservations` (JSON array, daa=0) on trial record; show warning dialog when user enters first post-spray observation (DAA > 0) without a baseline; show green check / amber warning icon on trial card and trial list row based on baseline presence
  - Requirements: R16
  - Files: `src/pages/Trials.jsx`, trial card component

- [ ] 58. Add Yield Data Entry panel to trial edit view with fields: PlotNumber (read-only), YieldValue (required), YieldUnit (dropdown: t/ha, kg/ha, bu/ac, kg/plot), GrainMoisture, ThousandGrainWeight, YieldNotes; show outlier warning when value > 20x project mean without blocking save; persist to EfficacyDataJSON yield key at harvest DAA and YieldDetails object
  - Requirements: R17
  - Files: `src/pages/Trials.jsx`

- [ ] 59. Add SoilPH and SoilClay as selectable covariates in the ANCOVA Covariate Factor selector in Statistics.jsx when those fields have data on the selected project's trial records; sort all trial records within a project by PlotNumber as the primary sort key in all views and exports
  - Requirements: R14
  - Files: `src/pages/Statistics.jsx`, `src/pages/Trials.jsx`

## Notes

- All new statistical functions must pass the 10 correctness property checks defined in design.md before merging
- pptxgenjs is already installed (`"pptxgenjs": "^4.0.1"` in package.json)
- Chart.js is already installed (`"chart.js": "^4.5.1"`)
- jStat is already installed (`"jstat": "^1.9.6"`)
- ExcelJS and docx are already installed
- All new fields on trial records are optional and backward-compatible; existing records without them will not break
- Phase 6 renderers (tasks 27-52) can be developed in parallel once Phase 3 (reportDataBuilder) is complete

