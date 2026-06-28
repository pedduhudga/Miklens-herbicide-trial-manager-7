// src/utils/categoryValidation.js
// Cross-category validation rules to prevent category isolation violations

import { getCategoryConfig } from './categoryConfig.js';

/**
 * Valid categories in the application
 */
export const VALID_CATEGORIES = ['herbicide', 'fungicide', 'pesticide', 'nutrition', 'biostimulant'];

/**
 * Validation error types for categorized error handling
 */
export const VALIDATION_ERROR_TYPES = {
  CATEGORY_MISMATCH: 'CATEGORY_MISMATCH',
  CROSS_CATEGORY_REFERENCE: 'CROSS_CATEGORY_REFERENCE', 
  INVALID_CATEGORY: 'INVALID_CATEGORY',
  MISSING_CATEGORY: 'MISSING_CATEGORY',
  CATEGORY_ISOLATION_VIOLATION: 'CATEGORY_ISOLATION_VIOLATION'
};

/**
 * Custom error class for category validation violations
 */
export class CategoryValidationError extends Error {
  constructor(message, type, details = {}) {
    super(message);
    this.name = 'CategoryValidationError';
    this.type = type;
    this.details = details;
  }
}

/**
 * Validates that a category is valid
 * @param {string} category - The category to validate
 * @throws {CategoryValidationError} If category is invalid
 */
export function validateCategory(category) {
  if (!category) {
    throw new CategoryValidationError(
      'Category is required for all data operations',
      VALIDATION_ERROR_TYPES.MISSING_CATEGORY
    );
  }
  
  if (!VALID_CATEGORIES.includes(category)) {
    throw new CategoryValidationError(
      `Invalid category: ${category}. Must be one of: ${VALID_CATEGORIES.join(', ')}`,
      VALIDATION_ERROR_TYPES.INVALID_CATEGORY,
      { category, validCategories: VALID_CATEGORIES }
    );
  }
  
  return category;
}

/**
 * Validates that a data record belongs to the expected category
 * @param {Object} record - The data record to validate
 * @param {string} expectedCategory - The expected category
 * @param {string} recordType - Type of record (for error messages)
 * @throws {CategoryValidationError} If categories don't match
 */
export function validateRecordCategory(record, expectedCategory, recordType = 'record') {
  validateCategory(expectedCategory);
  
  if (!record || typeof record !== 'object') {
    throw new CategoryValidationError(
      `Invalid ${recordType} provided for validation`,
      VALIDATION_ERROR_TYPES.CATEGORY_MISMATCH
    );
  }
  
  const recordCategory = record.Category || record.category;
  
  // Allow legacy records without category if expected category is herbicide
  if (!recordCategory && expectedCategory === 'herbicide') {
    return expectedCategory;
  }
  
  if (!recordCategory) {
    throw new CategoryValidationError(
      `${recordType} is missing category information and cannot be processed in ${expectedCategory} context`,
      VALIDATION_ERROR_TYPES.MISSING_CATEGORY,
      { recordId: record.ID || record.id, expectedCategory }
    );
  }
  
  if (recordCategory !== expectedCategory) {
    throw new CategoryValidationError(
      `Category isolation violation: Cannot process ${recordCategory} ${recordType} when active category is ${expectedCategory}`,
      VALIDATION_ERROR_TYPES.CATEGORY_MISMATCH,
      { recordCategory, expectedCategory, recordId: record.ID || record.id, recordType }
    );
  }
  
  return recordCategory;
}

/**
 * Validates cross-category references in data relationships
 * @param {Object} record - The primary record
 * @param {Array} relatedRecords - Array of related records to check
 * @param {string} relationshipType - Description of the relationship
 * @throws {CategoryValidationError} If cross-category references are found
 */
export function validateCategoryCrossReferences(record, relatedRecords, relationshipType) {
  const recordCategory = record.Category || record.category;
  if (!recordCategory) return; // Skip validation for records without category
  
  validateCategory(recordCategory);
  
  const violations = [];
  
  if (Array.isArray(relatedRecords)) {
    relatedRecords.forEach((related, index) => {
      if (!related || typeof related !== 'object') return;
      
      const relatedCategory = related.Category || related.category;
      
      // Allow legacy records without category if record category is herbicide
      if (!relatedCategory && recordCategory === 'herbicide') return;
      
      if (relatedCategory && relatedCategory !== recordCategory) {
        violations.push({
          index,
          relatedId: related.ID || related.id,
          relatedCategory,
          recordCategory
        });
      }
    });
  }
  
  if (violations.length > 0) {
    const violationDetails = violations.map(v => 
      `${relationshipType} #${v.index + 1} (ID: ${v.relatedId}) belongs to ${v.relatedCategory} category`
    ).join(', ');
    
    throw new CategoryValidationError(
      `Cross-category reference violation: ${recordCategory} record cannot reference items from other categories. Found: ${violationDetails}`,
      VALIDATION_ERROR_TYPES.CROSS_CATEGORY_REFERENCE,
      { recordCategory, violations, relationshipType }
    );
  }
}

/**
 * Validates trial-project category consistency
 * @param {Object} trial - The trial record
 * @param {Object} project - The project record
 * @throws {CategoryValidationError} If trial and project categories don't match
 */
export function validateTrialProjectCategory(trial, project) {
  if (!trial || !project) return;
  
  const trialCategory = trial.Category || trial.category;
  const projectCategory = project.Category || project.category;
  
  // Handle legacy records - if both are missing category, allow (assume herbicide)
  if (!trialCategory && !projectCategory) return;
  
  // If one has category and other doesn't, check if herbicide is assumed
  if (!trialCategory && projectCategory !== 'herbicide') {
    throw new CategoryValidationError(
      `Trial without category cannot be assigned to ${projectCategory} project`,
      VALIDATION_ERROR_TYPES.CATEGORY_MISMATCH,
      { trialId: trial.ID || trial.id, projectId: project.ID || project.id, projectCategory }
    );
  }
  
  if (!projectCategory && trialCategory !== 'herbicide') {
    throw new CategoryValidationError(
      `${trialCategory} trial cannot be assigned to project without category`,
      VALIDATION_ERROR_TYPES.CATEGORY_MISMATCH,
      { trialId: trial.ID || trial.id, trialCategory, projectId: project.ID || project.id }
    );
  }
  
  // Both have categories - they must match
  if (trialCategory && projectCategory && trialCategory !== projectCategory) {
    throw new CategoryValidationError(
      `Trial category (${trialCategory}) must match project category (${projectCategory})`,
      VALIDATION_ERROR_TYPES.CATEGORY_MISMATCH,
      { trialId: trial.ID || trial.id, trialCategory, projectId: project.ID || project.id, projectCategory }
    );
  }
}

/**
 * Validates formulation-ingredient category consistency
 * @param {Object} formulation - The formulation record
 * @param {Array} ingredients - Array of ingredient records
 * @throws {CategoryValidationError} If formulation and ingredients have category mismatches
 */
export function validateFormulationIngredientCategory(formulation, ingredients) {
  if (!formulation || !Array.isArray(ingredients)) return;
  
  const formulationCategory = formulation.Category || formulation.category;
  if (!formulationCategory) return; // Skip validation for formulations without category
  
  validateCategory(formulationCategory);
  
  const violations = [];
  
  ingredients.forEach((ingredient, index) => {
    if (!ingredient || typeof ingredient !== 'object') return;
    
    const ingredientCategory = ingredient.Category || ingredient.category;
    
    // Allow ingredients without category to be used (shared ingredients)
    if (!ingredientCategory) return;
    
    if (ingredientCategory !== formulationCategory) {
      violations.push({
        index,
        ingredientId: ingredient.ID || ingredient.id,
        ingredientCategory,
        formulationCategory
      });
    }
  });
  
  if (violations.length > 0) {
    const violationDetails = violations.map(v => 
      `ingredient #${v.index + 1} (ID: ${v.ingredientId}) from ${v.ingredientCategory} category`
    ).join(', ');
    
    throw new CategoryValidationError(
      `Formulation category violation: ${formulationCategory} formulation cannot include ${violationDetails}`,
      VALIDATION_ERROR_TYPES.CROSS_CATEGORY_REFERENCE,
      { formulationCategory, violations }
    );
  }
}

/**
 * Validates that data export operations respect category boundaries
 * @param {string} activeCategory - The currently active category
 * @param {Array} dataToExport - Array of records to export
 * @param {string} exportType - Type of export operation
 * @throws {CategoryValidationError} If export contains cross-category data
 */
export function validateExportCategoryBoundaries(activeCategory, dataToExport, exportType = 'data') {
  validateCategory(activeCategory);
  
  if (!Array.isArray(dataToExport)) return;
  
  const violations = [];
  
  dataToExport.forEach((record, index) => {
    if (!record || typeof record !== 'object') return;
    
    const recordCategory = record.Category || record.category;
    
    // Allow legacy records without category if active category is herbicide
    if (!recordCategory && activeCategory === 'herbicide') return;
    
    if (recordCategory && recordCategory !== activeCategory) {
      violations.push({
        index,
        recordId: record.ID || record.id,
        recordCategory,
        activeCategory
      });
    }
  });
  
  if (violations.length > 0) {
    const violationSummary = violations.reduce((acc, v) => {
      acc[v.recordCategory] = (acc[v.recordCategory] || 0) + 1;
      return acc;
    }, {});
    
    const summaryText = Object.entries(violationSummary)
      .map(([cat, count]) => `${count} ${cat} records`)
      .join(', ');
    
    throw new CategoryValidationError(
      `Export category violation: Cannot export ${exportType} containing cross-category data. Found ${summaryText} when active category is ${activeCategory}`,
      VALIDATION_ERROR_TYPES.CATEGORY_ISOLATION_VIOLATION,
      { activeCategory, violations, exportType }
    );
  }
}

/**
 * Validates that comparison operations only include same-category items
 * @param {Array} itemsToCompare - Array of items to compare
 * @param {string} comparisonType - Type of comparison operation
 * @throws {CategoryValidationError} If items are from different categories
 */
export function validateComparisonCategoryConsistency(itemsToCompare, comparisonType = 'comparison') {
  if (!Array.isArray(itemsToCompare) || itemsToCompare.length < 2) return;
  
  const categories = new Set();
  const categoryMap = new Map();
  
  itemsToCompare.forEach((item, index) => {
    if (!item || typeof item !== 'object') return;
    
    const category = item.Category || item.category || 'herbicide'; // Default legacy to herbicide
    categories.add(category);
    categoryMap.set(index, category);
  });
  
  if (categories.size > 1) {
    const categoryBreakdown = {};
    categoryMap.forEach((category, index) => {
      if (!categoryBreakdown[category]) categoryBreakdown[category] = [];
      categoryBreakdown[category].push(index + 1);
    });
    
    const breakdown = Object.entries(categoryBreakdown)
      .map(([cat, indices]) => `${cat}: items ${indices.join(', ')}`)
      .join('; ');
    
    throw new CategoryValidationError(
      `Cross-category comparison violation: ${comparisonType} can only include items from the same category. Found mixed categories: ${breakdown}`,
      VALIDATION_ERROR_TYPES.CROSS_CATEGORY_REFERENCE,
      { comparisonType, categories: Array.from(categories), categoryBreakdown }
    );
  }
}

/**
 * Validates AI analysis input data for category consistency
 * @param {Array} trialsData - Array of trials for AI analysis
 * @param {string} activeCategory - The active category for analysis
 * @throws {CategoryValidationError} If AI input contains cross-category data
 */
export function validateAiAnalysisCategoryBoundaries(trialsData, activeCategory) {
  validateCategory(activeCategory);
  
  if (!Array.isArray(trialsData)) return;
  
  const violations = [];
  
  trialsData.forEach((trial, index) => {
    if (!trial || typeof trial !== 'object') return;
    
    const trialCategory = trial.Category || trial.category;
    
    // Allow legacy trials without category if active category is herbicide
    if (!trialCategory && activeCategory === 'herbicide') return;
    
    if (trialCategory && trialCategory !== activeCategory) {
      violations.push({
        index,
        trialId: trial.ID || trial.id,
        trialCategory,
        activeCategory
      });
    }
  });
  
  if (violations.length > 0) {
    const violationDetails = violations.map(v => 
      `trial #${v.index + 1} (ID: ${v.trialId}) from ${v.trialCategory} category`
    ).join(', ');
    
    throw new CategoryValidationError(
      `AI analysis category violation: Cannot analyze ${violationDetails} when active category is ${activeCategory}`,
      VALIDATION_ERROR_TYPES.CATEGORY_ISOLATION_VIOLATION,
      { activeCategory, violations }
    );
  }
}

/**
 * Middleware function to validate category boundaries for data operations
 * @param {string} operation - The operation being performed
 * @param {Object} payload - The data payload
 * @param {string} activeCategory - The active category
 * @throws {CategoryValidationError} If operation violates category boundaries
 */
export function validateDataOperationCategoryBoundaries(operation, payload, activeCategory) {
  validateCategory(activeCategory);
  
  if (!payload || typeof payload !== 'object') return;
  
  // Validate based on operation type
  switch (operation) {
    case 'addTrial':
    case 'updateTrial':
      if (payload.ProjectId || payload.projectId) {
        // This validation would need project data to be effective
        // The actual project lookup and validation should happen in the data layer
      }
      break;
      
    case 'addFormulation':
    case 'updateFormulation':
      if (payload.ingredients && Array.isArray(payload.ingredients)) {
        // This validation would need ingredient data to be effective
        // The actual ingredient lookup and validation should happen in the data layer
      }
      break;
      
    case 'export':
      if (payload.data && Array.isArray(payload.data)) {
        validateExportCategoryBoundaries(activeCategory, payload.data, payload.type);
      }
      break;
      
    case 'compare':
      if (payload.items && Array.isArray(payload.items)) {
        validateComparisonCategoryConsistency(payload.items, payload.type);
      }
      break;
      
    case 'aiAnalysis':
      if (payload.trials && Array.isArray(payload.trials)) {
        validateAiAnalysisCategoryBoundaries(payload.trials, activeCategory);
      }
      break;
  }
}

/**
 * Creates user-friendly validation error messages for UI display
 * @param {CategoryValidationError} error - The validation error
 * @returns {Object} UI-friendly error information
 */
export function formatValidationErrorForUI(error) {
  if (!(error instanceof CategoryValidationError)) {
    return {
      title: 'Validation Error',
      message: error.message || 'An unknown validation error occurred',
      type: 'error'
    };
  }
  
  const baseInfo = {
    type: 'error',
    category: 'Category Validation',
    errorType: error.type
  };
  
  switch (error.type) {
    case VALIDATION_ERROR_TYPES.CATEGORY_MISMATCH:
      return {
        ...baseInfo,
        title: 'Category Mismatch',
        message: error.message,
        suggestion: 'Please ensure all related items belong to the same category, or switch to the correct category before proceeding.'
      };
      
    case VALIDATION_ERROR_TYPES.CROSS_CATEGORY_REFERENCE:
      return {
        ...baseInfo,
        title: 'Cross-Category Reference Violation',
        message: error.message,
        suggestion: 'Remove references to items from other categories, or create category-specific alternatives.'
      };
      
    case VALIDATION_ERROR_TYPES.INVALID_CATEGORY:
      return {
        ...baseInfo,
        title: 'Invalid Category',
        message: error.message,
        suggestion: `Please select a valid category: ${VALID_CATEGORIES.join(', ')}`
      };
      
    case VALIDATION_ERROR_TYPES.MISSING_CATEGORY:
      return {
        ...baseInfo,
        title: 'Missing Category Information',
        message: error.message,
        suggestion: 'Please assign a category to this item before proceeding.'
      };
      
    case VALIDATION_ERROR_TYPES.CATEGORY_ISOLATION_VIOLATION:
      return {
        ...baseInfo,
        title: 'Category Isolation Violation',
        message: error.message,
        suggestion: 'This operation would mix data across category boundaries. Please filter to the correct category first.'
      };
      
    default:
      return {
        ...baseInfo,
        title: 'Category Validation Error',
        message: error.message,
        suggestion: 'Please review the category assignments and try again.'
      };
  }
}

/**
 * Database constraint validation rules for Firebase
 * These functions can be used in Firestore security rules or application-level validation
 */
export const DATABASE_CONSTRAINTS = {
  /**
   * Validates that a document has a valid category field
   */
  hasValidCategory: (data) => {
    const category = data.Category || data.category;
    return category && VALID_CATEGORIES.includes(category);
  },
  
  /**
   * Validates that a trial belongs to the same category as its project
   */
  trialProjectCategoryMatch: (trialData, projectData) => {
    if (!projectData) return true; // Skip if no project reference
    
    const trialCategory = trialData.Category || trialData.category || 'herbicide';
    const projectCategory = projectData.Category || projectData.category || 'herbicide';
    
    return trialCategory === projectCategory;
  },
  
  /**
   * Validates that formulation ingredients belong to compatible categories
   */
  formulationIngredientCategoryCompatible: (formulationData, ingredientsData) => {
    if (!Array.isArray(ingredientsData)) return true;
    
    const formulationCategory = formulationData.Category || formulationData.category;
    if (!formulationCategory) return true; // Skip if no formulation category
    
    return ingredientsData.every(ingredient => {
      const ingredientCategory = ingredient.Category || ingredient.category;
      return !ingredientCategory || ingredientCategory === formulationCategory;
    });
  }
};