// src/utils/legacyDataMigration.js
// Legacy Data Migration Utility for Category Isolation Fix
// Provides heuristic-based automatic category assignment for uncategorized records
// Prevents defaulting all legacy records to 'herbicide' category

/**
 * Heuristic patterns for automatic category classification based on formulation names and context
 */
const CATEGORY_PATTERNS = {
  herbicide: {
    keywords: [
      // Common herbicide terms
      'herbicide', 'weedicide', 'weed', 'grass', 'broadleaf', 'selective', 'non-selective',
      // Active ingredients
      'glyphosate', 'atrazine', '2,4-d', 'dicamba', 'paraquat', 'glufosinate', 'imazapyr', 
      'metribuzin', 'pendimethalin', 'alachlor', 'acetochlor', 'trifluralin', 'diuron',
      'simazine', 'prometryn', 'clomazone', 'sulfentrazone', 'flumioxazin',
      // Mode of action descriptions
      'pre-emergence', 'post-emergence', 'systemic herbicide', 'contact herbicide',
      'ace inhibitor', 'photosystem inhibitor', 'amino acid synthesis inhibitor'
    ],
    patterns: [
      /weed.*control/i, /grass.*killer/i, /broadleaf.*herbicide/i, 
      /pre.*emergent/i, /post.*emergent/i, /glypho/i, /roundup/i
    ]
  },
  
  fungicide: {
    keywords: [
      // Common fungicide terms  
      'fungicide', 'antifungal', 'disease', 'blight', 'rust', 'mildew', 'spot', 'rot',
      'pathogen', 'fungal', 'mycosis', 'scab', 'canker', 'wilt', 'smut',
      // Active ingredients
      'propiconazole', 'tebuconazole', 'azoxystrobin', 'pyraclostrobin', 'trifloxystrobin',
      'metalaxyl', 'mancozeb', 'chlorothalonil', 'copper', 'sulfur', 'boscalid',
      'fluoxastrobin', 'carbendazim', 'benomyl', 'thiophanate', 'difenoconazole',
      // Disease names
      'powdery mildew', 'downy mildew', 'late blight', 'early blight', 'black spot',
      'brown spot', 'leaf spot', 'anthracnose', 'septoria', 'fusarium'
    ],
    patterns: [
      /disease.*control/i, /fungal.*treatment/i, /anti.*fungal/i, 
      /mildew/i, /blight/i, /spot.*disease/i, /rust.*control/i
    ]
  },

  pesticide: {
    keywords: [
      // Common insecticide/pesticide terms
      'insecticide', 'pesticide', 'bug', 'pest', 'insect', 'larvae', 'caterpillar',
      'aphid', 'thrips', 'mite', 'whitefly', 'leafhopper', 'armyworm', 'bollworm',
      // Active ingredients
      'chlorpyrifos', 'imidacloprid', 'thiamethoxam', 'clothianidin', 'acetamiprid',
      'lambda-cyhalothrin', 'bifenthrin', 'cypermethrin', 'deltamethrin', 'permethrin',
      'spinosad', 'emamectin', 'indoxacarb', 'diazinon', 'malathion', 'carbaryl',
      // Pest names
      'brown planthopper', 'fall armyworm', 'cotton bollworm', 'corn borer',
      'stem borer', 'leaf folder', 'pod borer', 'fruit borer'
    ],
    patterns: [
      /insect.*control/i, /pest.*control/i, /bug.*killer/i,
      /anti.*pest/i, /larva.*control/i, /aphid.*control/i
    ]
  },

  nutrition: {
    keywords: [
      // Fertilizer and nutrition terms
      'fertilizer', 'nutrient', 'nutrition', 'feed', 'supplement', 'growth',
      'nitrogen', 'phosphorus', 'potassium', 'urea', 'dap', 'mop', 'npk',
      'micronutrient', 'macronutrient', 'zinc', 'iron', 'boron', 'manganese',
      'calcium', 'magnesium', 'sulfur', 'compost', 'organic',
      // Nutrient ratios
      '20-20-20', '10-26-26', '46-0-0', '18-46-0', '0-0-60',
      // Application methods
      'foliar feed', 'soil application', 'fertigation', 'top dress'
    ],
    patterns: [
      /\d+-\d+-\d+/i, /npk/i, /fertilizer/i, /nutrient.*supplement/i,
      /growth.*promoter/i, /plant.*food/i, /soil.*conditioner/i
    ]
  },

  biostimulant: {
    keywords: [
      // Biostimulant terms
      'biostimulant', 'growth enhancer', 'bio-stimulant', 'seaweed', 'kelp',
      'humic', 'fulvic', 'amino acid', 'protein hydrolysate', 'extract',
      'biologically active', 'growth promoter', 'stress tolerance', 'vigor',
      // Active biologicals
      'trichoderma', 'mycorrhiza', 'rhizobium', 'bacillus', 'pseudomonas',
      'ascophyllum', 'ecklonia', 'chitosan', 'brassinosteroids'
    ],
    patterns: [
      /bio.*stimulant/i, /seaweed.*extract/i, /humic.*acid/i, 
      /growth.*enhancer/i, /stress.*tolerance/i, /vigor.*boost/i
    ]
  }
};

/**
 * Analyze formulation name and return most likely category based on keywords and patterns
 * @param {string} formulationName - Name of the formulation to analyze
 * @returns {string|null} - Predicted category or null if uncertain
 */
export function predictCategoryFromFormulation(formulationName) {
  if (!formulationName || typeof formulationName !== 'string') {
    return null;
  }

  const name = formulationName.toLowerCase().trim();
  const scores = {};

  // Score each category based on keyword matches and pattern matches
  for (const [category, config] of Object.entries(CATEGORY_PATTERNS)) {
    scores[category] = 0;

    // Check keyword matches
    for (const keyword of config.keywords) {
      if (name.includes(keyword.toLowerCase())) {
        scores[category] += 2; // Higher weight for exact keyword matches
      }
    }

    // Check pattern matches
    for (const pattern of config.patterns) {
      if (pattern.test(name)) {
        scores[category] += 3; // Even higher weight for pattern matches
      }
    }
  }

  // Find the category with the highest score
  const maxScore = Math.max(...Object.values(scores));
  if (maxScore === 0) {
    return null; // No clear indication
  }

  // Return the category with highest score, but only if it's significantly higher
  const topCategories = Object.entries(scores)
    .filter(([_, score]) => score === maxScore)
    .map(([category, _]) => category);

  // If there's a tie, return null (ambiguous)
  if (topCategories.length > 1) {
    return null;
  }

  return topCategories[0];
}

/**
 * Analyze trial context (ingredients, target species, etc.) to predict category
 * @param {Object} trialData - Trial record with additional context
 * @returns {string|null} - Predicted category or null if uncertain
 */
export function predictCategoryFromContext(trialData) {
  if (!trialData || typeof trialData !== 'object') {
    return null;
  }

  // Check target field values
  const contextFields = [
    trialData.WeedSpecies, 
    trialData.DiseaseTarget, 
    trialData.PestTarget,
    trialData.NutrientType,
    trialData.BiostimulantType,
    trialData.Notes,
    trialData.InvestigatorName
  ].filter(Boolean).join(' ').toLowerCase();

  if (!contextFields) {
    return null;
  }

  // Use the same pattern matching on context
  return predictCategoryFromFormulation(contextFields);
}

/**
 * Get formulation name from trial record
 * @param {Object} record - Trial or formulation record
 * @returns {string|null} - Formulation name if found
 */
export function getFormulationName(record) {
  if (!record) return null;
  
  return record.FormulationName || 
         record.Name || 
         record.ProductName || 
         record.TreatmentName ||
         record.formulation ||
         null;
}

/**
 * Suggest category for a legacy record using multiple heuristics
 * @param {Object} record - Legacy record without Category field
 * @param {Array} allFormulations - All formulation records for context
 * @returns {Object} - {suggestedCategory, confidence, reasoning}
 */
export function suggestCategoryForLegacyRecord(record, allFormulations = []) {
  if (!record) {
    return { suggestedCategory: null, confidence: 'none', reasoning: 'Invalid record' };
  }

  // Already has category - no migration needed
  if (record.Category) {
    return { 
      suggestedCategory: record.Category, 
      confidence: 'high', 
      reasoning: 'Already categorized' 
    };
  }

  const formulationName = getFormulationName(record);
  let suggestedCategory = null;
  let reasoning = [];

  // Method 1: Analyze formulation name
  if (formulationName) {
    const nameBasedCategory = predictCategoryFromFormulation(formulationName);
    if (nameBasedCategory) {
      suggestedCategory = nameBasedCategory;
      reasoning.push(`Formulation name "${formulationName}" indicates ${nameBasedCategory}`);
    }
  }

  // Method 2: Analyze trial context
  const contextBasedCategory = predictCategoryFromContext(record);
  if (contextBasedCategory) {
    if (suggestedCategory && suggestedCategory !== contextBasedCategory) {
      reasoning.push(`Context suggests ${contextBasedCategory} but conflicts with formulation analysis`);
    } else {
      suggestedCategory = contextBasedCategory;
      reasoning.push(`Trial context indicates ${contextBasedCategory}`);
    }
  }

  // Method 3: Check if formulation exists in current data with category
  if (formulationName && allFormulations.length > 0) {
    const matchingFormulation = allFormulations.find(f => 
      f.Name && f.Name.toLowerCase() === formulationName.toLowerCase() && f.Category
    );
    if (matchingFormulation) {
      if (suggestedCategory && suggestedCategory !== matchingFormulation.Category) {
        reasoning.push(`Existing formulation "${formulationName}" is categorized as ${matchingFormulation.Category} but analysis suggests ${suggestedCategory}`);
      } else {
        suggestedCategory = matchingFormulation.Category;
        reasoning.push(`Matching formulation found with ${matchingFormulation.Category} category`);
      }
    }
  }

  // Determine confidence level
  let confidence = 'none';
  if (suggestedCategory) {
    if (reasoning.length >= 2) {
      confidence = 'high';
    } else if (reasoning.length === 1) {
      confidence = 'medium';
    } else {
      confidence = 'low';
    }
  }

  return {
    suggestedCategory,
    confidence,
    reasoning: reasoning.join('; ')
  };
}

/**
 * Process a batch of legacy records and return categorization suggestions
 * @param {Array} records - Array of legacy records without categories
 * @param {Array} allFormulations - All formulation records for context
 * @returns {Array} - Array of {record, suggestion} objects
 */
export function processLegacyRecords(records, allFormulations = []) {
  if (!Array.isArray(records)) {
    return [];
  }

  return records
    .filter(record => !record.Category) // Only process uncategorized records
    .map(record => ({
      record,
      suggestion: suggestCategoryForLegacyRecord(record, allFormulations)
    }));
}

/**
 * Generate migration report for legacy data
 * @param {Object} state - Application state with trials, projects, formulations, etc.
 * @returns {Object} - Migration report with statistics and suggestions
 */
export function generateLegacyMigrationReport(state) {
  if (!state) {
    return { error: 'No application state provided' };
  }

  const allFormulations = state.formulations || [];
  const collections = {
    trials: state.trials || [],
    projects: state.projects || [],
    formulations: allFormulations,
    ingredients: state.ingredients || [],
    blocks: state.blocks || []
  };

  const report = {
    summary: {
      totalRecords: 0,
      legacyRecords: 0,
      categorizedRecords: 0,
      suggestionsGenerated: 0,
      highConfidenceSuggestions: 0,
      ambiguousRecords: 0
    },
    collections: {},
    suggestions: []
  };

  for (const [collectionName, records] of Object.entries(collections)) {
    const legacyRecords = records.filter(r => !r.Category);
    const categorizedRecords = records.filter(r => r.Category);
    
    const suggestions = processLegacyRecords(legacyRecords, allFormulations);
    const highConfidence = suggestions.filter(s => s.suggestion.confidence === 'high');
    const ambiguous = suggestions.filter(s => !s.suggestion.suggestedCategory);

    report.collections[collectionName] = {
      total: records.length,
      legacy: legacyRecords.length,
      categorized: categorizedRecords.length,
      suggestions: suggestions.length,
      highConfidence: highConfidence.length,
      ambiguous: ambiguous.length
    };

    report.summary.totalRecords += records.length;
    report.summary.legacyRecords += legacyRecords.length;
    report.summary.categorizedRecords += categorizedRecords.length;
    report.summary.suggestionsGenerated += suggestions.length;
    report.summary.highConfidenceSuggestions += highConfidence.length;
    report.summary.ambiguousRecords += ambiguous.length;

    // Add detailed suggestions for manual review
    suggestions.forEach(item => {
      report.suggestions.push({
        collection: collectionName,
        recordId: item.record.ID || item.record.id,
        recordName: getFormulationName(item.record) || item.record.Name || 'Unnamed',
        currentCategory: item.record.Category,
        suggestedCategory: item.suggestion.suggestedCategory,
        confidence: item.suggestion.confidence,
        reasoning: item.suggestion.reasoning
      });
    });
  }

  return report;
}

/**
 * Apply automatic migration for high-confidence suggestions
 * @param {Array} suggestions - Migration suggestions from generateLegacyMigrationReport
 * @param {string} minConfidence - Minimum confidence level ('high', 'medium', 'low')
 * @returns {Object} - Migration results
 */
export function applyAutomaticMigration(suggestions, minConfidence = 'high') {
  const confidenceLevels = { high: 3, medium: 2, low: 1, none: 0 };
  const minLevel = confidenceLevels[minConfidence] || 3;

  const applicableSuggestions = suggestions.filter(s => 
    s.suggestedCategory && 
    confidenceLevels[s.confidence] >= minLevel
  );

  const results = {
    applied: 0,
    skipped: 0,
    errors: 0,
    details: []
  };

  applicableSuggestions.forEach(suggestion => {
    try {
      // In a real implementation, this would update the database
      // For now, we just track what would be applied
      results.applied++;
      results.details.push({
        recordId: suggestion.recordId,
        collection: suggestion.collection,
        appliedCategory: suggestion.suggestedCategory,
        reasoning: suggestion.reasoning
      });
    } catch (error) {
      results.errors++;
      results.details.push({
        recordId: suggestion.recordId,
        error: error.message
      });
    }
  });

  return results;
}

/**
 * Validate migration suggestions to prevent data corruption
 * @param {Array} suggestions - Migration suggestions to validate
 * @returns {Object} - Validation results
 */
export function validateMigrationSuggestions(suggestions) {
  const validCategories = ['herbicide', 'fungicide', 'pesticide', 'nutrition', 'biostimulant'];
  const validation = {
    valid: 0,
    invalid: 0,
    warnings: [],
    errors: []
  };

  suggestions.forEach(suggestion => {
    // Check if suggested category is valid
    if (suggestion.suggestedCategory && !validCategories.includes(suggestion.suggestedCategory)) {
      validation.invalid++;
      validation.errors.push({
        recordId: suggestion.recordId,
        error: `Invalid category suggested: ${suggestion.suggestedCategory}`
      });
      return;
    }

    // Check for potential conflicts
    if (suggestion.reasoning.includes('conflicts')) {
      validation.warnings.push({
        recordId: suggestion.recordId,
        warning: 'Conflicting category indicators detected',
        reasoning: suggestion.reasoning
      });
    }

    validation.valid++;
  });

  return validation;
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