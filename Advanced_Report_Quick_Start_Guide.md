# Quick Start Implementation Guide
## Advanced Trial Report Generator for Miklens App

---

## 🎯 At A Glance

| Aspect | Details |
|--------|---------|
| **Purpose** | Auto-generate professional 10-sheet Excel reports like TOK2322 |
| **Target Categories** | Nutrition & Biostimulant |
| **Automation Level** | 70% automatic, 30% manual expert input |
| **Report Sheets** | 11 sheets (Narrative, Trial Info, Treatments, Assessment Data, Chartwork, Post-Harvest, ANOVA, Figures, Charts, Weather, Photos) |
| **Formulas** | 48+ Excel formulas (AVERAGEIF, SUMIF, efficacy calculations) |
| **Charts** | 21 professional charts (Line, Column, Area, Box Plot, Radar) |
| **Time per Report** | 30 min generation + 2-3 hours expert review |
| **File Size** | 3-8 MB (with 26 photos) |

---

## 📋 Report Architecture Quick View

```
NUTRITION TRIAL REPORT (Example: Tomato)
├── 11 Sheets
│   ├── Narrative (0% auto) → Manual analysis summary
│   ├── Trial Information (20% auto) → Experiment metadata
│   ├── Treatment List & Map (50% auto) → Treatment details + field layout
│   ├── Assessment Data (15% auto) → Raw 128×123 dataset
│   ├── Chartwork (80% auto) → 48 formulas, treatment means
│   ├── Post-Harvest (90% auto) → Storage quality analysis
│   ├── AOV Table (95% auto) → ANOVA statistics
│   ├── Figures (90% auto) → 19 professional charts
│   ├── Charts (90% auto) → 2 quality charts
│   ├── Weather (50% auto) → Environmental data
│   └── Photos (100% manual) → 26 images
│
├── Key Metrics Calculated
│   ├── Yield Efficacy: ((Treated - Control) / Control) × 100
│   ├── Tissue N, P, K efficiency
│   ├── ANOVA p-values & significance
│   └── 95% Confidence Intervals
│
└── Output: Professional multi-page Excel workbook
    (Export to PDF for distribution)
```

---

## 🛠️ Implementation Steps

### Phase 1: Setup (Week 1-3)

**Step 1: Install Dependencies**
```bash
npm install exceljs sharp jstat
# exceljs = Excel file generation
# sharp = Image compression
# jstat = Statistical calculations
```

**Step 2: Create Report Service**
```javascript
// src/services/advancedReportGenerator.js
class AdvancedReportGenerator {
  async generateCompleteReport() {
    // Main entry point
  }
}
```

**Step 3: Database Schema**
```javascript
// Store trial observation data with 128+ fields
Trial.observations = [
  {
    date: '2023-07-02',
    daa: 2,               // Days After Application
    plotNumber: 1,
    treatmentNumber: 1,   // 1=Control, 2=Treatment
    plantHeight: 45.2,    // cm
    ndvi: 0.52,          // Vegetation index
    tissueN: 2.1,        // % nitrogen
    tissueP: 0.25,       // % phosphorus
    tissueK: 1.8,        // % potassium
    // ... 120+ more fields
  }
]
```

**Step 4: Create Excel Template Logic**
```javascript
// Framework for sheet generation
const sheetTemplates = {
  narrative: () => createNarrativeSheet(),
  trialInfo: () => createTrialInformationSheet(),
  assessmentData: () => createAssessmentDataSheet(),
  chartwork: () => createChartworkSheet(), // With 48 formulas
  aov: () => createAOVMeansTable(),        // With ANOVA
  figures: () => createFiguresSheet(),     // With 19 charts
  // ... etc
};
```

### Phase 2: Core Sheets (Week 4-8)

**Week 4: Executive Summary Sheets**
```
✓ Narrative Sheet (0% auto)
  - Key Findings template
  - Summary narrative template
  - Conclusions framework
  
✓ Trial Information (20% auto)
  - Auto-populate from trial object
  - Trial ID, location, crop, dates
  - Design info (RCB, 6 reps, etc.)
  
✓ Treatment List & Map (50% auto)
  - Treatment details from formulations
  - Plot layout image embedding
  - Design summary
```

**Week 5: Assessment Data**
```
✓ Assessment Data Summary (15% auto)
  - 128 columns × 123 rows
  - Data validation rules (drop-downs for ratings)
  - Conditional formatting (highlight outliers)
  
Nutrition-specific columns:
  - Tissue N, P, K, Mg, Ca, S, micronutrients
  - Leaf color ratings, deficiency signs
  - Yield, quality metrics
  
Biostimulant-specific columns:
  - Root development, shoot vigor
  - Stress tolerance, overall vigor
  - Plant height, biomass
```

**Week 6: Calculations**
```
✓ Chartwork Sheet (80% auto)
  - 48 formulas for treatment means
  - AVERAGEIF: Calculate treatment averages per date
  - SUMIF: Accumulate metrics
  - Custom: Efficacy = (Treated - Control) / Control × 100
  
Formula Pattern:
  E5 = AVERAGEIF('Assessment'!E:E, 1, 'Assessment'!G:G)
       (Average height for treatment 1)
  
✓ Post-Harvest Chartwork (90% auto)
  - Weight loss calculations
  - Quality degradation over days
  - Storage efficacy metrics
```

**Week 7: Statistics**
```
✓ AOV Means Table (95% auto)
  - Run ANOVA on treatment data
  - Calculate F-values & p-values
  - Compile treatment means
  - Calculate 95% Confidence Intervals
  - Output: Professional ANOVA table (249 cols × 136 rows)
```

**Week 8: Visualizations**
```
✓ Figures Sheet (90% auto)
  - 19 Charts auto-generated from Chartwork data
  
Chart Types (Nutrition):
  1. Phytotoxicity over time (Line)
  2. Plant Height (Column)
  3. NDVI Greenness (Area)
  4. Tissue N Comparison (Box Plot)
  5. Tissue P/K Comparison (Bar)
  6. Micronutrients Status (Radar)
  7. Yield by Harvest (Combo)
  8. Cumulative Yield Curve (Line)
  9. Yield Efficacy Summary (Column)
  10-19. Other metrics...
  
✓ Post-Harvest Charts (90% auto)
  - Weight loss trend (Line)
  - Quality retention (Area)
```

### Phase 3: Advanced Features (Week 9-10)

**Photo Integration**
```javascript
// Sheet: Photos (26 images)
const photoSections = [
  { name: 'Trial Setup', photos: 3 },
  { name: 'Growth Stages', photos: 4 },
  { name: 'Nutrient Status', photos: 4 },
  { name: 'Harvest', photos: 4 },
  { name: 'Quality Check', photos: 4 },
  { name: 'Storage', photos: 2 },
  { name: 'Closure', photos: 2 }
];

// Compress images before embedding
const compressedImage = await sharp(photoPath)
  .resize(1200, 800)
  .jpeg({ quality: 85 })
  .toBuffer();

ws.addImage(Image(compressedImage), 'A2');
```

**Weather Data**
```javascript
// Sheet: Weather (Daily data for trial duration)
const weatherData = {
  date: '2023-07-02',
  precipitation: 0.15,      // inches
  cumPrecipitation: 0.15,   // rolling sum
  highTemp: 92,             // °F
  lowTemp: 68,              // °F
  meanTemp: 80,             // calculated
  humidity: 65,             // %
  dewPoint: 62,             // °F
  windSpeed: 4,             // mph
  solarRadiation: 2.8       // MJ/m²
};
```

**Batch Report Generation**
```javascript
// Generate multiple reports at once
async generateBatchReports(trialIds, category) {
  const reports = [];
  for (const trialId of trialIds) {
    const trial = await db.getTrial(trialId);
    const generator = new AdvancedReportGenerator(trial, category);
    const report = await generator.generateCompleteReport();
    reports.push(report);
  }
  return reports; // Zip files together
}
```

### Phase 4: Testing & Deployment (Week 11)

**Unit Tests**
```javascript
describe('AdvancedReportGenerator', () => {
  test('should create 11 sheets', () => {
    // Verify all sheets exist
  });
  
  test('should generate 48+ formulas in Chartwork', () => {
    // Count formulas in worksheet
  });
  
  test('should embed 19 charts correctly', () => {
    // Verify chart data ranges
  });
  
  test('should calculate ANOVA p-values < 0.0001 error', () => {
    // Validate statistics against R output
  });
  
  test('should compress file to < 10MB with photos', () => {
    // Check file size
  });
});
```

**Integration Tests**
```javascript
test('end-to-end report generation', async () => {
  const trial = createTestTrial('nutrition');
  const generator = new AdvancedReportGenerator(trial, 'nutrition');
  const result = await generator.generateCompleteReport();
  
  expect(result.filesize).toBeLessThan(10 * 1024 * 1024);
  expect(result.sheets).toBe(11);
  expect(result.charts).toBe(21);
  expect(result.success).toBe(true);
});
```

**User Acceptance Testing**
```
Checklist:
□ Report generates in < 2 minutes
□ All 11 sheets present and formatted correctly
□ Data matches Assessment Data Summary
□ Charts render with correct data ranges
□ ANOVA p-values match R/SAS calculations
□ Narrative template pre-populated with key data
□ 26 photos embedded without errors
□ Weather data imports correctly
□ File downloads automatically
□ Report matches TOK2322 quality
```

---

## 📊 Formula Quick Reference

### Efficacy Calculations

**Nutrition Category:**
```excel
Yield_Efficacy = (Treated_Yield - Control_Yield) / Control_Yield * 100
Tissue_N_Efficacy = (Treated_N% - Control_N%) / Control_N% * 100
Growth_Efficacy = (Treated_Height - Control_Height) / Control_Height * 100
```

**Biostimulant Category:**
```excel
Vigor_Efficacy = (Treated_Vigor - Control_Vigor) / Control_Vigor * 100
Root_Efficacy = (Treated_Root_Dev - Control_Root_Dev) / Control_Root_Dev * 100
```

### Treatment Means Formula
```excel
=AVERAGEIFS(
  'Assessment Data'!DataColumn,
  'Assessment Data'!TreatmentCol, TreatmentNumber,
  'Assessment Data'!DateCol, ObservationDate
)

Example:
=AVERAGEIFS('Assessment Data'!G:G, 'Assessment Data'!E:E, 1, 'Assessment Data'!A:A, DATE(2023,7,2))
Returns: Average height for treatment 1 on 7/2/2023
```

### Statistical Confidence Interval
```excel
CI_Lower = Mean - 1.96 * (StdDev / SQRT(n))
CI_Upper = Mean + 1.96 * (StdDev / SQRT(n))

Example (6 reps):
CI_Lower = 250.5 - 1.96 * (35.2 / 2.449) = 219.1
CI_Upper = 250.5 + 1.96 * (35.2 / 2.449) = 281.9
```

---

## 🔧 How to Add New Metrics

### For Nutrition Category

**Step 1: Add Column to Assessment Data**
```javascript
// In getAssessmentHeaders()
nutritionHeaders.push('New_Tissue_Metric (%)');
```

**Step 2: Add to Chartwork Metrics**
```javascript
// In getChartworkMetrics()
metrics.push({
  name: 'New Tissue Metric (%)',
  dataColumn: 'AX',  // Column where data is stored
  harvestDates: ['2023-07-02', '2023-07-15', '2023-08-01']
});
```

**Step 3: Create Chart**
```javascript
// In generateCharts()
charts.push({
  title: 'New Tissue Metric Over Time',
  type: 'ColumnChart',
  dataRange: { sheet: 'Chartwork', min: 'B120', max: 'F122' },
  xAxisTitle: 'Harvest Date',
  yAxisTitle: 'Metric (%)',
  series: ['Control', 'Treatment']
});
```

### For Biostimulant Category

Same process as above, just add to biostimulant-specific arrays in the condition blocks.

---

## 💾 Data Model Example

### Trial Object Extended for Reports
```javascript
{
  id: 'TOK2322',
  category: 'nutrition',
  cropCrop: 'Tomato',
  cropVariety: 'Tulare',
  startDate: '2023-06-30',
  endDate: '2023-09-16',
  location: 'Hyrule Kingdom, Hyrule, CA',
  designType: 'RCB',
  replications: 6,
  plotSize: { length: 5, width: 40 }, // feet
  
  treatments: [
    {
      number: 1,
      name: 'Untreated Check',
      doseRate: 0,
      doseUnit: 'N/A'
    },
    {
      number: 2,
      name: 'Warm Safflina + Electric Safflina',
      doseRate: 2,
      doseUnit: 'L/ha',
      applicationMethod: 'Drip line',
      formulation: 'Liquid concentrate'
    }
  ],
  
  observations: [
    {
      date: '2023-07-02',
      daa: 2,
      harvestNumber: 1,
      plotNumber: 1,
      replication: 1,
      treatmentNumber: 1,
      plantHeight: 45.2,
      ndvi: 0.52,
      tissueN: 2.1,
      tissueP: 0.25,
      tissueK: 1.8,
      // ... 120+ more fields
    },
    // ... 122 total observations
  ],
  
  photos: [
    { url: '/photos/trial_setup_1.jpg', date: '2023-06-30', description: 'Field layout' },
    // ... 26 total photos
  ],
  
  weather: [
    { date: '2023-06-30', precip: 0, highTemp: 85, lowTemp: 62, humidity: 65 },
    // ... 78 days of data
  ]
}
```

---

## 📱 Integration with Miklens UI

### Add Button to Reports Page
```javascript
// In src/pages/Reports.jsx

<button 
  onClick={() => generateAdvancedReport(selectedTrial, 'nutrition')}
  className="px-4 py-2 bg-green-600 text-white rounded"
>
  📊 Generate Professional Report
</button>

// Handler function
async function generateAdvancedReport(trial, category) {
  window.dispatchEvent(new CustomEvent('app:loading', { 
    detail: { show: true, message: 'Generating report...' } 
  }));
  
  try {
    const generator = new AdvancedReportGenerator(trial, category);
    const result = await generator.generateCompleteReport();
    
    // Auto-download
    const link = document.createElement('a');
    link.href = URL.createObjectURL(result.file);
    link.download = result.filename;
    link.click();
    
    showSuccess(`Report generated: ${result.sheets} sheets, ${result.charts} charts`);
  } catch (error) {
    showError(`Failed: ${error.message}`);
  } finally {
    window.dispatchEvent(new CustomEvent('app:loading', { detail: { show: false } }));
  }
}
```

---

## 🎨 Chart Color Scheme

**Nutrition Category (Emerald Green)**
```css
Primary: #059669
Control: #6B7280 (Gray)
Treatment: #059669 (Emerald)
Highlight: #10B981 (Bright Green)
Light: #D1FAE5
```

**Biostimulant Category (Cyan Blue)**
```css
Primary: #0891B2
Control: #6B7280 (Gray)
Treatment: #0891B2 (Cyan)
Highlight: #06B6D4 (Bright Cyan)
Light: #CFFAFE
```

---

## ⚠️ Common Pitfalls & Solutions

| Issue | Solution |
|-------|----------|
| File too large (>10MB) | Compress images (JPG 85%), use streaming |
| ANOVA p-values don't match R | Verify data types (float, not string), check n for each group |
| Charts not updating | Verify data range references in chart config |
| Formulas showing errors (#REF!) | Check sheet name spelling, column references |
| Photos not embedding | Verify image format (JPG/PNG), file exists, permissions |
| Memory issues with large datasets | Process in chunks, use generators instead of arrays |

---

## 📈 Performance Benchmarks

**Target Metrics:**
| Task | Duration | Max Size |
|------|----------|----------|
| Generate Report | < 2 min | - |
| File Output | - | < 10 MB |
| Open in Excel | < 5 sec | - |
| Chart Rendering | - | 60 charts max |
| Photo Embedding | < 30 sec | 50 MB total |
| ANOVA Calculation | < 5 sec | 10,000 observations |

---

## 🚀 Deployment Checklist

- [ ] All dependencies installed (`npm install`)
- [ ] Code passes linting (`npm run lint`)
- [ ] Unit tests passing (90%+ coverage)
- [ ] Integration tests passing
- [ ] Sample reports generated successfully
- [ ] File size < 10MB with 26 photos
- [ ] ANOVA values validated against R/SAS
- [ ] Charts rendering in Excel 2019+
- [ ] Narrative template tested
- [ ] Error handling comprehensive
- [ ] Documentation complete
- [ ] User training prepared
- [ ] UAT sign-off received
- [ ] Production deployment

---

## 📚 Further Reading

- **Tomato Fertility Report Analysis:** See `Tomato_Fertility_Report_Analysis_md.pdf`
- **Complete PRD:** See `Nutrition_Biostimulant_Advanced_Report_PRD.md`
- **Miklens App Documentation:** See `Miklens_App_Complete_Documentation.md`

---

## 💬 Support & Questions

For implementation questions:
1. Review the detailed PRD for specifications
2. Check formula reference in appendix
3. Examine test case examples
4. Refer to TOK2322 report as gold standard

---

**Version:** 1.0  
**Created:** June 8, 2026  
**Status:** Ready for Development
