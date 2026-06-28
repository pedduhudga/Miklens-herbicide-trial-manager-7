# Category Isolation Fix Bugfix Design

## Overview

This design addresses critical category isolation issues in the herbicide trial manager application where data from different trial categories (herbicide, fungicide, pesticide, nutrition, biostimulant) is incorrectly mixed across various application components. The fix implements comprehensive category boundary enforcement across the entire data pipeline, from UI filtering and service operations to AI analysis and data export, ensuring each category operates as a completely isolated data domain.

The approach involves adding systematic category filtering at multiple layers: UI dropdowns and selection components, data service operations, AI service calls, statistics and analytics calculations, export functions, and cross-category validation rules. Additionally, a migration strategy addresses legacy data records that lack proper category assignment.

## Glossary

- **Bug_Condition (C)**: The condition that triggers category isolation violations - when application components access, display, or process data from categories other than the currently active category
- **Property (P)**: The desired behavior when category-aware operations occur - only data belonging to the active category should be accessed, processed, or displayed
- **Preservation**: Existing category switching functionality and category-specific configurations that must remain unchanged by the fix
- **ActiveCategory**: The currently selected category in the application state (`state.activeCategory`)
- **CategoryBoundary**: The logical separation that prevents cross-category data contamination
- **DataDomain**: All data entities (trials, projects, formulations, ingredients) belonging to a specific category
- **CategoryFilter**: A function or mechanism that restricts data operations to a specific category
- **LegacyData**: Historical records that lack the `Category` field and default incorrectly to 'herbicide'

## Bug Details

### Bug Condition

The bug manifests when application components access, display, or process data from multiple categories simultaneously instead of restricting operations to the currently active category. This occurs across eight critical areas: reports dropdowns showing cross-category data, AI services analyzing trials from all categories, statistics pages displaying mixed-category metrics, data service functions bypassing category filters, export functions including incorrect category data, trial comparison features allowing cross-category comparisons, legacy data defaulting all records to 'herbicide' category, and missing validation preventing cross-category references.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type { operation: string, categories: string[], activeCategory: string }
  OUTPUT: boolean
  
  RETURN (input.operation IN ['dropdown_filter', 'ai_analysis', 'statistics_calc', 'data_service', 'export_function', 'trial_compare', 'legacy_migration', 'data_validation'])
         AND (input.categories.length > 1 OR !input.categories.includes(input.activeCategory))
         AND input.activeCategory IN ['herbicide', 'fungicide', 'pesticide', 'nutrition', 'biostimulant']
END FUNCTION
```

### Examples

- **Reports Dropdown Issue**: When activeCategory is 'fungicide', project dropdown displays projects from 'herbicide' and 'pesticide' categories alongside fungicide projects
- **AI Analysis Issue**: User requests AI analysis for fungicide trials, but system processes and includes herbicide trial data in the analysis results
- **Statistics Cross-Contamination**: Statistics page for 'nutrition' category displays aggregated metrics that include data from biostimulant and herbicide trials
- **Export Function Issue**: User exports 'pesticide' category data but receives CSV file containing trials from all five categories
- **Legacy Data Issue**: Historical records without Category field are all assigned 'herbicide' category, polluting herbicide statistics with nutrition and biostimulant data

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Category switching functionality must continue to reload and display appropriate category-specific data as currently implemented
- Role-based access control for category permissions must remain enforced (read/write operations based on user.categoryAccess)
- Category-specific configurations (forms, metrics, AI prompts, theming, UI elements) must continue to function correctly
- Firebase and Google Sheets backend integrations must continue to store data in category-specific collections
- Category-specific colors, icons, labels, and visual theming must remain intact

**Scope:**
All inputs and operations that do NOT involve cross-category data access should be completely unaffected by this fix. This includes:
- Single-category data operations within the active category
- User authentication and authorization flows
- Category-specific form validation and field configurations
- Backend storage operations to correct category collections
- Category switching and UI state management

## Hypothesized Root Cause

Based on the bug description and code analysis, the most likely issues are:

1. **Incomplete Data Filtering**: Many data service functions (getAllData, getTrials, getProjects, etc.) retrieve all records and rely on client-side filtering, but some UI components bypass these filters
   - Reports dropdowns may use unfiltered state.projects or state.trials arrays
   - Some components check `(!record.Category && activeCategory === 'herbicide')` creating false matches

2. **AI Service Category Blindness**: AI analysis functions receive trial data without category filtering context
   - AI prompts and analysis may process cross-category trial collections
   - Category-specific AI prompts are not consistently applied

3. **Statistics Aggregation Issues**: Statistics and analytics calculations operate on global data collections rather than category-filtered subsets
   - Functions like `computeTreatmentMeans` and statistical analyses may access all trials regardless of category

4. **Export Function Global Scope**: Export utilities access global state arrays (state.trials, state.projects) without category restrictions
   - Export functions may lack category filtering in data selection logic

## Correctness Properties

Property 1: Bug Condition - Category Boundary Enforcement

_For any_ operation where category-specific data access is required (isBugCondition returns true), the fixed application SHALL restrict all data access, processing, and display to only entities belonging to the currently active category, preventing cross-category data contamination.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.8**

Property 2: Preservation - Non-Category Operations

_For any_ operation that does NOT involve cross-category data access (isBugCondition returns false), the fixed application SHALL produce exactly the same behavior as the original application, preserving all existing functionality for single-category operations, authentication, authorization, and category-specific configurations.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: Multiple files across the application

**Service Layer**: `src/services/dataLayer.js`

**Specific Changes**:
1. **Data Service Category Enforcement**: Enhance data service functions to enforce category filtering at the service layer
   - Add category validation to all CRUD operations
   - Ensure category-specific collection access in Firebase functions
   - Add category parameter validation in service function signatures

2. **Reports Component Category Filtering**: Fix dropdown filtering in Reports page
   - Update project and trial dropdown population to use category-filtered data
   - Add category validation to selected project/trial IDs
   - Ensure all report generation functions receive category-filtered inputs

3. **AI Service Category Isolation**: Implement category-aware AI analysis
   - Add category context to all AI analysis function calls
   - Ensure AI prompts are category-specific based on active category
   - Filter trial collections before passing to AI services

4. **Statistics Category Boundary**: Enforce category isolation in statistics and analytics
   - Update statistical calculation functions to accept category-filtered data only
   - Add category validation to aggregation and computation functions
   - Ensure dashboard widgets display category-specific metrics only

5. **Export Function Category Restrictions**: Implement category filtering in all export utilities
   - Add category parameter to export function signatures
   - Filter data collections before export processing
   - Add category validation to prevent cross-category exports

6. **Compare Trials Category Validation**: Add category restrictions to trial comparison
   - Validate that all selected trials belong to the same category
   - Add UI warnings when attempting cross-category comparisons
   - Filter trial selection lists by active category

7. **Legacy Data Migration Strategy**: Implement proper legacy data categorization
   - Create migration utility to assign categories based on formulation types and context
   - Add user interface for manual legacy data categorization
   - Implement heuristic-based automatic category assignment for uncategorized records

8. **Cross-Category Validation Rules**: Add comprehensive data validation
   - Implement validation functions to prevent cross-category references
   - Add database constraints to enforce category boundaries
   - Create validation middleware for all data operations

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write tests that simulate category switching scenarios and assert that data access, display, and processing remain strictly within category boundaries. Run these tests on the UNFIXED code to observe failures and understand the root cause.

**Test Cases**:
1. **Reports Dropdown Cross-Contamination**: Switch to 'fungicide' category and verify project dropdown shows only fungicide projects (will fail on unfixed code)
2. **AI Analysis Category Leak**: Request AI analysis for 'pesticide' trials and verify no herbicide trial data is processed (will fail on unfixed code)
3. **Statistics Category Mixing**: Access statistics for 'nutrition' category and verify metrics exclude other categories (will fail on unfixed code)
4. **Export Category Contamination**: Export 'biostimulant' data and verify output contains only biostimulant records (will fail on unfixed code)
5. **Legacy Data Pollution**: Verify legacy records without Category field don't all default to 'herbicide' (may fail on unfixed code)

**Expected Counterexamples**:
- Project dropdowns display trials from multiple categories instead of active category only
- AI analysis processes data from incorrect categories alongside correct ones
- Statistical calculations include cross-category data in aggregations
- Export functions include records from categories other than the selected one
- Legacy data migration assigns all uncategorized records to 'herbicide' causing data pollution

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := executeOperation_fixed(input)
  ASSERT categoryBoundaryEnforced(result, input.activeCategory)
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT executeOperation_original(input) = executeOperation_fixed(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that behavior is unchanged for all single-category operations

**Test Plan**: Observe behavior on UNFIXED code first for single-category operations, category switching, and authentication flows, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Single-Category Operation Preservation**: Verify normal trial CRUD operations within a category continue working exactly as before
2. **Category Switching Preservation**: Verify category switching triggers appropriate data reloads and UI updates as before
3. **Authentication Preservation**: Verify user authentication and role-based category access controls continue working
4. **Configuration Preservation**: Verify category-specific forms, metrics, and theming continue functioning correctly

### Unit Tests

- Test category filtering functions in isolation for each data type (trials, projects, formulations, ingredients)
- Test category validation functions with valid and invalid inputs
- Test legacy data migration logic with various data scenarios
- Test AI service category context passing and prompt selection

### Property-Based Tests

- Generate random category switching sequences and verify data isolation is maintained
- Generate random data operations and verify category boundaries are respected
- Generate random export scenarios and verify output contains only correct category data
- Test cross-category validation rules with various invalid reference attempts

### Integration Tests

- Test complete workflow from category selection through data display to export
- Test category switching across all major application pages (Reports, Statistics, AI Assistant, Compare Trials)
- Test role-based category access controls across different user types and permissions
- Test Firebase and Google Sheets integrations maintain category-specific collections