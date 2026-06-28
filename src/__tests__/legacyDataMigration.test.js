// src/__tests__/legacyDataMigration.test.js
// Tests for Legacy Data Migration functionality

import { 
  predictCategoryFromFormulation, 
  predictCategoryFromContext,
  suggestCategoryForLegacyRecord,
  processLegacyRecords,
  generateLegacyMigrationReport,
  validateMigrationSuggestions
} from '../utils/legacyDataMigration.js';

describe('Legacy Data Migration', () => {
  describe('predictCategoryFromFormulation', () => {
    it('should predict herbicide for weed control formulations', () => {
      expect(predictCategoryFromFormulation('Glyphosate 360 SL')).toBe('herbicide');
      expect(predictCategoryFromFormulation('Weed Killer Pro')).toBe('herbicide');
      expect(predictCategoryFromFormulation('Pre-emergent herbicide')).toBe('herbicide');
      expect(predictCategoryFromFormulation('2,4-D Amine')).toBe('herbicide');
    });

    it('should predict fungicide for disease control formulations', () => {
      expect(predictCategoryFromFormulation('Propiconazole 250 EC')).toBe('fungicide');
      expect(predictCategoryFromFormulation('Mildew Control Fungicide')).toBe('fungicide');
      expect(predictCategoryFromFormulation('Azoxystrobin + Difenoconazole')).toBe('fungicide');
      expect(predictCategoryFromFormulation('Blight Buster')).toBe('fungicide');
    });

    it('should predict pesticide for insect control formulations', () => {
      expect(predictCategoryFromFormulation('Imidacloprid 200 SL')).toBe('pesticide');
      expect(predictCategoryFromFormulation('Insect Control Pro')).toBe('pesticide');
      expect(predictCategoryFromFormulation('Aphid Killer')).toBe('pesticide');
      expect(predictCategoryFromFormulation('Lambda-cyhalothrin EC')).toBe('pesticide');
    });

    it('should predict nutrition for fertilizer formulations', () => {
      expect(predictCategoryFromFormulation('NPK 20-20-20')).toBe('nutrition');
      expect(predictCategoryFromFormulation('Urea 46%')).toBe('nutrition');
      expect(predictCategoryFromFormulation('Foliar Fertilizer')).toBe('nutrition');
      expect(predictCategoryFromFormulation('DAP 18-46-0')).toBe('nutrition');
    });

    it('should predict biostimulant for growth enhancer formulations', () => {
      expect(predictCategoryFromFormulation('Seaweed Extract')).toBe('biostimulant');
      expect(predictCategoryFromFormulation('Humic Acid Bio-stimulant')).toBe('biostimulant');
      expect(predictCategoryFromFormulation('Growth Enhancer Plus')).toBe('biostimulant');
      expect(predictCategoryFromFormulation('Trichoderma viride')).toBe('biostimulant');
    });

    it('should return null for unclear formulation names', () => {
      expect(predictCategoryFromFormulation('Product X')).toBe(null);
      expect(predictCategoryFromFormulation('')).toBe(null);
      expect(predictCategoryFromFormulation(null)).toBe(null);
      expect(predictCategoryFromFormulation('Test Trial')).toBe(null);
    });
  });

  describe('suggestCategoryForLegacyRecord', () => {
    const mockFormulations = [
      { Name: 'Roundup Ready', Category: 'herbicide' },
      { Name: 'Fungus Fighter', Category: 'fungicide' },
      { Name: 'Bug Away', Category: 'pesticide' }
    ];

    it('should suggest category based on formulation name', () => {
      const record = {
        ID: 'trial1',
        FormulationName: 'Glyphosate 360',
        InvestigatorName: 'John Doe'
      };

      const suggestion = suggestCategoryForLegacyRecord(record, mockFormulations);
      expect(suggestion.suggestedCategory).toBe('herbicide');
      expect(suggestion.confidence).toBe('medium');
      expect(suggestion.reasoning).toContain('Glyphosate 360');
    });

    it('should suggest category based on existing formulation match', () => {
      const record = {
        ID: 'trial2',
        FormulationName: 'Roundup Ready',
        InvestigatorName: 'Jane Smith'
      };

      const suggestion = suggestCategoryForLegacyRecord(record, mockFormulations);
      expect(suggestion.suggestedCategory).toBe('herbicide');
      expect(suggestion.confidence).toBe('high');
      expect(suggestion.reasoning).toContain('Matching formulation');
    });

    it('should suggest category based on context fields', () => {
      const record = {
        ID: 'trial3',
        FormulationName: 'Unknown Product',
        WeedSpecies: 'Echinochloa crus-galli',
        Notes: 'Weed control trial'
      };

      const suggestion = suggestCategoryForLegacyRecord(record, mockFormulations);
      expect(suggestion.suggestedCategory).toBe('herbicide');
      expect(suggestion.reasoning).toContain('context');
    });

    it('should return no suggestion for unclear records', () => {
      const record = {
        ID: 'trial4',
        FormulationName: 'Mystery Product',
        InvestigatorName: 'Unknown'
      };

      const suggestion = suggestCategoryForLegacyRecord(record, mockFormulations);
      expect(suggestion.suggestedCategory).toBe(null);
      expect(suggestion.confidence).toBe('none');
    });

    it('should handle records that already have categories', () => {
      const record = {
        ID: 'trial5',
        FormulationName: 'Test Product',
        Category: 'fungicide'
      };

      const suggestion = suggestCategoryForLegacyRecord(record, mockFormulations);
      expect(suggestion.suggestedCategory).toBe('fungicide');
      expect(suggestion.confidence).toBe('high');
      expect(suggestion.reasoning).toBe('Already categorized');
    });
  });

  describe('processLegacyRecords', () => {
    it('should process multiple legacy records', () => {
      const records = [
        { ID: 'trial1', FormulationName: 'Herbicide A' },
        { ID: 'trial2', FormulationName: 'Fungicide B', Category: 'fungicide' }, // already categorized
        { ID: 'trial3', FormulationName: 'Pesticide C' }
      ];

      const results = processLegacyRecords(records);
      
      // Should only process uncategorized records
      expect(results).toHaveLength(2);
      expect(results.find(r => r.record.ID === 'trial1')).toBeDefined();
      expect(results.find(r => r.record.ID === 'trial3')).toBeDefined();
      expect(results.find(r => r.record.ID === 'trial2')).toBeUndefined(); // already categorized
    });
  });

  describe('generateLegacyMigrationReport', () => {
    it('should generate comprehensive migration report', () => {
      const state = {
        trials: [
          { ID: 'trial1', FormulationName: 'Herbicide A' }, // legacy
          { ID: 'trial2', FormulationName: 'Fungicide B', Category: 'fungicide' } // categorized
        ],
        projects: [
          { ID: 'proj1', Name: 'Legacy Project' }, // legacy
          { ID: 'proj2', Name: 'New Project', Category: 'herbicide' } // categorized
        ],
        formulations: [
          { ID: 'form1', Name: 'Glyphosate 360' }, // legacy - should predict herbicide
          { ID: 'form2', Name: 'Copper Fungicide', Category: 'fungicide' } // categorized
        ],
        ingredients: [],
        blocks: []
      };

      const report = generateLegacyMigrationReport(state);

      expect(report.summary.totalRecords).toBe(6);
      expect(report.summary.legacyRecords).toBe(3); // trial1, proj1, form1
      expect(report.summary.categorizedRecords).toBe(3); // trial2, proj2, form2
      
      expect(report.collections.trials.legacy).toBe(1);
      expect(report.collections.projects.legacy).toBe(1);
      expect(report.collections.formulations.legacy).toBe(1);

      // Should have suggestions for legacy records
      expect(report.suggestions.length).toBe(3);
      
      // Check specific suggestions
      const herbicideFormSuggestion = report.suggestions.find(s => 
        s.collection === 'formulations' && s.recordName === 'Glyphosate 360'
      );
      expect(herbicideFormSuggestion.suggestedCategory).toBe('herbicide');
    });

    it('should handle empty state', () => {
      const state = {
        trials: [],
        projects: [],
        formulations: [],
        ingredients: [],
        blocks: []
      };

      const report = generateLegacyMigrationReport(state);
      expect(report.summary.totalRecords).toBe(0);
      expect(report.summary.legacyRecords).toBe(0);
      expect(report.suggestions).toHaveLength(0);
    });
  });

  describe('validateMigrationSuggestions', () => {
    it('should validate correct suggestions', () => {
      const suggestions = [
        {
          recordId: 'trial1',
          collection: 'trials',
          suggestedCategory: 'herbicide',
          confidence: 'high',
          reasoning: 'Test'
        },
        {
          recordId: 'trial2',
          collection: 'formulations',
          suggestedCategory: 'fungicide',
          confidence: 'medium',
          reasoning: 'Test'
        }
      ];

      const validation = validateMigrationSuggestions(suggestions);
      expect(validation.valid).toBe(2);
      expect(validation.invalid).toBe(0);
      expect(validation.errors).toHaveLength(0);
    });

    it('should detect invalid categories', () => {
      const suggestions = [
        {
          recordId: 'trial1',
          collection: 'trials',
          suggestedCategory: 'invalid_category',
          confidence: 'high',
          reasoning: 'Test'
        }
      ];

      const validation = validateMigrationSuggestions(suggestions);
      expect(validation.valid).toBe(0);
      expect(validation.invalid).toBe(1);
      expect(validation.errors).toHaveLength(1);
      expect(validation.errors[0].error).toContain('Invalid category');
    });

    it('should detect potential conflicts', () => {
      const suggestions = [
        {
          recordId: 'trial1',
          collection: 'trials',
          suggestedCategory: 'herbicide',
          confidence: 'medium',
          reasoning: 'conflicts with other indicators'
        }
      ];

      const validation = validateMigrationSuggestions(suggestions);
      expect(validation.warnings).toHaveLength(1);
      expect(validation.warnings[0].warning).toContain('Conflicting category');
    });
  });
});

describe('Migration Bug Condition Prevention', () => {
  it('should prevent defaulting all legacy records to herbicide', () => {
    // Test the bug condition described in task 3.7
    const legacyRecords = [
      { ID: 'legacy1', FormulationName: 'Copper Sulfate Fungicide' },
      { ID: 'legacy2', FormulationName: 'Imidacloprid Insecticide' }, 
      { ID: 'legacy3', FormulationName: 'NPK 20-20-20 Fertilizer' }
    ];

    const results = processLegacyRecords(legacyRecords);
    const categories = results.map(r => r.suggestion.suggestedCategory);
    
    // Should not all be 'herbicide' - this was the bug
    const uniqueCategories = [...new Set(categories.filter(Boolean))];
    expect(uniqueCategories.length).toBeGreaterThan(1);
    
    // Should correctly categorize different types
    expect(categories).toContain('fungicide'); // for copper sulfate
    expect(categories).toContain('pesticide'); // for imidacloprid  
    expect(categories).toContain('nutrition'); // for NPK fertilizer
  });
});