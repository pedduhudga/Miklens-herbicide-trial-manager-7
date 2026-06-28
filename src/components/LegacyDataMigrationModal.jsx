// src/components/LegacyDataMigrationModal.jsx
// User interface for manual legacy data categorization
// Allows users to review and assign categories to uncategorized records

import React, { useState, useEffect } from 'react';
import Modal from './Modal.jsx';
import { 
  generateLegacyMigrationReport, 
  applyAutomaticMigration,
  validateMigrationSuggestions
} from '../utils/legacyDataMigration.js';
import { getCategoryConfig, getCategoryOptions } from '../utils/categoryConfig.js';
import { 
  FileSearch, 
  Zap, 
  CheckCircle, 
  AlertTriangle, 
  XCircle,
  ChevronDown,
  ChevronRight,
  Filter,
  Download,
  Upload
} from 'lucide-react';

export default function LegacyDataMigrationModal({ 
  isOpen, 
  onClose, 
  onApplyMigration, 
  state,
  updateState 
}) {
  const [migrationReport, setMigrationReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedSuggestions, setSelectedSuggestions] = useState(new Set());
  const [filterCollection, setFilterCollection] = useState('all');
  const [filterConfidence, setFilterConfidence] = useState('all');
  const [expandedCollections, setExpandedCollections] = useState(new Set());
  const [manualOverrides, setManualOverrides] = useState(new Map());

  const categoryOptions = getCategoryOptions();

  // Generate migration report when modal opens
  useEffect(() => {
    if (isOpen && state) {
      generateReport();
    }
  }, [isOpen, state]);

  const generateReport = async () => {
    setLoading(true);
    try {
      const report = generateLegacyMigrationReport(state);
      setMigrationReport(report);
      
      // Auto-select high confidence suggestions
      const highConfidenceSuggestions = report.suggestions
        .filter(s => s.confidence === 'high' && s.suggestedCategory)
        .map(s => s.recordId);
      setSelectedSuggestions(new Set(highConfidenceSuggestions));
    } catch (error) {
      console.error('Error generating migration report:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSelection = (recordId) => {
    const newSelected = new Set(selectedSuggestions);
    if (newSelected.has(recordId)) {
      newSelected.delete(recordId);
    } else {
      newSelected.add(recordId);
    }
    setSelectedSuggestions(newSelected);
  };

  const handleSelectAll = () => {
    const filteredSuggestions = getFilteredSuggestions();
    const allIds = filteredSuggestions.map(s => s.recordId);
    setSelectedSuggestions(new Set(allIds));
  };

  const handleDeselectAll = () => {
    setSelectedSuggestions(new Set());
  };

  const handleManualOverride = (recordId, newCategory) => {
    const newOverrides = new Map(manualOverrides);
    if (newCategory) {
      newOverrides.set(recordId, newCategory);
    } else {
      newOverrides.delete(recordId);
    }
    setManualOverrides(newOverrides);
  };

  const getFilteredSuggestions = () => {
    if (!migrationReport?.suggestions) return [];

    return migrationReport.suggestions.filter(s => {
      if (filterCollection !== 'all' && s.collection !== filterCollection) {
        return false;
      }
      if (filterConfidence !== 'all' && s.confidence !== filterConfidence) {
        return false;
      }
      return true;
    });
  };

  const handleApplyMigration = async () => {
    if (selectedSuggestions.size === 0) {
      alert('No suggestions selected for migration.');
      return;
    }

    const selectedItems = migrationReport.suggestions.filter(s => 
      selectedSuggestions.has(s.recordId)
    );

    // Apply manual overrides
    const finalSuggestions = selectedItems.map(item => {
      const override = manualOverrides.get(item.recordId);
      if (override) {
        return {
          ...item,
          suggestedCategory: override,
          confidence: 'manual',
          reasoning: 'Manually assigned by user'
        };
      }
      return item;
    });

    // Validate before applying
    const validation = validateMigrationSuggestions(finalSuggestions);
    if (validation.errors.length > 0) {
      alert(`Cannot apply migration: ${validation.errors[0].error}`);
      return;
    }

    if (validation.warnings.length > 0) {
      const proceed = confirm(
        `Warning: ${validation.warnings.length} potential conflicts detected. Proceed anyway?`
      );
      if (!proceed) return;
    }

    try {
      setLoading(true);
      
      // Group suggestions by collection for batch updates
      const updatesByCollection = {};
      finalSuggestions.forEach(suggestion => {
        if (!updatesByCollection[suggestion.collection]) {
          updatesByCollection[suggestion.collection] = [];
        }
        updatesByCollection[suggestion.collection].push(suggestion);
      });

      // Apply updates to state
      const newState = { ...state };
      
      for (const [collection, updates] of Object.entries(updatesByCollection)) {
        if (newState[collection]) {
          newState[collection] = newState[collection].map(record => {
            const update = updates.find(u => 
              u.recordId === (record.ID || record.id)
            );
            if (update) {
              return {
                ...record,
                Category: update.suggestedCategory,
                _migrationApplied: true,
                _migrationReason: update.reasoning
              };
            }
            return record;
          });
        }
      }

      // Update application state
      updateState(newState);

      // Call parent callback
      if (onApplyMigration) {
        onApplyMigration(finalSuggestions);
      }

      // Show success message
      window.dispatchEvent(new CustomEvent('app:toast', {
        detail: {
          msg: `Successfully migrated ${finalSuggestions.length} records`,
          type: 'success'
        }
      }));

      onClose();

    } catch (error) {
      console.error('Error applying migration:', error);
      window.dispatchEvent(new CustomEvent('app:toast', {
        detail: {
          msg: `Migration failed: ${error.message}`,
          type: 'error'
        }
      }));
    } finally {
      setLoading(false);
    }
  };

  const handleAutoMigrate = async (minConfidence = 'high') => {
    if (!migrationReport?.suggestions) return;

    const results = applyAutomaticMigration(migrationReport.suggestions, minConfidence);
    
    if (results.applied > 0) {
      const autoSelected = results.details.map(d => d.recordId);
      setSelectedSuggestions(new Set([...selectedSuggestions, ...autoSelected]));
      
      window.dispatchEvent(new CustomEvent('app:toast', {
        detail: {
          msg: `Auto-selected ${results.applied} high-confidence suggestions`,
          type: 'info'
        }
      }));
    }
  };

  const toggleCollectionExpanded = (collection) => {
    const newExpanded = new Set(expandedCollections);
    if (newExpanded.has(collection)) {
      newExpanded.delete(collection);
    } else {
      newExpanded.add(collection);
    }
    setExpandedCollections(newExpanded);
  };

  const getConfidenceColor = (confidence) => {
    switch (confidence) {
      case 'high': return 'text-green-600 bg-green-100';
      case 'medium': return 'text-yellow-600 bg-yellow-100';
      case 'low': return 'text-orange-600 bg-orange-100';
      case 'manual': return 'text-blue-600 bg-blue-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getCategoryColor = (categoryId) => {
    const config = getCategoryConfig(categoryId);
    return config.color.badge;
  };

  if (!isOpen) return null;

  const filteredSuggestions = getFilteredSuggestions();
  const selectedCount = selectedSuggestions.size;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <FileSearch className="w-6 h-6 text-blue-600" />
          <h2 className="text-xl font-bold text-gray-900">Legacy Data Migration</h2>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-3 text-gray-600">Analyzing legacy data...</span>
          </div>
        )}

        {migrationReport && !loading && (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="text-2xl font-bold text-gray-900">
                  {migrationReport.summary.legacyRecords}
                </div>
                <div className="text-sm text-gray-600">Legacy Records</div>
              </div>
              
              <div className="bg-green-50 p-4 rounded-lg">
                <div className="text-2xl font-bold text-green-600">
                  {migrationReport.summary.highConfidenceSuggestions}
                </div>
                <div className="text-sm text-green-700">High Confidence</div>
              </div>
              
              <div className="bg-yellow-50 p-4 rounded-lg">
                <div className="text-2xl font-bold text-yellow-600">
                  {migrationReport.summary.ambiguousRecords}
                </div>
                <div className="text-sm text-yellow-700">Needs Review</div>
              </div>
              
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">
                  {selectedCount}
                </div>
                <div className="text-sm text-blue-700">Selected</div>
              </div>
            </div>

            {/* Action Bar */}
            <div className="flex flex-wrap items-center gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-gray-600" />
                <select 
                  value={filterCollection} 
                  onChange={(e) => setFilterCollection(e.target.value)}
                  className="px-3 py-1 border border-gray-300 rounded text-sm"
                >
                  <option value="all">All Collections</option>
                  <option value="trials">Trials</option>
                  <option value="projects">Projects</option>
                  <option value="formulations">Formulations</option>
                  <option value="ingredients">Ingredients</option>
                  <option value="blocks">Blocks</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <select 
                  value={filterConfidence} 
                  onChange={(e) => setFilterConfidence(e.target.value)}
                  className="px-3 py-1 border border-gray-300 rounded text-sm"
                >
                  <option value="all">All Confidence</option>
                  <option value="high">High Confidence</option>
                  <option value="medium">Medium Confidence</option>
                  <option value="low">Low Confidence</option>
                </select>
              </div>

              <div className="flex-1"></div>

              <button 
                onClick={handleSelectAll}
                className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
              >
                Select All
              </button>
              
              <button 
                onClick={handleDeselectAll}
                className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
              >
                Deselect All
              </button>

              <button 
                onClick={() => handleAutoMigrate('high')}
                className="px-3 py-1 text-sm bg-green-100 text-green-700 rounded hover:bg-green-200 flex items-center gap-1"
              >
                <Zap className="w-3 h-3" />
                Auto-select High Confidence
              </button>
            </div>

            {/* Suggestions List */}
            <div className="max-h-96 overflow-y-auto border border-gray-200 rounded-lg">
              {filteredSuggestions.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  No legacy records match the current filters.
                </div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {filteredSuggestions.map((suggestion) => {
                    const isSelected = selectedSuggestions.has(suggestion.recordId);
                    const manualCategory = manualOverrides.get(suggestion.recordId);
                    const finalCategory = manualCategory || suggestion.suggestedCategory;

                    return (
                      <div key={suggestion.recordId} className={`p-4 hover:bg-gray-50 ${isSelected ? 'bg-blue-50' : ''}`}>
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelection(suggestion.recordId)}
                            className="mt-1 h-4 w-4 text-blue-600 rounded border-gray-300"
                          />
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="font-medium text-gray-900">
                                {suggestion.recordName}
                              </span>
                              
                              <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-600">
                                {suggestion.collection}
                              </span>
                              
                              <span className={`px-2 py-1 text-xs rounded-full ${getConfidenceColor(manualCategory ? 'manual' : suggestion.confidence)}`}>
                                {manualCategory ? 'Manual' : suggestion.confidence}
                              </span>
                            </div>

                            <div className="flex items-center gap-4 mb-2">
                              <div className="text-sm">
                                <span className="text-gray-600">Suggested: </span>
                                {finalCategory ? (
                                  <span className={`px-2 py-1 text-xs rounded-full ${getCategoryColor(finalCategory)}`}>
                                    {finalCategory}
                                  </span>
                                ) : (
                                  <span className="text-red-600">No suggestion</span>
                                )}
                              </div>

                              <div className="text-sm">
                                <span className="text-gray-600">Manual override: </span>
                                <select
                                  value={manualCategory || ''}
                                  onChange={(e) => handleManualOverride(suggestion.recordId, e.target.value)}
                                  className="px-2 py-1 text-xs border border-gray-300 rounded"
                                >
                                  <option value="">Use suggestion</option>
                                  {categoryOptions.map(cat => (
                                    <option key={cat.value} value={cat.value}>
                                      {cat.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>

                            {suggestion.reasoning && (
                              <div className="text-sm text-gray-600">
                                <span className="font-medium">Reasoning: </span>
                                {suggestion.reasoning}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-200">
              <div className="text-sm text-gray-600">
                {selectedCount} of {filteredSuggestions.length} suggestions selected
              </div>
              
              <div className="flex items-center gap-3">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded hover:bg-gray-200"
                >
                  Cancel
                </button>
                
                <button
                  onClick={handleApplyMigration}
                  disabled={selectedCount === 0 || loading}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <CheckCircle className="w-4 h-4" />
                  Apply Migration ({selectedCount})
                </button>
              </div>
            </div>
          </>
        )}

        {migrationReport?.error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center gap-2 text-red-600">
              <XCircle className="w-5 h-5" />
              <span className="font-medium">Error</span>
            </div>
            <p className="text-red-700 mt-1">{migrationReport.error}</p>
          </div>
        )}
      </div>
    </Modal>
  );
}