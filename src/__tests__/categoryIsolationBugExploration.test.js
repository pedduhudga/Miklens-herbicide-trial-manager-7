/**
 * categoryIsolationBugExploration.test.js
 * 
 * Bug condition exploration test for category isolation violations.
 * 
 * **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists.
 * **DO NOT attempt to fix the test or the code when it fails**
 * 
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.8**
 * 
 * Property 1: Bug Condition - Category Isolation Violation Detection
 * **GOAL**: Surface counterexamples that demonstrate category isolation violations exist
 * **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';

// Mock the data layer and AI services to simulate the bug
const mockState = {
  activeCategory: 'fungicide',
  trials: [
    { ID: 'trial1', ProjectID: 'proj1', Category: 'herbicide', FormulationName: 'Herbicide A' },
    { ID: 'trial2', ProjectID: 'proj2', Category: 'fungicide', FormulationName: 'Fungicide B' },
    { ID: 'trial3', ProjectID: 'proj3', Category: 'pesticide', FormulationName: 'Pesticide C' },
    { ID: 'trial4', ProjectID: 'proj4', Category: 'nutrition', FormulationName: 'Fertilizer D' },
  ],
  projects: [
    { ID: 'proj1', Name: 'Herbicide Project', Category: 'herbicide' },
    { ID: 'proj2', Name: 'Fungicide Project', Category: 'fungicide' },
    { ID: 'proj3', Name: 'Pesticide Project', Category: 'pesticide' },
    { ID: 'proj4', Name: 'Nutrition Project', Category: 'nutrition' },
  ],
  formulations: [
    { ID: 'form1', Name: 'Herbicide Formula', Category: 'herbicide' },
    { ID: 'form2', Name: 'Fungicide Formula', Category: 'fungicide' },
    { ID: 'form3', Name: 'Pesticide Formula', Category: 'pesticide' },
  ]
};

const mockGetAppState = () => mockState;

// Bug Condition function as specified in the design
function isBugCondition(input) {
  return (input.operation && ['dropdown_filter', 'ai_analysis', 'statistics_calc', 'data_service', 'export_function', 'trial_compare', 'legacy_migration', 'data_validation'].includes(input.operation))
    && (input.categories.length > 1 || !input.categories.includes(input.activeCategory))
    && ['herbicide', 'fungicide', 'pesticide', 'nutrition', 'biostimulant'].includes(input.activeCategory);
}

// Simulate buggy operations that violate category boundaries
function simulateDropdownFilter(activeCategory, allData) {
  // BUG: Returns data from all categories instead of filtering by activeCategory
  return allData; // Should filter by activeCategory but doesn't
}

function simulateAIAnalysis(activeCategory, trials) {
  // BUG: Processes trials from all categories instead of just activeCategory
  return {
    analyzedTrials: trials, // Should filter by activeCategory but includes all
    categories: [...new Set(trials.map(t => t.Category || 'herbicide'))]
  };
}

function simulateStatisticsCalculation(activeCategory, trials) {
  // BUG: Calculates stats across all categories instead of activeCategory only
  const allCategories = [...new Set(trials.map(t => t.Category || 'herbicide'))];
  return {
    totalTrials: trials.length, // Should count only activeCategory trials
    categoriesIncluded: allCategories
  };
}

function simulateDataService(activeCategory, data) {
  // BUG: Returns unfiltered data collection
  return {
    data: data, // Should filter by activeCategory but returns all
    categories: [...new Set(data.map(d => d.Category || 'herbicide'))]
  };
}

function simulateExportFunction(activeCategory, trials) {
  // BUG: Exports data from wrong categories
  return {
    exportedTrials: trials, // Should filter by activeCategory but exports all
    categories: [...new Set(trials.map(t => t.Category || 'herbicide'))]
  };
}

function simulateTrialCompare(activeCategory, selectedTrialIds, allTrials) {
  // BUG: Allows comparison of trials from different categories
  const selectedTrials = allTrials.filter(t => selectedTrialIds.includes(t.ID));
  return {
    comparedTrials: selectedTrials,
    categories: [...new Set(selectedTrials.map(t => t.Category || 'herbicide'))]
  };
}

describe('Property 1: Bug Condition - Category Isolation Violation Detection', () => {
  let consoleWarn;
  
  beforeEach(() => {
    // Suppress console warnings during test
    consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  
  afterEach(() => {
    consoleWarn.mockRestore();
  });

  it('MUST FAIL: dropdown_filter operation violates category boundaries', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('herbicide', 'fungicide', 'pesticide', 'nutrition', 'biostimulant'),
        (activeCategory) => {
          const input = {
            operation: 'dropdown_filter',
            activeCategory: activeCategory,
            categories: []
          };

          // Simulate the buggy dropdown filtering
          const result = simulateDropdownFilter(activeCategory, mockState.projects);
          const resultCategories = [...new Set(result.map(p => p.Category || 'herbicide'))];
          
          input.categories = resultCategories;

          // This assertion SHOULD FAIL proving the bug exists
          // The bug: dropdowns show cross-category data instead of activeCategory only
          if (isBugCondition(input)) {
            // For bug condition cases, we expect ONLY the activeCategory in results
            // This will FAIL because the buggy function returns all categories
            expect(resultCategories).toEqual([activeCategory]);
          }
        }
      ),
      { numRuns: 10 }
    );
  });

  it('MUST FAIL: ai_analysis operation processes wrong category data', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('herbicide', 'fungicide', 'pesticide', 'nutrition', 'biostimulant'),
        (activeCategory) => {
          const input = {
            operation: 'ai_analysis',
            activeCategory: activeCategory,
            categories: []
          };

          // Simulate the buggy AI analysis
          const result = simulateAIAnalysis(activeCategory, mockState.trials);
          input.categories = result.categories;

          // This assertion SHOULD FAIL proving the bug exists
          // The bug: AI processes trials from multiple categories instead of activeCategory only
          if (isBugCondition(input)) {
            expect(result.categories).toEqual([activeCategory]);
          }
        }
      ),
      { numRuns: 10 }
    );
  });

  it('MUST FAIL: statistics_calc operation includes cross-category data', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('herbicide', 'fungicide', 'pesticide', 'nutrition', 'biostimulant'),
        (activeCategory) => {
          const input = {
            operation: 'statistics_calc',
            activeCategory: activeCategory,
            categories: []
          };

          // Simulate the buggy statistics calculation
          const result = simulateStatisticsCalculation(activeCategory, mockState.trials);
          input.categories = result.categoriesIncluded;

          // This assertion SHOULD FAIL proving the bug exists
          // The bug: statistics include data from wrong categories
          if (isBugCondition(input)) {
            expect(result.categoriesIncluded).toEqual([activeCategory]);
          }
        }
      ),
      { numRuns: 10 }
    );
  });

  it('MUST FAIL: data_service operation bypasses category filtering', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('herbicide', 'fungicide', 'pesticide', 'nutrition', 'biostimulant'),
        (activeCategory) => {
          const input = {
            operation: 'data_service',
            activeCategory: activeCategory,
            categories: []
          };

          // Simulate the buggy data service
          const result = simulateDataService(activeCategory, mockState.formulations);
          input.categories = result.categories;

          // This assertion SHOULD FAIL proving the bug exists
          // The bug: data service returns unfiltered collections
          if (isBugCondition(input)) {
            expect(result.categories).toEqual([activeCategory]);
          }
        }
      ),
      { numRuns: 10 }
    );
  });

  it('MUST FAIL: export_function operation includes wrong category data', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('herbicide', 'fungicide', 'pesticide', 'nutrition', 'biostimulant'),
        (activeCategory) => {
          const input = {
            operation: 'export_function',
            activeCategory: activeCategory,
            categories: []
          };

          // Simulate the buggy export function
          const result = simulateExportFunction(activeCategory, mockState.trials);
          input.categories = result.categories;

          // This assertion SHOULD FAIL proving the bug exists
          // The bug: exports include data from incorrect categories
          if (isBugCondition(input)) {
            expect(result.categories).toEqual([activeCategory]);
          }
        }
      ),
      { numRuns: 10 }
    );
  });

  it('MUST FAIL: trial_compare operation allows cross-category comparisons', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('herbicide', 'fungicide', 'pesticide', 'nutrition', 'biostimulant'),
        fc.shuffledSubarray(['trial1', 'trial2', 'trial3', 'trial4'], { minLength: 2, maxLength: 4 }),
        (activeCategory, selectedTrialIds) => {
          const input = {
            operation: 'trial_compare',
            activeCategory: activeCategory,
            categories: []
          };

          // Simulate the buggy trial comparison
          const result = simulateTrialCompare(activeCategory, selectedTrialIds, mockState.trials);
          input.categories = result.categories;

          // This assertion SHOULD FAIL proving the bug exists
          // The bug: allows comparison of trials from different categories
          if (isBugCondition(input) && result.categories.length > 1) {
            expect(result.categories).toEqual([activeCategory]);
          }
        }
      ),
      { numRuns: 20 }
    );
  });

  it('MUST FAIL: legacy data migration assigns all records to herbicide', () => {
    const input = {
      operation: 'legacy_migration',
      activeCategory: 'fungicide',
      categories: []
    };

    // Simulate legacy data without Category field - bug assigns all to 'herbicide'
    const legacyRecords = [
      { ID: 'legacy1', Name: 'Old Trial 1' }, // No Category field
      { ID: 'legacy2', Name: 'Old Trial 2' }, // No Category field
      { ID: 'legacy3', Name: 'Old Trial 3' }, // No Category field
    ];

    // BUG: All legacy records default to 'herbicide' instead of proper categorization
    const migratedRecords = legacyRecords.map(record => ({
      ...record,
      Category: 'herbicide' // Bug: defaults all to herbicide
    }));

    const resultCategories = [...new Set(migratedRecords.map(r => r.Category))];
    input.categories = resultCategories;

    // This assertion SHOULD FAIL proving the bug exists
    // The bug: legacy data migration pollutes herbicide category with non-herbicide data
    if (isBugCondition(input)) {
      // If we're in fungicide category, legacy records should not all become herbicide
      expect(resultCategories).not.toContain('herbicide');
    }
  });

  it('documents expected counterexamples from bug exploration', () => {
    const counterexamples = [];

    // Test each operation with fungicide as active category
    const activeCategory = 'fungicide';
    
    // Dropdown filter counterexample
    const dropdownResult = simulateDropdownFilter(activeCategory, mockState.projects);
    const dropdownCategories = [...new Set(dropdownResult.map(p => p.Category || 'herbicide'))];
    if (dropdownCategories.length > 1 || !dropdownCategories.includes(activeCategory)) {
      counterexamples.push({
        operation: 'dropdown_filter',
        expected: [activeCategory],
        actual: dropdownCategories,
        description: 'Project dropdown shows cross-category projects instead of fungicide only'
      });
    }

    // AI analysis counterexample
    const aiResult = simulateAIAnalysis(activeCategory, mockState.trials);
    if (aiResult.categories.length > 1 || !aiResult.categories.includes(activeCategory)) {
      counterexamples.push({
        operation: 'ai_analysis',
        expected: [activeCategory],
        actual: aiResult.categories,
        description: 'AI analysis processes trials from multiple categories instead of fungicide only'
      });
    }

    // Statistics counterexample
    const statsResult = simulateStatisticsCalculation(activeCategory, mockState.trials);
    if (statsResult.categoriesIncluded.length > 1 || !statsResult.categoriesIncluded.includes(activeCategory)) {
      counterexamples.push({
        operation: 'statistics_calc',
        expected: [activeCategory],
        actual: statsResult.categoriesIncluded,
        description: 'Statistics display mixed-category metrics instead of fungicide only'
      });
    }

    // Export function counterexample  
    const exportResult = simulateExportFunction(activeCategory, mockState.trials);
    if (exportResult.categories.length > 1 || !exportResult.categories.includes(activeCategory)) {
      counterexamples.push({
        operation: 'export_function',
        expected: [activeCategory],
        actual: exportResult.categories,
        description: 'Export functions include wrong category data instead of fungicide only'
      });
    }

    // Log counterexamples for documentation
    console.log('=== CATEGORY ISOLATION BUG COUNTEREXAMPLES ===');
    counterexamples.forEach((example, index) => {
      console.log(`${index + 1}. ${example.description}`);
      console.log(`   Operation: ${example.operation}`);
      console.log(`   Expected categories: [${example.expected.join(', ')}]`);
      console.log(`   Actual categories: [${example.actual.join(', ')}]`);
      console.log('');
    });

    // This test documents the counterexamples but doesn't fail
    // The actual bug assertions are in the individual test cases above
    expect(counterexamples.length).toBeGreaterThan(0);
  });

  it('validates isBugCondition function correctly identifies violations', () => {
    // Test cases where bug condition should return true
    expect(isBugCondition({
      operation: 'dropdown_filter',
      categories: ['herbicide', 'fungicide'],
      activeCategory: 'fungicide'
    })).toBe(true);

    expect(isBugCondition({
      operation: 'ai_analysis', 
      categories: ['pesticide'],
      activeCategory: 'herbicide'
    })).toBe(true);

    // Test cases where bug condition should return false (valid single-category operation)
    expect(isBugCondition({
      operation: 'dropdown_filter',
      categories: ['fungicide'],
      activeCategory: 'fungicide'
    })).toBe(false);

    expect(isBugCondition({
      operation: 'other_operation',
      categories: ['herbicide', 'fungicide'],
      activeCategory: 'herbicide'
    })).toBe(false);
  });
});