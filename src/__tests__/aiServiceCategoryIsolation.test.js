import { vi } from 'vitest';
const jest = vi;

import { 
  validateAIAnalysisCategory, 
  filterTrialsByCategory,
  filterProjectsByCategory,
  filterFormulationsByCategory,
  validateUserCategoryAccess,
  createCategoryAwareAIContext,
  enhancePromptWithCategoryIsolation,
  validateAnalysisResults,
  logCategoryIsolationMetrics
} from '../utils/aiCategoryIsolation.js';

describe('AI Service Category Isolation', () => {
  
  const mockTrials = [
    { ID: 'trial1', Category: 'herbicide', FormulationName: 'Herbicide A' },
    { ID: 'trial2', Category: 'fungicide', FormulationName: 'Fungicide B' },
    { ID: 'trial3', Category: 'pesticide', FormulationName: 'Pesticide C' },
    { ID: 'trial4', Category: 'nutrition', FormulationName: 'Nutrition D' },
    { ID: 'trial5', Category: undefined, FormulationName: 'Legacy Trial' } // Legacy without category
  ];
  
  const mockProjects = [
    { ID: 'proj1', Name: 'Herbicide Project', Category: 'herbicide' },
    { ID: 'proj2', Name: 'Fungicide Project', Category: 'fungicide' },
    { ID: 'proj3', Name: 'Legacy Project', Category: undefined }
  ];
  
  const mockFormulations = [
    { ID: 'form1', Name: 'Herbicide Formula', Category: 'herbicide' },
    { ID: 'form2', Name: 'Fungicide Formula', Category: 'fungicide' },
    { ID: 'form3', Name: 'Legacy Formula', Category: undefined }
  ];
  
  const mockUser = {
    id: 'user1',
    role: 'researcher',
    categoryAccess: ['herbicide', 'fungicide']
  };

  describe('validateAIAnalysisCategory', () => {
    it('should accept valid categories', () => {
      expect(() => validateAIAnalysisCategory('herbicide')).not.toThrow();
      expect(() => validateAIAnalysisCategory('fungicide')).not.toThrow();
      expect(() => validateAIAnalysisCategory('pesticide')).not.toThrow();
      expect(() => validateAIAnalysisCategory('nutrition')).not.toThrow();
      expect(() => validateAIAnalysisCategory('biostimulant')).not.toThrow();
    });
    
    it('should reject invalid categories', () => {
      expect(() => validateAIAnalysisCategory('invalid')).toThrow();
      expect(() => validateAIAnalysisCategory('')).toThrow();
      expect(() => validateAIAnalysisCategory(null)).toThrow();
      expect(() => validateAIAnalysisCategory(undefined)).toThrow();
    });
    
    it('should provide descriptive error messages', () => {
      expect(() => validateAIAnalysisCategory('invalid', 'test operation'))
        .toThrow(/Invalid category 'invalid' for test operation/);
    });
  });

  describe('filterTrialsByCategory', () => {
    it('should filter trials to only include active category', () => {
      const herbicideTrials = filterTrialsByCategory(mockTrials, 'herbicide');
      expect(herbicideTrials).toHaveLength(2); // herbicide trial + legacy trial
      expect(herbicideTrials[0].Category).toBe('herbicide');
      expect(herbicideTrials[1].Category).toBeUndefined(); // legacy
    });
    
    it('should enforce strict category isolation', () => {
      const fungicideTrials = filterTrialsByCategory(mockTrials, 'fungicide');
      expect(fungicideTrials).toHaveLength(1);
      expect(fungicideTrials[0].Category).toBe('fungicide');
      
      // Should not include herbicide or other categories
      const categories = fungicideTrials.map(t => t.Category || 'herbicide');
      expect(categories).toEqual(['fungicide']);
    });
    
    it('should handle empty arrays gracefully', () => {
      expect(filterTrialsByCategory([], 'herbicide')).toEqual([]);
      expect(filterTrialsByCategory(null, 'herbicide')).toEqual([]);
      expect(filterTrialsByCategory(undefined, 'herbicide')).toEqual([]);
    });
    
    it('should validate category parameter', () => {
      expect(() => filterTrialsByCategory(mockTrials, 'invalid'))
        .toThrow(/Invalid category 'invalid'/);
    });
  });

  describe('filterProjectsByCategory', () => {
    it('should filter projects by category', () => {
      const herbicideProjects = filterProjectsByCategory(mockProjects, 'herbicide');
      expect(herbicideProjects).toHaveLength(2); // herbicide + legacy
      
      const fungicideProjects = filterProjectsByCategory(mockProjects, 'fungicide');
      expect(fungicideProjects).toHaveLength(1);
      expect(fungicideProjects[0].Category).toBe('fungicide');
    });
    
    it('should handle empty arrays', () => {
      expect(filterProjectsByCategory([], 'herbicide')).toEqual([]);
    });
  });

  describe('filterFormulationsByCategory', () => {
    it('should filter formulations by category', () => {
      const herbicideFormulations = filterFormulationsByCategory(mockFormulations, 'herbicide');
      expect(herbicideFormulations).toHaveLength(2); // herbicide + legacy
      
      const fungicideFormulations = filterFormulationsByCategory(mockFormulations, 'fungicide');
      expect(fungicideFormulations).toHaveLength(1);
      expect(fungicideFormulations[0].Category).toBe('fungicide');
    });
  });

  describe('validateUserCategoryAccess', () => {
    it('should allow access for categories in user permissions', () => {
      expect(() => validateUserCategoryAccess(mockUser, 'herbicide')).not.toThrow();
      expect(() => validateUserCategoryAccess(mockUser, 'fungicide')).not.toThrow();
    });
    
    it('should deny access for categories not in user permissions', () => {
      expect(() => validateUserCategoryAccess(mockUser, 'pesticide'))
        .toThrow(/Access denied.*pesticide category/);
    });
    
    it('should allow access for users with no category restrictions', () => {
      const unrestricted = { ...mockUser, categoryAccess: [] };
      expect(() => validateUserCategoryAccess(unrestricted, 'pesticide')).not.toThrow();
    });
    
    it('should skip validation for viewer role', () => {
      const viewer = { ...mockUser, role: 'viewer', categoryAccess: ['herbicide'] };
      expect(() => validateUserCategoryAccess(viewer, 'pesticide')).not.toThrow();
    });
  });

  describe('createCategoryAwareAIContext', () => {
    it('should create isolated context with filtered data', () => {
      const context = createCategoryAwareAIContext(
        'fungicide', 
        mockTrials, 
        mockProjects, 
        mockFormulations, 
        mockUser
      );
      
      expect(context.activeCategory).toBe('fungicide');
      expect(context.trials).toHaveLength(1);
      expect(context.trials[0].Category).toBe('fungicide');
      expect(context.projects).toHaveLength(1);
      expect(context.projects[0].Category).toBe('fungicide');
      expect(context.formulations).toHaveLength(1);
      expect(context.formulations[0].Category).toBe('fungicide');
    });
    
    it('should include isolation metrics', () => {
      const context = createCategoryAwareAIContext(
        'herbicide', 
        mockTrials, 
        mockProjects, 
        mockFormulations, 
        mockUser
      );
      
      expect(context.isolationMetrics).toBeDefined();
      expect(context.isolationMetrics.originalTrialCount).toBe(5);
      expect(context.isolationMetrics.filteredTrialCount).toBe(2); // herbicide + legacy
      expect(context.isolationMetrics.originalProjectCount).toBe(3);
      expect(context.isolationMetrics.filteredProjectCount).toBe(2); // herbicide + legacy
    });
    
    it('should validate user access', () => {
      expect(() => createCategoryAwareAIContext(
        'pesticide', 
        mockTrials, 
        mockProjects, 
        mockFormulations, 
        mockUser
      )).toThrow(/Access denied.*pesticide category/);
    });
  });

  describe('enhancePromptWithCategoryIsolation', () => {
    it('should enhance prompts with category isolation context', () => {
      const basePrompt = 'Analyze the trial data';
      const isolationMetrics = { 
        filteredTrialCount: 5, 
        originalTrialCount: 10,
        filteredProjectCount: 2,
        originalProjectCount: 4,
        filteredFormulationCount: 3,
        originalFormulationCount: 6
      };
      
      const enhanced = enhancePromptWithCategoryIsolation(basePrompt, 'fungicide', isolationMetrics);
      
      expect(enhanced).toContain('FUNGICIDE category ONLY');
      expect(enhanced).toContain('DO NOT reference, compare, or include data from other categories');
      expect(enhanced).toContain('herbicide, pesticide, nutrition, biostimulant');
      expect(enhanced).toContain('5/10 trials filtered for fungicide');
      expect(enhanced).toContain(basePrompt);
    });
  });

  describe('validateAnalysisResults', () => {
    it('should warn about cross-category references in results', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      const resultsWithCrossCategoryRef = {
        analysis: 'This fungicide trial shows better results than herbicide treatments'
      };
      
      validateAnalysisResults(resultsWithCrossCategoryRef, 'fungicide', 'test analysis');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('test analysis results for fungicide contain references to other categories: herbicide')
      );
      
      consoleSpy.mockRestore();
    });
    
    it('should not warn for category-appropriate content', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      const cleanResults = {
        analysis: 'This fungicide trial shows excellent disease control'
      };
      
      validateAnalysisResults(cleanResults, 'fungicide', 'test analysis');
      
      expect(consoleSpy).not.toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });
    
    it('should handle null results gracefully', () => {
      expect(() => validateAnalysisResults(null, 'herbicide')).not.toThrow();
      expect(() => validateAnalysisResults(undefined, 'herbicide')).not.toThrow();
    });
  });

  describe('logCategoryIsolationMetrics', () => {
    it('should log isolation metrics with percentages', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const metrics = {
        originalTrialCount: 10,
        filteredTrialCount: 3,
        originalProjectCount: 5,
        filteredProjectCount: 2,
        originalFormulationCount: 8,
        filteredFormulationCount: 1
      };
      
      logCategoryIsolationMetrics('Test Operation', 'fungicide', metrics);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Test Operation for fungicide: 3/10 trials (30.0%), 2/5 projects, 1/8 formulations')
      );
      
      consoleSpy.mockRestore();
    });
    
    it('should handle zero counts gracefully', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const metrics = {
        originalTrialCount: 0,
        filteredTrialCount: 0,
        originalProjectCount: 0,
        filteredProjectCount: 0,
        originalFormulationCount: 0,
        filteredFormulationCount: 0
      };
      
      logCategoryIsolationMetrics('Test Operation', 'fungicide', metrics);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('0/0 trials (0%), 0/0 projects, 0/0 formulations')
      );
      
      consoleSpy.mockRestore();
    });
  });
});