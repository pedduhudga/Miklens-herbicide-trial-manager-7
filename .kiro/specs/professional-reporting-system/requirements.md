# Requirements Document

## Introduction

The Professional Reporting System is a comprehensive overhaul of the existing report generation pipeline in the Miklens Agrochemical Trial Manager (React + Vite PWA). The system manages field trials across five categories — Herbicide, Fungicide, Pesticide, Nutrition, and Biostimulant — and must produce scientifically rigorous, regulator-ready reports across PDF (four templates), Excel (13-sheet workbook), DOCX, PPTX, CSV, JSON, HTML, and TXT formats. This overhaul addresses confirmed scaffolding gaps, a critical photo-at-scale crash problem, missing statistical chart embeddings, incomplete PDF templates, and broken export entry points. Every requirement is grounded in direct analysis of the existing source files: `reportDataBuilder.js`, `pdfReportRenderer.js`, `docxReportRenderer.js`, `excelReportRenderer.js`, `pptxReportRenderer.js`, `pptxReportRenderer.js`, `statsUtils.js`, `photoUtils.js`, `PhotoGallery.jsx`, `ReportConfigPanel.jsx`, and `Reports.jsx`.

---

## Glossary

- **Report_System**: The full reporting pipeline from data aggregation through file download.
- **ReportData**: The structured object produced by `buildReportData()` and consumed by all renderers.
- **PDF_Renderer**: The module `pdfReportRenderer.js` responsible for all PDF output.
- **Excel_Renderer**: The module `excelReportRenderer.js` producing 13-sheet workbooks.
- **DOCX_Renderer**: The module `docxReportRenderer.js` producing Word documents.
- **PPTX_Renderer**: The module `pptxReportRenderer.js` producing PowerPoint presentations.
- **ReportDataBuilder**: The module `reportDataBuilder.js` that aggregates trial data and runs statistics.
- **AnalysisEngine**: The statistical engine (`analysisUtils.js`) invoked by ReportDataBuilder.
- **StatsUtils**: The module `statsUtils.js` implementing ANOVA, Tukey HSD, Dunnett, and diagnostics.
- **Photo_Manager**: The system responsible for tagging, grouping, and rendering photos.
- **PhotoGallery**: The UI component `PhotoGallery.jsx` for capturing and displaying photos.
- **DAA**: Days After Application — the observation timing dimension.
- **CLD**: Compact Letter Display — the post-hoc significance grouping letters.
- **UTC**: Untreated Control — the baseline treatment for efficacy calculations.
- **WCE**: Weed Control Efficacy percentage (Herbicide category primary metric).
- **DCE**: Disease Control Efficacy percentage (Fungicide category primary metric).
- **PRE**: Pest Reduction Efficacy percentage (Pesticide category primary metric).
- **RCBD**: Randomised Complete Block Design.
- **CRD**: Completely Randomised Design.
- **Tier**: Efficacy classification — Excellent (≥ 80%), Good (60–79%), Fair (40–59%), Poor (< 40%).
- **GLP**: Good Laboratory Practice — regulatory reporting standard.
- **GEP**: Good Experimental Practice — field trial reporting standard.
- **AUDPC**: Area Under the Disease Progress Curve (Fungicide observations).
- **LargeScale_Trial**: A trial using the GPS sector / quadrant design type.
- **Photo_Tag**: Metadata linking a photo to a specific treatment, DAA, plot, or observation.
- **Thumbnail_Grid**: A 4×4 or configurable grid of reduced-size photo thumbnails for PDF embedding.
- **Residual_Diagnostics**: Statistical charts (histogram, Q-Q plot, fitted vs. residuals) verifying ANOVA assumptions.
- **Dose_Response**: The 4-parameter logistic model producing ED50, ED90, R² values.
- **Standard_Check**: A commercially registered reference treatment used as a performance benchmark.
- **Audit_Trail**: Machine-generated metadata block appended to every report recording generation provenance for GLP/GEP traceability.
- **Report_UUID**: A version-4 UUID assigned to each generated report file for unambiguous identification.
- **Compact_Template**: Templates that must fit within a constrained page count — Field Summary Card (1 page) and Scientific Journal (condensed multi-page). These templates may omit entirely empty parameter columns.
- **Comprehensive_Template**: Templates that include all sections regardless of data density — Standard and Regulatory Submission.
- **Experimental_Layout**: The randomised plot-to-treatment assignment map for a trial, recorded at design time and reproduced verbatim in Appendix D of comprehensive reports.
- **Data_Completeness**: The ratio of recorded non-null observations to expected observations (treatments × replications × DAA points), expressed as a percentage and surfaced in the Data Quality Summary block.

---

## Requirements

### Requirement 1: Universal Report Quality Standards

**User Story:** As a trial investigator, I want every generated report to meet professional scientific standards, so that outputs are suitable for submission to regulators, journals, and clients without manual reformatting.

#### Acceptance Criteria

1. THE Report_System SHALL include a title page in every report containing the project name, investigator name, organisation, location, GPS coordinates (decimal degrees to 6 decimal places), crop, variety, trial design, category, application date(s), and a logo placeholder area.
2. IF a report spans more than one page THEN THE Report_System SHALL include a table of contents in all multi-page PDF and DOCX reports that lists every numbered section with its page number; ELSE single-page reports shall omit the table of contents.
3. WHEN a report is generated, THE Report_System SHALL include a dynamic executive summary whose word limit and structure vary by template: Field Summary Card = 80–120 words (treatment count, top treatment, primary efficacy%, significance result only); Standard = 150–250 words (objectives, treatments, replications, ANOVA F and p, top treatment with CLD, CV% with interpretation: ≤10% = Excellent, 10–20% = Acceptable, >20% = Poor — repeat recommended, mean air temperature if present); Regulatory Submission = 250–350 words (full Standard content plus GLP compliance statement and protocol reference); Scientific Journal = structured abstract with four labelled paragraphs: Objective, Materials and Methods, Key Results (top treatment mean ± SE, CLD letter, primary efficacy%), and Conclusions — no word count limit applies to the Journal abstract.
4. THE Report_System SHALL render a "Confidential — For Research Purposes Only" footer on the title page of all PDF and DOCX outputs.
5. WHEN any report section has no data for a parameter, THE Report_System SHALL render a placeholder row or cell containing "—" rather than omitting the column or crashing.
6. THE Report_System SHALL apply category-specific accent colours consistently across section headings, table header rows, chart fill colours, and tier badge backgrounds across all report formats: teal (#0D9488) for Herbicide, indigo (#4F46E5) for Fungicide, red (#DC2626) for Pesticide, amber (#D97706) for Nutrition and Biostimulant.
7. WHEN a trial design is CRD or Pot Trial, THE Report_System SHALL label the ANOVA source table with "CRD model" or "Pot Trial (CRD) model" instead of the default RCBD label.
8. THE Report_System SHALL include a conclusions and recommendations section in every report that states whether treatment differences were statistically significant, names the top-performing treatment(s), and recommends further replication if the test was non-significant.
9. THE Report_System SHALL produce a glossary appendix in PDF and DOCX reports defining all parameter abbreviations used in that specific report.
10. WHEN a report is generated with fewer than 2 treatment groups, THE Report_System SHALL display a warning message in the report and skip all ANOVA and post-hoc sections rather than rendering empty or errored tables.
11. THE Report_System SHALL assign sequential identifiers to all tables and figures in PDF and DOCX outputs: tables SHALL be labelled "Table 1", "Table 2", etc. and figures SHALL be labelled "Figure 1", "Figure 2", etc. in the order they appear in the document; each label SHALL be followed by a concise caption describing the content (e.g. "Table 3. ANOVA source table — RCBD model, weed cover % at 21 DAA").

---

### Requirement 2: Photo Management and Tagging System

**User Story:** As a field investigator, I want every photo to be tagged with its treatment, DAA, plot number, and observation context, so that large photo sets can be correctly grouped in reports and never mixed between treatments.

#### Acceptance Criteria

1. THE Photo_Manager SHALL store a `treatment` tag, a `daa` tag, a `plotNumber` tag, and an `observationId` tag on every photo object at capture time.
2. THE Photo_Manager SHALL store a `direction` metadata field (values: Nadir, Oblique, Close-Up, Panoramic) on every photo object.
3. WHEN a photo with a non-null `direction` field is rendered in PhotoGallery or a report photo section, THE Photo_Manager SHALL display the direction value as a sub-label beneath the photo.
4. WHEN a photo is captured during an observation entry, THE Photo_Manager SHALL automatically populate the `daa`, `treatment`, and `plotNumber` tags from the current observation context without requiring manual user input.
5. WHEN observation context is partially available at capture time, THE Photo_Manager SHALL populate only the available tags and leave the rest as null — not throw an error.
6. THE Photo_Manager SHALL provide a UI control in PhotoGallery that allows the user to manually set or correct the `treatment`, `daa`, `plotNumber`, `direction`, and `observationId` tags on any existing photo, and SHALL persist the updated tag values to the underlying photo record so that the corrections are immediately reflected in gallery and report views.
7. WHEN photos are included in a PDF report, THE Report_System SHALL sort and group photos in the order: Treatment → DAA → Plot Number → Capture Time (ascending), with a labelled sub-heading for each Treatment/DAA/Plot group. Photos where `treatment`, `daa`, or `plotNumber` tags are null SHALL be collected into a final 'Untagged Photos' group at the end of the photo documentation section, sorted by capture time ascending within that group.
8. WHEN a project contains more than 50 photos, THE Report_System SHALL render photos in thumbnail mode (4×4 grid per page, maximum 600 px resolution) by default, rather than full-page mode, to prevent PDF generation from crashing or producing corrupt output.
9. THE Report_System SHALL support a user-selectable photo display mode: "Thumbnail Grid" (4×4, up to 400 px) or "Full Page" (1 photo per page, up to 1200 px), configurable in the ReportConfigPanel before generation.
10. WHEN a photo has an `aiResult` object, THE Report_System SHALL display the AI analysis summary (detected species, cover percentage, bounding box count) as a caption beneath the photo in all PDF, PPTX, and DOCX report photo sections.
11. WHEN the Excel report's "Photos" sheet is generated, THE Report_System SHALL resolve each photo's URL using `resolvePhotoSrc()` from `photoUtils.js` and output the resolved URL rather than a raw `driveId`, `fileData`, or `[base64-removed]` placeholder. WHEN a photo URL resolves to null, THE Excel_Renderer SHALL write 'Image unavailable' in the URL cell rather than an empty string.
12. WHEN a PPTX report's photo slide contains more than 6 photos, THE Report_System SHALL split the photos across multiple slides (maximum 6 photos per slide, 2×3 grid layout) rather than truncating to 6 or crashing.
13. THE Photo_Manager SHALL not embed base64-encoded image data into any report renderer that produces file downloads exceeding 50 MB; instead, THE Photo_Manager SHALL use Drive thumbnail URLs or reduced-resolution JPEG data URIs at a maximum of 400 px on the longest edge.
14. IF a photo's resolved source URL returns null (broken or stripped image), THEN THE Report_System SHALL render a grey placeholder rectangle with the label "Image unavailable" instead of throwing a rendering error.

---

### Requirement 3: Complete PDF Template Implementation

**User Story:** As a researcher, I want all four PDF templates (Standard, Scientific Journal, Field Summary Card, Regulatory Submission) to produce complete, correctly rendered documents, so that I can choose the appropriate format for each audience.

#### Acceptance Criteria

1. THE PDF_Renderer SHALL fully implement the Standard template by rendering all 16 sections defined in Requirement 7 (report structure), producing a valid, non-corrupt PDF for any project with ≥ 2 treatments and ≥ 2 replications.
2. THE PDF_Renderer SHALL fully implement the Scientific Journal template using a 2-column layout, 9pt body font, condensed section headings with decimal numbering (1., 1.1, 1.2), a structured abstract containing: Objective, Materials and Methods summary, Key Results (top treatment, mean ± SE, CLD letter, primary efficacy%), and Conclusions; and a references/appendix section — not a scaffold or stub.
3. WHEN the Scientific Journal template is selected, THE PDF_Renderer SHALL fit the treatment means table, ANOVA source table, and post-hoc CLD table each within a single column (≤ 90 mm width) without overflowing into the gutter or adjacent column.
4. THE PDF_Renderer SHALL fully implement the Field Summary Card template as a single A4 page containing a compact metadata header, a treatment-means table (top 5 treatments + UTC), a tier badges row, and a single horizontal bar chart of treatment means for the primary parameter at the final DAA observation point — no multi-page flow.
5. WHEN the Field Summary Card template is selected and the project contains more than 5 non-control treatments, THE PDF_Renderer SHALL display only the top 5 ranked treatments (ranked by primary efficacy% computed at the final DAA observation point) plus the UTC in the means table, with a footnote stating how many additional treatments were omitted.
6. THE PDF_Renderer SHALL fully implement the Regulatory Submission template with: a GLP/GEP cover page containing protocol number, Study Director name and signature line, Sponsor name, Site code, Statement of GLP compliance, and Date field; decimal-numbered section headings (1.0, 2.0, 2.1); a signature and date block on the final page; and all body sections from the Standard template.
7. WHEN the Regulatory Submission template is selected, THE PDF_Renderer SHALL include an "Amendment History" table on the cover page with columns: Version, Date, Description, Author — pre-populated with Version 1.0 and the current date.
8. THE PDF_Renderer SHALL render all four templates using the same `generateProjectPDF()` routing function and the existing `options.template` switch, without introducing new entry points or breaking the current `ReportConfigPanel` UI.

---

### Requirement 4: Confirmed Gap Fixes

**User Story:** As a developer, I want all 15 confirmed broken or scaffolded items resolved, so that the reporting system behaves consistently across all features already visible in the UI.

#### Acceptance Criteria

1. WHEN a user selects "Scientific Journal" or "Field Summary Card" or "Regulatory Submission" in the ReportConfigPanel and clicks Generate, THE PDF_Renderer SHALL produce a fully populated document for that template, not an empty or stub PDF.
2. WHEN any trial contains phytotoxicity observation data (`phytotoxicityPct` field), THE Report_System SHALL render a dedicated "Phytotoxicity Assessment" section in all PDF, DOCX, and Excel outputs containing a treatment-vs-DAA data table and a bar chart; WHEN all values are zero, THE Report_System SHALL render the section with the note "No phytotoxicity observed" rather than omitting it.
3. THE PDF_Renderer SHALL embed the ResidualDiagnosticsPanel outputs (histogram of residuals, Q-Q plot, fitted-vs-residuals scatter) as rasterised chart images in all PDF reports that contain ANOVA results, using the same `renderChartCanvas()` helper already used for bar and time-series charts.
4. WHEN a project has dose-response data (`doseResponseUtils.js` output), THE PDF_Renderer SHALL render the ED50/ED90 values in a dose-response results table and embed the 4-PL curve chart image in the PDF, in all PDF templates except Field Summary Card.
5. THE Report_System SHALL implement the Tier classification badge display on the Statistics page (`Statistics.jsx` page component) by mapping the computed mean efficacy percentage to one of four tier labels (Excellent, Good, Fair, Poor) using the thresholds defined in the Treatment Ranking section of `pdfReportRenderer.js`; tier badges SHALL appear in the treatment means table rendered on that page.
6. THE Report_System SHALL complete the correlation panel on the Statistics page by calling `computeCorrelationMatrix()` from `reportDataBuilder.js` (NOT a local `pearsonR` helper) and rendering the resulting matrix heatmap table, with significant cells (p < 0.05) highlighted.
7. THE Export Hub on the Reports page SHALL wire the "Tidy CSV" button to call `exportTidyCSV()` from `reportDataBuilder.js` using the currently selected project, so that clicking the button always triggers a download — no broken invocation paths.
8. WHEN a photo has a `direction` field with a value other than `null` or empty string, THE Report_System SHALL display the direction value as a sub-label beneath the photo in all report photo sections and in the PhotoGallery thumbnail view.
9. THE DOCX_Renderer SHALL include a fully populated executive summary section in every generated DOCX report, using the `buildExecutiveSummary()` function from `reportDataBuilder.js` — not a placeholder paragraph.
10. WHEN a LargeScale trial is selected on the Trials page, THE Report_System SHALL make the "Project Report" button active and functional, routing through the same `handleGenerateProjectReport()` flow used by standard projects, with a sector/quadrant summary table in the report.
11. WHEN a project contains photos resolved via `resolvePhotoSrc()`, THE Excel_Renderer "Photos" sheet SHALL write the resolved URL string (or Drive thumbnail URL) to column D, not a raw `driveId`, empty string, or `[base64-removed]` marker.
12. WHEN a PPTX report photo slide is generated and the project contains more than 6 photos, THE PPTX_Renderer SHALL distribute photos across multiple slides and SHALL NOT throw a crash or produce a corrupt PPTX file.
13. THE PDF_Renderer's Scientific Journal 2-column layout function SHALL produce a valid rendered output with actual 2-column page geometry, not a single-column fallback or scaffold.
14. THE PDF_Renderer's Regulatory Submission template SHALL produce a GLP/GEP cover page, decimal-numbered headings, and a signature block — not an empty or stub function body.
15. WHEN the ANCOVA covariate selector is displayed and soil data fields (`SoilPH`, `SoilClay`, `SoilOC`) are absent for the selected trials, THE Report_System SHALL disable the ANCOVA covariate selector and display an inline message "Soil covariate data not available for this project" rather than rendering an empty dropdown or crashing.

---

### Requirement 5: Parameter Completeness Across All Five Categories

**User Story:** As a trial investigator, I want every data parameter I recorded for each crop protection category to appear in the relevant report sections, so that no collected data is silently omitted from scientific outputs.

#### Acceptance Criteria

1. WHEN a Herbicide trial report is generated, THE Report_System SHALL include all of the following observation parameters in the data table section of PDF, DOCX, and Excel outputs for each DAA: `weedCover%`, weed species detail (species name, cover%, status), `phytotoxicityPct`, `phytotoxicityNotes`, and `weatherAtObs` (temperature, humidity, wind speed at observation time).
2. WHEN a Fungicide trial report is generated, THE Report_System SHALL include all of the following observation parameters in the data table section of PDF, DOCX, and Excel outputs per DAA: `diseaseSeverity%`, `diseaseIncidence%`, `greenLeafArea%`, `plantHealthScore`, `phytotoxicity`, `lesionCountAvg`, `chloroticHaloIncidence`, `defoliationPct`, and `AUDPC`.
3. WHEN a Pesticide trial report is generated, THE Report_System SHALL include all of the following observation parameters in the data table section of PDF, DOCX, and Excel outputs per DAA: `pestCount`, `liveInsectCount`, `deadInsectCount`, `eggCount`, `larvaCount`, `adultCount`, `damageRating`, `feedingDamagePct`, `beneficialCount`, `phytotoxicity`, `sootyMoldSeverity`, `frassIncidence`, `leafCurlingSeverity`, and Abbott's formula result.
4. WHEN a Nutrition trial report is generated, THE Report_System SHALL include all of the following observation parameters in the data table section of PDF, DOCX, and Excel outputs per DAA: `visualVigor`, `deficiencySeverity`, `leafColorScore` (LCC), `interveinalChlorosis`, `leafMarginNecrosis`, `chlorophyllIndex` (SPAD), `plantHeight`, and `tillerCount`.
5. WHEN a Biostimulant trial report is generated, THE Report_System SHALL include all of the following observation parameters in the data table section of PDF, DOCX, and Excel outputs per DAA: `overallVigor`, `shootVigor`, `abioticStressRecovery`, `leafAreaIndexEstimated`, `shootDensityScore`, `wiltingIndex`, `plantHeight`, `chlorophyllIndex`, `rootBiomass`, `shootBiomass`, `rootLength`, `leafCount`, and `noduleCount`.
6. THE Report_System SHALL include the following trial-level fields in the Trial Design and Methodology section of every report: `FormulationName`, `Dosage` (with unit), `Date`, `InvestigatorName`, `Location`, `GPS` (Lat/Lon), `Temperature`, `Humidity`, `Windspeed`, `Rain`, `Replication`, `PlotNumber`, `BBCHCode`, `SoilPH`, `SoilClay`, `SoilSand`, `SoilOC`, `SoilTexture`, `Crop`, `Variety`, `PreviousCrop`, `IrrigationMethod`, `PlantPopulation`, `TrialDesign`, and `ApplicationTiming`.
7. IF yield data (`YieldValue` field) is present for at least one treatment in the project THEN THE Report_System SHALL include the following trial-level fields in the Yield Analysis section: `YieldValue`, `YieldUnit`, `GrainMoisture`, `ThousandGrainWeight`, `HarvestDAA`.
8. WHEN a parameter field defined in the category parameter list in Acceptance Criteria 1–5 of this requirement has no recorded values for a given project, THE Report_System SHALL render the parameter column header with "—" values in Comprehensive_Template outputs (Standard, Regulatory Submission) so that report structure is consistent across projects in the same category; WHEN the active template is a Compact_Template (Field Summary Card, Scientific Journal), THE Report_System SHALL omit entirely empty parameter columns rather than rendering them with "—", to preserve the space-constrained layout.
9. THE Report_System SHALL include the `IsControl` and `IsStandardCheck` flags in the Treatment List table of every report, displaying "UTC / Control" for IsControl treatments and "Standard Check" for IsStandardCheck treatments in the Role column. WHEN a treatment has both IsControl=true and IsStandardCheck=true, THE Report_System SHALL display 'UTC / Control' and omit the Standard Check designation.
10. WHEN both Notes and Conclusion fields are null or empty string, THE Report_System SHALL render '—' in the Investigator Notes section rather than omitting the section header. WHEN either field has content, THE Report_System SHALL include the `Notes` and `Conclusion` fields from the trial record verbatim in a dedicated "Investigator Notes" section at the end of every PDF and DOCX report.

---

### Requirement 6: Statistical Completeness in All Report Formats

**User Story:** As a statistician reviewing trial results, I want all statistical outputs fully formatted in tables across every report format, so that I can verify analyses without needing to access the raw data.

#### Acceptance Criteria

1. THE Report_System SHALL render a complete ANOVA source table (Source, SS, df, MS, F, p) in every report that has sufficient data (provided the project has ≥ 2 treatments and ≥ 2 replications, consistent with the ANOVA guard in `statsUtils.js`), covering all designs: RCBD (sources: Treatments, Blocks, Error, Total), CRD (sources: Treatments, Error, Total), Split-Plot (sources: Whole-Plot, Subplot, Error(a), Error(b), Total), and Factorial/Two-Way (sources: Factor A, Factor B, A×B Interaction, Error, Total).
2. WHEN a post-hoc test has been performed (one of: LSD, Tukey HSD, Duncan MRT, SNK, Bonferroni, or Dunnett — whichever was selected by the user), THE Report_System SHALL render a single pairwise comparison table for that test only containing Treatment A, Treatment B, Mean A, Mean B, Mean Difference, critical value (LSD/Bonferroni = t-critical; Tukey HSD/SNK = q-critical (Studentized Range); Dunnett = d-critical; Duncan MRT = r-critical), and "Significant Yes/No", plus the CLD letter assignments. THE Report_System SHALL NOT render pairwise tables for tests that were not performed.
3. THE Report_System SHALL include a descriptive statistics row for each treatment containing: n, Mean, SD, SE, CV%, 95% Confidence Interval (lower and upper bounds), Min, and Max.
4. THE Report_System SHALL compute and display effect size metrics in the ANOVA section of PDF and DOCX reports: η² (eta-squared), ω² (omega-squared), and Cohen's f, each with a plain-language interpretation label using the following thresholds — η²/ω²: Negligible <0.01, Small 0.01–0.05, Medium 0.06–0.13, Large ≥0.14; Cohen's f: Negligible <0.10, Small 0.10–0.24, Medium 0.25–0.39, Large ≥0.40.
5. THE Report_System SHALL compute and display achieved statistical power, minimum required n per treatment, and a power curve description (a table of n values from 2 to 30 vs achieved power (%), plus one of four interpretation labels: Insufficient (<0.60), Acceptable (0.60–0.79), Good (0.80–0.89), Excellent (≥0.90)) in a "Power Analysis" subsection of PDF and DOCX reports when ≥ 3 replications are present.
6. IF n ≤ 50 THEN THE Report_System SHALL display Shapiro-Wilk W statistic (4 d.p.) and p-value (4 d.p.) with a pass (p > 0.05) or fail (p ≤ 0.05) statement for normality of ANOVA residuals.
7. IF n > 50 THEN THE Report_System SHALL display Jarque-Bera statistic (4 d.p.) and p-value (4 d.p.) with a pass (p > 0.05) or fail (p ≤ 0.05) statement for normality of ANOVA residuals.
8. THE Report_System SHALL run and display variance homogeneity test results in every report: Levene's F statistic (4 d.p.) and p-value (4 d.p.), with a plain-language pass/fail statement.
9. WHEN assumption tests fail (normality p < 0.05 or Levene p < 0.05), THE Report_System SHALL display a warning block rendered with a distinct background fill and a visible border in the ANOVA section recommending the Kruskal-Wallis non-parametric alternative, and SHALL include the Kruskal-Wallis H statistic and p-value if the non-parametric test was run. THE Report_System SHALL follow the analysis decision flow in the report: (1) render ANOVA source table; (2) render assumption test results immediately below; (3) IF assumptions fail THEN render the Kruskal-Wallis warning block and, if run, its results; (4) IF multiple-comparisons test was requested AND ANOVA was significant (p ≤ 0.05) THEN render the single selected post-hoc table; no additional statistical tests SHALL be rendered beyond this sequence.
10. THE Report_System SHALL render efficacy percentage columns in the treatment means table for all categories: WCE% (Herbicide), DCE% (Fungicide), PRE% (Pesticide), Yield Improvement% (all categories when yield data is present), and Vigor Improvement% (Nutrition, Biostimulant), each computed relative to the UTC treatment.
11. THE Report_System SHALL render a Tier classification badge (Excellent/Good/Fair/Poor) for each non-control treatment in the treatment means table in all PDF and Excel outputs, based on the primary efficacy percentage using the thresholds defined in `pdfReportRenderer.js` (≥ 80% Excellent, 60–79% Good, 40–59% Fair, < 40% Poor).
12. THE Report_System SHALL include SEm±, LSD at 5%, LSD at 1%, and CV% summary statistics beneath the ANOVA table in all PDF, DOCX, and Excel reports.
13. THE Excel_Renderer SHALL produce a "Post-Hoc Comparisons" sheet (Sheet 7) with all pairwise comparison rows populated when Tukey HSD or Duncan MRT is selected, not the "Post-hoc comparisons not available" placeholder row.

---

### Requirement 7: Full Report Structure Implementation

**User Story:** As a professional agronomist, I want every comprehensive report to contain all 16 standard sections defined for scientific field trials, so that the document is self-contained and meets peer-review or regulatory submission expectations.

#### Acceptance Criteria

1. THE Report_System SHALL render Section 1 — Title Page — as defined in Requirement 1, Acceptance Criterion 1.
2. THE Report_System SHALL render Section 2 — Table of Contents — listing all numbered sections with page references in all multi-page PDF and DOCX reports.
3. THE Report_System SHALL render Section 3 — Executive Summary — as defined in Requirement 1, Acceptance Criterion 3, using the word limit and structure appropriate to the active template.
4. THE Report_System SHALL render Section 4 — Trial Design and Methodology — containing: trial design type, treatments table (number, name, dosage, timing, replication count, role), block layout description, application dates and method, soil profile table (pH, clay%, sand%, OC%, texture), and a weather summary for the application date(s).
5. THE Report_System SHALL render Section 5 — Observations Summary — as a multi-row table with treatments as rows, each DAA observation point as a column, and the primary parameter value (with SD) in each cell, for all observation DAA points collected.
6. THE Report_System SHALL render Section 6 — Statistical Analysis — containing the ANOVA source table, the selected post-hoc means table with CLD letters (if a post-hoc test was run), effect size metrics, assumption test results following the decision flow in Requirement 6 AC9, and the SEm± / LSD / CV% summary block.
7. THE Report_System SHALL render Section 7 — Efficacy Rankings — containing a tier-classified ranking table with columns: Rank, Treatment, Mean ± SE, primary efficacy%, CLD letter, Tier badge.
8. THE Report_System SHALL render Section 8 — Charts — with the following conditional logic: (a) treatment means horizontal bar chart with ±1 SE error bars SHALL always be included; (b) time-series line chart SHALL be included only IF the project has more than 1 distinct DAA observation point; (c) 4-PL dose-response curve chart SHALL be included only IF dose-response data exists in the ReportData object (`reportData.doseResponse.success === true`); (d) correlation heatmap SHALL be included only IF the correlation matrix contains ≥ 3 numeric variables; (e) residual diagnostic charts (histogram, Q-Q, fitted vs. residuals) SHALL be included only IF ANOVA was performed and `reportData.residualDiagnostics.n ≥ 4`. All included charts SHALL be embedded as raster images (PNG) within the PDF.
9. THE Report_System SHALL render Section 9 — Phytotoxicity Assessment — containing a treatment × DAA data table and a bar chart. IF all phytotoxicity values are zero, THE Report_System SHALL render the section with a single note "No phytotoxicity observed" and omit the bar chart. IF the `reportData.phytotoxicity.hasData` flag is false and the template is a Compact_Template, THE Report_System SHALL omit Section 9 entirely.
10. IF `reportData.correlationMatrix` contains ≥ 3 numeric variables THEN THE Report_System SHALL render Section 10 — Correlation Analysis — containing the Pearson correlation matrix heatmap table with r values and significance stars (* p < 0.05, ** p < 0.01), and a footnote explaining the star notation; ELSE THE Report_System SHALL omit Section 10.
11. IF ANOVA was performed and `reportData.residualDiagnostics.n ≥ 4` THEN THE Report_System SHALL render Section 11 — Residual Diagnostics — containing three embedded chart images: histogram of ANOVA residuals, Q-Q (normal probability) plot, and a fitted values vs. residuals scatter plot, generated from `calculateResidualsDiagnostics()` in `statsUtils.js`; ELSE THE Report_System SHALL omit Section 11.
12. THE Report_System SHALL render Section 12 — Photo Documentation — containing photos sorted and grouped by Treatment → DAA → Plot Number → Capture Time as specified in Requirement 2, with each group labelled, AI analysis captions where available, photo direction labels, and thumbnail or full-page display as configured in ReportConfigPanel. IF the project has no photos, THE Report_System SHALL omit Section 12.
13. IF yield data is present (`reportData.yield` is non-null) THEN THE Report_System SHALL render Section 13 — Yield Analysis — containing a yield means table with ANOVA, yield improvement%, and CLD letters; ELSE THE Report_System SHALL omit Section 13.
14. IF weather data is present for at least one observation date THEN THE Report_System SHALL render Section 14 — Weather Log — containing a table with columns: Date, DAA, Temperature (°C), Humidity (%), Wind Speed (km/h), Rain (mm); ELSE THE Report_System SHALL omit Section 14.
15. THE Report_System SHALL render Section 15 — Conclusions and Recommendations — as defined in Requirement 1, Acceptance Criterion 8.
16. THE Report_System SHALL render Section 16 — Appendices — split into four labelled sub-appendices: Appendix A — Raw Data (full replications × parameters matrix for all treatments); Appendix B — Statistical Outputs (complete descriptive statistics table, full post-hoc pairwise table if run, power analysis table); Appendix C — Photo Index (table listing every photo with its treatment, DAA, plot, direction, capture time, and resolved URL); Appendix D — Experimental Layout (the randomised field layout showing plot positions per block, rendering the actual `PlotNumber` and assigned treatment label for each cell — for RCBD this SHALL be a grid of blocks × plots showing treatment-to-plot assignment; for LargeScale it SHALL be a sector map table with sector ID, GPS coordinates, and treatment assignment; for CRD it SHALL list plot numbers and treatment assignments in the order used). Appendix C SHALL be omitted IF the project has no photos. The Glossary of abbreviations SHALL appear as a final unnumbered appendix after Appendix D (or after Appendix C if no photos).

---

### Requirement 8: Chart Embedding

**User Story:** As a researcher generating PDF reports, I want residual diagnostic plots, dose-response curves, and correlation matrix heatmaps embedded directly in the document, so that the statistical outputs are visually verifiable without opening a separate application.

#### Acceptance Criteria

1. IF ANOVA was performed and `reportData.residualDiagnostics.n ≥ 4` THEN THE PDF_Renderer SHALL embed residual diagnostic charts (histogram, Q-Q plot, fitted-vs-residuals) as PNG images in the Statistical Analysis section of the PDF report, using the `renderChartCanvas()` function already implemented for bar and time-series charts; ELSE the residual diagnostics section SHALL be omitted from the PDF.
2. IF `reportData.doseResponse.success === true` THEN THE PDF_Renderer SHALL embed the 4-PL dose-response curve as a PNG image in a dedicated Dose-Response Analysis section of the Standard, Scientific Journal, and Regulatory Submission PDF templates; ELSE the dose-response section SHALL be omitted.
3. IF the correlation matrix contains ≥ 3 numeric variables THEN THE PDF_Renderer SHALL embed the correlation matrix as a colour-coded heatmap image in the Correlation Analysis section, where cells with r > 0.7 are shaded green and cells with r < −0.7 are shaded red; ELSE the correlation section SHALL be omitted.
4. IF ANOVA was performed and `reportData.residualDiagnostics.n ≥ 4` THEN THE DOCX_Renderer SHALL embed residual diagnostic chart images as inline images in Appendix B of the DOCX output; ELSE Appendix B shall omit residual chart images.
5. IF ANOVA was performed and `reportData.residualDiagnostics.n ≥ 4` THEN THE PPTX_Renderer SHALL include a dedicated "Statistical Diagnostics" slide (following the ANOVA slide) showing the three residual diagnostic charts in a 1×3 grid layout; ELSE the diagnostics slide SHALL be omitted from the PPTX.
6. THE Excel_Renderer SHALL populate the "Charts" sheet (Sheet 12) with data ranges suitable for creating dose-response scatter plots, residual histogram, and Q-Q plot in Excel; each range SHALL be labelled with a comment explaining the chart type.
7. WHEN chart rendering fails for any individual chart, THE Report_System SHALL log a console warning and continue generating the remainder of the report without throwing an uncaught exception or aborting the download.
8. THE PDF_Renderer SHALL embed bar charts with error bars representing ±1 SE for each treatment mean, using the `treatmentSems` object from the ANOVA result in `statsUtils.js`.

---

### Requirement 9: Scale Handling

**User Story:** As a project manager with 30 treatments, 100+ observations, and 200+ photos, I want report generation to complete successfully without browser crashes, memory errors, or corrupt output files, so that large-scale trials can be documented reliably.

#### Acceptance Criteria

1. WHEN a project contains more than 20 treatments, THE PDF_Renderer SHALL paginate the treatment means table across multiple pages using `checkPageBreak()`, with header rows repeated on each continuation page.
2. WHEN a project contains more than 200 photos and thumbnail mode is active, THE PDF_Renderer SHALL process photos in batches of 16 (one page per batch), releasing each batch from memory before beginning the next batch, rather than loading all photos into memory simultaneously.
3. WHEN a PPTX report is generated for a project with more than 6 photos, THE PPTX_Renderer SHALL process photo slides sequentially, generating one slide at a time, rather than awaiting all `toBase64()` promises in parallel.
4. THE Report_System SHALL complete PDF generation for a project with 30 treatments, 4 replications, 10 DAA observation points, and 200 photos in thumbnail mode within 60 seconds in a modern browser (Chrome 120+, Firefox 121+).
5. WHEN a project contains more than 30 treatments, THE Excel_Renderer SHALL use streaming row writes (appending one row at a time) for the Raw Data Matrix sheet rather than building all rows in memory before writing.
6. THE Report_System SHALL not allocate more than 512 MB of heap memory during any single report generation operation; WHEN memory would be exceeded, THE Report_System SHALL switch to a lower-resolution photo embedding mode automatically and display a toast notification informing the user.
7. WHEN a time-series table spans more than 12 DAA columns, THE PDF_Renderer SHALL split the table into blocks of 8 DAA columns across multiple sub-tables on the same or subsequent pages, with the treatment name column repeated in each block.
8. WHEN an Excel workbook would exceed 50 MB due to embedded photo data in Sheet 13, THE Excel_Renderer SHALL limit the Photos sheet to URL references only (no base64 data) and add a comment at the top of the sheet: "Images are linked by URL; use the URL column to download originals."

---

### Requirement 10: Per-Design ANOVA Source Tables

**User Story:** As a statistician, I want the ANOVA source table in every report to reflect the correct variance partitioning for the actual trial design used, so that degrees of freedom, mean squares, and F-ratios are scientifically valid.

#### Acceptance Criteria

1. WHEN a trial uses the RCBD design, THE Report_System SHALL render the ANOVA source table with rows: Treatments (df = t−1), Blocks (df = b−1), Error (df = (t−1)(b−1)), Total (df = N−1).
2. WHEN a trial uses the CRD or Pot Trial design, THE Report_System SHALL render the ANOVA source table with rows: Treatments (df = t−1), Error (df = N−t), Total (df = N−1), and SHALL NOT include a Blocks row.
3. WHEN a trial uses the Factorial / Two-Way design, THE Report_System SHALL render the ANOVA source table with rows: Factor A (df = a−1), Factor B (df = b−1), A×B Interaction (df = (a−1)(b−1)), Error (df = ab(r−1) where r=replications), Total (df = abr−1).
4. WHEN a trial uses the Split-Plot design, THE Report_System SHALL render the ANOVA source table with rows: Whole-Plot (df = a−1), Error(a) (df = a(r−1), Whole-Plot Error), Subplot Treatment (df = b−1), Interaction (df = (a−1)(b−1), Whole-Plot × Subplot), Error(b) (df = a(r−1)(b−1), Subplot Error), Total (df = abr−1).
5. WHEN a trial uses the Repeated Measures design, THE Report_System SHALL render the ANOVA source table with rows: Between-Subjects (df = t−1, Treatments), Within-Subjects (df = k−1 where k=time points, Time / DAA), Treatment × Time Interaction (df = (t−1)(k−1)), Error (df = t(k−1)(r−1)), Total (df = tkr−1), and SHALL include Mauchly's W sphericity test result as a footnote containing: Mauchly's W statistic, χ² approximation, df, and p-value, with a note if Greenhouse-Geisser correction was applied.
6. WHEN a trial uses the Large Scale / GPS design, THE Report_System SHALL render the ANOVA source table with rows: Treatments (by sector), Spatial Error, Total, and SHALL include the spatial CV% for each sector from the `meta.spatialSummary` object.
7. THE Report_System SHALL label the model used for each design in the ANOVA section heading, e.g. "ANOVA Source Table (RCBD model)", "ANOVA Source Table (Split-Plot model)", using the `meta.analysisModel` field from ReportData.
8. WHEN computed Error df < 1, THE Report_System SHALL display "df = 0 (Insufficient data)" in the Error row and SHALL also display 'F = N/A' and 'p = N/A' in those cells, and SHALL not compute or display F or p values for that run.

---

### Requirement 11: Cross-Format Consistency

**User Story:** As a researcher, I want the same project data to produce consistent numerical values, table structures, and section headings across PDF, Excel, DOCX, and PPTX outputs, so that I can reference any format interchangeably.

#### Acceptance Criteria

1. THE Report_System SHALL compute treatment means, SD, SE, and CLD letters exactly once in `buildReportData()` and pass the result to all renderers, so that no renderer independently recalculates statistics that could diverge.
2. WHEN a treatment mean value is displayed in PDF, Excel, DOCX, and PPTX for the same project and same parameter, THE Report_System SHALL render the same numerical value to 2 decimal places in all four formats.
3. THE Report_System SHALL use the same significance star thresholds across all formats: NS for p > 0.05, * for p ≤ 0.05, ** for p ≤ 0.01.
4. THE Report_System SHALL use the same Tier classification thresholds (≥ 80% Excellent, 60–79% Good, 40–59% Fair, < 40% Poor) consistently in PDF treatment ranking, Excel treatment means sheet, PPTX treatment ranking slide, and DOCX ranking table.
5. THE Report_System SHALL use the same treatment ordering (sorted by mean descending, UTC/control last) in the treatment means table across PDF, DOCX, Excel Sheet 5, and PPTX Slide 5.
6. WHEN a parameter's efficacy% is excluded because it is an adverse-effect parameter (phytotoxicity), THE Report_System SHALL display "N/A*" in the Efficacy column and a footnote explaining the exclusion consistently in PDF, DOCX, Excel Sheet 5, and PPTX ranking slide.
7. THE Report_System SHALL render the same weather data table (Date, DAA, Temp, Humidity, Wind, Rain) with the same rows in PDF Section 14, DOCX Section 8, Excel Sheet 11, and PPTX Conclusions slide metadata.
8. THE Report_System SHALL use the same executive summary text produced by `buildExecutiveSummary()` as the content for the Executive Summary section in PDF, DOCX, and PPTX title slide subtitle — no renderer SHALL generate its own independent summary text.

---

### Requirement 12: Export From Every Entry Point

**User Story:** As a user navigating from any page in the application, I want the report export buttons on that page to produce correct, complete downloads, so that I do not need to navigate to the Reports page to access export functionality.

#### Acceptance Criteria

1. WHEN a user clicks "Export PDF" on the Trials page for a single trial, THE Report_System SHALL generate a single-trial standard PDF report containing the trial's own data, not a project-level report.
2. WHEN a user clicks "Export DOCX" on the Trials page for a single trial, THE Report_System SHALL invoke `exportScientificReportAsDOC()` from `exportUtils.js` and produce a complete, non-empty DOCX file.
3. WHEN a user clicks "Export PPTX" on the Trials page for a single trial, THE PPTX_Renderer SHALL generate a 7-slide presentation summarising that trial's data.
4. WHEN a user clicks "Export CSV" or "Tidy CSV" on the Reports page with a project selected, THE Report_System SHALL invoke `exportTidyCSV()` and download a properly formatted CSV file with all columns defined in Requirement 5.
5. WHEN a user clicks "Export JSON" on the Trials page, THE Report_System SHALL produce a JSON file containing the complete trial record including all observation arrays, photo metadata (without base64 blobs), and computed statistics.
6. WHEN a user clicks "Export HTML" on the Trials page, THE Report_System SHALL produce a self-contained HTML file with inline CSS that renders the trial data as a formatted field report viewable in a browser without internet access.
7. WHEN a user clicks "Export TXT" (Field Report) on the Trials page, THE Report_System SHALL produce a plain-text field report with fixed-width columns for treatment, DAA, primary metric value, and a brief CLD letter, printable on standard A4 paper at 10pt font.
8. WHEN a user initiates any export from the Statistics page, THE Report_System SHALL include the currently displayed statistical analysis (ANOVA table, post-hoc means, residual diagnostics) in the generated PDF or Excel output, reflecting the parameter and DAA selected in the Statistics page UI.
9. WHEN a user initiates any export from the Analytics page, THE Report_System SHALL capture the currently rendered analytics charts using `window.print()` or an equivalent canvas-capture approach and include them in a single-page PDF output.
10. WHEN a user clicks "Compare Trials" and initiates an export, THE Report_System SHALL produce a comparison report containing a side-by-side treatment means table and chart for all selected trials.
11. WHEN a user initiates an export from the Dose-Response page, THE Report_System SHALL produce a PDF containing the 4-PL model summary table (ED10, ED50, ED90, R², model equation) and the dose-response curve chart for each analysed treatment.
12. WHEN a LargeScale trial's "Project Report" button is activated and the user clicks Generate, THE Report_System SHALL produce a project-level report containing the sector/quadrant map table, treatment means by sector, and spatial CV% values from `fbGetLargeScaleData()`, without throwing a routing error.

---

### Requirement 13: Report Configuration UI

**User Story:** As a user generating reports, I want the ReportConfigPanel to expose all configurable options, display accurate pre-flight data validation, and provide clear feedback during generation, so that I can produce the right report without guesswork.

#### Acceptance Criteria

1. THE ReportConfigPanel SHALL display the photo display mode selector ("Thumbnail Grid" or "Full Page") as a new option in the "Include in Report" section, visible when the "Include Photos" checkbox is enabled.
2. THE ReportConfigPanel SHALL display a "Residual Diagnostics" checkbox in the "Include in Report" section, defaulting to enabled, that controls whether residual diagnostic charts are embedded in the generated report.
3. THE ReportConfigPanel SHALL display a "Dose-Response" checkbox in the "Include in Report" section when dose-response data is detected in the selected project's trials.
4. WHEN the ReportConfigPanel detects that the selected project has LargeScale trials (sector/GPS design), THE ReportConfigPanel SHALL display a "Sector Map" checkbox to include the sector/quadrant summary table in the report.
5. THE ReportProgressModal SHALL display a progress percentage and a labelled step for each major generation phase: "Aggregating data", "Running statistics", "Embedding charts", "Processing photos", "Generating [format] file", "Preparing download".
6. WHEN report generation fails at any step, THE ReportProgressModal SHALL display the failed step with a red "Error" status and show the error message text, rather than closing the modal silently.
7. THE ReportConfigPanel pre-flight summary SHALL display the count of photos detected for the selected project, and SHALL show a warning if photo count exceeds 50.
8. THE ReportConfigPanel SHALL expose a "Significance Level" selector for Dunnett's test in addition to the existing α = 5% and α = 1% options for ANOVA.

---

### Requirement 14: Data Integrity and Round-Trip Correctness

**User Story:** As a developer, I want the data flowing from raw trial records through ReportDataBuilder into renderers to be lossless and verifiable, so that no values are silently dropped, rounded incorrectly, or misattributed to the wrong treatment.

#### Acceptance Criteria

1. THE ReportDataBuilder SHALL produce a ReportData object where, for every treatment in `treatmentMap`, the `rawMatrix` contains at least one rep entry with at least one non-null observation value, provided the trial's `EfficacyDataJSON` is non-empty.
2. WHEN a CSV export is loaded back into the application's import flow, THE Report_System SHALL be able to reconstruct a valid trial observation structure from the exported Tidy CSV columns without data loss for all numeric observation fields.
3. THE ReportDataBuilder SHALL preserve 4 decimal places of precision for all computed means, SDs, SEs, and effect sizes in the ReportData object before renderers apply display rounding.
4. WHEN `buildReportData()` encounters a trial whose `EfficacyDataJSON` cannot be parsed, THE ReportDataBuilder SHALL skip that trial, add a warning to the `warnings` array with the trial ID, and continue processing remaining trials — not throw an exception that aborts the entire build.
5. THE ReportDataBuilder SHALL correctly populate the `phytotoxicity` section of ReportData by reading the `phytotoxicityPct` field from each observation, separate from and not conflated with the primary efficacy metric computation.
6. FOR ALL valid ReportData objects produced by `buildReportData()`, parsing the object, serialising it to JSON, and deserialising it again SHALL produce an object that is deep-equal to the original for all numeric fields, CLD strings, and ANOVA table arrays (round-trip property).
7. THE ReportDataBuilder SHALL compute and store a `dataCompleteness` object in the ReportData containing: `expectedObservations` (treatments × replications × DAA points), `recordedObservations` (count of non-null primary parameter values across all trials in the project), `missingObservations` (expectedObservations − recordedObservations), and `missingPct` (missingObservations / expectedObservations × 100, rounded to 1 decimal place).
8. THE Report_System SHALL render a Data Quality Summary block in Section 4 (Trial Design and Methodology) of all PDF, DOCX, and Excel Comprehensive_Template reports containing the four `dataCompleteness` fields in a labelled two-column table: "Observations expected", "Observations recorded", "Missing observations", "Missing %". WHEN `missingPct` > 10%, THE Report_System SHALL render the Missing % cell with a yellow background fill and append the note "High missing rate — interpret results with caution". WHEN `missingPct` = 0%, THE Report_System SHALL render the row as "Missing observations: 0 (complete dataset)".

---

### Requirement 15: Single Trial Report Completeness

**User Story:** As a field investigator generating a single-trial report from the Trials page, I want the output to contain the same level of detail as a project report scoped to one trial, so that individual trial documentation is scientifically complete.

#### Acceptance Criteria

1. WHEN a single trial is exported as PDF from the Trials page, THE Report_System SHALL include all parameters collected for that trial's category with their DAA observation values in the observations table.
2. WHEN a single trial is exported as PDF from the Trials page and the trial uses a multi-treatment design, THE Report_System SHALL run descriptive statistics (mean, SD, SE, n) across replications if the trial has a `Replication` field, and present the results as a standard means table.
3. WHEN a single trial PDF export includes photos, THE Report_System SHALL group photos by DAA and render them in the photo documentation section using the thumbnail mode if the total photo count exceeds 20.
4. THE Single Trial PDF report SHALL include a trial card section showing the plot layout, QR code for the trial ID, and all trial-level metadata fields defined in Requirement 5, Acceptance Criterion 6.
5. WHEN a trial has `Conclusion` and `Notes` text, THE Report_System SHALL render both fields verbatim in the Investigator Notes section of the single-trial PDF and DOCX reports.
6. THE Single Trial DOCX export SHALL include an executive summary, methodology section, observations table, phytotoxicity section, weather log (if weather data present), and conclusions — not just the treatment means table.

---

### Requirement 16: Report Audit Trail

**User Story:** As a GLP/GEP-compliant investigator, I want every generated report to carry a machine-readable audit trail block, so that regulators, auditors, and collaborators can unambiguously identify the exact conditions under which the report was produced.

#### Acceptance Criteria

1. THE Report_System SHALL append an Audit Trail block to every generated report (PDF, DOCX, Excel, PPTX, HTML) containing the following fields: Generated On (ISO 8601 datetime with timezone), Generated By (authenticated user's display name and email), App Version (from `package.json` version field), Analysis Engine Version (the version string of `statsUtils.js` — read from a `STATS_ENGINE_VERSION` constant exported by that module), Report Template (the `options.template` value used for this generation), Statistics Engine Version (same as Analysis Engine Version — retained as a separately labelled field for GLP forms), and Report UUID (a version-4 UUID generated at report creation time and unique to that file).
2. THE Report_System SHALL render the Audit Trail block in PDF and DOCX outputs as the very last page or section, after Appendix D, with the heading "Report Audit Trail" and a horizontal rule separating it from appendix content.
3. THE Report_System SHALL embed the Audit Trail fields in Excel outputs as a dedicated "Audit Trail" sheet (Sheet 14), with field names in column A and values in column B, protected from editing (sheet locked, no password required).
4. THE Report_System SHALL embed the Audit Trail fields in PPTX outputs as a final slide with the title "Report Audit Trail" and a table listing field name and value pairs.
5. THE Report_System SHALL embed the Report UUID in the PDF file metadata (`/Keywords` XMP field) and in the DOCX `core.xml` `<dc:identifier>` field so that the UUID is machine-readable without opening the document body.
6. WHEN a Regulatory Submission PDF is generated, THE Report_System SHALL also display the Report UUID and Generated On datetime prominently on the GLP/GEP cover page beneath the Amendment History table, labelled "Document Reference" and "Report Date" respectively.
7. THE Report_System SHALL store each generated Report UUID, template name, generation datetime, and user identifier in the local IndexedDB audit log (key: `reportAuditLog`) so that the history of generated reports is queryable from the app without re-opening individual files.
