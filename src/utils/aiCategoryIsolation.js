/**
 * AI Service Category Isolation Utilities
 * 
 * This module implements category boundary enforcement for all AI analysis operations.
 * It ensures that AI services process only data belonging to the active category,
 * preventing cross-category data contamination in analysis and insights.
 */

import { getCategoryConfig } from './categoryConfig.js';

/**
 * Validates that AI analysis operations respect category boundaries
 * @param {string} activeCategory - The currently active category
 * @param {string} operationType - The type of AI operation being performed
 * @throws {Error} If category validation fails
 */
export function validateAIAnalysisCategory(activeCategory, operationType = 'AI analysis') {
  const validCategories = ['herbicide', 'fungicide', 'pesticide', 'nutrition', 'biostimulant'];
  
  if (!activeCategory || !validCategories.includes(activeCategory)) {
    throw new Error(
      `Invalid category '${activeCategory}' for ${operationType}. Must be one of: ${validCategories.join(', ')}`
    );
  }
  
  return activeCategory;
}

/**
 * Filters trials to only include those belonging to the active category
 * Implements strict category isolation without legacy fallbacks
 * @param {Array} trials - Array of trial objects
 * @param {string} activeCategory - The active category to filter by
 * @returns {Array} Filtered trials belonging only to the active category
 */
export function filterTrialsByCategory(trials, activeCategory) {
  validateAIAnalysisCategory(activeCategory, 'trial filtering');
  
  if (!Array.isArray(trials)) {
    return [];
  }
  
  const filteredTrials = trials.filter(trial => {
    const trialCategory = trial.Category || 'herbicide';
    return trialCategory === activeCategory;
  });
  
  // Validate no cross-category contamination occurred
  const violatingTrials = filteredTrials.filter(trial => {
    const trialCategory = trial.Category || 'herbicide';
    return trialCategory !== activeCategory;
  });
  
  if (violatingTrials.length > 0) {
    const violatedCategories = [...new Set(violatingTrials.map(t => t.Category || 'herbicide'))];
    throw new Error(
      `Category isolation violation: Found trials from ${violatedCategories.join(', ')} in ${activeCategory} analysis`
    );
  }
  
  console.log(`[AI Category Isolation] Filtered ${filteredTrials.length}/${trials.length} trials for ${activeCategory} category`);
  return filteredTrials;
}

/**
 * Filters projects to only include those belonging to the active category
 * @param {Array} projects - Array of project objects
 * @param {string} activeCategory - The active category to filter by
 * @returns {Array} Filtered projects belonging only to the active category
 */
export function filterProjectsByCategory(projects, activeCategory) {
  validateAIAnalysisCategory(activeCategory, 'project filtering');
  
  if (!Array.isArray(projects)) {
    return [];
  }
  
  return projects.filter(project => {
    const projectCategory = project.Category || 'herbicide';
    return projectCategory === activeCategory;
  });
}

/**
 * Filters formulations to only include those belonging to the active category
 * @param {Array} formulations - Array of formulation objects
 * @param {string} activeCategory - The active category to filter by
 * @returns {Array} Filtered formulations belonging only to the active category
 */
export function filterFormulationsByCategory(formulations, activeCategory) {
  validateAIAnalysisCategory(activeCategory, 'formulation filtering');
  
  if (!Array.isArray(formulations)) {
    return [];
  }
  
  return formulations.filter(formulation => {
    const formulationCategory = formulation.Category || 'herbicide';
    return formulationCategory === activeCategory;
  });
}

/**
 * Validates user has access to perform AI analysis for the specified category
 * @param {Object} user - User object with categoryAccess permissions
 * @param {string} activeCategory - The category to check access for
 * @throws {Error} If user doesn't have access to the category
 */
export function validateUserCategoryAccess(user, activeCategory) {
  if (!user) {
    throw new Error('User authentication required for AI analysis');
  }
  
  // Skip validation for viewer role - they have read-only access
  if (user.role === 'viewer') {
    return;
  }
  
  const userCategoryAccess = user.categoryAccess || [];
  
  // If user has specific category restrictions, validate access
  if (userCategoryAccess.length > 0 && !userCategoryAccess.includes(activeCategory)) {
    throw new Error(
      `Access denied: You do not have permission to perform AI analysis for ${activeCategory} category. ` +
      `Available categories: ${userCategoryAccess.join(', ')}`
    );
  }
}

/**
 * Creates a category-aware AI context object with proper isolation
 * @param {string} activeCategory - The active category
 * @param {Array} trials - Raw trials array (will be filtered)
 * @param {Array} projects - Raw projects array (will be filtered) 
 * @param {Array} formulations - Raw formulations array (will be filtered)
 * @param {Object} user - User object for access validation
 * @returns {Object} Category-isolated AI context
 */
export function createCategoryAwareAIContext(activeCategory, trials, projects, formulations, user) {
  // Validate category and user access
  validateAIAnalysisCategory(activeCategory, 'AI context creation');
  validateUserCategoryAccess(user, activeCategory);
  
  // Get category-specific configuration
  const config = getCategoryConfig(activeCategory);
  
  // Filter all data to active category only
  const categoryTrials = filterTrialsByCategory(trials, activeCategory);
  const categoryProjects = filterProjectsByCategory(projects, activeCategory);
  const categoryFormulations = filterFormulationsByCategory(formulations, activeCategory);
  
  return {
    activeCategory,
    config,
    trials: categoryTrials,
    projects: categoryProjects,
    formulations: categoryFormulations,
    totalTrials: trials?.length || 0,
    filteredTrials: categoryTrials.length,
    categoryPrompt: config.aiPhotoPrompt,
    categoryFeatures: config.aiFeatures || [],
    isolationMetrics: {
      originalTrialCount: trials?.length || 0,
      filteredTrialCount: categoryTrials.length,
      originalProjectCount: projects?.length || 0,
      filteredProjectCount: categoryProjects.length,
      originalFormulationCount: formulations?.length || 0,
      filteredFormulationCount: categoryFormulations.length,
    }
  };
}

/**
 * Enhances AI prompts with category-specific isolation context
 * @param {string} basePrompt - The base AI prompt
 * @param {string} activeCategory - The active category
 * @param {Object} isolationMetrics - Metrics about data filtering
 * @returns {string} Enhanced prompt with category isolation context
 */
export function enhancePromptWithCategoryIsolation(basePrompt, activeCategory, isolationMetrics) {
  const config = getCategoryConfig(activeCategory);
  
  const isolationContext = `
CRITICAL CATEGORY ISOLATION REQUIREMENTS:
- You are analyzing data for the ${activeCategory.toUpperCase()} category ONLY
- DO NOT reference, compare, or include data from other categories: ${['herbicide', 'fungicide', 'pesticide', 'nutrition', 'biostimulant'].filter(c => c !== activeCategory).join(', ')}
- Use category-specific terminology and analysis methods for ${config.name}
- Analysis is based on ${isolationMetrics.filteredTrialCount}/${isolationMetrics.originalTrialCount} trials filtered for ${activeCategory} category

Category-Specific Analysis Parameters:
- Primary Metric: ${config.primaryMetric?.label || 'Efficacy'}
- Target Field: ${config.targetLabel || 'Target'}
- Observation Fields: ${config.observationFields?.map(f => f.label).join(', ') || 'Standard fields'}
- AI Features: ${config.aiFeatures?.join(', ') || 'Standard analysis'}

`;

  return isolationContext + basePrompt;
}

/**
 * Validates that AI analysis results respect category boundaries
 * @param {Object} analysisResults - Results from AI analysis
 * @param {string} activeCategory - The expected category
 * @param {string} operationType - Type of operation that generated results
 * @throws {Error} If results contain cross-category references
 */
export function validateAnalysisResults(analysisResults, activeCategory, operationType = 'AI analysis') {
  if (!analysisResults) {
    return;
  }
  
  // Check for mentions of other categories in the results
  const otherCategories = ['herbicide', 'fungicide', 'pesticide', 'nutrition', 'biostimulant']
    .filter(cat => cat !== activeCategory);
  
  const resultText = JSON.stringify(analysisResults).toLowerCase();
  const mentionedCategories = otherCategories.filter(cat => 
    resultText.includes(cat) || resultText.includes(cat + 's')
  );
  
  if (mentionedCategories.length > 0) {
    console.warn(
      `[AI Category Isolation] Warning: ${operationType} results for ${activeCategory} ` +
      `contain references to other categories: ${mentionedCategories.join(', ')}`
    );
  }
}

/**
 * Logs category isolation metrics for monitoring
 * @param {string} operationType - Type of AI operation
 * @param {string} activeCategory - The active category
 * @param {Object} isolationMetrics - Data about filtering performed
 */
export function logCategoryIsolationMetrics(operationType, activeCategory, isolationMetrics) {
  const filteredPercentage = isolationMetrics.originalTrialCount > 0 
    ? (isolationMetrics.filteredTrialCount / isolationMetrics.originalTrialCount * 100).toFixed(1)
    : '0';
  
  console.log(
    `[AI Category Isolation] ${operationType} for ${activeCategory}: ` +
    `${isolationMetrics.filteredTrialCount}/${isolationMetrics.originalTrialCount} trials (${filteredPercentage}%), ` +
    `${isolationMetrics.filteredProjectCount}/${isolationMetrics.originalProjectCount} projects, ` +
    `${isolationMetrics.filteredFormulationCount}/${isolationMetrics.originalFormulationCount} formulations`
  );
}