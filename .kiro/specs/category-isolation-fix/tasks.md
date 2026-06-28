# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Category Isolation Violation Detection
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate category isolation violations exist
  - **Scoped PBT Approach**: Test concrete failing cases where operations access data from categories other than the active category
  - Test that when activeCategory is set (e.g., 'fungicide'), operations like dropdown_filter, ai_analysis, statistics_calc, data_service, export_function, trial_compare return only data from that active category
  - Property: For all operations where isBugCondition(input) returns true, the system should restrict data access to activeCategory only
  - Test implementation based on Bug Condition specification: `isBugCondition(input)` where input contains operations accessing multiple categories or wrong categories
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists)
  - Document counterexamples found:
    - Reports dropdowns showing cross-category projects/trials
    - AI analysis processing data from multiple categories
    - Statistics displaying mixed-category metrics
    - Export functions including wrong category data
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.8_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Single-Category Operation Preservation
  - **IMPORTANT**: Follow observation-first methodology
  - Observe behavior on UNFIXED code for operations that do NOT involve cross-category data access
  - Test cases where isBugCondition returns false:
    - Single-category CRUD operations within active category
    - Category switching and UI state management
    - User authentication and authorization flows
    - Category-specific form validation and configurations
  - Write property-based tests capturing observed behavior patterns:
    - For single-category operations, behavior should remain exactly the same
    - Category switching should continue to reload appropriate data
    - Role-based access control should remain enforced
    - Category-specific configurations should continue functioning
  - Property-based testing generates many test cases for stronger preservation guarantees
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [ ] 3. Fix for category isolation violations

  - [x] 3.1 Implement data service category enforcement
    - Enhance data service functions in `src/services/dataLayer.js` to enforce category filtering at service layer
    - Add category validation to all CRUD operations (getTrials, getProjects, getAllData, etc.)
    - Ensure category-specific collection access in Firebase functions
    - Add category parameter validation in service function signatures
    - _Bug_Condition: isBugCondition(input) where input.operation = 'data_service' and categories include wrong categories_
    - _Expected_Behavior: Data services return only activeCategory data from design expectedBehavior specification_
    - _Preservation: Single-category operations and backend integrations from Preservation Requirements_
    - _Requirements: 2.4, 3.4_

  - [-] 3.2 Fix reports component category filtering
    - Update project and trial dropdown population in Reports page to use category-filtered data
    - Add category validation to selected project/trial IDs
    - Ensure all report generation functions receive category-filtered inputs
    - Fix any dropdown components that bypass category filters
    - _Bug_Condition: isBugCondition(input) where input.operation = 'dropdown_filter' and wrong categories displayed_
    - _Expected_Behavior: Reports dropdowns show only activeCategory entities from design_
    - _Preservation: Category switching and report functionality from design Preservation Requirements_
    - _Requirements: 2.1, 3.1_

  - [-] 3.3 Implement AI service category isolation
    - Add category context to all AI analysis function calls
    - Ensure AI prompts are category-specific based on active category
    - Filter trial collections before passing to AI services
    - Update AI service interfaces to accept and validate category parameters
    - _Bug_Condition: isBugCondition(input) where input.operation = 'ai_analysis' and processes multiple categories_
    - _Expected_Behavior: AI services process only activeCategory data with appropriate prompts from design_
    - _Preservation: Category-specific AI configurations from Preservation Requirements_
    - _Requirements: 2.2, 3.3_

  - [ ] 3.4 Enforce statistics category boundaries
    - Update statistical calculation functions to accept category-filtered data only
    - Add category validation to aggregation and computation functions (computeTreatmentMeans, etc.)
    - Ensure dashboard widgets display category-specific metrics only
    - Filter data collections before statistical processing
    - _Bug_Condition: isBugCondition(input) where input.operation = 'statistics_calc' and includes cross-category data_
    - _Expected_Behavior: Statistics calculations use only activeCategory data from design_
    - _Preservation: Statistical calculation accuracy and dashboard functionality from Preservation Requirements_
    - _Requirements: 2.3_

  - [ ] 3.5 Implement export function category restrictions
    - Add category parameter to export function signatures
    - Filter data collections before export processing
    - Add category validation to prevent cross-category exports
    - Update CSV, PDF, and other export utilities
    - _Bug_Condition: isBugCondition(input) where input.operation = 'export_function' and includes wrong category data_
    - _Expected_Behavior: Export functions include only activeCategory data from design_
    - _Preservation: Export functionality and data formats from Preservation Requirements_
    - _Requirements: 2.5_

  - [ ] 3.6 Add compare trials category validation
    - Validate that all selected trials belong to the same category
    - Add UI warnings when attempting cross-category comparisons
    - Filter trial selection lists by active category
    - Update comparison logic to enforce category boundaries
    - _Bug_Condition: isBugCondition(input) where input.operation = 'trial_compare' allows cross-category comparisons_
    - _Expected_Behavior: Trial comparisons restricted to same category from design_
    - _Preservation: Comparison functionality and UI from Preservation Requirements_
    - _Requirements: 2.6_

  - [ ] 3.7 Implement legacy data migration strategy
    - Create migration utility to assign categories based on formulation types and context
    - Add user interface for manual legacy data categorization
    - Implement heuristic-based automatic category assignment for uncategorized records
    - Prevent defaulting all legacy records to 'herbicide'
    - _Bug_Condition: isBugCondition(input) where input.operation = 'legacy_migration' and defaults all to 'herbicide'_
    - _Expected_Behavior: Legacy data properly categorized based on context from design_
    - _Preservation: Data integrity and user workflows from Preservation Requirements_
    - _Requirements: 2.7_

  - [ ] 3.8 Add cross-category validation rules
    - Implement validation functions to prevent cross-category references
    - Add database constraints to enforce category boundaries
    - Create validation middleware for all data operations
    - Add UI validation messages for cross-category violations
    - _Bug_Condition: isBugCondition(input) where input.operation = 'data_validation' allows cross-category references_
    - _Expected_Behavior: Validation prevents cross-category relationships from design_
    - _Preservation: Data validation accuracy and user feedback from Preservation Requirements_
    - _Requirements: 2.8_

  - [ ] 3.9 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Category Isolation Enforcement
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior
    - When this test passes, it confirms the expected behavior is satisfied
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - Verify that operations now properly restrict data to activeCategory only
    - Confirm counterexamples from step 1 are now resolved
    - _Requirements: Property 1 Expected Behavior from design (Requirements 2.1-2.8)_

  - [ ] 3.10 Verify preservation tests still pass
    - **Property 2: Preservation** - Single-Category Operation Preservation
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all single-category operations still work exactly as before
    - Verify category switching, authentication, and configurations remain unchanged
    - Confirm all tests still pass after fix (no regressions)

- [ ] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
  - Verify complete category isolation across all application components
  - Confirm no regressions in existing functionality
  - Test category switching workflows end-to-end
  - Validate data integrity across all categories