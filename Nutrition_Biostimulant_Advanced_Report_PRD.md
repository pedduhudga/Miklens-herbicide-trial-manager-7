# PRD: Advanced Agricultural Trial Report Generation System
## For Nutrition & Biostimulant Categories in Miklens App

**Document Version:** 1.0  
**Date:** June 2026  
**Author:** Peddu (Pavan R)  
**Target Implementation:** Miklens Herbicide Trial Manager v6+  
**Scope:** Nutrition (NPK, Micronutrients, Biofertilizers) & Biostimulant Trial Reports  

---

## 1. EXECUTIVE SUMMARY

### Goal
Implement **enterprise-grade Excel report generation** for Nutrition and Biostimulant trials that automatically produces **10-sheet professional reports** with ~70% automation and ~30% manual expert input.

### Reference Report
- **File:** TOK2322C_Tomato_Fertility_Report.xlsx
- **Sheets:** 10 sheets with 4,919+ merged cells, 48 formulas, 21 charts, 26 photos
- **Automation Level:** 70% automatic (formulas, ANOVA, charts) + 30% manual (data entry, interpretation)
- **Time Effort:** 100-125 hours per report (80 hours field work, 20-45 hours data processing & reporting)

### What This PRD Covers
- **Complete report architecture** (10 sheet specifications)
- **Data flow pipeline** (from trial data to automated Excel)
- **Formula & calculation specifications**
- **Chart and visualization strategy**
- **Statistical analysis integration**
- **Photo & media embedding**
- **Implementation timeline & tech stack**

---

## 2. PRODUCT OVERVIEW & OBJECTIVES

### 2.1 Categories In Scope

#### Nutrition Category
- **Primary Metrics:** Yield Improvement, Plant Height, Biomass, Nutrient Status
- **Efficacy Calc:** ((treated_value - control_value) / control_value) × 100
- **Key Observables:**
  - Crop growth stages and measurements
  - Visual deficiency ratings
  - Tissue nutrient analysis results
  - Yield and quality metrics
  - Post-harvest quality

#### Biostimulant Category
- **Primary Metrics:** Growth Response, Stress Tolerance, Root Development, Overall Vigor
- **Efficacy Calc:** ((treated_param - control_param) / control_param) × 100
- **Key Observables:**
  - Root development index
  - Shoot vigor ratings
  - Stress response measurements
  - Chlorophyll/NDVI readings
  - Plant vigor assessments

### 2.2 Key Objectives
✅ **Automate Report Generation:** From trial data → polished Excel report in 30 minutes  
✅ **Professional Quality:** Match or exceed industry standards (Pacific Ag Research level)  
✅ **Template-Based:** Reusable templates reduce manual work by 70%  
✅ **Real-Time Updates:** Charts and stats update when data changes  
✅ **Statistical Analysis:** Integrated ANOVA and significance testing  
✅ **Photo Integration:** Automatic photo gallery from trial documentation  
✅ **Batch Processing:** Generate multiple reports at once  
✅ **Quality Assurance:** Built-in validation and consistency checks  

---

## 3. REPORT STRUCTURE & SPECIFICATIONS

### 3.1 Complete Sheet Architecture

```
┌─────────────────────────────────────────────────────────┐
│ REPORT STRUCTURE: 10 SHEETS (TOK2322 Model)            │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  SECTION 1: EXECUTIVE & REFERENCE (3 sheets)          │
│  ├─ 1. Narrative (0% Automatic)                       │
│  ├─ 2. Trial Information (20% Automatic)              │
│  └─ 3. Treatment List & Map (50% Automatic)           │
│                                                         │
│  SECTION 2: DATA & ANALYSIS (4 sheets)                │
│  ├─ 4. Assessment Data Summary (15% Automatic)        │
│  ├─ 5. Chartwork (80% Automatic)                      │
│  ├─ 6. Post-Harvest Chartwork (90% Automatic)         │
│  └─ 7. AOV Means Table (95% Automatic)                │
│                                                         │
│  SECTION 3: VISUALIZATIONS (2 sheets)                 │
│  ├─ 8. Figures (90% Automatic)                        │
│  └─ 9. Statistical Charts (90% Automatic)             │
│                                                         │
│  SECTION 4: REFERENCE & EVIDENCE (2 sheets)           │
│  ├─ 10. Weather/Environmental Data (50% Automatic)    │
│  └─ 11. Photos & Documentation (100% Manual)          │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 4. DETAILED SHEET SPECIFICATIONS

### SECTION 1: EXECUTIVE & REFERENCE

#### **Sheet 1: Narrative (0% Automatic)**

**Purpose:** Executive summary, key findings, conclusions

**Content Structure:**
```
Header:
├─ Report Title
├─ Report ID (Auto-generated from Trial ID)
├─ Generation Date (Auto-timestamp)
└─ Organization Name

Key Findings Section:
├─ 1-2 paragraph summary of results
├─ Primary efficacy metric result (e.g., "Yield improved 15%")
├─ Statistical significance notation (p < 0.05, ns = not significant)
└─ Key observation about treatment effect

Summary Section:
├─ Trial Metadata (design, duration, location)
├─ Treatment details
├─ Environmental conditions summary
└─ Methodology overview

Conclusions Section:
├─ Statistical interpretation
├─ Practical significance assessment
├─ Recommendations
└─ Limitations & caveats
```

**Data Source:** Manual input by agronomist/study director  
**Word Count:** 300-500 words  
**Formatting:** 
- Merged cells for titles
- Font: Calibri 11pt
- Line spacing: 1.15
- Professional narrative voice

**Key Fields to Extract & Reference:**
```javascript
- Trial ID (from Trial Information)
- Trial Duration (from Treatment List)
- Treatment names and rates (from Treatment List)
- Primary efficacy metric and result (from Chartwork/AOV)
- P-value notation (from AOV Means Table)
- Environmental summary (from Weather sheet)
```

**Template Content:**
```
KEY FINDINGS
[AUTO-INSERT] Crop [cropName] was treated with [treatmentName] at [rate] [unit] 
applied via [applicationMethod]. Results showed [efficacy%] improvement in 
[primaryMetric] compared to [controlName] (p = [pValue]).

SUMMARY
A field trial was conducted at [location] from [startDate] to [endDate] to 
evaluate the efficacy of [treatmentName] in improving [primaryMetric] of 
[cropName] variety [variety].

Trial Design:
- Design: [designType] (e.g., RCB)
- Replicates: [repCount]
- Plot Size: [plotSize] ft x [plotSize] ft
- Treatments: [treatmentCount] (1 untreated check, [treatmentCount-1] test treatments)

[NARRATIVE - Manual writing required]

CONCLUSIONS
Based on the statistical analysis (ANOVA, RCB design) and field observations:
1. [Treatment] showed [positive/negative/no significant] effect on [metric]
2. Practical significance: [interpretation]
3. Recommendation: [action item for grower]
```

---

#### **Sheet 2: Trial Information (20% Automatic)**

**Purpose:** Complete trial metadata and experimental setup documentation

**Data Structure (4 columns × 37 rows):**
```
┌─────────────────────────────────┬──────────────────────┐
│ TRIAL INFORMATION SHEET         │                      │
├─────────────────────────────────┼──────────────────────┤
│ Trial ID:                       │ [AUTO-POPULATE]      │
│ Protocol ID:                    │ [AUTO-POPULATE]      │
│ Client Contact:                 │ [AUTO-POPULATE]      │
│ Sponsor Company:                │ [AUTO-POPULATE]      │
│                                 │                      │
│ Location:                       │ [AUTO-POPULATE]      │
│ Grower:                         │ [AUTO-POPULATE]      │
│ Farm & Block:                   │ [AUTO-POPULATE]      │
│ Principal Investigator:         │ [AUTO-POPULATE]      │
│                                 │                      │
│ CROP INFORMATION                │                      │
│ Crop:                           │ [DROP-DOWN: Tomato] │
│ Variety:                        │ [TEXT: Tulare]       │
│ Planting Date:                  │ [DATE: 6/30/2023]    │
│ Harvest Date (First):           │ [DATE: 8/15/2023]    │
│ Trial Duration:                 │ [AUTO-CALC: 77 days] │
│                                 │                      │
│ TRIAL DESIGN                    │                      │
│ Design Type:                    │ [DROP-DOWN: RCB]     │
│ Treatments:                     │ [NUMBER: 2]          │
│ Replicates:                     │ [NUMBER: 6]          │
│ Plot Size (length × width):     │ [TEXT: 5 ft × 40 ft] │
│ Total Plots:                    │ [AUTO-CALC: 12]      │
│                                 │                      │
│ TREATMENTS                      │                      │
│ Check Treatment:                │ [TEXT: Untreated]    │
│ Test Treatments:                │ [MULTI-SELECT]       │
│ Application Method:             │ [DROP-DOWN: Drip]    │
│ Application Volume:             │ [NUMBER: 100] GAL/AC │
│                                 │                      │
│ ENVIRONMENT                     │                      │
│ Region/Zone:                    │ [TEXT]               │
│ Soil Type:                      │ [DROP-DOWN]          │
│ Previous Crop:                  │ [TEXT]               │
│ Irrigation:                     │ [DROP-DOWN: Drip]    │
└─────────────────────────────────┴──────────────────────┘
```

**Data Source:** Populated from App State at trial creation + manual setup inputs  
**Merged Cells:** 12 (section headers)  
**Automation:** 
- 80% manual entry during trial creation
- 20% auto-filled from Trial object properties
- Drop-downs linked to predefined lists

**Auto-Population Fields:**
```javascript
// From app.state.trials[selectedTrial]
const autoFields = {
  'Trial ID': trial.id,
  'Location': trial.location,
  'Crop': trial.cropCrop,
  'Variety': trial.cropVariety,
  'Planting Date': trial.startDate,
  'Design Type': trial.designType,
  'Treatments': trial.treatments.length,
  'Replicates': trial.replications,
  'Plot Size': trial.plotSize,
  'Total Plots': trial.treatments.length * trial.replications,
  'Trial Duration': calculateDays(trial.startDate, trial.endDate)
};
```

**Excel Implementation:**
```
Sheet Structure:
A1:D1 → Title (merged cell, font: bold 14pt, color: emerald)
A2:B2 → "Trial ID:" (merged), C2:D2 → Value
A37:D37 → Footer (centered, gray background)

Formula Example:
C18 = (C13 - C12) in days
(Auto-calculate trial duration from start/end dates)
```

---

#### **Sheet 3: Treatment List & Map (50% Automatic)**

**Purpose:** Detailed treatment documentation and field layout visualization

**Components:**

**A. Treatment Details Table (2 treatments × 6 columns)**
```
┌────────┬──────────────────┬─────────┬────────┬──────────┬─────────┐
│ Trt No │ Treatment Name   │ Form    │ Rate   │ Unit     │ Notes   │
├────────┼──────────────────┼─────────┼────────┼──────────┼─────────┤
│ 1      │ Untreated Check  │ N/A     │ 0      │ N/A      │ Control │
│ 2      │ Test Treatment   │ [AUTO]  │ [AUTO] │ [AUTO]   │ [AUTO]  │
└────────┴──────────────────┴─────────┴────────┴──────────┴─────────┘
```

**B. Trial Design Summary**
```
Reps: 6 (cells merged showing design info)
Plots per Rep: 2
Total Plots: 12
Plot Size: 5 ft × 40 ft = 200 sq ft per plot
Application Method: [Drip line, Foliar spray, Fertigation, etc.]
Application Volume: 100 GAL/AC
```

**C. Embedded Field Map**
```
Visual representation of plot layout:
├─ Auto-generated if GPS data available (from geospatial feature)
├─ OR manually created/imported image showing:
│  ├─ Plot numbers (1-12)
│  ├─ Treatment assignments
│  ├─ Replication blocks (Rep 1-6)
│  └─ North arrow & scale
└─ Image embedded as OLE object (1 image)
```

**Data Source:**
- Formulations table from app.state.formulations
- Treatment rates from trial.treatments array
- GPS data (if available) for map generation
- Custom field map image (user uploads or auto-generated)

**Auto-Calculation Logic:**
```javascript
const treatmentData = {
  form: formulation.type, // e.g., "SC" = Suspension Concentrate
  rate: treatment.doseRate, // e.g., 2
  unit: treatment.doseUnit, // e.g., "L/ha"
  moa: formulation.modeOfAction, // e.g., "Gibberellin"
  ingredients: formulation.activeIngredients // Array of {name, percentage}
};

const designData = {
  totalPlots: trial.treatments.length * trial.replications,
  plotsPerRep: trial.treatments.length,
  plotArea: trial.plotSize.length * trial.plotSize.width,
  totalArea: plotArea * totalPlots
};
```

**Excel Implementation:**
```
Sheet Layout:
B4:N10 → Design summary (merged cells)
B6:F10 → Treatment table (auto-filled)
B12:N25 → Embedded image (field map)

Image Insertion:
ws.add_image(Image('field_map.png'), 'B12')
image.width = 450  // pixels
image.height = 300
```

---

### SECTION 2: DATA & ANALYSIS

#### **Sheet 4: Assessment Data Summary (15% Automatic)**

**Purpose:** Raw field measurement data - foundation of entire report

**Specifications:**
- **Size:** 128 columns × 123 rows (massive dataset)
- **Purpose:** Raw field and lab measurements
- **Automation:** 15% (validation only)
- **Manual Input:** 85% (field collection + data entry)

**Column Categories:**

**A. Metadata (Columns A-F)**
```
A: Date
B: Days After Application (DAA)
C: Harvest Number
D: Plot Number
E: Replication
F: Treatment Number
```

**B. Plant Growth & Vigor (Columns G-M)**
```
G: Plant Height (cm)
H: Plant Height Average
I: Stem Diameter (mm)
J: NDVI (Normalized Difference Vegetation Index)
K: NDRE (Normalized Difference Red Edge)
L: Chlorophyll Content
M: Visual Vigor Rating (0-10 scale)
```

**C. Nutritional Status (Columns N-W) - NUTRITION SPECIFIC**
```
N: Leaf Color Rating (1-9, where 9 = darkest green)
O: Visual Deficiency Sign (N/P/K/Mg/Zn/etc.) → Drop-down
P: Deficiency Severity (0-10 scale)
Q: Tissue N (%)
R: Tissue P (%)
S: Tissue K (%)
T: Tissue Mg (%)
U: Tissue Ca (%)
V: Tissue S (%)
W: Tissue Micronutrients (ppm)
```

**D. Growth Response (Columns X-AE) - BIOSTIMULANT SPECIFIC**
```
X: Root Development Index (0-10)
Y: Lateral Root Count
Z: Root Depth (cm)
AA: Shoot Vigor Rating (0-10)
AB: Branching Index
AC: Leaf Area Index (LAI)
AD: Stress Tolerance Rating (0-10)
AE: Overall Vigor Score (0-10)
```

**E. Yield & Quality (Columns AF-AM)**
```
AF: Fruit Count (number)
AG: Fruit Size Category (S/M/L)
AH: Average Fruit Weight (g)
AI: Total Yield (kg/plot)
AJ: Marketable Yield (%)
AK: Quality Rating (0-10, 0=excellent)
AL: Post-Harvest Days Until Senescence
AM: Visual Quality Notes
```

**F. Environmental/Crop Response (Columns AN-AX)**
```
AN: Pest Damage Rating (0-10)
AO: Disease Incidence (%)
AP: Phytotoxicity (%)
AQ: Lodging/Wilting (Yes/No)
AR: Blossom End Rot (%)
AS: Cracking (%)
AT: Color Development Rating (0-10)
AU: Taste/Eating Quality Notes
AV-AX: Custom fields
```

**Data Validation Rules:**

```javascript
// Excel Data Validation Configuration
const validationRules = {
  'Days After Application': {
    type: 'whole',
    operator: 'greaterThan',
    value: 0,
    message: 'Must be positive number'
  },
  'Plant Height': {
    type: 'decimal',
    operator: 'between',
    minimum: 0,
    maximum: 300, // cm
    message: 'Height must be 0-300 cm'
  },
  'NDVI': {
    type: 'decimal',
    operator: 'between',
    minimum: -1,
    maximum: 1,
    message: 'NDVI must be -1 to 1'
  },
  'Tissue N (%)': {
    type: 'decimal',
    operator: 'between',
    minimum: 0,
    maximum: 5,
    message: 'N% typically 0-5%'
  },
  'Visual Deficiency Sign': {
    type: 'list',
    formula: 'N,P,K,Mg,Ca,S,Zn,Mn,Fe,B,Cu',
  },
  'Severity Rating': {
    type: 'whole',
    operator: 'between',
    minimum: 0,
    maximum: 10,
    message: '0-10 scale'
  }
};
```

**Conditional Formatting:**
```
// Highlight out-of-range values
Rule 1: If NDVI < -1 or > 1 → Red background
Rule 2: If Tissue N > 5% → Orange background
Rule 3: If Plant Height = 0 → Yellow (missing data)
Rule 4: If Phytotoxicity > 5% → Red font (potential damage)
```

**Sample Data Entry (3 rows):**
```
Date │ DAA │ Harvest │ Plot │ Rep │ Trt │ Height │ NDVI │ … │ Tissue N │ Quality
──────────────────────────────────────────────────────────────────────────────
6/30 │ 0   │ 1       │ 1    │ 1   │ 1   │ 45.2   │ 0.52 │ … │ 2.1      │ 5
7/15 │ 15  │ 1       │ 1    │ 1   │ 1   │ 62.3   │ 0.61 │ … │ 2.3      │ 4
8/1  │ 32  │ 2       │ 1    │ 1   │ 1   │ 78.5   │ 0.68 │ … │ 2.0      │ 3
```

**Excel Implementation:**
```python
# Create large data structure
ws = wb.create_sheet('Assessment Data Summary', 3)

# Header row with formatting
headers = ['Date', 'DAA', 'Harvest', 'Plot', 'Rep', 'Trt', 
           'Height (cm)', 'NDVI', ..., 'Tissue N (%)', 'Quality']

for col_num, header in enumerate(headers, 1):
    cell = ws.cell(row=1, column=col_num)
    cell.value = header
    cell.font = Font(bold=True, color="FFFFFF")
    cell.fill = PatternFill(start_color="366092", end_color="366092", fill_type="solid")

# Data rows (123 rows total: 1 header + 122 data rows)
# Each row represents one plot observation
for row_num in range(2, 124):  # 123 rows
    ws.cell(row=row_num, column=1).value = observation_data[row_num].date
    ws.cell(row=row_num, column=2).value = observation_data[row_num].daa
    # ... populate all 128 columns
    
# Apply data validation
dv_rating = DataValidation(type="whole", formula1="0", formula2="10")
dv_rating.error = 'Value must be 0-10'
dv_rating.errorTitle = 'Invalid Rating'
ws.add_data_validation(dv_rating)
dv_rating.add('G2:G123')  # Apply to NDVI column

# Format columns
ws.column_dimensions['A'].width = 12
ws.column_dimensions['B'].width = 10
# ... set widths for all columns
```

---

#### **Sheet 5: Chartwork (80% Automatic)**

**Purpose:** Intermediate calculations and derived data for charts and statistics

**Key Features:**
- **48 Formulas** (cumulative sums, averages, rolling calculations)
- **Cross-sheet references** to Assessment Data Summary
- **Auto-updates** when source data changes
- **19 Charts** linked to this data
- **Treatment means compilation**

**Column Structure:**

**A. Treatment Headers (Columns A-D)**
```
A: Treatment Number
B: Treatment Name
C: Rate
D: Unit
```

**B. Time-Series Data with Formulas (Columns E onwards)**
```
Column Headers (by observation date):
E: 7/2/2023 (2 DAA)
F: 7/13/2023 (13 DAA)
G: 7/25/2023 (25 DAA)
H: 8/6/2023 (37 DAA)
... (one per harvest date)

Data Rows (per treatment):
Row 5-6: Phytotoxicity (%)
Row 7-8: Plant Height Average
Row 9-10: NDVI Average
Row 11-12: Tissue N Average
Row 13-14: Yield (kg/ha)
... etc
```

**Formula Patterns:**

**Pattern 1: Simple Average**
```excel
=AVERAGE(Assessment_Data![column_range] where Treatment=TrtNumber)
Example: E5 = AVERAGEIF('Assessment Data Summary'!$E$2:$E$122, "=1", 'Assessment Data Summary'!$G$2:$G$122)
(Average height for treatment 1 at harvest 1)
```

**Pattern 2: Treatment vs Control Efficacy**
```excel
=((E5-E6)/E6)*100
(Efficacy % = (Treated - Control) / Control × 100)

For Nutrition: ((Treated_Growth - Control_Growth) / Control_Growth) × 100
For Biostimulant: ((Treated_Vigor - Control_Vigor) / Control_Vigor) × 100
```

**Pattern 3: Cumulative Rolling Sum**
```excel
Row N, Column C = Row N, Column B + Row N-1, Column C
Example: F5 = E5 + F4
(Cumulative sum calculation for accumulating metrics like days or precipitation)
```

**Full Formula Specification for Nutrition Category:**

```javascript
const chartworkFormulas = {
  // Phytotoxicity Section
  'Phytotoxicity_Trt1_2DAA': 'AVERAGEIF(Assessment!$E:$E, "1", Assessment!$P:$P)',
  'Phytotoxicity_Control_2DAA': 'AVERAGEIF(Assessment!$E:$E, "2", Assessment!$P:$P)',
  'Phytotoxicity_Efficacy_2DAA': '((B3-B4)/B4)*100',
  
  // Plant Height Section
  'Height_Trt1_2DAA': 'AVERAGEIFS(Assessment!$G:$G, Assessment!$E:$E, "1", Assessment!$D:$D, "<=7/3")',
  'Height_Control_2DAA': 'AVERAGEIFS(Assessment!$G:$G, Assessment!$E:$E, "2", Assessment!$D:$D, "<=7/3")',
  'Height_Efficacy': '((Height_Trt-Height_Control)/Height_Control)*100',
  
  // Tissue Analysis Section
  'TissueN_Trt1': 'AVERAGEIF(Assessment!$E:$E, "1", Assessment!$Q:$Q)',
  'TissueN_Control': 'AVERAGEIF(Assessment!$E:$E, "2", Assessment!$Q:$Q)',
  'TissueN_Efficacy': '((TissueN_Trt-TissueN_Control)/TissueN_Control)*100',
  
  // Yield Section
  'Yield_Trt1': 'SUMPRODUCT((Assessment!$E$2:$E$122="1")*(Assessment!$AI$2:$AI$122))',
  'Yield_Control': 'SUMPRODUCT((Assessment!$E$2:$E$122="2")*(Assessment!$AI$2:$AI$122))',
  'Yield_Efficacy': '((Yield_Trt-Yield_Control)/Yield_Control)*100'
};
```

**Calculation Examples (Nutrition Trial):**

```
Row 5: Phytotoxicity (%) by Harvest
       Trt1_2DAA: =AVERAGEIF('Assessment Data'!E:E, 1, 'Assessment Data'!AP:AP)
       Trt2_2DAA: =AVERAGEIF('Assessment Data'!E:E, 2, 'Assessment Data'!AP:AP)

Row 7: Plant Height (cm) by Harvest  
       Trt1_2DAA: =AVERAGEIF('Assessment Data'!E:E, 1, 'Assessment Data'!G:G)
       Trt2_2DAA: =AVERAGEIF('Assessment Data'!E:E, 2, 'Assessment Data'!G:G)

Row 9: NDVI (Green Index)
       Trt1_2DAA: =AVERAGEIF('Assessment Data'!E:E, 1, 'Assessment Data'!J:J)
       Trt2_2DAA: =AVERAGEIF('Assessment Data'!E:E, 2, 'Assessment Data'!J:J)

Row 11: Tissue N (%) - KEY FOR NUTRITION
        Trt1_2DAA: =AVERAGEIF('Assessment Data'!E:E, 1, 'Assessment Data'!Q:Q)
        Trt2_2DAA: =AVERAGEIF('Assessment Data'!E:E, 2, 'Assessment Data'!Q:Q)
        Efficacy: =(E11-E12)/E12*100

Row 13: Yield (kg/ha)
        Trt1: =SUMIF('Assessment Data'!E:E, 1, 'Assessment Data'!AI:AI) / plot_count
        Trt2: =SUMIF('Assessment Data'!E:E, 2, 'Assessment Data'!AI:AI) / plot_count
        Efficacy: =(E13-E14)/E14*100
```

**Excel Implementation:**

```python
# Sheet 5: Chartwork
ws = wb.create_sheet('Chartwork', 4)

# Define metric names and formulas
metrics = [
    ('Phytotoxicity (%)', 'AVERAGEIF(Assessment!E:E,1,Assessment!AP:AP)', 'AVERAGEIF(Assessment!E:E,2,Assessment!AP:AP)'),
    ('Plant Height (cm)', 'AVERAGEIF(Assessment!E:E,1,Assessment!G:G)', 'AVERAGEIF(Assessment!E:E,2,Assessment!G:G)'),
    ('NDVI', 'AVERAGEIF(Assessment!E:E,1,Assessment!J:J)', 'AVERAGEIF(Assessment!E:E,2,Assessment!J:J)'),
    ('Tissue N (%)', 'AVERAGEIF(Assessment!E:E,1,Assessment!Q:Q)', 'AVERAGEIF(Assessment!E:E,2,Assessment!Q:Q)'),
    ('Yield (kg/ha)', 'SUMIF(Assessment!E:E,1,Assessment!AI:AI)/6', 'SUMIF(Assessment!E:E,2,Assessment!AI:AI)/6'),
]

row = 3
for metric_name, trt_formula, control_formula in metrics:
    ws.cell(row, 1).value = metric_name
    ws.cell(row, 2).value = trt_formula
    ws.cell(row, 3).value = control_formula
    
    # Efficacy formula
    efficacy_formula = f'=(B{row}-C{row})/C{row}*100'
    ws.cell(row, 4).value = efficacy_formula
    
    row += 1

# Charts automatically reference this data
# Charts will auto-update when formulas recalculate
```

---

#### **Sheet 6: Post-Harvest Chartwork (90% Automatic)**

**Purpose:** Storage and quality retention analysis (NUTRITION & BIOSTIMULANT SPECIFIC)

**Data Structure:**
```
                    │ Day 0 │ Day 2 │ Day 4 │ Day 6 │ Day 8
──────────────────────────────────────────────────────────────
Weight (g)
├─ Trt1            │ 250   │ 245   │ 238   │ 230   │ 220
├─ Control         │ 250   │ 248   │ 243   │ 235   │ 222
└─ Efficacy        │ 0%    │ -0.4% │ -2.1% │ -2.1% │ +1%

Weight Loss (%)
├─ Trt1            │ 0     │ 2     │ 4.8   │ 8     │ 12
├─ Control         │ 0     │ 0.8   │ 2.8   │ 6     │ 11.2
└─ Efficacy        │ -     │ -150% │ -71%  │ -33%  │ -7%

Quality Rating (0-10)
├─ Trt1            │ 2     │ 3     │ 4     │ 5     │ 6
├─ Control         │ 2     │ 2     │ 3     │ 4     │ 5
└─ Efficacy        │ 0%    │ -50%  │ -33%  │ -25%  │ -20%

Firmness (Shore Durometer)
├─ Trt1            │ 95    │ 88    │ 80    │ 72    │ 64
├─ Control         │ 95    │ 90    │ 85    │ 78    │ 70
└─ Difference      │ 0     │ -2    │ -5    │ -6    │ -6
```

**Key Formulas:**
```excel
Weight Loss (%) = ((Initial_Weight - Current_Weight) / Initial_Weight) * 100

Efficacy (Storage) = ((Control_Loss - Treatment_Loss) / Control_Loss) * 100

Quality Change = Quality_Rating_Current - Quality_Rating_Initial
(Negative = degradation, positive = improvement - rare)
```

**Formula Examples:**
```javascript
// Sheet 6, Post-Harvest Chartwork

// Weight Loss Calculation
const weightLossFormula = {
  trt1_day0: 'Query(Assessment where Harvest=1 and Trt=1 avg(Weight))',
  trt1_day4: 'Query(Assessment where Harvest=2 and Trt=1 avg(Weight))',
  trt1_loss: '(E4-E5)/E4*100',
  
  control_day0: 'Query(Assessment where Harvest=1 and Trt=2 avg(Weight))',
  control_day4: 'Query(Assessment where Harvest=2 and Trt=2 avg(Weight))',
  control_loss: '(E6-E7)/E6*100',
  
  efficacy: '((E8-E4)/E8)*100'
};

// Quality Rating Change
const qualityChange = {
  trt1_day0: 'Query(Assessment where Harvest=1 and Trt=1 avg(Quality))',
  trt1_day4: 'Query(Assessment where Harvest=2 and Trt=1 avg(Quality))',
  trt1_change: 'E10-E9', // Positive = worse (higher number = worse quality)
  
  control_day0: 'Query(Assessment where Harvest=1 and Trt=2 avg(Quality))',
  control_day4: 'Query(Assessment where Harvest=2 and Trt=2 avg(Quality))',
  control_change: 'E12-E11',
  
  efficacy: '((E12-E10)/E12)*100' // Positive = better quality retention
};
```

**Key Finding Highlight:**
```
Interpretation for report:
"By Day 4 following the first harvest, [Treatment] fruit showed 
[X%] less weight loss and [Y point] better quality retention 
compared to untreated control. This demonstrates improved 
post-harvest longevity with the treatment."
```

---

#### **Sheet 7: AOV Means Table (95% Automatic)**

**Purpose:** Statistical Analysis of Variance - most critical sheet for trial validity

**Specifications:**
- **Size:** 249 columns × 136 rows (massive!)
- **Merged Cells:** 4,919 (extensive table structure)
- **Format:** Professional statistical table with headers/footers
- **Automation:** 95% (generated by statistical software)

**Statistical Design:** RCB (Randomized Complete Block Design)
- Factor: Treatment (2 levels: Control, Test)
- Block: Replication (6 levels: Rep 1-6)
- Design Structure:
  ```
  Treatment × Replication = 2 × 6 = 12 plots
  ```

**ANOVA Model:**
```
Y_ij = μ + Treatment_i + Block_j + Error_ij

Where:
μ = Grand mean
Treatment_i = Treatment effect (i = 1,2)
Block_j = Block/Replication effect (j = 1-6)
Error_ij = Residual error
```

**Output Table Structure:**

```
┌────────────────────────────────────────────────────────────────┐
│ ANALYSIS OF VARIANCE (RCB DESIGN)                             │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│ Source    │ DF │ Sum of Sq │ Mean Square │ F Value │ Pr > F   │
│─────────────────────────────────────────────────────────────────│
│ Treatment │ 1  │ 234.56    │ 234.56      │ 4.23    │ 0.0453 * │
│ Block     │ 5  │ 156.78    │ 31.356      │ 0.57    │ 0.7256   │
│ Error     │ 5  │ 277.01    │ 55.402      │         │          │
│─────────────────────────────────────────────────────────────────│
│ Total     │11  │ 668.35    │             │         │          │
│                                                                │
│ R-squared = 0.5856    CV = 12.34%                             │
│ * Significant at p < 0.05                                     │
└────────────────────────────────────────────────────────────────┘
```

**Treatment Means Table:**

```
┌─────────────────────────────────────────────────────────────┐
│ TREATMENT MEANS (RCB Design)                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Treatment │ Mean  │ Std Dev │ SE    │ 95% CI Lower/Upper  │
│─────────────────────────────────────────────────────────────│
│ Untreated │ 250.5 │ 35.2    │ 14.4  │ [219.1, 281.9]      │
│ Treated   │ 290.3 │ 42.1    │ 17.2  │ [251.5, 329.1]      │
│─────────────────────────────────────────────────────────────│
│ Difference│ 39.8  │         │ 22.1  │ [4.3, 75.3]         │
│ % Efficacy│ 15.9% │         │       │                     │
└─────────────────────────────────────────────────────────────┘

Interpretation:
Treatment shows 39.8 unit improvement (15.9% efficacy)
95% CI: [4.3, 75.3] - CI does NOT cross zero = significant at p < 0.05
```

**Multiple Metrics ANOVA (per category):**

**Nutrition Category:**
```
ANOVA for each metric:
1. Phytotoxicity (%)
2. Plant Height (cm)
3. NDVI
4. Tissue N (%)
5. Tissue P (%)
6. Tissue K (%)
7. Yield (kg/ha)
8. Quality Rating
9. Post-Harvest Weight Loss (%)
10. Days Until Senescence

Each metric gets its own ANOVA table with:
├─ Source table (Treatment, Block, Error, Total)
├─ Treatment Means table
├─ p-value significance notation (* p<0.05, ** p<0.01)
└─ Effect size & 95% Confidence Intervals
```

**Biostimulant Category:**
```
ANOVA for each metric:
1. Root Development Index
2. Lateral Root Count
3. Root Depth (cm)
4. Shoot Vigor Rating
5. Branching Index
6. Leaf Area Index (LAI)
7. Stress Tolerance Rating
8. Overall Vigor Score
9. NDVI
10. Yield Response (%)

Same structure as Nutrition.
```

**Significance Notation:**
```
p < 0.001   *** (highly significant)
p < 0.01    ** (very significant)
p < 0.05    * (significant)
p >= 0.05   ns (not significant)
```

**Excel Implementation:**

```python
# Statistical Analysis Integration
from scipy import stats
import numpy as np

# Input data prepared for ANOVA
treatment_data = {
    1: [heights_rep1_trt1, heights_rep2_trt1, ..., heights_rep6_trt1],  # 6 reps
    2: [heights_rep1_trt2, heights_rep2_trt2, ..., heights_rep6_trt2]   # 6 reps
}

# Perform ANOVA
f_stat, p_value = stats.f_oneway(treatment_data[1], treatment_data[2])

# Calculate treatment means
trt1_mean = np.mean(treatment_data[1])
trt2_mean = np.mean(treatment_data[2])
efficacy = ((trt1_mean - trt2_mean) / trt2_mean) * 100

# Calculate standard error
trt1_se = np.std(treatment_data[1]) / np.sqrt(6)
trt2_se = np.std(treatment_data[2]) / np.sqrt(6)

# Calculate 95% CI
ci_lower = trt1_mean - 1.96 * trt1_se
ci_upper = trt1_mean + 1.96 * trt1_se

# Build ANOVA table in Excel
ws = wb['AOV Means Table']
anova_data = [
    ['Source', 'DF', 'Sum of Squares', 'Mean Square', 'F Value', 'Pr > F'],
    ['Treatment', 1, ss_treatment, ms_treatment, f_stat, p_value],
    ['Block', 5, ss_block, ms_block, f_block, p_block],
    ['Error', 5, ss_error, ms_error, '', ''],
    ['Total', 11, ss_total, '', '', '']
]

for row_idx, row_data in enumerate(anova_data, 1):
    for col_idx, value in enumerate(row_data, 1):
        ws.cell(row=row_idx, column=col_idx).value = value

# Add significance notation
if p_value < 0.001:
    ws.cell(row=2, column=6).value = f"{p_value:.4f} ***"
elif p_value < 0.01:
    ws.cell(row=2, column=6).value = f"{p_value:.4f} **"
elif p_value < 0.05:
    ws.cell(row=2, column=6).value = f"{p_value:.4f} *"
else:
    ws.cell(row=2, column=6).value = f"{p_value:.4f} ns"

# Treatment means table
means_data = [
    ['Treatment', 'Mean', 'Std Dev', 'SE', '95% CI Lower', '95% CI Upper'],
    ['Control', trt2_mean, np.std(treatment_data[2]), trt2_se, trt2_ci_lower, trt2_ci_upper],
    ['Treated', trt1_mean, np.std(treatment_data[1]), trt1_se, ci_lower, ci_upper],
    ['Difference', trt1_mean - trt2_mean, '', trt1_se + trt2_se, '', ''],
    ['Efficacy (%)', efficacy, '', '', '', '']
]

for row_idx, row_data in enumerate(means_data, 10):  # Start at row 10
    for col_idx, value in enumerate(row_data, 1):
        ws.cell(row=row_idx, column=col_idx).value = value
```

---

### SECTION 3: VISUALIZATIONS

#### **Sheet 8: Figures - Charts (90% Automatic)**

**Purpose:** Visual presentation of all trial data via professional charts

**19 Charts for Nutrition Category:**

```
1. Phytotoxicity (%) Over Time - Line Chart
   X-axis: Days After Application (0, 15, 30, 45)
   Y-axis: Phytotoxicity (%)
   Series: Control, Treatment 1, Treatment 2, etc.
   Purpose: Show safety - should be ~0%
   
2. Plant Height Progression - Column Chart
   X-axis: Harvest Date (columns grouped by treatment)
   Y-axis: Height (cm)
   Series: By Treatment
   Purpose: Growth comparison
   
3. NDVI Greenness Index - Area Chart
   X-axis: Days After Application
   Y-axis: NDVI (-1 to 1)
   Series: Control, Treatment
   Purpose: Green biomass accumulation
   
4. Tissue N (%) by Treatment - Box Plot
   X-axis: Treatment
   Y-axis: Tissue N (%)
   Series: Box showing range, mean, quartiles
   Purpose: N accumulation in tissue
   
5. Tissue P (%) Comparison - Bar Chart
   X-axis: Treatment
   Y-axis: Tissue P (%)
   Purpose: P status by treatment
   
6. Tissue K (%) Comparison - Bar Chart
   X-axis: Treatment
   Y-axis: Tissue K (%)
   Purpose: K status by treatment
   
7. Micronutrient Status (Zn, Fe, Mn) - Radar Chart
   Axes: Different micronutrients
   Series: Control vs Treatment
   Purpose: Holistic nutrient picture
   
8. Yield by Harvest - Combo Chart (Column + Line)
   X-axis: Harvest Number
   Y-axis: Yield (kg/ha)
   Columns: Treatment comparison
   Line: Cumulative yield
   
9. Cumulative Yield Curve - Line Chart
   X-axis: Harvest Date
   Y-axis: Cumulative Yield (kg/ha)
   Series: Control, Treatment (separate lines)
   Purpose: Total production trajectory
   
10. Yield Efficacy (%) - Column Chart
    X-axis: Treatment
    Y-axis: Efficacy (%)
    Purpose: Quick summary of treatment effect
    
11. Fruit Size Distribution - Stacked Bar
    X-axis: Treatment
    Y-axis: % of Fruit in each size category
    Stack: Small, Medium, Large, Unmarked
    Purpose: Quality assessment
    
12. Average Fruit Weight - Column Chart
    X-axis: Treatment
    Y-axis: Weight (g)
    Purpose: Size comparison
    
13. Marketable Yield (%) - Bar Chart
    X-axis: Treatment
    Y-axis: % Marketable
    Purpose: Commercial value
    
14. Quality Rating Over Time - Line Chart
    X-axis: Harvest Date
    Y-axis: Quality Rating (0-10)
    Series: Control, Treatment
    Purpose: Quality trajectory
    
15. Deficiency Symptoms Rating - Column Chart
    X-axis: Nutrient (N, P, K, Mg, etc.)
    Y-axis: Severity Rating (0-10)
    Series: Control, Treatment
    Purpose: Nutrient sufficiency comparison
    
16. Treatment Effect Summary - Waterfall Chart
    X-axis: Metrics (Phytotox, Height, N%, Yield)
    Y-axis: % Change from Control
    Purpose: Quick overview of all metrics
    
17. ANOVA P-values - Bar Chart
    X-axis: Metrics
    Y-axis: p-value (log scale)
    Threshold line at p=0.05
    Purpose: Statistical significance overview
    
18. Confidence Intervals - Error Bar Chart
    X-axis: Metrics
    Y-axis: Mean with 95% CI
    Purpose: Precision of estimates
    
19. Treatment Efficacy Summary - Horizontal Bar
    X-axis: Efficacy (%)
    Y-axis: Metrics
    Color: Green if positive, Red if negative
    Purpose: Quick ROI summary
```

**Chart Specifications:**

```javascript
const chartConfig = {
  chart1: {
    title: 'Phytotoxicity (%) Over Time',
    type: 'Line',
    dataRange: 'Chartwork!B5:F5,Chartwork!B6:F6',  // Control, Treatment
    xAxis: 'Days After Application',
    yAxis: 'Phytotoxicity (%)',
    yAxisMin: 0,
    yAxisMax: 100,
    legend: ['Control', 'Treatment'],
    colors: ['#6B7280', '#059669'],
    gridlines: true,
    dataLabels: false,
    size: { width: 480, height: 300 }
  },
  
  chart4: {
    title: 'Tissue Nitrogen (%) Comparison',
    type: 'BoxPlot',
    dataRange: 'Chartwork!B11:E11,Chartwork!B12:E12',
    xAxis: 'Treatment',
    yAxis: 'Tissue N (%)',
    legend: ['Control Rep 1-6', 'Treatment Rep 1-6'],
    color: ['#EF4444', '#10B981'],
    size: { width: 480, height: 300 }
  },
  
  chart8: {
    title: 'Yield by Harvest',
    type: 'ComboChart',
    columnDataRange: 'Chartwork!B13:F13,Chartwork!B14:F14',
    lineDataRange: 'Chartwork!B15:F15',
    xAxis: 'Harvest Date',
    yAxis: 'Yield (kg/ha)',
    legend: ['Control (Column)', 'Treatment (Column)', 'Cumulative (Line)'],
    colors: ['#6B7280', '#059669', '#3B82F6'],
    size: { width: 600, height: 350 }
  }
};
```

**Excel Implementation:**

```python
from openpyxl.chart import (
    LineChart, BarChart, ColumnChart, AreaChart, 
    RadarChart, DoughnutChart, BubbleChart, ScatterChart,
    Reference, Series
)
from openpyxl.chart.marker import DataPoint

# Sheet 8: Figures (all charts)
ws = wb['Figures']

# Chart 1: Phytotoxicity Over Time
chart1 = LineChart()
chart1.title = "Phytotoxicity (%) Over Time"
chart1.style = 10
chart1.y_axis.title = 'Phytotoxicity (%)'
chart1.x_axis.title = 'Days After Application'

# Reference data from Chartwork sheet
control_data = Reference(wb['Chartwork'], min_col=5, min_row=5, max_row=6)
treatment_data = Reference(wb['Chartwork'], min_col=5, min_row=6, max_row=7)
chart1.add_data(control_data, titles_from_data=True)
chart1.add_data(treatment_data, titles_from_data=True)

# Styling
chart1.height = 12  # cm
chart1.width = 18   # cm
chart1.legend.position = 'r'  # right

ws.add_chart(chart1, "B4")  # Position at B4

# Chart 2: Plant Height Progression (Column chart)
chart2 = ColumnChart()
chart2.title = "Plant Height Progression"
chart2.style = 11
chart2.y_axis.title = 'Height (cm)'
chart2.x_axis.title = 'Harvest Date'

data = Reference(wb['Chartwork'], min_col=5, min_row=7, max_row=8)
chart2.add_data(data, titles_from_data=True)
chart2.height = 12
chart2.width = 18

ws.add_chart(chart2, "B24")  # Below first chart

# ... repeat for all 19 charts, positioning them in grid layout:
# B4, N4, B24, N24, B44, etc. (2 columns × 10 rows)

# Auto-formatting
for chart in [chart1, chart2, ...]:
    chart.legend.position = 'r'
    chart.legend.overlay = False
    chart.plot_area.layout.layoutTarget = "inner"
    # Remove gridlines for cleaner look
    chart.plot_area.graphicalProperties.ln = None
```

**Chart Positioning in Sheet:**
```
Row 4:  ┌──────────────────────────────┬──────────────────────────────┐
        │ Chart 1                      │ Chart 2                      │
        │ Phytotoxicity               │ Plant Height                 │
        │ (B4:N20)                    │ (O4:AB20)                    │
        └──────────────────────────────┴──────────────────────────────┘

Row 24: ┌──────────────────────────────┬──────────────────────────────┐
        │ Chart 3                      │ Chart 4                      │
        │ NDVI Index                  │ Tissue N Comparison          │
        │ (B24:N40)                   │ (O24:AB40)                   │
        └──────────────────────────────┴──────────────────────────────┘

...and so on for all 19 charts
```

---

#### **Sheet 9: Post-Harvest Quality Charts (90% Automatic)**

**Purpose:** Detailed storage and quality retention visualizations

**2 Charts:**

```
Chart 1: Weight Loss Over Storage Period
├─ Type: Line Chart
├─ X-axis: Days in Storage (0, 2, 4, 6, 8)
├─ Y-axis: Weight (g)
├─ Series: 
│  ├─ Control (solid line, gray)
│  └─ Treatment (solid line, emerald)
├─ Purpose: Show weight retention advantage
└─ Target: Treatment line should be above control

Chart 2: Quality Rating Degradation
├─ Type: Area Chart (stacked)
├─ X-axis: Days in Storage
├─ Y-axis: Quality Score (0-10, where 0 = excellent)
├─ Series:
│  ├─ Control (bottom area)
│  └─ Treatment (top area)
├─ Purpose: Show quality longevity
└─ Target: Treatment area should be lower (better quality)
```

---

### SECTION 4: REFERENCE & EVIDENCE

#### **Sheet 10: Weather & Environmental Data (50% Automatic)**

**Purpose:** Environmental context for trial conditions

**Data Format:**
```
Date Range: Trial Duration (e.g., 6/30/2023 - 9/16/2023)
Rows: 128 rows of daily data
Columns: 12 columns

Columns:
A: Date
B: Day of Trial (calculated: Date - Start Date)
C: Precipitation (inches)
D: Cumulative Precipitation (calculated)
E: High Temperature (°F)
F: Low Temperature (°F)
G: Mean Temperature (°F)
H: Humidity (%)
I: Dew Point (°F)
J: Wind Speed (mph)
K: Solar Radiation (MJ/m²)
L: Notes (frost, heat stress, irrigation, etc.)
```

**Data Source:** Automated weather station or NOAA API

**Formulas:**
```excel
D2 = C2 + D1  (Cumulative precipitation rolling sum)
G2 = (E2 + F2) / 2  (Mean temperature)
B2 = A2 - $A$2  (Days from trial start)
```

**Key Statistics Calculated:**
```
Total Precipitation: =SUM(C:C)
Mean Temperature: =AVERAGE(G:G)
Growing Degree Days (GDD): =SUM((G:G - 50)) where G:G > 50
Stress Days (>90°F): =COUNTIF(E:E, ">90")
Wet Days: =COUNTIF(C:C, ">0.1")
```

---

#### **Sheet 11: Photos & Documentation (100% Manual)**

**Purpose:** Visual evidence of trial conditions and results

**Content:**
```
26 Embedded Images:

1-3:    Trial Setup (Field overview, plot layout, signage)
4-6:    Control vs Treatment Plants (Side-by-side comparison)
7-10:   Growth Stages (V4, V8, Flowering, Fruiting)
11-14:  Nutrient Status (Visual deficiency signs, healthy plants)
15-18:  Harvest Operations (Picking, weighing, counting)
19-22:  Quality Assessment (Fruit comparison, grading)
23-24:  Post-Harvest Storage (Storage conditions, samples)
25-26:  Trial Closure (Final documentation, field cleanup)
```

**Image Specifications:**
```
Format: JPG or PNG
Resolution: 300 DPI (for print quality)
Size: ~2-3 MB per image
Dimensions: Thumbnails (400×300px) + Full resolution versions

Layout in Excel:
Row 2:     Embedded Image 1 (Setup)
Row 12:    Embedded Image 2 (Growth)
Row 22:    Embedded Image 3 (Harvest)
...

Each image has:
├─ Image placeholder
├─ Photo number
├─ Date taken
├─ Description (1-2 sentences)
└─ Observations
```

---

## 5. DATA FLOW & AUTOMATION ARCHITECTURE

### 5.1 Complete Report Generation Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│                    REPORT GENERATION FLOW                   │
└─────────────────────────────────────────────────────────────┘

STEP 1: TRIAL DATA COLLECTION (Field Phase - 80+ hours)
├─ Manual data entry into Assessment Data Summary
├─ Field measurements:
│  ├─ Plant metrics (height, vigor, NDVI readings)
│  ├─ Nutrient status (tissue samples, deficiency ratings)
│  ├─ Yield/quality metrics
│  └─ Environmental observations
├─ Photo documentation (26 images)
└─ Weather station auto-logging

STEP 2: DATA VALIDATION & QC (1-2 hours)
├─ Assessment Data Summary sheet
├─ Data validation rules trigger
├─ Conditional formatting highlights outliers
├─ Manual review of flagged data
└─ Corrections made directly in Excel

STEP 3: FORMULA CALCULATION (Auto - 5 minutes)
├─ Chartwork formulas recalculate
│  ├─ AVERAGEIF: Treatment means
│  ├─ SUMIF: Cumulative values
│  └─ Custom formulas: Efficacy calculations
├─ Post-Harvest Chartwork formulas
└─ All formulas update automatically when data changes

STEP 4: STATISTICAL ANALYSIS (Auto - 30 minutes)
├─ Data exported from Excel
├─ R/SAS/Python script processes ANOVA
├─ Statistical output generated:
│  ├─ ANOVA tables
│  ├─ Treatment means
│  ├─ p-values & significance
│  └─ Confidence intervals
└─ AOV Means Table populated with results

STEP 5: CHART GENERATION (Auto - 5 minutes)
├─ 19 charts in Figures sheet auto-update
├─ 2 charts in Post-Harvest sheet auto-update
├─ All charts linked to:
│  ├─ Chartwork data ranges
│  └─ AOV Means Table data
├─ Chart titles, labels, legends auto-populate
└─ Color schemes applied automatically

STEP 6: REPORT NARRATIVE WRITING (Manual - 2 hours)
├─ Study director reviews all data
├─ Narrative sheet completed with:
│  ├─ Key findings (data-driven)
│  ├─ Summary (context & methodology)
│  └─ Conclusions (evidence-based)
├─ Cross-reference charts & statistics
└─ Professional agricultural language

STEP 7: FINAL QUALITY ASSURANCE (Manual - 3-5 hours)
├─ Data consistency check
│  ├─ Verify Assessment Data matches source documents
│  ├─ Check formula references (no circular refs)
│  └─ Validate chart data ranges
├─ Statistical validity review
│  ├─ Confirm design appropriateness (RCB for this trial)
│  ├─ Check ANOVA assumptions
│  └─ Review p-values and effect sizes
├─ Visual inspection
│  ├─ All 21 charts render correctly
│  ├─ Axis scales are reasonable
│  └─ Colors and formatting are professional
├─ Narrative alignment
│  ├─ Findings match statistics
│  ├─ Conclusions are supported
│  └─ Language is clear and professional
└─ Study Director approval

STEP 8: REPORT DELIVERY
├─ Final Excel file locked (prevent accidental changes)
├─ PDF export generated (for archival)
├─ Report delivered to client
└─ Archive copy maintained for compliance

TOTAL TIME INVESTMENT:
├─ Field Work:       80 hours
├─ Data Entry:       10-15 hours
├─ Statistical:      2-3 hours
├─ Report Gen:       3-5 hours
├─ QA & Review:      5-10 hours
└─ TOTAL:            100-125 hours per report
```

### 5.2 Automation Breakdown by Task

```
Data Collection:         15% Automatic
  └─ Automated weather station logs temperature, humidity, precipitation
  └─ Manual field measurements, counts, ratings (85%)

Data Entry:              20% Automatic
  └─ Automated validation rules catch errors
  └─ Manual typing of field data into spreadsheet (80%)

Calculations:            85% Automatic
  └─ Excel formulas (AVERAGEIF, SUMIF, etc.) auto-calculate
  └─ R/SAS statistical software runs ANOVA automatically
  └─ Manual review of results (15%)

Visualizations:          90% Automatic
  └─ Charts auto-generate from data ranges
  └─ Chart formatting applied automatically via template
  └─ Manual selection of chart types (10%)

Analysis/Interpretation: 0% Automatic
  └─ 100% requires expert agronomist input

Documentation:          50% Automatic
  └─ Photos are 100% manual
  └─ Metadata (dates, plot numbers) are auto-populated

Report Assembly:         80% Automatic
  └─ Template structure is automatic
  └─ Linking and formula references are automatic
  └─ Narrative writing is manual (20%)

Overall Report Average:  ~70% Automatic, 30% Manual
```

---

## 6. IMPLEMENTATION ROADMAP

### 6.1 Phase 1: Backend Architecture (Weeks 1-3)

**Goal:** Set up data structures and report generation pipeline

**Tasks:**
1. **Define Report Data Model**
   - Schema for 128-column Assessment Data
   - Treatment means calculation logic
   - ANOVA preparation structure

2. **Create Report Template Class**
   ```javascript
   class AdvancedReportGenerator {
     constructor(trial, category) {
       this.trial = trial;
       this.category = category; // 'nutrition' or 'biostimulant'
       this.workbook = null;
     }
     
     // Main entry point
     async generateReport() {
       this.createWorkbook();
       await this.populateNarrativeSheet();
       await this.populateTrialInformationSheet();
       await this.populateTreatmentListSheet();
       await this.populateAssessmentDataSheet();
       await this.populateChartworkSheet();
       await this.populatePostHarvestSheet();
       await this.runStatisticalAnalysis();
       await this.populateAOVSheet();
       await this.generateCharts();
       await this.embedPhotos();
       await this.populateWeatherSheet();
       return this.workbook;
     }
   }
   ```

3. **Statistical Integration**
   - Option A: Integrate R via RScript package
   - Option B: Use Python subprocess for scipy.stats
   - Option C: Use existing JS library (jstat already in dependencies)
   - Selected: **Option C + Node.js backend** for ANOVA

4. **Excel Generation Library**
   - Evaluate: exceljs vs openpyxl
   - Decision: Use **exceljs** (already used in Miklens for reports)
   - Test large file creation (128 columns, 123 rows)

### 6.2 Phase 2: Sheet Implementation (Weeks 4-8)

**Goal:** Build all 10 sheets with data population and formulas

**Weekly Breakdown:**

**Week 4: Executive & Reference Sheets**
- Sheet 1: Narrative (template + manual fields)
- Sheet 2: Trial Information (auto-population from trial object)
- Sheet 3: Treatment List & Map (treatment details + image embedding)

**Week 5: Data Sheet**
- Sheet 4: Assessment Data Summary (128 columns, data validation, conditional formatting)
- Data validation rules implementation
- Lookup formulas for treatment names

**Week 6: Calculation Sheet**
- Sheet 5: Chartwork (48 formulas, cross-sheet references)
- Sheet 6: Post-Harvest Chartwork (rolling calculations)

**Week 7: Statistical Analysis**
- Statistical R functions or Python integration
- ANOVA calculation
- Sheet 7: AOV Means Table population

**Week 8: Visualizations**
- Sheet 8: Figures (19 charts)
- Sheet 9: Post-Harvest Charts (2 charts)
- Chart styling and positioning

### 6.3 Phase 3: Advanced Features (Weeks 9-10)

**Goal:** Complete remaining features and testing

**Tasks:**
1. **Photo Integration**
   - Sheet 10: Photos sheet (26 image embedding)
   - Image compression logic
   - Photo metadata auto-population

2. **Weather Data**
   - Sheet 11: Weather data import
   - Weather API integration (optional)
   - Environmental data validation

3. **Report Customization**
   - Report branding (logo, colors)
   - Custom field definitions per category
   - Batch report generation

4. **Quality Assurance**
   - Formula validation
   - Data integrity checks
   - Chart rendering tests
   - Large file handling (5-10 MB Excel files)

5. **Documentation**
   - Report generation user guide
   - Data entry standards document
   - Formula reference guide
   - Troubleshooting guide

### 6.4 Phase 4: Deployment & Training (Week 11)

**Goal:** Production deployment and user training

**Tasks:**
1. Deploy to production
2. Create user training materials
3. User acceptance testing
4. Gather feedback for v1.1

---

## 7. TECHNOLOGY STACK & LIBRARIES

### 7.1 Excel Generation

**Library:** `exceljs`
```javascript
npm install exceljs
// Already compatible with Miklens (used in trialReports.js)

Key Methods:
- wb.addWorksheet(name) - Create sheet
- ws.columns = [...] - Define column headers
- ws.cell(ref).value = value - Set cell value
- ws.addImage(image, ref) - Embed image
- ws.addChart(chart) - Add chart object
- wb.xlsx.writeFile(filename) - Save file
```

### 7.2 Statistical Analysis

**Option 1: jstat (Already in Dependencies)**
```javascript
import jstat from 'jstat';

const group1 = [250.5, 248.2, 252.1, ...]; // 6 values
const group2 = [290.3, 288.5, 295.2, ...]; // 6 values

// ANOVA calculation
const anova = jstat.anova(group1, group2);
const fValue = anova.f;
const pValue = anova.p;
```

**Option 2: Backend R Integration (Recommended for Production)**
```bash
npm install r-script

# Create R script: anova_analysis.R
source('anova_analysis.R')
# Runs ANOVA, generates summary statistics
```

**Option 3: Python Subprocess (Alternative)**
```javascript
const { spawn } = require('child_process');

const python = spawn('python', ['anova_analysis.py']);
python.stdout.on('data', (data) => {
  const results = JSON.parse(data);
  // Process ANOVA results
});
```

**Recommendation:** Use **Option 1 (jstat)** for MVP, upgrade to **Option 2 (R)** for production

### 7.3 Image Handling

**Compression:** `sharp` library
```bash
npm install sharp

const sharp = require('sharp');
sharp('large_photo.jpg')
  .resize(1200, 800)
  .jpeg({ quality: 85 })
  .toFile('optimized_photo.jpg');
```

### 7.4 API Integration

**Weather API:** OpenWeatherMap or NOAA
```javascript
// Option 1: OpenWeatherMap (Requires API key)
const weatherAPI = 'https://api.openweathermap.org/data/2.5/weather';

// Option 2: NOAA (Free, no key required)
const noaaAPI = 'https://www.weather.gov/wrh/Climate?wfo=[location]';
```

---

## 8. CODE STRUCTURE FOR MIKLENS APP

### 8.1 New File: `src/services/advancedReportGenerator.js`

```javascript
// advancedReportGenerator.js
// Generates 10-sheet professional Excel reports for Nutrition & Biostimulant trials

import ExcelJS from 'exceljs';
import jstat from 'jstat';
import sharp from 'sharp';
import { getCategoryConfig } from '../utils/categoryConfig';

class AdvancedReportGenerator {
  constructor(trial, category = 'nutrition') {
    this.trial = trial;
    this.category = category;
    this.config = getCategoryConfig(category);
    this.workbook = new ExcelJS.Workbook();
    this.observations = []; // Will be loaded from trial
  }

  // ───────────────────────────────────────────────────────────────
  // MAIN ENTRY POINT
  // ───────────────────────────────────────────────────────────────
  
  async generateCompleteReport() {
    console.log(`Generating ${this.category} report for trial ${this.trial.id}`);
    
    try {
      // Load trial data
      await this.loadTrialData();
      
      // Create all sheets
      await this.createNarrativeSheet();      // 0% auto
      await this.createTrialInformationSheet(); // 20% auto
      await this.createTreatmentListSheet();    // 50% auto
      await this.createAssessmentDataSheet();   // 15% auto
      await this.createChartworkSheet();        // 80% auto
      await this.createPostHarvestSheet();      // 90% auto
      await this.createAOVMeansTable();         // 95% auto
      await this.createFiguresSheet();          // 90% auto
      await this.createPostHarvestCharts();     // 90% auto
      await this.createWeatherSheet();          // 50% auto
      await this.createPhotosSheet();           // 100% manual (auto-embed only)
      
      // Save and return
      const filename = `${this.trial.id}_${this.category}_Report_${new Date().toISOString().slice(0,10)}.xlsx`;
      await this.workbook.xlsx.writeFile(filename);
      
      return {
        success: true,
        filename: filename,
        filesize: (await fs.stat(filename)).size,
        sheets: 11,
        charts: 21,
        formulas: 48,
        messageCount: 'Report generated successfully'
      };
    } catch (error) {
      console.error('Report generation failed:', error);
      throw error;
    }
  }

  // ───────────────────────────────────────────────────────────────
  // SHEET 1: NARRATIVE (0% Auto)
  // ───────────────────────────────────────────────────────────────
  
  async createNarrativeSheet() {
    const ws = this.workbook.addWorksheet('Narrative');
    
    // Headers
    ws.merge('A1:D1');
    ws.getCell('A1').value = 'Trial Report - Narrative Summary';
    ws.getCell('A1').font = { bold: true, size: 14, color: { rgb: this.config.color.hex } };
    
    // Report Info
    ws.getCell('A2').value = `Report ID: ${this.trial.id}`;
    ws.getCell('A3').value = `Generated: ${new Date().toLocaleDateString()}`;
    ws.getCell('A4').value = `Category: ${this.config.name}`;
    
    // Key Findings Section - AUTO-INSERT FROM DATA
    let row = 6;
    ws.getCell(`A${row}`).value = 'KEY FINDINGS';
    ws.getCell(`A${row}`).font = { bold: true, size: 12 };
    
    row++;
    const findingsText = this.generateKeyFindings();
    ws.getCell(`A${row}`).value = findingsText;
    ws.getCell(`A${row}`).alignment = { wrapText: true };
    
    // Summary Section
    row += 3;
    ws.getCell(`A${row}`).value = 'SUMMARY';
    ws.getCell(`A${row}`).font = { bold: true, size: 12 };
    
    row++;
    const summaryText = this.generateSummary();
    ws.getCell(`A${row}`).value = summaryText;
    ws.getCell(`A${row}`).alignment = { wrapText: true };
    
    // NOTE: Conclusions section requires MANUAL input
    // Auto-insert template text for data analyst to edit
    row += 3;
    ws.getCell(`A${row}`).value = 'CONCLUSIONS [EDIT BY ANALYST]';
    ws.getCell(`A${row}`).font = { bold: true, size: 12 };
    ws.getCell(`A${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { rgb: 'FFFFCC' } };
    
    row++;
    ws.getCell(`A${row}`).value = 
      `[Draft conclusions for analyst review]\n\n` +
      `Treatment ${this.trial.treatments[1]?.name} showed ${this.getEfficacyPercent()}% ` +
      `improvement in ${this.config.primaryMetric.label} compared to control.`;
    ws.getCell(`A${row}`).alignment = { wrapText: true };
    
    ws.column_dimensions['A'].width = 100;
    ws.column_dimensions['B'].width = 50;
  }

  // ───────────────────────────────────────────────────────────────
  // SHEET 2: TRIAL INFORMATION (20% Auto)
  // ───────────────────────────────────────────────────────────────
  
  async createTrialInformationSheet() {
    const ws = this.workbook.addWorksheet('Trial Information', { index: 1 });
    
    const data = [
      ['Trial Information Sheet', '', 'Location:', this.trial.location],
      ['Trial ID:', this.trial.id, 'Grower:', this.trial.grower || ''],
      ['Protocol ID:', this.trial.protocolId || this.trial.id, 'Farm & Block:', this.trial.farmBlock || ''],
      ['Client Contact:', this.trial.clientContact || '', 'Principal Investigator:', this.trial.principalInvestigator || ''],
      ['Sponsor Company:', this.trial.sponsor || '', '', ''],
      ['', '', '', ''],
      ['CROP INFORMATION', '', '', ''],
      ['Crop:', this.trial.cropCrop, 'Planting Date:', this.trial.startDate],
      ['Variety:', this.trial.cropVariety, 'Harvest Date (First):', this.getFirstHarvestDate()],
      ['', '', 'Trial Duration (days):', this.calculateTrialDuration()],
      ['', '', '', ''],
      ['TRIAL DESIGN', '', '', ''],
      ['Design Type:', this.trial.designType, 'Replications:', this.trial.replications],
      ['Treatments:', this.trial.treatments.length, 'Total Plots:', this.trial.treatments.length * this.trial.replications],
      ['Plot Size:', `${this.trial.plotSize.length} × ${this.trial.plotSize.width} ft`, '', ''],
      ['', '', '', ''],
      ['TREATMENTS', '', '', ''],
      ['Check Treatment:', 'Untreated Control', 'Application Method:', this.trial.applicationMethod || 'Drip'],
      ['Test Treatments:', this.trial.treatments.slice(1).map(t => t.name).join(', '), 
       'Application Volume:', '100 GAL/AC'],
    ];
    
    data.forEach((row, idx) => {
      row.forEach((val, colIdx) => {
        ws.getCell(idx + 1, colIdx + 1).value = val;
      });
    });
    
    // Formatting
    ws.getCell('A1').font = { bold: true, size: 12, color: { rgb: this.config.color.hex } };
    ws.column_dimensions['A'].width = 25;
    ws.column_dimensions['B'].width = 35;
    ws.column_dimensions['C'].width = 25;
    ws.column_dimensions['D'].width = 35;
  }

  // ───────────────────────────────────────────────────────────────
  // SHEET 4: ASSESSMENT DATA SUMMARY (15% Auto)
  // ───────────────────────────────────────────────────────────────
  
  async createAssessmentDataSheet() {
    const ws = this.workbook.addWorksheet('Assessment Data Summary', { index: 3 });
    
    // Define 128 columns based on category
    const headers = this.getAssessmentHeaders();
    
    // Set headers (Row 1)
    headers.forEach((header, idx) => {
      const cell = ws.getCell(1, idx + 1);
      cell.value = header;
      cell.font = { bold: true, color: { rgb: 'FFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { rgb: '366092' } };
      cell.alignment = { wrapText: true };
    });
    
    // Populate data from observations
    this.observations.forEach((obs, rowIdx) => {
      const excelRow = rowIdx + 2;
      
      ws.getCell(excelRow, 1).value = obs.date;
      ws.getCell(excelRow, 2).value = obs.daa;
      ws.getCell(excelRow, 3).value = obs.harvestNumber;
      ws.getCell(excelRow, 4).value = obs.plotNumber;
      ws.getCell(excelRow, 5).value = obs.replication;
      ws.getCell(excelRow, 6).value = obs.treatmentNumber;
      
      // Nutrition-specific fields
      if (this.category === 'nutrition') {
        ws.getCell(excelRow, 7).value = obs.plantHeight;
        ws.getCell(excelRow, 8).value = obs.ndvi;
        ws.getCell(excelRow, 9).value = obs.leafColorRating;
        ws.getCell(excelRow, 10).value = obs.tissueN;
        ws.getCell(excelRow, 11).value = obs.tissueP;
        ws.getCell(excelRow, 12).value = obs.tissueK;
        // ... and so on for all 128 columns
      }
      
      // Biostimulant-specific fields
      if (this.category === 'biostimulant') {
        ws.getCell(excelRow, 7).value = obs.rootDevelopment;
        ws.getCell(excelRow, 8).value = obs.shootVigor;
        ws.getCell(excelRow, 9).value = obs.stressTolerance;
        // ... and so on
      }
    });
    
    // Add data validation
    this.addDataValidationRules(ws);
    
    // Add conditional formatting
    this.addConditionalFormatting(ws);
    
    // Set column widths
    headers.forEach((_, idx) => {
      ws.column_dimensions[String.fromCharCode(65 + idx)].width = 12;
    });
  }

  // ───────────────────────────────────────────────────────────────
  // SHEET 5: CHARTWORK (80% Auto - 48 Formulas)
  // ───────────────────────────────────────────────────────────────
  
  async createChartworkSheet() {
    const ws = this.workbook.addWorksheet('Chartwork', { index: 4 });
    
    // Build metric rows with formulas
    const metrics = this.getChartworkMetrics(); // Returns array of metric definitions
    
    metrics.forEach((metric, rowIdx) => {
      const row = rowIdx + 3;
      
      ws.getCell(row, 1).value = metric.name;
      ws.getCell(row, 1).font = { bold: true };
      
      // Add formulas for each harvest/observation date
      metric.harvestDates.forEach((date, colIdx) => {
        const col = colIdx + 2;
        
        // Control average formula
        const controlFormula = 
          `=AVERAGEIFS('Assessment Data Summary'!${this.getColumnLetter(metric.dataColumn)}:${this.getColumnLetter(metric.dataColumn)},` +
          `'Assessment Data Summary'!$E:$E,2,` +
          `'Assessment Data Summary'!$A:$A,"${date}")`;
        
        ws.getCell(row, col).value = controlFormula;
        
        // Treatment average formula
        const trtFormula = 
          `=AVERAGEIFS('Assessment Data Summary'!${this.getColumnLetter(metric.dataColumn)}:${this.getColumnLetter(metric.dataColumn)},` +
          `'Assessment Data Summary'!$E:$E,1,` +
          `'Assessment Data Summary'!$A:$A,"${date}")`;
        
        ws.getCell(row + 1, col).value = trtFormula;
        
        // Efficacy formula (treatment - control) / control * 100
        const efficacyFormula = `=(${this.getCellRef(row+1, col)}-${this.getCellRef(row, col)})/${this.getCellRef(row, col)}*100`;
        ws.getCell(row + 2, col).value = efficacyFormula;
      });
    });
    
    // Add row labels
    ws.getCell(3, 1).value = 'Treatment 1 - Control';
    ws.getCell(4, 1).value = 'Treatment 2 - Test';
    ws.getCell(5, 1).value = 'Efficacy (%)';
    
    return ws;
  }

  // ───────────────────────────────────────────────────────────────
  // SHEET 7: AOV MEANS TABLE (95% Auto - Statistical Analysis)
  // ───────────────────────────────────────────────────────────────
  
  async createAOVMeansTable() {
    const ws = this.workbook.addWorksheet('AOV Means Table', { index: 6 });
    
    // Get assessment data to run ANOVA
    const metrics = this.getMetricsForANOVA();
    
    let row = 1;
    
    metrics.forEach(metric => {
      // Header for this metric
      ws.merge(`A${row}:F${row}`);
      ws.getCell(`A${row}`).value = `ANOVA: ${metric.name}`;
      ws.getCell(`A${row}`).font = { bold: true, size: 11 };
      ws.getCell(`A${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { rgb: this.config.color.hexLight } };
      row += 2;
      
      // ANOVA Table
      ws.getCell(`A${row}`).value = 'Source';
      ws.getCell(`B${row}`).value = 'DF';
      ws.getCell(`C${row}`).value = 'Sum of Squares';
      ws.getCell(`D${row}`).value = 'Mean Square';
      ws.getCell(`E${row}`).value = 'F Value';
      ws.getCell(`F${row}`).value = 'Pr > F';
      row++;
      
      // Calculate ANOVA using jstat
      const anovaResults = this.calculateANOVA(metric);
      
      // Populate ANOVA rows
      ws.getCell(`A${row}`).value = 'Treatment';
      ws.getCell(`B${row}`).value = 1;
      ws.getCell(`C${row}`).value = anovaResults.ss_treatment;
      ws.getCell(`D${row}`).value = anovaResults.ms_treatment;
      ws.getCell(`E${row}`).value = anovaResults.f_value;
      ws.getCell(`F${row}`).value = anovaResults.p_value;
      
      // Significance notation
      if (anovaResults.p_value < 0.001) {
        ws.getCell(`F${row}`).value += ' ***';
      } else if (anovaResults.p_value < 0.01) {
        ws.getCell(`F${row}`).value += ' **';
      } else if (anovaResults.p_value < 0.05) {
        ws.getCell(`F${row}`).value += ' *';
      } else {
        ws.getCell(`F${row}`).value += ' ns';
      }
      
      row += 2;
      
      // Treatment Means Table
      ws.getCell(`A${row}`).value = 'Treatment';
      ws.getCell(`B${row}`).value = 'Mean';
      ws.getCell(`C${row}`).value = 'Std Dev';
      ws.getCell(`D${row}`).value = '95% CI Lower';
      ws.getCell(`E${row}`).value = '95% CI Upper';
      row++;
      
      // Control mean
      ws.getCell(`A${row}`).value = 'Control';
      ws.getCell(`B${row}`).value = anovaResults.control_mean;
      ws.getCell(`C${row}`).value = anovaResults.control_sd;
      ws.getCell(`D${row}`).value = anovaResults.control_ci_lower;
      ws.getCell(`E${row}`).value = anovaResults.control_ci_upper;
      row++;
      
      // Treatment mean
      ws.getCell(`A${row}`).value = 'Treated';
      ws.getCell(`B${row}`).value = anovaResults.treatment_mean;
      ws.getCell(`C${row}`).value = anovaResults.treatment_sd;
      ws.getCell(`D${row}`).value = anovaResults.treatment_ci_lower;
      ws.getCell(`E${row}`).value = anovaResults.treatment_ci_upper;
      row++;
      
      // Efficacy
      ws.getCell(`A${row}`).value = 'Efficacy (%)';
      ws.getCell(`B${row}`).value = anovaResults.efficacy_percent;
      ws.getCell(`C${row}`).value = '';
      row += 3;
    });
    
    // Column formatting
    ws.column_dimensions['A'].width = 20;
    ws.column_dimensions['B'].width = 15;
    ws.column_dimensions['C'].width = 18;
    ws.column_dimensions['D'].width = 18;
    ws.column_dimensions['E'].width = 15;
    ws.column_dimensions['F'].width = 15;
  }

  // ───────────────────────────────────────────────────────────────
  // SHEET 8: FIGURES - 19 Charts (90% Auto)
  // ───────────────────────────────────────────────────────────────
  
  async createFiguresSheet() {
    const ws = this.workbook.addWorksheet('Figures', { index: 7 });
    ws.pageSetup.paperSize = ws.PAPER_SIZES.TABLOID; // 11" × 17" for better chart display
    
    const charts = this.generateCharts(); // Returns array of chart configs
    
    let chartPosition = 'B4';
    charts.forEach((chartConfig, idx) => {
      const chart = this.buildExcelChart(chartConfig);
      ws.addChart(chart, chartPosition);
      
      // Position next chart
      // Layout: 2 columns × 10 rows
      if (idx % 2 === 0) {
        chartPosition = this.getNextChartPosition(chartPosition, 'right');
      } else {
        chartPosition = this.getNextChartPosition(chartPosition, 'down');
      }
    });
    
    return ws;
  }

  // ───────────────────────────────────────────────────────────────
  // HELPER METHODS
  // ───────────────────────────────────────────────────────────────
  
  getAssessmentHeaders() {
    // Returns 128 column headers based on category
    const baseHeaders = [
      'Date', 'Days After App', 'Harvest', 'Plot', 'Rep', 'Treatment',
      'Height (cm)', 'Stem Diameter', 'NDVI', 'NDRE', 'Chlorophyll',
      'Visual Vigor', 'Leaf Color'
    ];
    
    if (this.category === 'nutrition') {
      return [
        ...baseHeaders,
        'Deficiency Sign', 'Deficiency Severity',
        'Tissue N (%)', 'Tissue P (%)', 'Tissue K (%)',
        'Tissue Mg (%)', 'Tissue Ca (%)', 'Tissue S (%)',
        'Tissue Zn (ppm)', 'Tissue Fe (ppm)', 'Tissue Mn (ppm)',
        'Fruit Count', 'Avg Fruit Weight', 'Total Yield', 'Quality Rating',
        'Pest Damage', 'Disease Incidence', 'Phytotoxicity',
        'Blossom End Rot', 'Cracking', 'Color Development',
        ...Array(98).fill('').map((_, i) => `Custom_Field_${i+1}`)
      ];
    }
    
    if (this.category === 'biostimulant') {
      return [
        ...baseHeaders,
        'Root Development', 'Lateral Roots', 'Root Depth',
        'Shoot Vigor', 'Branching Index', 'Leaf Area Index',
        'Stress Tolerance', 'Overall Vigor',
        'Fruit Count', 'Avg Fruit Weight', 'Total Yield', 'Quality Rating',
        'Pest Damage', 'Disease Incidence', 'Phytotoxicity',
        'Lodging', 'Wilting',
        ...Array(110).fill('').map((_, i) => `Custom_Field_${i+1}`)
      ];
    }
  }

  getChartworkMetrics() {
    // Returns metric definitions for Chartwork sheet
    if (this.category === 'nutrition') {
      return [
        { name: 'Phytotoxicity (%)', dataColumn: 'AP', harvestDates: ['2023-07-02', '2023-07-15', '2023-08-01'] },
        { name: 'Plant Height (cm)', dataColumn: 'G', harvestDates: ['2023-07-02', '2023-07-15', '2023-08-01'] },
        { name: 'NDVI', dataColumn: 'I', harvestDates: ['2023-07-02', '2023-07-15', '2023-08-01'] },
        { name: 'Tissue N (%)', dataColumn: 'Q', harvestDates: ['2023-07-02', '2023-07-15', '2023-08-01'] },
        { name: 'Tissue P (%)', dataColumn: 'R', harvestDates: ['2023-07-02', '2023-07-15', '2023-08-01'] },
        { name: 'Tissue K (%)', dataColumn: 'S', harvestDates: ['2023-07-02', '2023-07-15', '2023-08-01'] },
        { name: 'Yield (kg/ha)', dataColumn: 'AJ', harvestDates: ['2023-07-02', '2023-07-15', '2023-08-01'] },
      ];
    }
    
    if (this.category === 'biostimulant') {
      return [
        { name: 'Root Development', dataColumn: 'X', harvestDates: ['2023-07-02', '2023-07-15', '2023-08-01'] },
        { name: 'Shoot Vigor', dataColumn: 'AA', harvestDates: ['2023-07-02', '2023-07-15', '2023-08-01'] },
        { name: 'Stress Tolerance', dataColumn: 'AD', harvestDates: ['2023-07-02', '2023-07-15', '2023-08-01'] },
        { name: 'Overall Vigor', dataColumn: 'AE', harvestDates: ['2023-07-02', '2023-07-15', '2023-08-01'] },
        { name: 'NDVI', dataColumn: 'I', harvestDates: ['2023-07-02', '2023-07-15', '2023-08-01'] },
        { name: 'Yield Response (%)', dataColumn: 'AJ', harvestDates: ['2023-07-02', '2023-07-15', '2023-08-01'] },
      ];
    }
  }

  calculateANOVA(metric) {
    // Use jstat to calculate ANOVA
    const controlData = this.getMetricData(metric, 'control');
    const treatmentData = this.getMetricData(metric, 'treatment');
    
    // Simple ANOVA calculation using jstat
    const f_oneway = jstat.anova(controlData, treatmentData);
    
    return {
      ss_treatment: f_oneway.sstrt,
      ms_treatment: f_oneway.mstrt,
      f_value: f_oneway.fstat,
      p_value: f_oneway.pvalue,
      control_mean: jstat.mean(controlData),
      control_sd: jstat.stdev(controlData),
      control_ci_lower: jstat.mean(controlData) - 1.96 * (jstat.stdev(controlData) / Math.sqrt(controlData.length)),
      control_ci_upper: jstat.mean(controlData) + 1.96 * (jstat.stdev(controlData) / Math.sqrt(controlData.length)),
      treatment_mean: jstat.mean(treatmentData),
      treatment_sd: jstat.stdev(treatmentData),
      treatment_ci_lower: jstat.mean(treatmentData) - 1.96 * (jstat.stdev(treatmentData) / Math.sqrt(treatmentData.length)),
      treatment_ci_upper: jstat.mean(treatmentData) + 1.96 * (jstat.stdev(treatmentData) / Math.sqrt(treatmentData.length)),
      efficacy_percent: ((jstat.mean(treatmentData) - jstat.mean(controlData)) / jstat.mean(controlData)) * 100
    };
  }

  generateCharts() {
    // Returns array of chart configurations for Figures sheet
    return [
      {
        title: 'Phytotoxicity (%) Over Time',
        type: 'LineChart',
        dataRange: { sheet: 'Chartwork', min: 'B3', max: 'F5' },
        xAxisTitle: 'Days After Application',
        yAxisTitle: 'Phytotoxicity (%)',
        series: ['Control', 'Treatment'],
        colors: ['#6B7280', '#059669']
      },
      {
        title: 'Plant Height Progression',
        type: 'ColumnChart',
        dataRange: { sheet: 'Chartwork', min: 'B7', max: 'F8' },
        xAxisTitle: 'Observation Date',
        yAxisTitle: 'Height (cm)',
        series: ['Control', 'Treatment'],
        colors: ['#6B7280', '#059669']
      },
      // ... 17 more chart configs
    ];
  }

  buildExcelChart(config) {
    const ExcelJS = require('exceljs');
    const chart = new ExcelJS[config.type]();
    
    chart.title = config.title;
    chart.style = 10;
    chart.xAxis.title = config.xAxisTitle;
    chart.yAxis.title = config.yAxisTitle;
    chart.legend.position = 'r';
    
    // Add data series (simplified)
    // In production, need to add proper data ranges
    
    return chart;
  }

  async loadTrialData() {
    // Load trial observations from database
    // Typically: observations = await db.getObservations(this.trial.id);
    this.observations = this.trial.observations || [];
  }

  generateKeyFindings() {
    const efficacy = this.getEfficacyPercent();
    const pValue = this.getPValue();
    const metric = this.config.primaryMetric.label;
    
    return `Crop ${this.trial.cropCrop} treated with ${this.trial.treatments[1]?.name} at ` +
           `${this.trial.treatments[1]?.doseRate} ${this.trial.treatments[1]?.doseUnit} showed ` +
           `${efficacy}% improvement in ${metric} compared to untreated control (p = ${pValue.toFixed(4)}).`;
  }

  generateSummary() {
    const duration = this.calculateTrialDuration();
    const designType = this.trial.designType || 'RCB';
    
    return `A ${duration}-day field trial was conducted at ${this.trial.location} from ` +
           `${this.trial.startDate} to ${this.trial.endDate} to evaluate the efficacy of ` +
           `${this.trial.treatments[1]?.name} in improving ${this.config.primaryMetric.label} of ` +
           `${this.trial.cropCrop} variety ${this.trial.cropVariety}. ` +
           `The trial was conducted in a ${designType} design with ${this.trial.replications} replications.`;
  }

  calculateTrialDuration() {
    const start = new Date(this.trial.startDate);
    const end = new Date(this.trial.endDate);
    return Math.floor((end - start) / (1000 * 60 * 60 * 24));
  }

  getFirstHarvestDate() {
    return this.observations[0]?.date || this.trial.startDate;
  }

  getEfficacyPercent() {
    // Calculate from observations or ANOVA results
    // Placeholder: return average efficacy
    return 15.9; // Example value
  }

  getPValue() {
    // Get p-value from ANOVA
    // Placeholder
    return 0.0453; // Example value
  }

  getColumnLetter(num) {
    return String.fromCharCode(65 + num);
  }

  getCellRef(row, col) {
    return `${this.getColumnLetter(col)}${row}`;
  }

  getMetricData(metric, treatment) {
    // Filter observations by treatment and extract metric values
    const filtered = this.observations.filter(obs => {
      if (treatment === 'control') return obs.treatmentNumber === 1;
      if (treatment === 'treatment') return obs.treatmentNumber === 2;
    });
    
    return filtered.map(obs => obs[metric.dataColumn.toLowerCase()]).filter(v => v !== null);
  }

  addDataValidationRules(ws) {
    // Add Excel data validation for cells
    // E.g., height between 0-300, NDVI between -1 and 1
    const dv_rating = new ExcelJS.DataValidation({
      type: 'whole',
      operator: 'between',
      formula1: 0,
      formula2: 10,
      showErrorMessage: true,
      errorTitle: 'Invalid Value',
      error: 'Must be 0-10'
    });
    ws.addDataValidation(dv_rating);
    dv_rating.addAddresses('M2:M1000'); // Apply to rating column
  }

  addConditionalFormatting(ws) {
    // Highlight out-of-range values
    ws.conditionalFormatting.add('I2:I1000', {
      type: 'expression',
      formulae: ['OR(I2<-1,I2>1)'],
      fill: { type: 'pattern', pattern: 'solid', fgColor: { rgb: 'FF0000' } }
    });
  }

  // ... Additional helper methods ...
}

export default AdvancedReportGenerator;
```

### 8.2 Integration with App

**Add to Pages/Reports.jsx:**
```javascript
import AdvancedReportGenerator from '../services/advancedReportGenerator';

async function handleGenerateAdvancedReport(trial, category) {
  try {
    window.dispatchEvent(new CustomEvent('app:loading', { detail: { show: true } }));
    
    const generator = new AdvancedReportGenerator(trial, category);
    const result = await generator.generateCompleteReport();
    
    // Trigger file download
    const link = document.createElement('a');
    link.href = result.filepath;
    link.download = result.filename;
    link.click();
    
    window.dispatchEvent(new CustomEvent('app:toast', { 
      detail: { 
        msg: `Advanced report generated successfully (${result.sheets} sheets, ${result.charts} charts)`, 
        type: 'success' 
      } 
    }));
  } catch (error) {
    window.dispatchEvent(new CustomEvent('app:toast', { 
      detail: { msg: `Report generation failed: ${error.message}`, type: 'error' } 
    }));
  }
}
```

---

## 9. KEY FORMULAS REFERENCE

### 9.1 Efficacy Calculation Formulas

**Nutrition Category:**
```excel
Yield Efficacy = ((Treated_Yield - Control_Yield) / Control_Yield) * 100
Tissue N Efficacy = ((Treated_N% - Control_N%) / Control_N%) * 100
Growth Efficacy = ((Treated_Height - Control_Height) / Control_Height) * 100
```

**Biostimulant Category:**
```excel
Vigor Efficacy = ((Treated_Vigor - Control_Vigor) / Control_Vigor) * 100
Root Efficacy = ((Treated_Root_Dev - Control_Root_Dev) / Control_Root_Dev) * 100
Stress Response = ((Treated_Stress_Tol - Control_Stress_Tol) / Control_Stress_Tol) * 100
```

### 9.2 Treatment Means Formula
```excel
=AVERAGEIFS('Assessment Data'!DataColumn, 'Assessment Data'!TreatmentCol, TreatmentNumber, 'Assessment Data'!DateCol, ObservationDate)
```

### 9.3 Statistical Confidence Interval
```excel
CI_Lower = Mean - 1.96 * (StdDev / SQRT(SampleSize))
CI_Upper = Mean + 1.96 * (StdDev / SQRT(SampleSize))
```

---

## 10. SUCCESS METRICS & ACCEPTANCE CRITERIA

### 10.1 Functional Requirements
- [ ] All 10 sheets generated correctly
- [ ] 48+ formulas working and auto-calculating
- [ ] 21+ charts rendering with correct data
- [ ] ANOVA p-values < 0.0001 validation error < 0.01%
- [ ] File size < 10 MB (with 26 photos)
- [ ] Report generation time < 2 minutes

### 10.2 Data Quality
- [ ] Data validation rules prevent invalid entries
- [ ] Conditional formatting highlights outliers
- [ ] Formula error checking active
- [ ] Cross-sheet references validate successfully

### 10.3 User Experience
- [ ] Report generation initiated with one click
- [ ] Progress indicator shows generation status
- [ ] Error messages are clear and actionable
- [ ] Report downloads automatically when ready
- [ ] Narrative template easy to edit

### 10.4 Professional Quality
- [ ] Report matches TOK2322 quality standards
- [ ] Charts professionally formatted
- [ ] Statistics are accurate (validated against R/SAS)
- [ ] Color scheme consistent per category
- [ ] Accessibility: Tables have headers, images have alt text

---

## 11. RISK MITIGATION & CONTINGENCIES

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| Large files (>10MB) slow down generation | Medium | High | Implement lazy-loading for charts, compress images |
| ANOVA calculation errors | Low | High | Validate against R package, extensive unit testing |
| Chart rendering issues in Excel | Medium | Medium | Test in multiple Excel versions, fallback to static images |
| Complex formula maintenance | High | Medium | Document all formulas, create formula reference guide |
| Missing weather data | Low | Low | Use estimated weather from API as fallback |

---

## 12. DEPLOYMENT CHECKLIST

**Pre-Deployment:**
- [ ] All tests passing (unit + integration)
- [ ] Code reviewed by senior developer
- [ ] Documentation complete and reviewed
- [ ] User training materials prepared
- [ ] Test reports generated with sample data

**Deployment Day:**
- [ ] Deploy to staging environment
- [ ] Smoke test all report types
- [ ] Generate sample reports for Nutrition and Biostimulant
- [ ] Verify file downloads correctly
- [ ] Check error handling

**Post-Deployment:**
- [ ] Monitor for user errors/issues
- [ ] Gather user feedback
- [ ] Plan v1.1 improvements
- [ ] Document any workarounds needed

---

## 13. FUTURE ENHANCEMENTS (v1.1+)

- [ ] Multi-language report generation
- [ ] Custom report templates per organization
- [ ] Real-time collaborative report editing
- [ ] Cloud storage integration (Google Drive, Dropbox)
- [ ] PDF report generation (in addition to Excel)
- [ ] Automated email delivery
- [ ] Report version control & diff view
- [ ] API endpoint for batch report generation
- [ ] Mobile app for report review/signing
- [ ] Integration with LIMS for lab result imports

---

## 14. DEPENDENCIES & INSTALLATION

```bash
# Install required packages
npm install exceljs sharp jstat

# Optional for production R integration
npm install r-script  

# Development dependencies
npm install --save-dev jest @testing-library/react

# Optional: Weather API
npm install node-fetch  # For OpenWeatherMap or NOAA APIs
```

---

## 15. GLOSSARY OF TERMS

- **ANOVA:** Analysis of Variance - statistical test for comparing treatments
- **RCB:** Randomized Complete Block Design - experimental design with replicates
- **DAA:** Days After Application
- **NDVI:** Normalized Difference Vegetation Index (greenness index -1 to 1)
- **Efficacy:** (Treated - Control) / Control × 100
- **GDD:** Growing Degree Days (heat accumulation)
- **CI:** Confidence Interval (95% confidence)
- **p-value:** Probability of treatment effect being due to chance
- **PHI:** Pre-Harvest Interval (days before harvest when last application allowed)
- **Merged Cells:** Excel cells combined for visual layout

---

## APPENDIX A: SAMPLE NUTRITION REPORT STRUCTURE

**Report:** TOK2322C_Tomato_Fertility_Report.xlsx
- **Crop:** Tomato
- **Duration:** June 30 - September 16, 2023 (78 days)
- **Treatments:** 2 (Control + Nutrition Product)
- **Design:** RCB with 6 replications
- **Key Metric:** Tissue N (%), Yield (kg/ha)
- **Result:** 15.9% yield improvement (p = 0.0453, significant at 0.05 level)

---

## APPENDIX B: SAMPLE BIOSTIMULANT REPORT STRUCTURE

**Report:** Theoretical Biostimulant Trial
- **Crop:** Corn
- **Duration:** May 1 - September 30 (153 days)
- **Treatments:** 2 (Control + Biostimulant)
- **Design:** RCB with 4 replications
- **Key Metrics:** Root Development, Shoot Vigor, Overall Vigor Score
- **Expected Result:** 20-30% improvement in vigor, 10-15% yield improvement

---

## CONCLUSION

This PRD provides a complete specification for implementing enterprise-grade trial report generation in Miklens app. The system is designed to be:

1. **Highly Automated** (70%) - Minimal manual effort after data entry
2. **Statistically Rigorous** (ANOVA validated)
3. **Professionally Formatted** (industry-standard Excel reports)
4. **Extensible** (easily adapted for new categories)
5. **Maintainable** (clear code structure, well-documented formulas)

Implementation timeline: **11 weeks to production deployment**

---

**Document Version:** 1.0  
**Last Updated:** June 8, 2026  
**Status:** Ready for Development  
**Next Review:** Post-MVP (after Phase 1 completion)
