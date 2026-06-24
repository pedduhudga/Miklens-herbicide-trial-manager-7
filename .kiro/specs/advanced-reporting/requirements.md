# Requirements: Advanced Multi-Treatment Professional Reporting System

## Overview

The app currently generates adequate reports for single-trial, single-block scenarios. However, it is not capable of producing professional-grade reports for complex multi-treatment, multi-replication field trials. Treatment means are never averaged across replications in the report output, the ANOVA in reports is disconnected from the statistics engine, trial design variants are ignored, and multi-parameter data is never fully reported. This spec covers a complete upgrade of the reporting pipeline to handle real agronomic research complexity.

---

## Requirement 1 — Treatment × Replication Data Aggregation Engine

**User Story:** As a researcher, I want reports to automatically group all sub-trials by treatment name, average their observations across replications, and compute descriptive statistics per treatment group, so that a report reflects a proper experimental summary rather than a raw list of individual plot records.

### Acceptance Criteria

1.1 The system SHALL group trials within a project by their `FormulationName` (treatment) and `Dosage` combination to form treatment groups.

1.2 For each treatment group, the system SHALL compute: arithmetic mean, standard deviation (SD), standard error of the mean (SE), coefficient of variation (CV%), minimum value, maximum value, and replication count (n) for every collected observation parameter.

1.3 Mean calculation SHALL use the final observation DAA value for each replication unless a specific DAA is selected for the report.

1.4 The system SHALL also compute means at each DAA time-point (e.g., 7, 15, 30, 45 DAA), producing a time-series means table.

1.5 The aggregation engine SHALL handle unbalanced designs (missing replications for some treatments) without crashing, and SHALL flag the affected treatments with a warning in the report.

1.6 The aggregation SHALL identify the Untreated Check (UTC) / control treatment automatically by matching treatment names containing "control", "untreated", or "check" (case-insensitive), and SHALL use it as the reference for efficacy calculations.

1.7 Efficacy percentage per treatment SHALL be calculated as `((UTC_mean - Treatment_mean) / UTC_mean) × 100` for reduction metrics (herbicide, fungicide, pesticide) and `((Treatment_mean - UTC_mean) / UTC_mean) × 100` for improvement metrics (nutrition, biostimulant).

---

## Requirement 2 — Proper ANOVA Integration in Report Generator

**User Story:** As a researcher, I want the report generator to use the same statistical engine as the Statistics page, so that ANOVA, post-hoc tests, and LSD/CD groupings in the report are identical to what I see when I run analysis manually.

### Acceptance Criteria

2.1 The report generator SHALL use `AnalysisEngine` from `src/utils/analysisUtils.js` as the sole source of statistical computation — not the internal `calculateAnovaRCB` function inside `advancedReportGenerator.js`.

2.2 The report SHALL include a full ANOVA source table with: Source of Variation, Sum of Squares (SS), Degrees of Freedom (df), Mean Square (MS), F-value, and p-value for Treatments, Blocks/Replicates, and Error rows.

2.3 The report SHALL display: Grand Mean, CV%, SEm±, LSD at 5%, LSD at 1%, and CD (Critical Difference) values.

2.4 Post-hoc letter groupings (CLD — Compact Letter Display) SHALL be shown alongside treatment means using the method selected at report generation time (LSD, Tukey HSD, or Duncan's MRT).

2.5 When p-value ≤ 0.05 the report SHALL label the result "Significant at 5% level"; when p ≤ 0.01 it SHALL label it "Highly Significant at 1% level"; when p > 0.05 it SHALL label it "Non-Significant (NS)".

2.6 The ANOVA computation SHALL support a minimum of 2 treatments and 2 replications. If either condition is not met, the report SHALL display "Insufficient data for ANOVA" rather than showing incorrect numbers.

2.7 For projects with more than 2 treatments the system SHALL NOT use the two-treatment-only `calculateAnovaRCB` path — it SHALL always route through `AnalysisEngine.analyze()`.

---

## Requirement 3 — Trial Design Awareness

**User Story:** As a researcher, I want the report to correctly reflect the trial design I selected (RCBD, CRD, Pot Trial, Factorial, Split-Plot), so that the statistical model and degrees of freedom are correct.

### Acceptance Criteria

3.1 The report generator SHALL detect the trial design from `project.Design` or `project.TrialDesign` and apply the matching statistical model:
- `RCBD` → Randomized Complete Block Design (blocks as replicates)
- `CRD` → Completely Randomized Design (no block term in ANOVA)
- `PotTrial` → CRD or RCBD-pot depending on `PotLayout` field
- `Factorial` or `Two-Way` → Two-Way ANOVA with interaction term
- `Split-Plot` → Split-Plot ANOVA with whole-plot and sub-plot error terms

3.2 The ANOVA source table SHALL show the correct sources of variation for the detected design (e.g., Factorial adds a "Treatment × Factor B" interaction row).

3.3 The report header SHALL display the detected design name and a short description (e.g., "Design: Randomized Complete Block Design — 4 blocks, 6 treatments").

3.4 For Pot Trial designs the report SHALL display pot layout, number of pots per treatment, and treatment assignment scheme.

3.5 For Split-Plot designs the report SHALL clearly label main-plot treatments and sub-plot treatments with their respective error terms.

---

## Requirement 4 — Multi-Parameter Reporting

**User Story:** As a researcher, I want all collected observation parameters to appear in the report with their own means table and statistics, not just the primary efficacy metric, so that reviewers can evaluate every measured variable.

### Acceptance Criteria

4.1 The report SHALL include a separate means table for every observation parameter that has data in the project, based on the category's `observationFields` configuration in `categoryConfig.js`.

4.2 Each parameter table SHALL show treatment means, SD, SE, and LSD letter groupings, and SHALL include an ANOVA F-value and p-value footer row.

4.3 The list of parameters with data SHALL be auto-detected — parameters with zero non-null values SHALL be excluded from the report automatically.

4.4 For herbicide trials, weed species data SHALL be broken out into per-species means tables where species-level `weedDetails` observations exist.

4.5 For fungicide trials, AUDPC (Area Under the Disease Progress Curve) SHALL be computed and reported as a derived parameter when ≥3 time-point observations exist.

4.6 For pesticide trials, Abbott's Formula efficiency SHALL be computed and reported where pre- and post-treatment pest count data is available.

4.7 For nutrition and biostimulant trials, yield improvement percentage vs. UTC SHALL be the primary reported metric, with SPAD, plant height, and biomass as secondary parameters.

4.8 The report SHALL include a "Parameters Reported" summary table at the start listing all parameters included and their units.

---

## Requirement 5 — Professional Report Formats

**User Story:** As a researcher, I want to download reports in multiple professional formats (PDF, Excel, DOCX) that all reflect the same correct aggregated data and statistics, so that I can submit them to clients, regulatory bodies, or academic journals.

### Acceptance Criteria

5.1 **PDF Report** — The system SHALL generate a professionally formatted PDF containing:
- Cover page with project name, crop, investigator, location, trial period, and sponsor logo placeholder
- Trial design and methodology section
- Treatment list with dosages, application timings, and replication count
- Treatment × Replication raw data table (all reps shown)
- Treatment means summary table with SD, SE, and CLD letters
- Full ANOVA source table
- Descriptive statistics block (Grand Mean, CV%, SEm±, LSD 5%, LSD 1%)
- Efficacy percentage table vs. UTC for the primary metric
- Time-series data table (means at each DAA)
- Parameter-specific means tables for all measured variables
- Photo grid section organized by treatment and DAA
- Weather data table
- Conclusion and recommendations section

5.2 **Excel Workbook** — The system SHALL generate a multi-sheet Excel workbook with dedicated sheets for:
1. Summary / Cover
2. Trial Information
3. Treatment List
4. Raw Observation Data (treatment × replication × DAA)
5. Treatment Means (primary metric)
6. ANOVA Table
7. Post-Hoc Comparisons
8. All Parameters Data (one table per parameter)
9. Charts (bar chart of means with error bars, time-series line chart)
10. Yield / Primary Outcome
11. Photos

5.3 **DOCX Report** — The system SHALL generate a Word document with the same structure as the PDF, suitable for editing and submission.

5.4 All three formats SHALL be generated from a single shared data pipeline so that numbers are identical across formats.

5.5 The Reports page SHALL offer a "Project Report" mode that selects a project and generates the full aggregated report across all its trials, distinct from the current "single trial" mode.

---

## Requirement 6 — Report Generation UI

**User Story:** As a researcher, I want a clear report generation interface where I can select the project, choose the report scope and parameters, and configure statistical options before downloading, so that I have control over what goes into the report.

### Acceptance Criteria

6.1 The Reports page SHALL have a "Project Report" tab that works at project level (aggregating all trials in the project) and a "Single Trial Report" tab that works on one trial at a time.

6.2 In Project Report mode, the user SHALL be able to select:
- Report format (PDF, Excel, DOCX)
- Statistical test for post-hoc comparisons (LSD, Tukey HSD, Duncan's MRT)
- Significance level (α = 0.01 or 0.05)
- Specific DAA time-point for the primary analysis, or "Final observation"
- Whether to include photos in the report
- Whether to include the weather data section

6.3 The system SHALL show a pre-generation data summary panel before the user clicks download, displaying: number of treatments, number of replications, list of parameters with data, and any data quality warnings (missing reps, unbalanced design, insufficient data).

6.4 A progress indicator SHALL be shown during report generation with the current step (e.g., "Computing treatment means… Running ANOVA… Building ANOVA table… Embedding photos…").

6.5 If any treatment has fewer replications than others, the system SHALL display a warning: "Unbalanced design detected — [Treatment X] has only [n] replications. ANOVA results should be interpreted with caution."

6.6 The system SHALL validate that at least 2 treatments with at least 2 replications each have data for the selected metric before enabling the download button. If not, it SHALL show a specific message explaining what data is missing.

---

## Requirement 7 — Data Transformation Support

**User Story:** As a statistician, I want the report to apply appropriate data transformations before ANOVA when the raw data violates normality assumptions, so that the statistical analysis is valid.

### Acceptance Criteria

7.1 The report generation flow SHALL offer an optional data transformation selector: None, Arcsine (√), Log (log₁₀), Square Root (√), and Probit.

7.2 When a transformation is applied, the report SHALL show means in both transformed and back-transformed (original) units.

7.3 The report SHALL display the transformation used as a footnote in every table where transformed data is presented.

7.4 Arcsine transformation SHALL be the default suggestion for percentage data (weed cover %, disease severity %) when selected.

7.5 Log transformation SHALL be the default suggestion for count data (pest count, lesion count).

---

## Requirement 8 — Large-Scale / Field Map Trial Reports

**User Story:** As a researcher running large-scale field trials with spatial data (sectors, quadrants, GPS coordinates), I want reports that include spatial analysis and sector-level summaries, not just per-plot lists.

### Acceptance Criteria

8.1 For projects with `Design === 'LargeScale'`, the report generator SHALL use the flat `observations` array from `largeScaleService` to build sector-level treatment means.

8.2 The large-scale report SHALL include a sector/treatment assignment map (text-based if GIS not available) showing which sector received which treatment.

8.3 Spatial variability (CV% across sectors for the same treatment) SHALL be computed and reported as a "Field Uniformity" metric.

8.4 The large-scale report SHALL include GPS coordinates and sector codes in the Treatment List section.

8.5 Weather data (temperature, humidity, wind, rainfall) aggregated across observation visits SHALL be included in the report.

---

## Requirement 9 — ARM / Regulatory Export Compatibility

**User Story:** As a regulatory submitter, I want the exported data to conform to Agricultural Research Manager (ARM) exchange format standards so that it can be imported directly into ARM software.

### Acceptance Criteria

9.1 The ARM CSV export SHALL include treatment codes, block IDs, observation values at each DAA, and all required ARM header fields.

9.2 The ARM export SHALL support multi-parameter export — all observation fields for the category SHALL be included as separate columns, not just the primary metric.

9.3 The ARM export SHALL be accessible both from the Reports page and from the LargeScaleTrials page for large-scale projects.

9.4 The system SHALL validate required ARM fields before export and warn the user if any mandatory fields (treatment code, application date, observation date) are missing.

---

## Requirement 10 — Report Quality and Professionalism

**User Story:** As a researcher submitting results to clients or regulatory agencies, I want reports that look professionally formatted and include proper scientific notation, footnotes, and metadata.

### Acceptance Criteria

10.1 All numeric values in tables SHALL be formatted to a consistent decimal precision: means and SD to 2 decimal places; F-values to 3 decimal places; p-values to 4 decimal places.

10.2 Non-significant results SHALL display "NS" and significant results SHALL display "*" (5%) or "**" (1%) in means tables following standard agronomic reporting conventions.

10.3 Reports SHALL include a header footer on every page: trial/project name on the left, page number on the right, and report generation date at the bottom.

10.4 The cover page SHALL display: Organisation name (from Organisations data), investigator name, trial location, GPS coordinates (if available), crop, target pest/disease/nutrient, application dates, and a "Confidential — For Research Purposes Only" disclaimer.

10.5 The report SHALL include a "Data Completeness" section noting the percentage of expected observations that were actually collected, and the date range of observations.

10.6 Tables with LSD groupings SHALL include a footnote explaining: "Means followed by the same letter are not significantly different at the [α]% level of significance using [test name]."

10.7 The report SHALL be generated entirely client-side (no server required) and SHALL work in offline mode.
