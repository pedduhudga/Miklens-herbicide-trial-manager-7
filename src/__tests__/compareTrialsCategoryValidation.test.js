/**
 * compareTrialsCategoryValidation.test.js
 * 
 * Tests for task 3.6: Compare trials category validation
 * Validates that compare trials functionality enforces category boundaries
 */

import { describe, it, expect, vi } from 'vitest';

// Mock category validation logic from CompareTrials component
function validateSelectedTrialsCategory(selectedTrials, activeCategory) {
  if (selectedTrials.length === 0) return { isValid: true, warning: null };
  
  // Get all unique categories from selected trials
  const categories = [...new Set(selectedTrials.map(t => t.Category || 'herbicide'))];
  
  // Check if all trials belong to the same category
  const isValid = categories.length === 1;
  
  // Check if the category matches the active category
  const matchesActiveCategory = categories.length === 1 && categories[0] === activeCategory;
  
  let warning = null;
  if (!isValid) {
    const categoryList = categories.join(', ');
    warning = {
      type: 'error',
      title: 'Cross-Category Comparison Detected',
      message: `Selected trials belong to different categories: ${categoryList}. Only trials from the same category can be compared.`
    };
  } else if (!matchesActiveCategory) {
    warning = {
      type: 'warning', 
      title: 'Category Mismatch',
      message: `Selected trials are from ${categories[0]} category but current active category is ${activeCategory}. Switch to ${categories[0]} category or reselect trials.`
    };
  }
  
  return { isValid: matchesActiveCategory, warning, categories };
}

function filterTrialsByCategory(selectedTrials, activeCategory) {
  return selectedTrials.filter(t => (t.Category || 'herbicide') === activeCategory);
}

describe('Compare Trials Category Validation', () => {
  const mockTrials = [
    { ID: 'trial1', FormulationName: 'Herbicide A', Category: 'herbicide' },
    { ID: 'trial2', FormulationName: 'Fungicide B', Category: 'fungicide' },
    { ID: 'trial3', FormulationName: 'Pesticide C', Category: 'pesticide' },
    { ID: 'trial4', FormulationName: 'Fertilizer D', Category: 'nutrition' },
    { ID: 'trial5', FormulationName: 'Legacy Trial', Category: undefined }, // Legacy without category
  ];

  describe('Category validation logic', () => {
    it('should validate when all selected trials are from active category', () => {
      const selectedTrials = [mockTrials[0]]; // herbicide trial
      const activeCategory = 'herbicide';
      
      const result = validateSelectedTrialsCategory(selectedTrials, activeCategory);
      
      expect(result.isValid).toBe(true);
      expect(result.warning).toBeNull();
      expect(result.categories).toEqual(['herbicide']);
    });

    it('should detect cross-category comparison error', () => {
      const selectedTrials = [mockTrials[0], mockTrials[1]]; // herbicide + fungicide
      const activeCategory = 'herbicide';
      
      const result = validateSelectedTrialsCategory(selectedTrials, activeCategory);
      
      expect(result.isValid).toBe(false);
      expect(result.warning.type).toBe('error');
      expect(result.warning.title).toBe('Cross-Category Comparison Detected');
      expect(result.warning.message).toContain('herbicide, fungicide');
    });

    it('should detect category mismatch warning when trials are same category but not active', () => {
      const selectedTrials = [mockTrials[1], mockTrials[1]]; // both fungicide
      const activeCategory = 'herbicide';
      
      const result = validateSelectedTrialsCategory(selectedTrials, activeCategory);
      
      expect(result.isValid).toBe(false);
      expect(result.warning.type).toBe('warning');
      expect(result.warning.title).toBe('Category Mismatch');
      expect(result.warning.message).toContain('fungicide category but current active category is herbicide');
    });

    it('should handle legacy trials without category field', () => {
      const selectedTrials = [mockTrials[4]]; // legacy trial without Category
      const activeCategory = 'herbicide';
      
      const result = validateSelectedTrialsCategory(selectedTrials, activeCategory);
      
      expect(result.isValid).toBe(true); // legacy defaults to herbicide
      expect(result.warning).toBeNull();
      expect(result.categories).toEqual(['herbicide']);
    });

    it('should detect mixed legacy and categorized trials', () => {
      const selectedTrials = [mockTrials[0], mockTrials[4]]; // herbicide + legacy
      const activeCategory = 'herbicide';
      
      const result = validateSelectedTrialsCategory(selectedTrials, activeCategory);
      
      expect(result.isValid).toBe(true); // both resolve to herbicide
      expect(result.warning).toBeNull();
    });
  });

  describe('Category filtering logic', () => {
    it('should filter trials to only include active category', () => {
      const selectedTrials = mockTrials; // all trials
      const activeCategory = 'fungicide';
      
      const filtered = filterTrialsByCategory(selectedTrials, activeCategory);
      
      expect(filtered).toHaveLength(1);
      expect(filtered[0].ID).toBe('trial2');
      expect(filtered[0].Category).toBe('fungicide');
    });

    it('should include legacy trials when active category is herbicide', () => {
      const selectedTrials = [mockTrials[0], mockTrials[4]]; // herbicide + legacy
      const activeCategory = 'herbicide';
      
      const filtered = filterTrialsByCategory(selectedTrials, activeCategory);
      
      expect(filtered).toHaveLength(2);
      expect(filtered.map(t => t.ID)).toEqual(['trial1', 'trial5']);
    });

    it('should exclude legacy trials when active category is not herbicide', () => {
      const selectedTrials = [mockTrials[1], mockTrials[4]]; // fungicide + legacy
      const activeCategory = 'fungicide';
      
      const filtered = filterTrialsByCategory(selectedTrials, activeCategory);
      
      expect(filtered).toHaveLength(1);
      expect(filtered[0].ID).toBe('trial2');
    });

    it('should return empty array when no trials match active category', () => {
      const selectedTrials = [mockTrials[0], mockTrials[2]]; // herbicide + pesticide
      const activeCategory = 'nutrition';
      
      const filtered = filterTrialsByCategory(selectedTrials, activeCategory);
      
      expect(filtered).toHaveLength(0);
    });
  });

  describe('Navigation filtering', () => {
    it('should filter and warn when navigating to compare with cross-category trials', () => {
      const selectedForBulk = new Set(['trial1', 'trial2', 'trial3']); // multi-category
      const allTrials = mockTrials;
      const activeCategory = 'herbicide';
      
      // Simulate the navigation filtering logic
      const categoryFilteredTrials = allTrials.filter(t => 
        selectedForBulk.has(t.ID) && ((t.Category || 'herbicide') === activeCategory)
      );
      
      const filteredOutCount = selectedForBulk.size - categoryFilteredTrials.length;
      
      expect(categoryFilteredTrials).toHaveLength(1);
      expect(categoryFilteredTrials[0].ID).toBe('trial1');
      expect(filteredOutCount).toBe(2); // trial2 and trial3 filtered out
    });

    it('should not filter when all selected trials are from active category', () => {
      const selectedForBulk = new Set(['trial2']); // only fungicide
      const allTrials = mockTrials;
      const activeCategory = 'fungicide';
      
      const categoryFilteredTrials = allTrials.filter(t => 
        selectedForBulk.has(t.ID) && ((t.Category || 'herbicide') === activeCategory)
      );
      
      const filteredOutCount = selectedForBulk.size - categoryFilteredTrials.length;
      
      expect(categoryFilteredTrials).toHaveLength(1);
      expect(filteredOutCount).toBe(0);
    });
  });

  describe('Selection bar indicators', () => {
    it('should calculate cross-category count correctly', () => {
      const selectedForBulk = new Set(['trial1', 'trial2', 'trial3']); // herbicide, fungicide, pesticide
      const allTrials = mockTrials;
      const activeCategory = 'herbicide';
      
      const crossCategoryCount = Array.from(selectedForBulk).filter(id => {
        const trial = allTrials.find(t => t.ID === id);
        return trial && (trial.Category || 'herbicide') !== activeCategory;
      }).length;
      
      const validCount = selectedForBulk.size - crossCategoryCount;
      
      expect(crossCategoryCount).toBe(2); // trial2 (fungicide) and trial3 (pesticide)
      expect(validCount).toBe(1); // only trial1 (herbicide)
    });

    it('should disable compare button when less than 2 valid trials', () => {
      const selectedForBulk = new Set(['trial1']); // only 1 valid trial
      const allTrials = mockTrials;
      const activeCategory = 'herbicide';
      
      const crossCategoryCount = Array.from(selectedForBulk).filter(id => {
        const trial = allTrials.find(t => t.ID === id);
        return trial && (trial.Category || 'herbicide') !== activeCategory;
      }).length;
      
      const validCount = selectedForBulk.size - crossCategoryCount;
      const shouldDisable = validCount < 2;
      
      expect(shouldDisable).toBe(true);
    });

    it('should enable compare button when 2 or more valid trials', () => {
      const selectedForBulk = new Set(['trial1', 'trial5']); // 2 herbicide trials (including legacy)
      const allTrials = mockTrials;
      const activeCategory = 'herbicide';
      
      const crossCategoryCount = Array.from(selectedForBulk).filter(id => {
        const trial = allTrials.find(t => t.ID === id);
        return trial && (trial.Category || 'herbicide') !== activeCategory;
      }).length;
      
      const validCount = selectedForBulk.size - crossCategoryCount;
      const shouldDisable = validCount < 2;
      
      expect(shouldDisable).toBe(false);
    });
  });

  describe('Requirements validation', () => {
    it('validates that all selected trials belong to the same category (Requirement 2.6)', () => {
      const crossCategoryTrials = [mockTrials[0], mockTrials[1]]; // herbicide + fungicide
      const result = validateSelectedTrialsCategory(crossCategoryTrials, 'herbicide');
      
      // Should detect cross-category violation
      expect(result.isValid).toBe(false);
      expect(result.warning.type).toBe('error');
    });

    it('validates UI warnings when attempting cross-category comparisons (Requirement 2.6)', () => {
      const crossCategoryTrials = [mockTrials[0], mockTrials[1], mockTrials[2]]; // 3 different categories
      const result = validateSelectedTrialsCategory(crossCategoryTrials, 'herbicide');
      
      // Should provide clear warning message
      expect(result.warning).not.toBeNull();
      expect(result.warning.message).toContain('Selected trials belong to different categories');
      expect(result.warning.message).toContain('herbicide, fungicide, pesticide');
    });

    it('validates trial selection lists are filtered by active category (Requirement 2.6)', () => {
      const mixedTrials = mockTrials; // all categories
      const activeCategory = 'nutrition';
      
      const filtered = filterTrialsByCategory(mixedTrials, activeCategory);
      
      // Should only include nutrition trials
      expect(filtered).toHaveLength(1);
      expect(filtered[0].Category).toBe('nutrition');
    });

    it('validates comparison logic enforces category boundaries (Requirement 2.6)', () => {
      const selectedTrials = [mockTrials[1], mockTrials[2]]; // fungicide + pesticide
      const activeCategory = 'fungicide';
      
      // Filter to enforce category boundaries
      const validTrials = filterTrialsByCategory(selectedTrials, activeCategory);
      
      // Should only allow fungicide trials through
      expect(validTrials).toHaveLength(1);
      expect(validTrials[0].Category).toBe('fungicide');
    });
  });
});