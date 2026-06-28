// src/services/legacyMigrationService.js
// Service layer for legacy data migration operations
// Integrates with dataLayer.js to persist migration changes

import { 
  generateLegacyMigrationReport,
  validateMigrationSuggestions,
  applyAutomaticMigration
} from '../utils/legacyDataMigration.js';
import { 
  updateTrial,
  updateProject,
  updateFormulation,
  addIngredient,
  updateBlock,
  getAllData
} from './dataLayer.js';

/**
 * Service to manage legacy data migration operations
 * Provides high-level functions for the migration workflow
 */
export class LegacyMigrationService {
  
  /**
   * Generate comprehensive migration analysis
   * @param {Function} getAppState - Function to get current app state
   * @returns {Promise<Object>} - Migration report
   */
  static async analyzeLegacyData(getAppState) {
    try {
      const state = getAppState();
      const report = generateLegacyMigrationReport(state);
      
      return {
        success: true,
        report,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error analyzing legacy data:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Apply migration suggestions to the database
   * @param {Array} suggestions - Migration suggestions to apply
   * @param {Function} getAppState - Function to get current app state
   * @returns {Promise<Object>} - Migration results
   */
  static async applyMigrationSuggestions(suggestions, getAppState) {
    const results = {
      success: false,
      applied: 0,
      failed: 0,
      errors: [],
      details: []
    };

    try {
      // Validate suggestions first
      const validation = validateMigrationSuggestions(suggestions);
      if (validation.errors.length > 0) {
        return {
          success: false,
          error: `Validation failed: ${validation.errors[0].error}`,
          validation
        };
      }

      // Group suggestions by collection type for batch processing
      const suggestionsByCollection = suggestions.reduce((acc, suggestion) => {
        if (!acc[suggestion.collection]) {
          acc[suggestion.collection] = [];
        }
        acc[suggestion.collection].push(suggestion);
        return acc;
      }, {});

      // Apply migrations for each collection
      for (const [collection, collectionSuggestions] of Object.entries(suggestionsByCollection)) {
        const collectionResults = await this._applyCollectionMigrations(
          collection, 
          collectionSuggestions, 
          getAppState
        );
        
        results.applied += collectionResults.applied;
        results.failed += collectionResults.failed;
        results.errors.push(...collectionResults.errors);
        results.details.push(...collectionResults.details);
      }

      results.success = results.failed === 0;
      return results;

    } catch (error) {
      console.error('Error applying migration suggestions:', error);
      return {
        success: false,
        error: error.message,
        applied: results.applied,
        failed: results.failed + 1
      };
    }
  }

  /**
   * Apply migrations for a specific collection type
   * @private
   */
  static async _applyCollectionMigrations(collection, suggestions, getAppState) {
    const results = {
      applied: 0,
      failed: 0,
      errors: [],
      details: []
    };

    for (const suggestion of suggestions) {
      try {
        const success = await this._applySingleMigration(suggestion, getAppState);
        
        if (success) {
          results.applied++;
          results.details.push({
            recordId: suggestion.recordId,
            collection: suggestion.collection,
            appliedCategory: suggestion.suggestedCategory,
            reasoning: suggestion.reasoning,
            status: 'success'
          });
        } else {
          results.failed++;
          results.errors.push({
            recordId: suggestion.recordId,
            error: 'Failed to update record'
          });
        }
      } catch (error) {
        results.failed++;
        results.errors.push({
          recordId: suggestion.recordId,
          error: error.message
        });
        console.error(`Migration failed for ${suggestion.recordId}:`, error);
      }
    }

    return results;
  }

  /**
   * Apply a single migration suggestion
   * @private
   */
  static async _applySingleMigration(suggestion, getAppState) {
    const { collection, recordId, suggestedCategory } = suggestion;
    
    try {
      // Get current record from state
      const state = getAppState();
      const records = state[collection] || [];
      const record = records.find(r => (r.ID || r.id) === recordId);
      
      if (!record) {
        throw new Error(`Record ${recordId} not found in ${collection}`);
      }

      // Create updated record with category
      const updatedRecord = {
        ...record,
        Category: suggestedCategory,
        _migrationApplied: true,
        _migrationDate: new Date().toISOString(),
        _migrationReason: suggestion.reasoning
      };

      // Use appropriate data layer function based on collection
      switch (collection) {
        case 'trials':
          await updateTrial(updatedRecord, getAppState);
          break;
        
        case 'projects':
          await updateProject(updatedRecord, getAppState);
          break;
        
        case 'formulations':
          await updateFormulation(updatedRecord, getAppState);
          break;
        
        case 'ingredients':
          // Ingredients use different pattern - might need to delete/re-add
          // For now, we'll update in place (this might need adjustment based on actual schema)
          await addIngredient(updatedRecord, getAppState);
          break;
        
        case 'blocks':
          await updateBlock(updatedRecord, getAppState);
          break;
        
        default:
          throw new Error(`Unsupported collection type: ${collection}`);
      }

      return true;
    } catch (error) {
      console.error(`Failed to apply migration for ${recordId}:`, error);
      throw error;
    }
  }

  /**
   * Perform automatic migration for high-confidence suggestions
   * @param {Function} getAppState - Function to get current app state
   * @param {string} minConfidence - Minimum confidence level ('high', 'medium', 'low')
   * @returns {Promise<Object>} - Auto-migration results
   */
  static async performAutoMigration(getAppState, minConfidence = 'high') {
    try {
      // Generate migration report
      const analysisResult = await this.analyzeLegacyData(getAppState);
      if (!analysisResult.success) {
        return analysisResult;
      }

      const { suggestions } = analysisResult.report;
      
      // Apply automatic migration logic
      const autoResults = applyAutomaticMigration(suggestions, minConfidence);
      
      if (autoResults.applied === 0) {
        return {
          success: true,
          message: `No records meet the ${minConfidence} confidence threshold for automatic migration`,
          applied: 0,
          details: autoResults
        };
      }

      // Extract suggestions that meet the confidence threshold
      const confidenceLevels = { high: 3, medium: 2, low: 1, none: 0 };
      const minLevel = confidenceLevels[minConfidence] || 3;
      
      const applicableSuggestions = suggestions.filter(s => 
        s.suggestedCategory && 
        confidenceLevels[s.confidence] >= minLevel
      );

      // Apply the migrations
      const migrationResults = await this.applyMigrationSuggestions(
        applicableSuggestions, 
        getAppState
      );

      return {
        success: migrationResults.success,
        applied: migrationResults.applied,
        failed: migrationResults.failed,
        errors: migrationResults.errors,
        message: `Automatic migration completed: ${migrationResults.applied} records migrated, ${migrationResults.failed} failed`,
        details: migrationResults.details
      };

    } catch (error) {
      console.error('Error performing automatic migration:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Validate that migration won't corrupt data
   * @param {Array} suggestions - Migration suggestions to validate
   * @param {Function} getAppState - Function to get current app state
   * @returns {Promise<Object>} - Validation results
   */
  static async validateMigration(suggestions, getAppState) {
    try {
      const validation = validateMigrationSuggestions(suggestions);
      
      // Additional validation - check for cross-category references
      const state = getAppState();
      const crossReferenceIssues = this._checkCrossReferences(suggestions, state);
      
      return {
        success: validation.errors.length === 0,
        validation,
        crossReferenceIssues,
        safe: validation.errors.length === 0 && crossReferenceIssues.length === 0
      };
    } catch (error) {
      console.error('Error validating migration:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Check for potential cross-category reference issues
   * @private
   */
  static _checkCrossReferences(suggestions, state) {
    const issues = [];
    
    // Check if migrating projects would create orphaned trials
    const projectMigrations = suggestions.filter(s => s.collection === 'projects');
    
    projectMigrations.forEach(projectSuggestion => {
      const relatedTrials = (state.trials || []).filter(t => 
        t.ProjectID === projectSuggestion.recordId
      );
      
      const trialCategories = [...new Set(relatedTrials.map(t => t.Category).filter(Boolean))];
      
      if (trialCategories.length > 0 && !trialCategories.includes(projectSuggestion.suggestedCategory)) {
        issues.push({
          type: 'cross_reference',
          recordId: projectSuggestion.recordId,
          issue: `Project migration to ${projectSuggestion.suggestedCategory} would create cross-category references with ${trialCategories.join(', ')} trials`,
          severity: 'warning'
        });
      }
    });

    // Check if migrating formulations would create cross-category trial references
    const formulationMigrations = suggestions.filter(s => s.collection === 'formulations');
    
    formulationMigrations.forEach(formulationSuggestion => {
      const relatedTrials = (state.trials || []).filter(t => 
        t.FormulationID === formulationSuggestion.recordId ||
        t.FormulationName === formulationSuggestion.recordName
      );
      
      const trialCategories = [...new Set(relatedTrials.map(t => t.Category).filter(Boolean))];
      
      if (trialCategories.length > 0 && !trialCategories.includes(formulationSuggestion.suggestedCategory)) {
        issues.push({
          type: 'cross_reference',
          recordId: formulationSuggestion.recordId,
          issue: `Formulation migration to ${formulationSuggestion.suggestedCategory} would create cross-category references with ${trialCategories.join(', ')} trials`,
          severity: 'warning'
        });
      }
    });

    return issues;
  }

  /**
   * Generate migration preview without applying changes
   * @param {Array} suggestions - Migration suggestions to preview
   * @param {Function} getAppState - Function to get current app state
   * @returns {Object} - Preview results
   */
  static generateMigrationPreview(suggestions, getAppState) {
    try {
      const state = getAppState();
      const preview = {
        totalRecords: suggestions.length,
        byCollection: {},
        byCategory: {},
        byConfidence: {},
        potentialIssues: []
      };

      // Group by collection
      suggestions.forEach(s => {
        preview.byCollection[s.collection] = (preview.byCollection[s.collection] || 0) + 1;
        preview.byCategory[s.suggestedCategory] = (preview.byCategory[s.suggestedCategory] || 0) + 1;
        preview.byConfidence[s.confidence] = (preview.byConfidence[s.confidence] || 0) + 1;
      });

      // Check for potential issues
      const crossRefIssues = this._checkCrossReferences(suggestions, state);
      preview.potentialIssues = crossRefIssues;

      return {
        success: true,
        preview
      };
    } catch (error) {
      console.error('Error generating migration preview:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

/**
 * Convenience function for quick migration analysis
 * @param {Function} getAppState - Function to get current app state
 * @returns {Promise<Object>} - Quick analysis results
 */
export async function quickMigrationAnalysis(getAppState) {
  try {
    const state = getAppState();
    const report = generateLegacyMigrationReport(state);
    
    return {
      hasLegacyData: report.summary.legacyRecords > 0,
      legacyRecordCount: report.summary.legacyRecords,
      highConfidenceCount: report.summary.highConfidenceSuggestions,
      needsReviewCount: report.summary.ambiguousRecords,
      collectionsAffected: Object.keys(report.collections).filter(
        col => report.collections[col].legacy > 0
      )
    };
  } catch (error) {
    console.error('Error in quick migration analysis:', error);
    return {
      hasLegacyData: false,
      error: error.message
    };
  }
}