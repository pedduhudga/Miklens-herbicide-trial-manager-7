// src/middleware/categoryValidationMiddleware.js
// Middleware for enforcing category validation rules across all data operations

import {
  validateCategory,
  validateRecordCategory,
  validateTrialProjectCategory,
  validateFormulationIngredientCategory,
  validateDataOperationCategoryBoundaries,
  CategoryValidationError,
  VALIDATION_ERROR_TYPES,
  formatValidationErrorForUI
} from '../utils/categoryValidation.js';

// Re-export for dataLayer.js
export { validateCategory, validateRecordCategory, validateTrialProjectCategory, validateFormulationIngredientCategory, validateDataOperationCategoryBoundaries, CategoryValidationError, VALIDATION_ERROR_TYPES, formatValidationErrorForUI };

/**
 * Category validation middleware that intercepts data operations
 * to enforce category boundaries and prevent cross-category contamination
 */
export class CategoryValidationMiddleware {
  constructor() {
    this.validationRules = new Map();
    this.setupDefaultRules();
  }

  /**
   * Setup default validation rules for different operation types
   */
  setupDefaultRules() {
    // Trial operations
    this.addValidationRule('addTrial', this.validateTrialOperation.bind(this));
    this.addValidationRule('updateTrial', this.validateTrialOperation.bind(this));
    this.addValidationRule('deleteTrial', this.validateTrialOperation.bind(this));
    this.addValidationRule('finalizeTrial', this.validateTrialOperation.bind(this));
    
    // Project operations
    this.addValidationRule('addProject', this.validateProjectOperation.bind(this));
    this.addValidationRule('updateProject', this.validateProjectOperation.bind(this));
    this.addValidationRule('deleteProject', this.validateProjectOperation.bind(this));
    
    // Formulation operations
    this.addValidationRule('addFormulation', this.validateFormulationOperation.bind(this));
    this.addValidationRule('updateFormulation', this.validateFormulationOperation.bind(this));
    this.addValidationRule('deleteFormulation', this.validateFormulationOperation.bind(this));
    
    // Export operations
    this.addValidationRule('exportData', this.validateExportOperation.bind(this));
    this.addValidationRule('exportTrials', this.validateExportOperation.bind(this));
    this.addValidationRule('exportProjects', this.validateExportOperation.bind(this));
    
    // AI operations
    this.addValidationRule('aiAnalysis', this.validateAiOperation.bind(this));
    this.addValidationRule('generateReport', this.validateAiOperation.bind(this));
    
    // Comparison operations
    this.addValidationRule('compareTrials', this.validateComparisonOperation.bind(this));
    this.addValidationRule('compareProjects', this.validateComparisonOperation.bind(this));
  }

  /**
   * Add a custom validation rule for an operation
   * @param {string} operation - Operation name
   * @param {Function} validationFn - Validation function
   */
  addValidationRule(operation, validationFn) {
    this.validationRules.set(operation, validationFn);
  }

  /**
   * Remove a validation rule
   * @param {string} operation - Operation name
   */
  removeValidationRule(operation) {
    this.validationRules.delete(operation);
  }

  /**
   * Main validation method - validates an operation before execution
   * @param {string} operation - The operation being performed
   * @param {Object} payload - The data payload
   * @param {Object} context - Application context (includes activeCategory, state, etc.)
   * @returns {Object} Validation result
   */
  async validateOperation(operation, payload, context) {
    try {
      // Basic category validation
      if (!context.activeCategory) {
        throw new CategoryValidationError(
          'Active category is required for all data operations',
          VALIDATION_ERROR_TYPES.MISSING_CATEGORY
        );
      }

      validateCategory(context.activeCategory);

      // Run operation-specific validation if rule exists
      const validationRule = this.validationRules.get(operation);
      if (validationRule) {
        await validationRule(payload, context);
      }

      // Run generic data operation validation
      validateDataOperationCategoryBoundaries(operation, payload, context.activeCategory);

      return {
        valid: true,
        operation,
        category: context.activeCategory
      };

    } catch (error) {
      if (error instanceof CategoryValidationError) {
        return {
          valid: false,
          error,
          operation,
          category: context.activeCategory,
          userMessage: formatValidationErrorForUI(error)
        };
      }
      
      // Re-throw non-validation errors
      throw error;
    }
  }

  /**
   * Validation for trial operations
   */
  async validateTrialOperation(payload, context) {
    if (!payload) return;

    const { activeCategory, state } = context;
    
    // Validate trial category matches active category
    if (payload.Category && payload.Category !== activeCategory) {
      throw new CategoryValidationError(
        `Cannot process ${payload.Category} trial when active category is ${activeCategory}`,
        VALIDATION_ERROR_TYPES.CATEGORY_MISMATCH,
        { trialCategory: payload.Category, activeCategory }
      );
    }

    // Validate trial-project relationship if project is specified
    if (payload.ProjectId || payload.projectId) {
      const projectId = payload.ProjectId || payload.projectId;
      const project = (state.projects || []).find(p => p.ID === projectId || p.id === projectId);
      
      if (project) {
        validateTrialProjectCategory({ ...payload, Category: activeCategory }, project);
      }
    }
  }

  /**
   * Validation for project operations
   */
  async validateProjectOperation(payload, context) {
    if (!payload) return;

    const { activeCategory } = context;
    
    // Validate project category matches active category
    if (payload.Category && payload.Category !== activeCategory) {
      throw new CategoryValidationError(
        `Cannot process ${payload.Category} project when active category is ${activeCategory}`,
        VALIDATION_ERROR_TYPES.CATEGORY_MISMATCH,
        { projectCategory: payload.Category, activeCategory }
      );
    }
  }

  /**
   * Validation for formulation operations
   */
  async validateFormulationOperation(payload, context) {
    if (!payload) return;

    const { activeCategory, state } = context;
    
    // Validate formulation category matches active category
    if (payload.Category && payload.Category !== activeCategory) {
      throw new CategoryValidationError(
        `Cannot process ${payload.Category} formulation when active category is ${activeCategory}`,
        VALIDATION_ERROR_TYPES.CATEGORY_MISMATCH,
        { formulationCategory: payload.Category, activeCategory }
      );
    }

    // Validate formulation-ingredient relationships
    if (payload.ingredients && Array.isArray(payload.ingredients)) {
      const ingredients = payload.ingredients.map(ingredientId => 
        (state.ingredients || []).find(ing => ing.ID === ingredientId || ing.id === ingredientId)
      ).filter(Boolean);
      
      validateFormulationIngredientCategory({ ...payload, Category: activeCategory }, ingredients);
    }
  }

  /**
   * Validation for export operations
   */
  async validateExportOperation(payload, context) {
    if (!payload || !payload.data) return;

    const { activeCategory } = context;
    
    // Validate all export data belongs to active category
    const violations = [];
    payload.data.forEach((record, index) => {
      if (!record) return;
      
      const recordCategory = record.Category || record.category;
      
      // Allow legacy records without category if active category is herbicide
      if (!recordCategory && activeCategory === 'herbicide') return;
      
      if (recordCategory && recordCategory !== activeCategory) {
        violations.push({ index, recordCategory, recordId: record.ID || record.id });
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
        `Export contains cross-category data: ${summaryText}. Cannot export when active category is ${activeCategory}`,
        VALIDATION_ERROR_TYPES.CATEGORY_ISOLATION_VIOLATION,
        { activeCategory, violations }
      );
    }
  }

  /**
   * Validation for AI operations
   */
  async validateAiOperation(payload, context) {
    if (!payload) return;

    const { activeCategory } = context;
    
    // Validate AI input data is category-consistent
    if (payload.trials && Array.isArray(payload.trials)) {
      const violations = [];
      
      payload.trials.forEach((trial, index) => {
        if (!trial) return;
        
        const trialCategory = trial.Category || trial.category;
        
        // Allow legacy trials without category if active category is herbicide
        if (!trialCategory && activeCategory === 'herbicide') return;
        
        if (trialCategory && trialCategory !== activeCategory) {
          violations.push({ index, trialCategory, trialId: trial.ID || trial.id });
        }
      });

      if (violations.length > 0) {
        const violationDetails = violations.map(v => 
          `trial #${v.index + 1} (${v.trialCategory})`
        ).join(', ');
        
        throw new CategoryValidationError(
          `AI analysis input contains cross-category trials: ${violationDetails}. Cannot analyze when active category is ${activeCategory}`,
          VALIDATION_ERROR_TYPES.CATEGORY_ISOLATION_VIOLATION,
          { activeCategory, violations }
        );
      }
    }
  }

  /**
   * Validation for comparison operations
   */
  async validateComparisonOperation(payload, context) {
    if (!payload || !payload.items) return;

    const { activeCategory } = context;
    
    // Validate all comparison items are from same category
    const categories = new Set();
    const categoryMap = new Map();
    
    payload.items.forEach((item, index) => {
      if (!item) return;
      
      const category = item.Category || item.category || 'herbicide';
      categories.add(category);
      categoryMap.set(index, category);
    });
    
    // All items must be from the active category
    if (categories.size > 1 || (categories.size === 1 && !categories.has(activeCategory))) {
      const categoryBreakdown = {};
      categoryMap.forEach((category, index) => {
        if (!categoryBreakdown[category]) categoryBreakdown[category] = [];
        categoryBreakdown[category].push(index + 1);
      });
      
      const breakdown = Object.entries(categoryBreakdown)
        .map(([cat, indices]) => `${cat}: items ${indices.join(', ')}`)
        .join('; ');
      
      throw new CategoryValidationError(
        `Comparison contains mixed categories: ${breakdown}. Only ${activeCategory} items can be compared when active category is ${activeCategory}`,
        VALIDATION_ERROR_TYPES.CROSS_CATEGORY_REFERENCE,
        { activeCategory, categories: Array.from(categories) }
      );
    }
  }

  /**
   * Validate category access permissions for user
   * @param {Object} user - User object
   * @param {string} category - Category to validate access for
   * @returns {boolean} Whether user has access to category
   */
  validateCategoryAccess(user, category) {
    if (!user || !category) return false;
    
    // Admin has access to all categories
    const role = String(user.Role || user.role || '').toLowerCase();
    if (role === 'admin') return true;
    
    // Check user's category access list
    const categoryAccess = user.categoryAccess || user.CategoryAccess || [];
    if (Array.isArray(categoryAccess)) {
      return categoryAccess.includes(category);
    }
    
    // If no specific category access defined, allow all (legacy compatibility)
    return true;
  }

  /**
   * Create validation context from application state
   * @param {Function} getAppState - Function to get application state
   * @returns {Object} Validation context
   */
  createValidationContext(getAppState) {
    const state = getAppState ? getAppState() : {};
    
    return {
      activeCategory: state.activeCategory || 'herbicide',
      state,
      user: state.auth?.user,
      settings: state.settings || {}
    };
  }
}

/**
 * Singleton instance of the validation middleware
 */
export const categoryValidationMiddleware = new CategoryValidationMiddleware();

/**
 * Wrapper function for easy integration with existing data operations
 * @param {string} operation - Operation name
 * @param {Object} payload - Data payload
 * @param {Function} getAppState - Function to get app state
 * @returns {Promise<Object>} Validation result
 */
export async function validateCategoryOperation(operation, payload, getAppState) {
  const context = categoryValidationMiddleware.createValidationContext(getAppState);
  return categoryValidationMiddleware.validateOperation(operation, payload, context);
}

/**
 * Higher-order function that wraps data operations with category validation
 * @param {Function} operation - The original data operation function
 * @param {string} operationName - Name of the operation for validation
 * @returns {Function} Wrapped operation with validation
 */
export function withCategoryValidation(operation, operationName) {
  return async function(payload, getAppState, ...args) {
    // Perform validation
    const validation = await validateCategoryOperation(operationName, payload, getAppState);
    
    if (!validation.valid) {
      // Convert validation error to user-friendly format and throw
      const errorInfo = validation.userMessage;
      const error = new Error(errorInfo.message);
      error.validationError = true;
      error.errorInfo = errorInfo;
      throw error;
    }
    
    // If validation passes, proceed with original operation
    return operation(payload, getAppState, ...args);
  };
}

/**
 * Database-level validation rules that can be used in Firestore security rules
 * These provide the constraint enforcement at the database level
 */
export const DATABASE_VALIDATION_RULES = {
  /**
   * Firestore security rule functions (to be used in firestore.rules)
   */
  
  // Check if document has valid category
  hasValidCategory: `
    function hasValidCategory(data) {
      let category = 'Category' in data ? data.Category : ('category' in data ? data.category : null);
      return category != null && category in ['herbicide', 'fungicide', 'pesticide', 'nutrition', 'biostimulant'];
    }
  `,
  
  // Check if user has access to category
  hasCategoryAccess: `
    function hasCategoryAccess(category) {
      let user = get(/databases/$(database)/documents/users/$(request.auth.uid)).data;
      return user.Role == 'admin' || 
             ('categoryAccess' in user && category in user.categoryAccess) ||
             ('CategoryAccess' in user && category in user.CategoryAccess);
    }
  `,
  
  // Check if trial category matches project category
  trialProjectCategoryMatch: `
    function trialProjectCategoryMatch(trialData, projectId) {
      let project = get(/databases/$(database)/documents/projects-$(trialData.Category)/$(projectId)).data;
      let trialCategory = 'Category' in trialData ? trialData.Category : 'herbicide';
      let projectCategory = 'Category' in project ? project.Category : 'herbicide';
      return trialCategory == projectCategory;
    }
  `,
  
  // Comprehensive category isolation rule
  enforcesCategoryIsolation: `
    function enforcesCategoryIsolation(data) {
      return hasValidCategory(data) && 
             hasCategoryAccess(data.Category) &&
             ('ProjectId' in data ? trialProjectCategoryMatch(data, data.ProjectId) : true);
    }
  `
};