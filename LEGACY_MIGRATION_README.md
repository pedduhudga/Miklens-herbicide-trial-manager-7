# Legacy Data Migration Implementation

## Overview

This document describes the implementation of task 3.7: "Implement legacy data migration strategy" as part of the category isolation fix. This implementation prevents the bug where all legacy data records without a `Category` field would default to 'herbicide', causing data pollution.

## Problem Statement

The original bug condition described in the design:
> **WHEN legacy data records exist without Category fields THEN the system defaults them to 'herbicide' category causing data pollution**

This created several issues:
- All uncategorized formulations, trials, projects, etc. were incorrectly assigned to 'herbicide'
- This polluted herbicide statistics with data from other categories
- Users couldn't distinguish between actual herbicide data and misclassified legacy data
- Category isolation was violated as herbicide category contained non-herbicide data

## Solution Components

### 1. Heuristic-Based Category Prediction (`src/utils/legacyDataMigration.js`)

**Intelligent Pattern Matching:**
- Analyzes formulation names using keyword matching and regex patterns
- Recognizes active ingredients (glyphosate → herbicide, imidacloprid → pesticide)
- Identifies product types (NPK ratios → nutrition, seaweed extract → biostimulant)
- Uses context clues from trial fields (WeedSpecies → herbicide, DiseaseTarget → fungicide)

**Category Pattern Examples:**
```javascript
// Herbicide indicators
'glyphosate', '2,4-d', 'weed control', /pre.*emergent/i

// Fungicide indicators  
'propiconazole', 'mildew', 'blight', /disease.*control/i

// Pesticide indicators
'imidacloprid', 'insect control', 'aphid killer', /pest.*control/i

// Nutrition indicators
'npk', 'urea', /\d+-\d+-\d+/i, 'fertilizer'

// Biostimulant indicators
'seaweed extract', 'humic acid', 'trichoderma', /bio.*stimulant/i
```

### 2. User Interface for Manual Categorization (`src/components/LegacyDataMigrationModal.jsx`)

**Features:**
- **Migration Analysis Dashboard:** Shows statistics on legacy records, high-confidence suggestions, and records needing review
- **Filterable Record List:** Filter by collection type (trials, projects, formulations) and confidence level
- **Manual Override Capability:** Users can override automatic suggestions with manual category assignments
- **Batch Operations:** Select multiple records for simultaneous migration
- **Validation Warnings:** Alerts users to potential conflicts or cross-category references

**UI Flow:**
1. Admin opens migration tool from Settings page
2. System analyzes all legacy records and presents suggestions
3. User reviews suggestions, applies manual overrides as needed
4. User selects records to migrate and applies changes
5. System updates records and refreshes analysis

### 3. Migration Service Layer (`src/services/legacyMigrationService.js`)

**Service Capabilities:**
- **Quick Analysis:** Fast check for legacy data presence without full processing
- **Comprehensive Migration:** Full analysis with detailed suggestions and confidence levels
- **Automatic Migration:** Auto-apply high-confidence suggestions without user intervention
- **Validation & Safety:** Cross-reference checks to prevent data corruption
- **Database Integration:** Seamless integration with existing dataLayer.js functions

**Migration Process:**
```javascript
// 1. Analyze legacy data
const analysis = await LegacyMigrationService.analyzeLegacyData(getAppState);

// 2. Apply automatic migration for high-confidence records
const result = await LegacyMigrationService.performAutoMigration(getAppState, 'high');

// 3. Manual migration for remaining records via UI
const suggestions = analysis.report.suggestions.filter(s => s.confidence !== 'high');
// User reviews and applies through LegacyDataMigrationModal
```

### 4. Integration with Settings Page

**Admin-Only Access:**
- Migration functionality is only available to admin users
- Non-admin users cannot see or access migration features
- Prevents accidental data modifications by regular users

**Settings Integration:**
- Migration status displayed in Settings page
- Quick stats showing legacy record count and migration readiness
- One-click access to migration tool
- Auto-migration button for high-confidence records

## Migration Strategies

### Automatic (High-Confidence) Migration
- **Criteria:** Clear keyword matches + pattern recognition + existing formulation matches
- **Examples:** 
  - "Glyphosate 360 SL" → herbicide (active ingredient match)
  - "NPK 20-20-20" → nutrition (ratio pattern match)
  - Existing formulation with same name already categorized
- **Safety:** Only applied when confidence is 'high' and no conflicts detected

### Manual Review Required
- **Ambiguous names:** Generic product names without clear indicators
- **Conflicting signals:** Multiple category indicators in same record
- **Cross-references:** Records with relationships to already-categorized data in different categories
- **Novel formulations:** New products not matching existing patterns

### Context-Based Prediction
- **Trial Context:** Uses WeedSpecies, DiseaseTarget, PestTarget fields as category indicators
- **Investigator History:** Can leverage previous categorizations by same investigator
- **Project Association:** Uses project category to infer trial categories
- **Ingredient Analysis:** Analyzes formulation ingredients for category clues

## Validation and Safety

### Cross-Reference Validation
```javascript
// Prevents issues like:
// - Project migrated to 'fungicide' but contains 'herbicide' trials
// - Formulation migrated to 'pesticide' but used in 'nutrition' trials
```

### Migration Preview
- Shows what will change before applying
- Identifies potential conflicts
- Allows users to review and modify suggestions

### Rollback Capability
- Migration adds metadata fields (`_migrationApplied`, `_migrationDate`, `_migrationReason`)
- Enables identification of migrated records for potential rollback
- Preserves migration history for audit purposes

## Testing

### Unit Tests (`src/__tests__/legacyDataMigration.test.js`)
- **Pattern Recognition:** Tests all category prediction algorithms
- **Edge Cases:** Handles empty data, ambiguous names, conflicting indicators
- **Integration:** Tests full migration workflow end-to-end
- **Bug Prevention:** Specifically tests that legacy records are NOT all defaulted to 'herbicide'

### Key Test Cases
```javascript
// Prevents the original bug
it('should prevent defaulting all legacy records to herbicide', () => {
  const legacyRecords = [
    { FormulationName: 'Copper Sulfate Fungicide' },
    { FormulationName: 'Imidacloprid Insecticide' }, 
    { FormulationName: 'NPK 20-20-20 Fertilizer' }
  ];
  
  const results = processLegacyRecords(legacyRecords);
  const categories = results.map(r => r.suggestion.suggestedCategory);
  
  // Should correctly categorize different types, not all 'herbicide'
  expect(categories).toContain('fungicide');
  expect(categories).toContain('pesticide');  
  expect(categories).toContain('nutrition');
});
```

## Expected Behavior After Implementation

### Before Migration (Bug Condition)
```javascript
// All legacy records defaulted to herbicide
const legacyRecords = [
  { FormulationName: 'Copper Fungicide' }, // → herbicide ❌ 
  { FormulationName: 'Pest Control' },     // → herbicide ❌
  { FormulationName: 'NPK Fertilizer' }    // → herbicide ❌
];
// Result: Herbicide category polluted with non-herbicide data
```

### After Migration (Fixed Behavior)
```javascript
// Intelligent categorization based on content
const migrationResults = [
  { FormulationName: 'Copper Fungicide', suggestedCategory: 'fungicide' }, // ✅
  { FormulationName: 'Pest Control', suggestedCategory: 'pesticide' },     // ✅  
  { FormulationName: 'NPK Fertilizer', suggestedCategory: 'nutrition' }    // ✅
];
// Result: Each category contains only appropriate data
```

### Category Isolation Maintained
- **Herbicide category:** Only contains actual herbicide trials, formulations, and projects
- **Other categories:** Properly populated with their respective data types
- **Statistics accuracy:** Each category's metrics reflect only relevant data
- **Cross-category prevention:** Validation prevents mixing of incompatible data

## Usage Instructions

### For Administrators

1. **Access Migration Tool:**
   - Navigate to Settings page
   - Scroll to "Legacy Data Migration" section (admin-only)
   - Review migration analysis dashboard

2. **Quick Auto-Migration:**
   - Click "Auto-Migrate" button for high-confidence records
   - Confirms before applying changes
   - Provides feedback on migration results

3. **Manual Migration:**
   - Click "Open Migration Tool" for detailed interface
   - Review all suggestions with confidence levels
   - Apply manual overrides for ambiguous cases
   - Select records to migrate and apply changes

4. **Validation:**
   - Review migration warnings and conflicts
   - Verify cross-category references are handled correctly
   - Test category filtering to ensure isolation is maintained

### For Developers

1. **Migration Service Integration:**
   ```javascript
   import { quickMigrationAnalysis } from '../services/legacyMigrationService.js';
   
   // Check if migration is needed
   const analysis = await quickMigrationAnalysis(getAppState);
   if (analysis.hasLegacyData) {
     // Show migration prompt to admin
   }
   ```

2. **Custom Pattern Addition:**
   ```javascript
   // Add new category patterns in legacyDataMigration.js
   const CATEGORY_PATTERNS = {
     newCategory: {
       keywords: ['new_keyword', 'another_indicator'],
       patterns: [/new.*pattern/i]
     }
   };
   ```

3. **Migration Monitoring:**
   ```javascript
   // Check migration status
   const state = getAppState();
   const migratedRecords = state.trials.filter(t => t._migrationApplied);
   console.log(`${migratedRecords.length} records have been migrated`);
   ```

## Implementation Files

- **`src/utils/legacyDataMigration.js`** - Core migration logic and heuristics
- **`src/components/LegacyDataMigrationModal.jsx`** - User interface component  
- **`src/services/legacyMigrationService.js`** - Service layer for migration operations
- **`src/pages/Settings.jsx`** - Integration point and admin interface
- **`src/__tests__/legacyDataMigration.test.js`** - Comprehensive test suite

## Success Criteria

✅ **Prevents herbicide category pollution** - Legacy records are not automatically assigned to herbicide
✅ **Intelligent categorization** - Uses formulation names and context to predict correct categories  
✅ **User interface for manual review** - Admins can review and override automatic suggestions
✅ **Heuristic-based assignment** - Multiple algorithms for different data patterns
✅ **Validation and safety checks** - Prevents data corruption and cross-category conflicts
✅ **Integration with existing workflow** - Seamlessly works with current data layer and UI
✅ **Comprehensive testing** - All functionality validated with unit tests
✅ **Admin-only access** - Migration features restricted to administrators only

This implementation successfully addresses the legacy data migration requirements from task 3.7, preventing the bug where all uncategorized records defaulted to 'herbicide' and ensuring proper category isolation throughout the application.