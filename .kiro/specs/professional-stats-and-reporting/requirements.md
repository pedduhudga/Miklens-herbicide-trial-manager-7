# Requirements Document

## Introduction

This document defines requirements for the **Professional Stats and Reporting** feature upgrade to the Miklens Herbicide Trial Manager — a progressive web application (PWA) used by agronomists, field researchers, and regulatory scientists to design, execute, and analyse agricultural product trials across the categories: herbicide, fungicide, pesticide, nutrition, and biostimulant.

The application already contains a functional statistical analysis engine (`statsUtils.js`, `analysisUtils.js`) and a report generation pipeline (`reportDataBuilder.js`, `pdfReportRenderer.js`, `excelReportRenderer.js`, `docxReportRenderer.js`). However, several critical capabilities required by professional research practice are missing or incomplete. This upgrade addresses seven gap areas:

1. Missing data input and export capabilities on the Statistics page
2. Missing statistical outputs (visualisations, additional tests, post-hoc methods)
3. Missing report design templates and PowerPoint export
4. Missing content sections in generated reports
5. Incomplete structured plot-level data fields
6. Missing tidy raw data export formats
7. Incomplete multi-parameter reporting for project-level analysis

The system under spec is referred to as the **App** throughout this document. Sub-systems are named where required (e.g., Statistics_Page, Report_Engine, Plot_Editor).

---

## Glossary

- **ANOVA**: Analysis of Variance — a statistical method for testing whether treatment means differ significantly.
- **ANCOVA**: Analysis of Covariance — ANOVA with a continuous covariate to reduce experimental error.
- **App**: The Miklens Herbicide Trial Manager PWA.
- **ARM**: Agricultural Research Manager — an industry-standard trial data exchange format.
- **BBCH**: Biologische Bundesanstalt, Bundessortenamt und CHemische Industrie — a standardised scale for phenological growth stages of crops.
- **Bartlett's Test**: A parametric test for homogeneity of variance across groups, sensitive to non-normality.
- **Bonferroni Correction**: A multiple comparisons adjustment that divides the family-wise α by the number of comparisons.
- **CLD**: Compact Letter Display — a notation system assigning letters to treatments such that treatments sharing a letter are not significantly different.
- **Cohen's d**: A standardised effect size expressing the difference between two means in standard deviation units.
- **CRD**: Completely Randomised Design — a trial layout where treatments are assigned randomly without blocking.
- **CV%**: Coefficient of Variation (%) — the ratio of standard deviation to mean, expressed as a percentage; a measure of experimental precision.
- **DAA**: Days After Application — the time interval between treatment application and an efficacy observation.
- **Dunnett's Test**: A post-hoc test comparing each treatment mean to a single control mean.
- **Duncan's MRT**: Duncan's Multiple Range Test — a step-wise post-hoc test ranking treatments.
- **ED50 / ED90**: Effective Dose causing 50% / 90% of maximum response, derived from dose-response modelling.
- **Effect Size**: A quantitative measure of the practical significance of a statistical result (η², ω², Cohen's d).
- **EARS**: Easy Approach to Requirements Syntax — a structured language pattern for writing requirements.
- **GEP**: Good Experimental Practice — EPPO standard for the conduct of efficacy trials.
- **GLP**: Good Laboratory Practice — regulatory framework ensuring quality and integrity of non-clinical safety studies.
- **GPS**: Global Positioning System — geographic coordinate data per plot.
- **Jarque-Bera Test**: A normality test based on skewness and kurtosis of residuals.
- **LSD**: Least Significant Difference — the minimum difference between two treatment means considered statistically significant.
- **MSE**: Mean Square Error — the within-group variance estimate from ANOVA.
- **OECD**: Organisation for Economic Co-operation and Development — issues guidelines for chemical testing and trial data standards.
- **PlotNumber**: A unique numeric identifier assigned to each experimental plot within a trial.
- **Plot_Editor**: The UI component for entering and editing per-plot observation data.
- **Power Analysis**: Statistical calculation to determine the sample size needed to detect a treatment effect at a specified probability.
- **PPTX**: PowerPoint Open XML format — Microsoft PowerPoint slide deck file.
- **Q-Q Plot**: Quantile-Quantile plot — a diagnostic graphic comparing sample quantiles against theoretical normal distribution quantiles to assess normality.
- **RCBD**: Randomised Complete Block Design — a trial layout where treatments are assigned within blocks to control field variation.
- **Report_Engine**: The collection of services responsible for building and rendering project and single-trial reports.
- **Residual Plot**: A diagnostic chart of model residuals versus fitted values, used to assess ANOVA assumptions.
- **Shapiro-Wilk Test**: A normality test with greater power than Jarque-Bera for small samples (n < 50).
- **SNK**: Student-Newman-Keuls test — a step-down post-hoc test controlling the family-wise error rate at each step.
- **SoilPH**: Soil pH value recorded per plot or per trial.
- **SoilClay**: Soil clay content (%) recorded per plot or per trial.
- **Statistics_Page**: The Statistics.jsx page component and its supporting logic.
- **Tier Classification**: Categorical efficacy rating assigned to a treatment based on its mean control percentage (Excellent, Good, Fair, Poor).
- **Tidy Format**: A data organisation standard where each row represents one observation and each column represents one variable, per OECD/ISO trial data conventions.
- **Tukey HSD**: Tukey's Honestly Significant Difference — a post-hoc test controlling family-wise error rate for all pairwise comparisons.
- **UTC**: Untreated Control — the reference treatment against which treatment efficacy is calculated.

---

## Requirements

### Requirement 1: Statistical Results Export — PDF and Excel

**User Story:** As an agronomist, I want to export the full statistical results table from the Statistics page to PDF and Excel formats, so that I can share formatted analysis outputs with colleagues and include them in regulatory submissions without manually copying figures.

#### Acceptance Criteria

1. WHEN a statistical analysis has been run successfully on the Statistics_Page, THE Statistics_Page SHALL display an "Export PDF" button and an "Export Excel" button alongside the existing "Export CSV" button.
2. WHEN the user clicks "Export PDF" on the Statistics_Page, THE Statistics_Page SHALL generate and download a PDF document containing: the treatment means table with CLD letters, the full ANOVA table (source, SS, df, MS, F, p-value), all precision statistics (CV%, SEm±, LSD/CD at 5% and 1%), effect sizes (η², ω², Cohen's d), the assumptions validation table (normality test name, statistic, p-value, pass/fail), and the project and test configuration header (project name, test type, metric, α, DAA, transformation, date).
3. WHEN the user clicks "Export Excel" on the Statistics_Page, THE Statistics_Page SHALL generate and download an Excel workbook containing at minimum two worksheets: one for the treatment means table with CLD letters and one for the ANOVA table, with all numeric cells formatted to four decimal places.
4. IF the statistical analysis result contains an error field, THEN THE Statistics_Page SHALL disable both export buttons and display the error message in the export area.
5. WHEN the PDF or Excel export is initiated, THE Statistics_Page SHALL display a loading indicator until the file is ready for download.
6. THE Statistics_Page SHALL name the exported PDF file using the pattern `stats_[ProjectName]_[TestType]_[YYYY-MM-DD].pdf` and the Excel file using `stats_[ProjectName]_[TestType]_[YYYY-MM-DD].xlsx`.


### Requirement 2: Statistical Visualisation — Bar Chart, Box Plot, and Residual Plots

**User Story:** As a researcher, I want to see visual charts of statistical results directly on the Statistics page, so that I can rapidly assess treatment separation, data distribution, and the validity of ANOVA assumptions without switching to an external tool.

#### Acceptance Criteria

1. WHEN an ANOVA, Tukey HSD, Duncan's MRT, Dunnett's Test, or Kruskal-Wallis result is displayed on the Statistics_Page, THE Statistics_Page SHALL render a horizontal bar chart showing each treatment mean, with error bars representing ±1 standard error, and CLD letter annotations positioned above each bar.
2. WHEN a post-hoc test result is displayed and at least one treatment has ≥ 3 replication values, THE Statistics_Page SHALL render a box plot panel showing the distribution (median, IQR, whiskers at 1.5×IQR, individual data points as dots) for each treatment group.
3. WHEN an ANOVA result containing residuals is available, THE Statistics_Page SHALL render a residual diagnostic panel consisting of: a histogram of residuals with a normal curve overlay, and a Q-Q plot of standardised residuals against theoretical normal quantiles.
4. WHEN the user selects the "Dose-Response" test on the Statistics_Page, THE Statistics_Page SHALL render a dose-response scatter plot with the fitted 4-parameter logistic (4-PL) curve overlaid, axis labels showing log₁₀(dose) on the x-axis and the selected metric on the y-axis, and annotations for ED50 and ED90 values.
5. WHERE the Chart.js library is available, THE Statistics_Page SHALL use Chart.js to render all statistical charts described in this requirement.
6. THE Statistics_Page SHALL provide a "Download Chart" button beneath each chart that exports the chart as a PNG image file.
7. IF fewer than 2 treatment groups have sufficient data to render a chart, THEN THE Statistics_Page SHALL display a message stating the minimum data requirement rather than rendering an empty or broken chart.


### Requirement 3: Advanced Normality and Variance Homogeneity Tests

**User Story:** As a statistician, I want the Statistics page to include Shapiro-Wilk normality testing and Bartlett's variance homogeneity test alongside the existing Jarque-Bera and Levene tests, so that I can select the most appropriate assumption diagnostic for my sample size and data distribution.

#### Acceptance Criteria

1. WHEN an ANOVA-based test completes and residuals are available, THE Statistics_Page SHALL display four assumption test results in the Assumptions Validation card: Jarque-Bera (existing), Shapiro-Wilk (new), Levene's (existing), and Bartlett's (new), each showing the test statistic, p-value, and a pass/fail indicator at the current α level.
2. THE Statistics_Page SHALL implement the Shapiro-Wilk W statistic using the Royston (1992) approximation algorithm for sample sizes between 3 and 5000 observations.
3. WHEN the Shapiro-Wilk test is computed on fewer than 3 residuals, THE Statistics_Page SHALL display "N/A — insufficient data" for the Shapiro-Wilk result without raising a runtime error.
4. THE Statistics_Page SHALL use the `calculateBartlettsTest` function already present in `analysisUtils.js` to supply the Bartlett's test result for the Assumptions Validation card.
5. WHEN both Shapiro-Wilk and Jarque-Bera disagree in their normality conclusion, THE Statistics_Page SHALL display an advisory note recommending that the user consider the Kruskal-Wallis non-parametric alternative, referencing both test results.
6. WHEN both Bartlett's and Levene's tests indicate heteroscedasticity (p < α), THE Statistics_Page SHALL display an advisory note recommending Welch's correction or data transformation.


### Requirement 4: Additional Post-Hoc Tests — SNK and Bonferroni

**User Story:** As a statistician, I want Student-Newman-Keuls (SNK) and Bonferroni correction available as post-hoc options on the Statistics page and in the Report Config panel, so that I can choose a method that matches the alpha-error control requirements of my study protocol.

#### Acceptance Criteria

1. THE Statistics_Page SHALL add "Student-Newman-Keuls (SNK)" and "Bonferroni Correction" as selectable options in the Statistical Test dropdown under the Post-Hoc Comparisons group.
2. WHEN the user selects SNK, THE Statistics_Page SHALL perform SNK step-down testing using the Studentized Range distribution critical values, comparing ordered treatment means from largest to smallest in a step-down fashion, and assign CLD letters using the same `assignLetterGroups` pattern as Tukey HSD and Duncan's MRT.
3. WHEN the user selects Bonferroni, THE Statistics_Page SHALL perform all pairwise t-tests and apply the Bonferroni-adjusted significance threshold α* = α / m, where m is the number of pairwise comparisons, and report each pair as significant or non-significant at the adjusted threshold.
4. THE Report_Engine ReportConfigPanel SHALL add "SNK" and "Bonferroni" as selectable options in the Post-hoc Test dropdown alongside the existing LSD, Tukey HSD, and Duncan's MRT options.
5. WHEN the Bonferroni test is used and the number of pairwise comparisons m exceeds 20, THE Statistics_Page SHALL display an advisory note stating that Bonferroni becomes overly conservative for large treatment numbers and recommending Tukey HSD as an alternative.
6. WHEN SNK or Bonferroni results are exported to CSV, PDF, or Excel, THE Statistics_Page SHALL include the adjusted critical value or adjusted α level in the output header rows.


### Requirement 5: Power Analysis UI — Complete Input Controls

**User Story:** As a trial designer, I want a fully functional Power Analysis interface on the Statistics page, so that I can determine the required number of replications before starting a trial to achieve sufficient statistical power.

#### Acceptance Criteria

1. WHEN the user selects "Power Analysis" from the Statistical Test dropdown on the Statistics_Page, THE Statistics_Page SHALL display a dedicated Power Analysis input panel containing: number of treatment groups (k, integer ≥ 2), replications per group (n, integer ≥ 2), expected effect size (Cohen's f, numeric > 0), significance level α (0.01, 0.05, 0.10), and target power (0.70, 0.80, 0.90).
2. THE Statistics_Page SHALL call `calculatePower` from `statsUtils.js`, passing the values from the input panel, and display the computed achieved power (0–1) and the minimum n required to reach the target power at the specified α and effect size.
3. WHEN the user changes any input field in the Power Analysis panel, THE Statistics_Page SHALL recompute and update the power result in real time without requiring the user to click "Run Analysis" again.
4. THE Statistics_Page SHALL render a power curve chart showing achieved power on the y-axis (0 to 1) against replications per group (n from 2 to 30) on the x-axis, with a horizontal dashed line at the target power level and a vertical dashed line at the computed minimum n.
5. IF the user has selected a project with existing trial data, THE Statistics_Page SHALL pre-populate the k field with the number of detected treatment groups from that project.
6. THE Statistics_Page SHALL display an interpretation panel beneath the power result, classifying achieved power as: Insufficient (< 0.70), Acceptable (0.70–0.79), Good (0.80–0.89), or Excellent (≥ 0.90).


### Requirement 6: Report Design Templates

**User Story:** As a researcher, I want to select from multiple professionally designed report templates when generating a project PDF, so that the output format matches the intended audience — whether a scientific journal submission, a regulatory dossier, a quick field summary, or a stakeholder presentation.

#### Acceptance Criteria

1. THE Report_Engine ReportConfigPanel SHALL add a "Report Template" selector as a new configuration option with four named templates: "Standard" (existing layout, default), "Scientific Journal", "Field Summary Card", and "Regulatory Submission".
2. WHEN the user selects "Scientific Journal" and generates a PDF, THE Report_Engine SHALL produce a compact, two-column layout using a sans-serif typeface, with section headings in bold 9pt, body text in 8pt, tables formatted to publication width, and no decorative colour bands — suitable for submission to agronomic journals.
3. WHEN the user selects "Field Summary Card" and generates a PDF, THE Report_Engine SHALL produce a single A4 page containing: the project name and site, the top-ranked treatment with its mean efficacy and CLD letter, a small embedded photo (if available), the CV% and LSD values, and a brief one-paragraph plain-language summary — formatted for printing and posting in a field office.
4. WHEN the user selects "Regulatory Submission" and generates a PDF, THE Report_Engine SHALL produce a document conforming to GLP/GEP report structure, including: a cover page with study number, protocol reference, sponsor name, test facility, and GLP/GEP compliance statement; numbered sections with decimal headings (1.0, 1.1, etc.); an investigator signature block on the final page; and page numbers in the format "Page N of M".
5. WHEN the user selects "Scientific Journal", "Field Summary Card", or "Regulatory Submission" templates, THE Report_Engine SHALL apply the selected template to the same underlying `buildReportData` output, without requiring separate data processing pipelines.
6. WHEN any template generates a PDF exceeding 50 pages, THE Report_Engine SHALL append a table of contents on page 2 with page number references for each major section.


### Requirement 7: PowerPoint Export

**User Story:** As a research manager, I want to export a project summary as a PowerPoint presentation, so that I can present trial results to agronomists and stakeholders in a meeting without manually creating slides from the report data.

#### Acceptance Criteria

1. THE Report_Engine ReportConfigPanel SHALL add "PPTX" as a fourth format option in the Report Format selector, displayed alongside the existing PDF, Excel, and DOCX buttons.
2. WHEN the user selects PPTX format and clicks "Generate Report", THE Report_Engine SHALL create a PowerPoint file using the `pptxgenjs` library (already installed) containing the following slides in order: a title slide with project name, category, date, and trial count; a trial design slide listing design type (CRD/RCBD), number of treatments, and number of replications; a treatment means slide with a bar chart showing mean efficacy per treatment with error bars; an ANOVA results slide showing the ANOVA table in tabular form with the F-statistic and p-value highlighted; a treatment ranking slide listing all treatments ranked by mean efficacy with their Tier Classification and CLD letter; and a conclusions slide with the three highest-ranked treatments and their mean values.
3. WHERE photos are available and the "Include Photos" option is enabled, THE Report_Engine SHALL add a photo slide with up to 6 trial photos arranged in a 2×3 grid.
4. WHEN the PPTX file is generated, THE Report_Engine SHALL name it using the pattern `[ProjectName]_[Category]_Trial_Summary_[YYYY-MM-DD].pptx`.
5. THE Report_Engine SHALL apply a consistent colour scheme to the PPTX using the category accent colour (e.g., green for herbicide, blue for fungicide) for slide header backgrounds and chart bar fill.
6. IF the report data contains fewer than 2 treatments, THEN THE Report_Engine SHALL display an error notification and SHALL NOT generate the PPTX file.


### Requirement 8: Charts Embedded in PDF Reports

**User Story:** As a researcher, I want the project PDF report to include embedded efficacy bar charts and time-series charts as actual images, so that stakeholders can interpret treatment performance visually without needing to cross-reference a separate charting tool.

#### Acceptance Criteria

1. WHEN the Report_Engine generates a project PDF, THE Report_Engine SHALL embed a treatment means bar chart (mean efficacy per treatment, with error bars representing ±1 SE) immediately after the treatment means table section.
2. WHEN time-series observation data across multiple DAA timepoints is available for the primary metric, THE Report_Engine SHALL embed a line chart showing efficacy over time (DAA on x-axis, metric value on y-axis, one line per treatment) in the time-series section of the PDF.
3. THE Report_Engine SHALL render each chart as an off-screen HTML Canvas element using Chart.js, export the canvas to a base64-encoded PNG at a resolution of at least 1200×600 pixels, and embed the PNG into the PDF document using `jsPDF`'s `addImage` method.
4. WHEN the "Include Photos" option is disabled but chart rendering is enabled, THE Report_Engine SHALL still embed the statistical charts in the PDF regardless of the photo toggle state.
5. IF chart rendering fails for any chart (e.g., Canvas API unavailable in the current environment), THEN THE Report_Engine SHALL log the error, skip that chart, and continue PDF generation without aborting the full report.
6. WHEN a project PDF is generated with the "Scientific Journal" template, THE Report_Engine SHALL size embedded charts to a single column width (approximately 85mm) to fit the two-column layout.


### Requirement 9: Treatment Efficacy Ranking and Tier Classification

**User Story:** As an agronomist, I want all treatments ranked by efficacy with a clear tier label in both reports and the Statistics page, so that I can immediately communicate which products performed well to farmers and clients without requiring them to interpret statistical tables.

#### Acceptance Criteria

1. THE Report_Engine SHALL compute a Tier Classification for each treatment based on its mean primary metric value using the following thresholds (for control percentage metrics): Excellent (mean ≥ 80%), Good (60% ≤ mean < 80%), Fair (40% ≤ mean < 60%), Poor (mean < 40%).
2. WHEN a project PDF or DOCX report is generated, THE Report_Engine SHALL include a Treatment Ranking Table section containing: rank number, treatment name, mean value, standard error, CLD letter, Tier Classification label, and a colour-coded tier indicator (e.g., green for Excellent, yellow for Good, orange for Fair, red for Poor).
3. WHEN any report template other than "Field Summary Card" is selected, THE Report_Engine SHALL position the Treatment Ranking Table after the ANOVA table and before the time-series section.
4. WHEN the metric is not a percentage-based control metric (e.g., yield, plant height, biomass), THE Report_Engine SHALL rank treatments by descending mean value without applying fixed percentage thresholds, and SHALL display the rank and relative performance index (treatment mean / highest treatment mean × 100) instead of a Tier Classification.
5. WHEN the Statistics_Page displays post-hoc test results, THE Statistics_Page SHALL render a Tier Classification badge next to each treatment mean in the treatment means table, using the same thresholds defined in criterion 1.
6. THE Report_Engine SHALL sort the Treatment Ranking Table by descending treatment mean, with the UTC/control treatment always listed last regardless of its efficacy value.


### Requirement 10: Multi-Parameter Full ANOVA in Project Reports

**User Story:** As a researcher, I want the project report to perform and include a complete ANOVA and post-hoc analysis for every parameter that has sufficient data — not just the primary metric — so that I can assess treatment performance across all measured endpoints in a single document.

#### Acceptance Criteria

1. WHEN the Report_Engine builds a project report, THE Report_Engine SHALL run a full ANOVA (using the selected post-hoc test and α level) for every parameter returned by `getParametersWithData` that has data in at least 2 treatment groups with at least 2 replications each.
2. FOR EACH parameter that passes the minimum data threshold, THE Report_Engine SHALL include in the report: a parameter-level section with the treatment means table (mean ± SE, CLD letters), the ANOVA table (source, SS, df, MS, F, p), and the precision statistics (CV%, LSD).
3. WHEN a parameter has fewer than 2 treatment groups with sufficient data, THE Report_Engine SHALL include a note in the report stating "Insufficient replication data for full ANOVA on [parameter name] — descriptive means only" and include only the treatment means without ANOVA.
4. THE Report_Engine SHALL process multi-parameter ANOVA sequentially to avoid blocking the UI, updating the progress modal with the name of the parameter currently being processed.
5. WHEN the number of parameters with sufficient data exceeds 10, THE Report_Engine SHALL generate a collapsible secondary parameters appendix section in the PDF/DOCX rather than inline sections, to preserve document readability.
6. THE Report_Engine SHALL include a summary table at the start of the multi-parameter section listing all parameters, their F-statistic, p-value, and significance status (significant / non-significant at α), allowing readers to identify which parameters showed treatment effects.


### Requirement 11: Executive Summary Auto-Generation for Project PDF

**User Story:** As a project manager, I want the project-level PDF report to include an automatically generated executive summary narrative, so that I can provide a plain-language overview of trial results without writing it manually for every report.

#### Acceptance Criteria

1. WHEN a project PDF report is generated, THE Report_Engine SHALL include an Executive Summary section on the page immediately following the cover page.
2. THE Report_Engine SHALL generate the executive summary narrative programmatically from the report data using a structured template, without requiring an AI API call, including: the project name, category, number of trials, trial location(s), trial design type, number of treatments, the top-ranked treatment name and its mean efficacy value with CLD letter, whether the overall ANOVA was significant (F-statistic and p-value), the CV% as a precision indicator, and the date of the most recent observation.
3. WHEN the primary ANOVA result is statistically significant (p < α), THE Report_Engine SHALL include in the executive summary narrative a sentence of the form: "Treatments differed significantly (F = [value], p = [value]), with [top treatment] achieving the highest [metric label] of [mean]% [CLD letter]."
4. WHEN the primary ANOVA result is not statistically significant (p ≥ α), THE Report_Engine SHALL include in the executive summary narrative a sentence of the form: "No statistically significant differences were detected among treatments (F = [value], p = [value]) at the [α×100]% significance level."
5. WHERE weather data is included in the report, THE Report_Engine SHALL add one sentence to the executive summary describing the temperature range and total rainfall recorded during the trial period.
6. THE Report_Engine SHALL limit the executive summary to a maximum of 250 words and SHALL not include raw statistical tables in the executive summary section.


### Requirement 12: Correlation Analysis Between Parameters

**User Story:** As a researcher, I want a correlation analysis table between all measured parameters included in the project report, so that I can identify relationships between efficacy metrics (e.g., weed cover vs control percentage, yield vs efficacy) and support multi-variate interpretation of results.

#### Acceptance Criteria

1. WHEN a project report is generated and the report data contains at least 2 parameters with treatment-level means, THE Report_Engine SHALL compute Pearson correlation coefficients for all unique parameter pairs and include a correlation matrix table in the report.
2. THE Report_Engine SHALL compute each Pearson correlation coefficient r from the treatment-level means of each parameter pair, using all treatments (including the control) as observations.
3. WHEN a correlation coefficient has a p-value < 0.05 (two-tailed t-test, df = number of treatments − 2), THE Report_Engine SHALL mark that cell in the correlation matrix with an asterisk (*), and p < 0.01 with a double asterisk (**).
4. IF fewer than 4 treatment-level mean pairs are available for a parameter pair, THEN THE Report_Engine SHALL display "N/A" in that cell of the correlation matrix rather than computing an unreliable coefficient.
5. WHEN the Statistics_Page has a result available, THE Statistics_Page SHALL display a correlation coefficient between the primary metric and each available secondary metric as additional rows beneath the precision statistics card.
6. THE Report_Engine SHALL position the correlation matrix section after the multi-parameter ANOVA summary table and before the dose-response section (if included).


### Requirement 13: Dose-Response Curve Integration in Project Reports

**User Story:** As a researcher, I want the dose-response analysis to be integrated into the project PDF report when dose variation is present across treatments, so that I can communicate ED50/ED90 values and curve fits within the same document as the ANOVA results.

#### Acceptance Criteria

1. WHEN a project report is generated and the project's sub-trials contain at least 3 distinct dosage values across treatments, THE Report_Engine SHALL include a Dose-Response Analysis section in the report.
2. THE Report_Engine SHALL call `performDoseResponseAnalysis` from `doseResponseUtils.js` using the primary metric and the dosage field from trial records, and include the resulting ED50, ED90, curve parameters (min, max, slope), R² goodness-of-fit, and model type (4-PL or linear) in a dose-response results table.
3. WHEN dose-response fitting succeeds (R² ≥ 0.70), THE Report_Engine SHALL embed a dose-response curve chart (log₁₀ dose on x-axis, metric value on y-axis, fitted curve line, observed mean points with error bars) as a PNG image in the Dose-Response section.
4. WHEN dose-response fitting produces R² < 0.70, THE Report_Engine SHALL include a note stating "Dose-response fit quality is low (R² = [value]); results should be interpreted with caution" alongside the curve parameters.
5. IF the project contains only a single dosage value per treatment (no dose gradient), THEN THE Report_Engine SHALL omit the Dose-Response section entirely and SHALL NOT raise an error.
6. THE Report_Engine SHALL report the dose unit (e.g., g a.i./ha, L/ha) in the dose-response table header, derived from the `Dosage` and `DosageUnit` fields of the trial records.


### Requirement 14: Structured Plot Data Fields

**User Story:** As a trial coordinator, I want each experimental plot to have standardised fields for PlotNumber, BBCH growth stage, GPS coordinates, soil pH, and soil clay content, so that statistical covariates and spatial analyses can be applied during analysis and these fields appear correctly in ARM and OECD export formats.

#### Acceptance Criteria

1. THE App SHALL ensure that every trial record supports the following structured plot-level fields: `PlotNumber` (positive integer), `BBCHCode` (string, validated against EPPO BBCH scale codes from `eppoBBCHData.js`), `GPSLatitude` (decimal degrees, range −90 to 90), `GPSLongitude` (decimal degrees, range −180 to 180), `SoilPH` (numeric, range 0.0–14.0), and `SoilClay` (numeric percentage, range 0–100).
2. WHEN a user creates or edits a trial record, THE App SHALL display input fields for all six structured plot-level fields defined in criterion 1, with appropriate validation error messages for out-of-range values.
3. WHEN a user enters a `BBCHCode`, THE App SHALL validate the code against the EPPO BBCH data and display the corresponding growth stage description as an inline tooltip or confirmation label.
4. IF a `PlotNumber` value is entered that duplicates an existing `PlotNumber` within the same project, THEN THE App SHALL display an inline validation warning stating "Plot number [N] is already assigned within this project."
5. WHEN the ANCOVA test is run on the Statistics_Page and `SoilPH` or `SoilClay` data is present for trial records, THE Statistics_Page SHALL include these fields as available covariate options in the Covariate Factor selector.
6. THE App SHALL treat `PlotNumber` as the primary sort key when displaying trial records within a project, and SHALL use `PlotNumber` in all export formats to identify individual plots.


### Requirement 15: Tidy CSV Raw Data Export

**User Story:** As a data analyst, I want to export a single tidy-format CSV file containing all plot-level replications and all observation parameters for a project, so that I can import the data into R, Python, or SAS for further analysis without manual reformatting.

#### Acceptance Criteria

1. THE App SHALL provide a "Tidy Data Export (CSV)" option accessible from the Reports page Single Trial Export Hub for a selected project.
2. WHEN the user initiates a Tidy Data Export, THE App SHALL generate a CSV file where each row represents one observation record with the following columns: `ProjectID`, `ProjectName`, `TrialID`, `PlotNumber`, `BlockID`, `TreatmentName`, `DosageValue`, `DosageUnit`, `BBCH`, `GPSLatitude`, `GPSLongitude`, `SoilPH`, `SoilClay`, `DAA`, `ObservationDate`, and one column per observation parameter present in the project (e.g., `controlPct`, `weedCover`, `yield`, `diseaseSeverity`, `pestCount`, `plantHeight`, `rootBiomass`, `shootBiomass`, `chlorophyllIndex`, `phytotoxicityPct`).
3. WHEN a field has no recorded value for a given observation row, THE App SHALL output an empty cell (not zero, not "N/A") for that field in the tidy CSV.
4. THE App SHALL name the exported tidy CSV file using the pattern `[ProjectName]_tidy_data_[YYYY-MM-DD].csv`.
5. WHEN the tidy CSV is generated, THE App SHALL include a header row as the first line with the column names listed in criterion 2.
6. THE App SHALL include all replications and all DAA timepoints in the tidy CSV; the export SHALL NOT aggregate or average values across replications.


### Requirement 16: Baseline (Pre-Spray) Observation Enforcement

**User Story:** As a researcher, I want the system to require and validate a pre-spray baseline observation before post-spray observations are entered, so that efficacy calculations are anchored to confirmed initial conditions and I can compute Abbott's correction or ANCOVA adjustment using real baseline values.

#### Acceptance Criteria

1. THE App SHALL support a `BaselineObservations` field on each trial record, structured as a JSON array with the same parameter keys as `EfficacyDataJSON` entries, with a `daa` value of 0 (representing the day of application).
2. WHEN a user attempts to enter the first post-spray observation (DAA > 0) for a trial that has no baseline observation recorded, THE App SHALL display a warning dialog stating "No pre-spray baseline observation has been recorded. Recording a baseline is strongly recommended for accurate efficacy calculation. Proceed without baseline?"
3. WHEN a baseline observation is present for a trial, THE Statistics_Page SHALL make the baseline data available as the zero-timepoint in time-series analyses and SHALL include the baseline values in Repeated Measures ANOVA as the first time point.
4. WHEN the ANCOVA test is selected and a trial has baseline observations, THE Statistics_Page SHALL offer the primary metric's baseline value as an optional covariate in the Covariate Factor selector, labelled "[Metric] Baseline (DAA 0)".
5. THE App SHALL display a visual indicator on each trial card or trial list row distinguishing trials with a baseline recorded (green check icon) from trials without a baseline (amber warning icon).
6. WHEN a project PDF report is generated, THE Report_Engine SHALL include the baseline mean values in the time-series table as the first row labelled "DAA 0 (Pre-spray)" if baseline data is present for at least 50% of the sub-trials in the project.


### Requirement 17: Yield Data Entry UI

**User Story:** As a field researcher, I want a dedicated yield data entry interface within the trial record, so that I can record harvest yield values with units, plot numbers, and quality parameters in a structured form that feeds directly into the ANOVA and report pipeline.

#### Acceptance Criteria

1. THE App SHALL provide a dedicated Yield Data Entry panel accessible within the trial editing view, displayed when the `yield` field is listed as a parameter for the active category.
2. THE Yield_Entry_Panel SHALL contain the following input fields per plot: `PlotNumber` (read-only, populated from the trial's PlotNumber), `YieldValue` (numeric, required), `YieldUnit` (dropdown: t/ha, kg/ha, bu/ac, kg/plot), `GrainMoisture` (numeric percentage, optional), `ThousandGrainWeight` (numeric grams, optional), and `YieldNotes` (free text, optional).
3. WHEN the user saves a yield entry, THE App SHALL store the yield value in the trial's `EfficacyDataJSON` under the `yield` key at the harvest DAA timepoint, and SHALL also persist the unit, moisture, and thousand-grain weight in a `YieldDetails` object on the trial record.
4. WHEN yield data is present for at least 2 treatment groups in a project, THE Statistics_Page SHALL include `yield` as a selectable metric in the Metric dropdown.
5. IF a yield value is entered that is greater than 20 times the mean of all other entered yield values for the same project, THEN THE App SHALL display an inline warning flagging the value as a potential outlier, without blocking the save operation.
6. WHEN a project report is generated and yield data is available, THE Report_Engine SHALL include a Yield Analysis section with the treatment means table (mean yield ± SE, CLD letters, Tier rank by yield), the ANOVA table, and where more than 3 distinct dosage values exist, a dose-response curve for yield.


### Requirement 18: Phytotoxicity and Crop Safety Section in Reports

**User Story:** As a regulatory researcher, I want phytotoxicity and crop safety observations to be captured and reported as a dedicated section in project and single-trial reports, so that product safety to the crop can be assessed alongside efficacy in a single document.

#### Acceptance Criteria

1. THE App SHALL support a `PhytotoxicityPct` field (numeric, 0–100) and a `PhytotoxicityNotes` (free text) field as observation parameters within `EfficacyDataJSON` entries, alongside efficacy parameters.
2. WHEN a user records observations for a trial, THE App SHALL display a Phytotoxicity sub-panel within the observation entry form with inputs for `PhytotoxicityPct` (0–100 slider and numeric input) and `PhytotoxicityNotes` (text area), labelled "Crop Injury / Phytotoxicity (%)".
3. WHEN a project report is generated and at least one trial in the project has a non-zero `PhytotoxicityPct` value recorded, THE Report_Engine SHALL include a Phytotoxicity and Crop Safety section in the report containing: a treatment means table for phytotoxicity percentage (mean ± SE, CLD letters from ANOVA), a safety classification per treatment (Safe: mean < 5%, Minor Injury: 5–10%, Moderate Injury: 10–25%, Severe Injury: > 25%), and any phytotoxicity notes recorded for each treatment.
4. WHEN all recorded `PhytotoxicityPct` values for a project are zero, THE Report_Engine SHALL include a single sentence in the Crop Safety section stating "No phytotoxic effects were observed in any treatment throughout the trial period."
5. WHEN the Regulatory Submission template is used, THE Report_Engine SHALL position the Phytotoxicity and Crop Safety section immediately after the main efficacy treatment means section and before the yield section.
6. THE Statistics_Page SHALL include `phytotoxicityPct` as a selectable metric in the Metric dropdown for all product categories when phytotoxicity data is present in the selected project.


### Requirement 19: Residual Diagnostic Plots in Reports

**User Story:** As a statistician, I want residual diagnostic plots (residual histogram, Q-Q plot, fitted vs residual scatter) included in the project report when ANOVA has been run, so that peer reviewers and regulatory auditors can verify that ANOVA assumptions were assessed and documented.

#### Acceptance Criteria

1. WHEN a project report is generated using any template except "Field Summary Card", THE Report_Engine SHALL include a Statistical Assumptions section in the report containing residual diagnostic plots for the primary parameter ANOVA.
2. THE Report_Engine SHALL generate the following three diagnostic charts for the primary parameter residuals: (a) a histogram of residuals with a superimposed normal distribution curve; (b) a Normal Q-Q plot with residuals on the y-axis, theoretical normal quantiles on the x-axis, and a 45° reference line; (c) a Fitted Values vs Residuals scatter plot with a horizontal reference line at residual = 0.
3. THE Report_Engine SHALL use the `calculateResidualsDiagnostics` function from `analysisUtils.js` to obtain the residual array, and SHALL render each diagnostic chart as an HTML Canvas PNG using Chart.js before embedding in the PDF or DOCX.
4. WHEN the residuals array contains fewer than 6 values, THE Report_Engine SHALL include the text "Insufficient residual data for diagnostic plots (n = [count])" in the Statistical Assumptions section without attempting to render the charts.
5. THE Statistics_Page SHALL display a "Residual Diagnostics" expandable panel beneath the ANOVA result when an ANOVA, Tukey HSD, Duncan's MRT, SNK, or Bonferroni result is present, containing the same three diagnostic charts described in criterion 2.
6. WHEN the Shapiro-Wilk or Jarque-Bera test fails for the residuals displayed in the diagnostic plots, THE Report_Engine SHALL include an annotation beneath the Q-Q plot stating the normality test result and the p-value, and SHALL recommend the non-parametric alternative in the conclusions section.

